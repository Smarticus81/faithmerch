import { desc } from "drizzle-orm";
import { db, metaTokens } from "@/db";
import { env } from "@/lib/env";
import { fetchWithRetry, logStructured } from "./http";

/**
 * Meta Graph API client — Instagram publishing only. Catalog sync is
 * Shopify's Facebook & Instagram channel's job, not ours.
 *
 * Constraints encoded here (they break the build if ignored):
 *  - image must be a public HTTPS URL; binary upload unsupported
 *  - JPEG only
 *  - ~25 published media per rolling 24h (enforced by the caller via the
 *    ig_publish_log table, never in memory)
 *  - long-lived tokens expire at 60 days → refreshed on a schedule into
 *    the meta_tokens table (env vars can't be rewritten at runtime)
 */

const GRAPH_VERSION = "v23.0";
const BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;

export const IG_ROLLING_WINDOW_CAP = 25;

/** Current token: latest refreshed row, falling back to the env seed. */
export async function getActiveToken(): Promise<string> {
  const rows = await db()
    .select()
    .from(metaTokens)
    .orderBy(desc(metaTokens.refreshedAt))
    .limit(1);
  return rows[0]?.token ?? env("META_LONG_LIVED_TOKEN");
}

function logUsageHeaders(res: Response, event: string): void {
  logStructured("info", event, {
    appUsage: res.headers.get("X-App-Usage"),
    businessUseCaseUsage: res.headers.get("X-Business-Use-Case-Usage"),
  });
}

/** Step 1 of 2: create a media container for a public JPEG URL. */
export async function createMediaContainer(input: {
  imageUrl: string;
  caption: string;
}): Promise<string> {
  const token = await getActiveToken();
  const res = await fetchWithRetry(
    "instagram",
    `${BASE_URL}/${env("IG_USER_ID")}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: input.imageUrl,
        caption: input.caption,
        access_token: token,
      }),
    },
    { attempts: 3, backoffMs: 2000 }
  );
  logUsageHeaders(res, "ig_container_created");
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error("instagram: container creation returned no id");
  return json.id;
}

/** Step 2 of 2: publish the container. Returns the IG media id. */
export async function publishMediaContainer(creationId: string): Promise<string> {
  const token = await getActiveToken();
  const res = await fetchWithRetry(
    "instagram",
    `${BASE_URL}/${env("IG_USER_ID")}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: creationId, access_token: token }),
    },
    { attempts: 3, backoffMs: 2000 }
  );
  logUsageHeaders(res, "ig_media_published");
  const json = (await res.json()) as { id?: string };
  if (!json.id) throw new Error("instagram: media_publish returned no id");
  return json.id;
}

/**
 * Exchanges the current long-lived token for a fresh one (60-day expiry)
 * and stores it. Called by the scheduled refresh job.
 */
export async function refreshLongLivedToken(): Promise<void> {
  const current = await getActiveToken();
  const url =
    `${BASE_URL}/oauth/access_token?grant_type=fb_exchange_token` +
    `&client_id=${encodeURIComponent(env("META_APP_ID"))}` +
    `&client_secret=${encodeURIComponent(env("META_APP_SECRET"))}` +
    `&fb_exchange_token=${encodeURIComponent(current)}`;
  const res = await fetchWithRetry("instagram", url, { method: "GET" });
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("instagram: token refresh returned no access_token");
  const expiresAt = json.expires_in
    ? new Date(Date.now() + json.expires_in * 1000)
    : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  await db().insert(metaTokens).values({ token: json.access_token, expiresAt });
  logStructured("info", "meta_token_refreshed", { expiresAt: expiresAt.toISOString() });
}
