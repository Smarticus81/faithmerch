import { inngest } from "../client";
import {
  attachProductImage,
  createProduct,
  createSizeVariants,
  findPublicationIds,
  publishToChannels,
} from "@/lib/clients/shopify";
import * as gelato from "@/lib/clients/gelato";
import * as printful from "@/lib/clients/printful";
import {
  createMediaContainer,
  IG_ROLLING_WINDOW_CAP,
  publishMediaContainer,
} from "@/lib/clients/instagram";
import { logStructured } from "@/lib/clients/http";
import {
  getDesign,
  igNextSlotAt,
  igPublishCountLast24h,
  recordIgPublish,
  updateDesign,
} from "@/db/queries";

/** Printful catalog variant ids for Bella+Canvas 3001, S–2XL. Verify per SKU. */
const PRINTFUL_VARIANT_IDS = [4011, 4012, 4013, 4014, 4015];

async function markStep(
  designId: string,
  steps: Record<string, string | boolean>,
  key: string,
  value: string | boolean
): Promise<Record<string, string | boolean>> {
  const next = { ...steps, [key]: value };
  await updateDesign(designId, { publishSteps: next });
  return next;
}

function buildCaption(design: {
  concept: string;
  verseRef: string | null;
  translation: string | null;
  verseText: string | null;
}): string {
  const lines = [design.concept.split("—")[0].trim()];
  if (design.verseText && design.verseRef) {
    lines.push("");
    lines.push(`“${design.verseText}” — ${design.verseRef}${design.translation ? ` (${design.translation})` : ""}`);
  }
  lines.push("");
  lines.push("#faithapparel #christianclothing #scripture");
  return lines.join("\n");
}

/**
 * Idempotent, resumable publish. Every step's result is persisted to
 * designs.publish_steps BEFORE the next step starts — running this twice
 * must not create two products, and a crash resumes where it stopped.
 * Order: Shopify product → variants → print file → image → channels → IG.
 */
export const publishDesign = inngest.createFunction(
  {
    id: "publish-design",
    retries: 3,
    onFailure: async ({ event }) => {
      await updateDesign(event.data.event.data.designId, {
        status: "failed",
        error: `publish: ${event.data.error.message.slice(0, 1000)}`,
      });
    },
  },
  { event: "design/publish.requested" },
  async ({ event, step }) => {
    const { designId } = event.data;

    // Guard: the gate is law. No fail-status design ever publishes, even if
    // the API is hit directly.
    const design = await step.run("load-and-guard", async () => {
      const row = await getDesign(designId);
      if (!row) throw new Error(`design ${designId} not found`);
      if (row.checks.some((c) => c.status === "fail")) {
        throw new Error(
          `design ${designId} has failing quality checks — publish refused (no override path)`
        );
      }
      if (!["approved", "publishing", "failed"].includes(row.status)) {
        throw new Error(`design ${designId} is ${row.status}, not approved`);
      }
      if (!row.flatMockupUrl) throw new Error(`design ${designId} has no flat mockup yet`);
      if (!row.artworkUrl) throw new Error(`design ${designId} has no artwork`);
      await updateDesign(designId, { status: "publishing", error: null });
      return row;
    });

    let steps: Record<string, string | boolean> = design.publishSteps ?? {};

    // 1. Shopify product
    const productId = await step.run("shopify-product", async () => {
      if (typeof steps.productId === "string") return steps.productId;
      const created = await createProduct({
        title: design.concept.split("—")[0].trim(),
        descriptionHtml: buildCaption(design).replaceAll("\n", "<br/>"),
        handle: design.slug,
      });
      steps = await markStep(designId, steps, "productId", created.productId);
      await updateDesign(designId, {
        shopifyProductId: created.productId,
        shopifyHandle: created.handle,
      });
      return created.productId;
    });

    // 2. Size variants
    await step.run("shopify-variants", async () => {
      if (steps.variantsCreated === true) return;
      await createSizeVariants({ productId, priceCents: design.priceCents ?? 3400 });
      steps = await markStep(designId, steps, "variantsCreated", true);
    });

    // 3. Print file → supplier (per-design supplier field, never both)
    await step.run("attach-print-file", async () => {
      if (steps.printFileAttached === true) return;
      if (design.supplier === "printful") {
        const syncId = await printful.attachPrintFile({
          shopifyProductId: productId,
          name: design.concept.split("—")[0].trim(),
          printFileUrl: design.artworkUrl!,
          variantIds: PRINTFUL_VARIANT_IDS.map((printfulVariantId) => ({
            printfulVariantId,
            retailPrice: ((design.priceCents ?? 3400) / 100).toFixed(2),
          })),
        });
        steps = await markStep(designId, steps, "printfulSyncId", syncId);
      } else {
        const storeId = await gelato.findStoreId();
        const gelatoId = await gelato.attachPrintFile({
          storeId,
          shopifyProductId: productId,
          title: design.concept.split("—")[0].trim(),
          productUid: design.garmentSku?.startsWith("gelato-")
            ? gelato.GELATO_DEFAULT_PRODUCT_UID
            : gelato.GELATO_DEFAULT_PRODUCT_UID,
          printFileUrl: design.artworkUrl!,
        });
        steps = await markStep(designId, steps, "gelatoProductId", gelatoId);
      }
      steps = await markStep(designId, steps, "printFileAttached", true);
    });

    // 4. Flat mockup as the product image
    await step.run("shopify-image", async () => {
      if (typeof steps.mediaId === "string") return;
      const mediaId = await attachProductImage({
        productId,
        imageUrl: design.flatMockupUrl!,
        alt: design.concept,
      });
      steps = await markStep(designId, steps, "mediaId", mediaId);
    });

    // 5. Publish to Online Store + Facebook & Instagram channels
    await step.run("shopify-channels", async () => {
      if (steps.channelsPublished === true) return;
      const publications = await findPublicationIds();
      if (publications.length === 0) {
        throw new Error(
          "shopify: no matching sales channels found — add the Online Store and Facebook & Instagram channels first"
        );
      }
      await publishToChannels({
        productId,
        publicationIds: publications.map((p) => p.id),
      });
      steps = await markStep(designId, steps, "channelsPublished", true);
      logStructured("info", "shopify_published", {
        designId,
        productId,
        channels: publications.map((p) => p.name),
      });
    });

    // 6. Instagram post — rate-limited via ig_publish_log (rolling 24h).
    // When the window is full we sleep until the oldest publish ages out.
    const igImageUrl = design.modelMockupUrls?.[0] ?? design.flatMockupUrl!;

    const quota = await step.run("ig-quota-check", async () => {
      const used = await igPublishCountLast24h();
      if (used < IG_ROLLING_WINDOW_CAP) return { deferUntil: null as string | null };
      const slot = await igNextSlotAt(IG_ROLLING_WINDOW_CAP);
      return { deferUntil: (slot ?? new Date(Date.now() + 60 * 60 * 1000)).toISOString() };
    });
    if (quota.deferUntil) {
      logStructured("warn", "ig_quota_deferred", { designId, until: quota.deferUntil });
      await step.sleepUntil("ig-quota-wait", quota.deferUntil);
    }

    const igMediaId = await step.run("ig-publish", async () => {
      if (typeof steps.igMediaId === "string") return steps.igMediaId;
      let containerId = typeof steps.igContainerId === "string" ? steps.igContainerId : null;
      if (!containerId) {
        containerId = await createMediaContainer({
          imageUrl: igImageUrl,
          caption: buildCaption(design),
        });
        steps = await markStep(designId, steps, "igContainerId", containerId);
      }
      const mediaId = await publishMediaContainer(containerId);
      steps = await markStep(designId, steps, "igMediaId", mediaId);
      await recordIgPublish(designId);
      return mediaId;
    });

    await step.run("finalize", async () => {
      await updateDesign(designId, {
        igMediaId,
        status: "live",
        publishedAt: new Date(),
        error: null,
      });
      logStructured("info", "design_live", { designId, productId, igMediaId });
    });

    return { designId, productId, igMediaId };
  }
);
