import { env } from "@/lib/env";
import { fetchWithRetry } from "./http";

/**
 * Gelato client — primary supplier. Order routing is handled entirely by
 * the Gelato Shopify app (no order code in this repo). This client covers:
 *  1. Product creation in Gelato's e-commerce store mapped to our Shopify
 *     product, which attaches the print file for fulfillment.
 *
 * NOTE: endpoint shapes follow Gelato's published API docs
 * (order/product/ecommerce *.gelatoapis.com). They could not be verified
 * live from this build environment (network policy blocks non-allowlisted
 * hosts) — verify on first run with a real GELATO_API_KEY and adjust; the
 * client isolates every Gelato call here so a fix never touches callers.
 */

const ECOMMERCE_BASE = "https://ecommerce.gelatoapis.com/v1";

/** Default Gelato product UID for the heavyweight natural tee. */
export const GELATO_DEFAULT_PRODUCT_UID =
  "apparel_product_gca_t-shirt_gsp_heavyweight";

function headers(): Record<string, string> {
  return {
    "X-API-KEY": env("GELATO_API_KEY"),
    "Content-Type": "application/json",
  };
}

/** Returns the first connected Shopify store's id (single-store operator). */
export async function findStoreId(): Promise<string> {
  const res = await fetchWithRetry(
    "gelato",
    `${ECOMMERCE_BASE}/stores`,
    { method: "GET", headers: headers() },
    { attempts: 3, backoffMs: 2000 }
  );
  const json = (await res.json()) as { stores?: Array<{ id: string }> };
  const id = json.stores?.[0]?.id;
  if (!id) {
    throw new Error(
      "gelato: no connected store found — install the Gelato Shopify app first (docs/setup.md)."
    );
  }
  return id;
}

/**
 * Registers the design with Gelato against the Shopify product so the
 * Gelato app fulfills its orders with this print file. externalId keys the
 * upsert — re-runs must not create duplicates.
 */
export async function attachPrintFile(input: {
  storeId: string;
  shopifyProductId: string;
  title: string;
  productUid: string;
  printFileUrl: string;
}): Promise<string> {
  const res = await fetchWithRetry(
    "gelato",
    `${ECOMMERCE_BASE}/stores/${encodeURIComponent(input.storeId)}/products`,
    {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({
        externalId: input.shopifyProductId,
        title: input.title,
        productUid: input.productUid,
        files: [{ type: "default", url: input.printFileUrl }],
      }),
    },
    { attempts: 3, backoffMs: 2000 }
  );
  const json = (await res.json()) as { id?: string };
  return json.id ?? "";
}
