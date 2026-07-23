import sharp from "sharp";
import { inngest } from "../client";
import { generateFlatMockup } from "@/lib/clients/printful";
import { generateOnModelMockup } from "@/lib/clients/replicate";
import { fetchWithRetry, logStructured } from "@/lib/clients/http";
import { MOCKUP_BUCKET, uploadPublic } from "@/lib/storage";
import { getDesign, updateDesign } from "@/db/queries";

/**
 * Renders both mockup kinds in parallel once artwork lands:
 *  - flat product shot via the supplier's mockup generator (never rendered
 *    by us) — becomes the Shopify product image
 *  - two photorealistic on-model shots via Replicate — Instagram content
 * Everything lands in the public mockups bucket as JPEG (Instagram rejects
 * PNG and private URLs).
 */
export const renderMockups = inngest.createFunction(
  {
    id: "render-mockups",
    retries: 2,
    onFailure: async ({ event }) => {
      const designId = event.data.event.data.designId;
      const design = await getDesign(designId);
      // Mockup failure shouldn't kill an otherwise reviewable design; the
      // desk shows what's missing and publish requires the flat mockup.
      await updateDesign(designId, {
        error: `mockups: ${event.data.error.message.slice(0, 500)}`,
        status: design?.status === "generating" ? "ready" : (design?.status ?? "ready"),
      });
    },
  },
  { event: "design/mockups.requested" },
  async ({ event, step }) => {
    const { designId } = event.data;

    const design = await step.run("load-design", async () => {
      const row = await getDesign(designId);
      if (!row) throw new Error(`design ${designId} not found`);
      if (!row.artworkUrl) throw new Error(`design ${designId} has no artwork`);
      return {
        artworkUrl: row.artworkUrl,
        garmentName: row.garmentName ?? "heavyweight tee",
      };
    });

    const [flatUrl, studioUrl, lifestyleUrl] = await Promise.all([
      step.run("flat-mockup", async () => {
        const supplierUrl = await generateFlatMockup({
          artworkUrl: design.artworkUrl,
        });
        const res = await fetchWithRetry("mockup-cdn", supplierUrl, { method: "GET" });
        const jpeg = await sharp(Buffer.from(await res.arrayBuffer()))
          .jpeg({ quality: 92 })
          .toBuffer();
        return uploadPublic(MOCKUP_BUCKET, `${designId}/flat.jpg`, jpeg, "image/jpeg");
      }),
      step.run("model-mockup-studio", async () => {
        const image = await generateOnModelMockup({
          artworkUrl: design.artworkUrl,
          garmentName: design.garmentName,
          scene: "studio",
        });
        const jpeg = await sharp(image).jpeg({ quality: 92 }).toBuffer();
        return uploadPublic(MOCKUP_BUCKET, `${designId}/model-studio.jpg`, jpeg, "image/jpeg");
      }),
      step.run("model-mockup-lifestyle", async () => {
        const image = await generateOnModelMockup({
          artworkUrl: design.artworkUrl,
          garmentName: design.garmentName,
          scene: "lifestyle",
        });
        const jpeg = await sharp(image).jpeg({ quality: 92 }).toBuffer();
        return uploadPublic(MOCKUP_BUCKET, `${designId}/model-lifestyle.jpg`, jpeg, "image/jpeg");
      }),
    ]);

    await step.run("save-urls", async () => {
      await updateDesign(designId, {
        flatMockupUrl: flatUrl,
        modelMockupUrls: [studioUrl, lifestyleUrl],
      });
      logStructured("info", "mockups_rendered", { designId, flatUrl, studioUrl, lifestyleUrl });
    });

    return { designId, flatUrl, modelMockupUrls: [studioUrl, lifestyleUrl] };
  }
);
