import { env } from "@/lib/env";
import { fetchWithRetry } from "./http";

/**
 * Printful client — premium/branded SKUs. Two jobs:
 *  1. Mockup generator (flat product shots) — never render these ourselves.
 *  2. Sync products: attaches print files to Shopify variants so the
 *     Printful Shopify app fulfills orders with the right artwork.
 */

const BASE_URL = "https://api.printful.com";

function headers(): Record<string, string> {
  return {
    Authorization: `Bearer ${env("PRINTFUL_API_KEY")}`,
    "Content-Type": "application/json",
  };
}

/** Printful catalog product id for our default premium tee (Bella+Canvas 3001). */
export const PRINTFUL_DEFAULT_CATALOG_ID = 71;

interface MockupTaskResult {
  task_key: string;
  status: "pending" | "completed" | "failed";
  mockups?: Array<{ mockup_url: string }>;
  error?: string;
}

/** Generates a flat product mockup and returns its temporary URL. */
export async function generateFlatMockup(input: {
  artworkUrl: string;
  catalogProductId?: number;
}): Promise<string> {
  const productId = input.catalogProductId ?? PRINTFUL_DEFAULT_CATALOG_ID;

  const createRes = await fetchWithRetry(
    "printful",
    `${BASE_URL}/mockup-generator/create-task/${productId}`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        format: "jpg",
        files: [{ placement: "front", image_url: input.artworkUrl }],
      }),
    },
    { attempts: 3, backoffMs: 2000 }
  );
  const createJson = (await createRes.json()) as { result: MockupTaskResult };
  const taskKey = createJson.result.task_key;

  const deadline = Date.now() + 3 * 60 * 1000;
  for (;;) {
    await new Promise((r) => setTimeout(r, 3000));
    if (Date.now() > deadline) {
      throw new Error(`printful: mockup task ${taskKey} timed out after 3m`);
    }
    const pollRes = await fetchWithRetry(
      "printful",
      `${BASE_URL}/mockup-generator/task?task_key=${encodeURIComponent(taskKey)}`,
      { method: "GET", headers: headers() }
    );
    const poll = (await pollRes.json()) as { result: MockupTaskResult };
    if (poll.result.status === "completed") {
      const url = poll.result.mockups?.[0]?.mockup_url;
      if (!url) throw new Error(`printful: task ${taskKey} completed with no mockup`);
      return url;
    }
    if (poll.result.status === "failed") {
      throw new Error(`printful: mockup task ${taskKey} failed: ${poll.result.error ?? "no detail"}`);
    }
  }
}

/**
 * Creates a Printful sync product linked to an existing Shopify product,
 * attaching the print file to every variant. The Printful Shopify app then
 * owns fulfillment for it. external_id ties it to the Shopify product so
 * re-runs upsert instead of duplicating.
 */
export async function attachPrintFile(input: {
  shopifyProductId: string;
  name: string;
  printFileUrl: string;
  variantIds: Array<{ printfulVariantId: number; retailPrice: string }>;
}): Promise<string> {
  const res = await fetchWithRetry(
    "printful",
    `${BASE_URL}/store/products`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        sync_product: {
          external_id: input.shopifyProductId,
          name: input.name,
        },
        sync_variants: input.variantIds.map((v) => ({
          variant_id: v.printfulVariantId,
          retail_price: v.retailPrice,
          files: [{ type: "front", url: input.printFileUrl }],
        })),
      }),
    },
    { attempts: 3, backoffMs: 2000 }
  );
  const json = (await res.json()) as { result?: { id?: number } };
  return String(json.result?.id ?? "");
}
