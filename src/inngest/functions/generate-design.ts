import sharp from "sharp";
import { inngest } from "../client";
import { downloadAsset, generateArtwork, RECRAFT_PALETTE } from "@/lib/clients/recraft";
import { fetchWithRetry, logStructured } from "@/lib/clients/http";
import { ARTWORK_BUCKET, uploadPublic } from "@/lib/storage";
import { buildArtworkPrompt } from "@/lib/generation/prompt";
import { countSvgColors, svgDimensions } from "@/lib/generation/svg";
import { runQualityGate } from "@/lib/gate";
import { getDesign, updateDesign } from "@/db/queries";

const MIN_WIDTH = 4500;
const MIN_HEIGHT = 5400;

/**
 * Generation takes 30–90s — it never runs in a request handler. The API
 * route inserts the row and fires the event; this function does the work.
 */
export const generateDesign = inngest.createFunction(
  {
    id: "generate-design",
    retries: 2,
    onFailure: async ({ event }) => {
      const designId = event.data.event.data.designId;
      await updateDesign(designId, {
        status: "failed",
        error: event.data.error.message.slice(0, 1000),
      });
    },
  },
  { event: "design/generate.requested" },
  async ({ event, step }) => {
    const { designId } = event.data;

    const artwork = await step.run("generate-and-store-artwork", async () => {
      const design = await getDesign(designId);
      if (!design) throw new Error(`design ${designId} not found`);

      const prompt = buildArtworkPrompt({
        concept: design.concept,
        verseText: design.verseText,
        verseRef: design.verseRef,
        inkCount: RECRAFT_PALETTE.length,
      });
      await updateDesign(designId, { prompt });

      const generated = await generateArtwork(prompt);
      let data = await downloadAsset(generated.url);
      let widthPx: number;
      let heightPx: number;
      let dpi: number;
      let colorCount: number;

      if (generated.format === "svg") {
        const svg = data.toString("utf8");
        const dims = svgDimensions(svg);
        widthPx = dims?.width ?? 0;
        heightPx = dims?.height ?? 0;
        dpi = 300; // resolution-independent; recorded for the spec panel
        colorCount = countSvgColors(svg) || RECRAFT_PALETTE.length;
      } else {
        // Raster came back: upscale until both dimensions clear the print
        // minimum before anything else touches it.
        const meta = await sharp(data).metadata();
        const w = meta.width ?? 0;
        const h = meta.height ?? 0;
        const scale = Math.max(MIN_WIDTH / w, MIN_HEIGHT / h, 1);
        if (scale > 1) {
          data = await sharp(data)
            .resize(Math.ceil(w * scale), Math.ceil(h * scale), { kernel: "lanczos3" })
            .withMetadata({ density: 300 })
            .png()
            .toBuffer();
        }
        const finalMeta = await sharp(data).metadata();
        widthPx = finalMeta.width ?? 0;
        heightPx = finalMeta.height ?? 0;
        dpi = 300;
        colorCount = RECRAFT_PALETTE.length;
      }

      const ext = generated.format === "svg" ? "svg" : "png";
      const contentType = generated.format === "svg" ? "image/svg+xml" : "image/png";
      const url = await uploadPublic(
        ARTWORK_BUCKET,
        `${designId}/artwork.${ext}`,
        data,
        contentType
      );

      logStructured("info", "artwork_generated", {
        designId,
        format: generated.format,
        widthPx,
        heightPx,
        bytes: data.length,
      });

      await updateDesign(designId, {
        artworkUrl: url,
        artworkFormat: generated.format,
        widthPx,
        heightPx,
        dpi,
        colorCount,
      });

      return { url, format: generated.format, widthPx, heightPx, dpi, colorCount };
    });

    await step.run("quality-gate", async () => {
      const design = await getDesign(designId);
      if (!design) throw new Error(`design ${designId} not found`);

      // Re-fetch the stored artwork so the gate sees exactly what will print.
      const res = await fetchWithRetry("supabase-storage", artwork.url, { method: "GET" });
      const data = Buffer.from(await res.arrayBuffer());

      const checks = runQualityGate({
        concept: design.concept,
        prompt: design.prompt,
        verseRef: design.verseRef,
        translation: design.translation,
        verseText: design.verseText,
        artworkFormat: artwork.format,
        widthPx: artwork.widthPx,
        heightPx: artwork.heightPx,
        dpi: artwork.dpi,
        colorCount: artwork.colorCount,
        artworkSvg: artwork.format === "svg" ? data.toString("utf8") : undefined,
        artworkPng: artwork.format === "png" ? data : undefined,
      });

      await updateDesign(designId, { checks, status: "ready" });
      return { failCount: checks.filter((c) => c.status === "fail").length };
    });

    // Mockups render in parallel once artwork lands (phase 4).
    await step.sendEvent("request-mockups", {
      name: "design/mockups.requested",
      data: { designId },
    });

    return { designId };
  }
);
