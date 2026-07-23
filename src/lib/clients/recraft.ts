import { env } from "@/lib/env";
import { fetchWithRetry } from "./http";

/**
 * Recraft V4.1 client — artwork generation.
 * Parameters below are the verified-working set from the build spec.
 */

export const RECRAFT_PALETTE = ["#141210", "#B08A31", "#8A3B24", "#EDE7DA"] as const;
export const RECRAFT_BACKGROUND = "#EDE7DA";

export interface RecraftResult {
  /** URL of the generated asset (Recraft hosts it temporarily). */
  url: string;
  /** 'svg' when the vector pipeline returned SVG, else 'png'. */
  format: "svg" | "png";
}

interface RecraftResponse {
  data?: Array<{ url?: string; b64_json?: string; image?: { url?: string } }>;
}

const BASE_URL = "https://external.api.recraft.ai/v1";

export async function generateArtwork(prompt: string): Promise<RecraftResult> {
  const res = await fetchWithRetry(
    "recraft",
    `${BASE_URL}/images/generations`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env("RECRAFT_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        model: "recraft_v4_1",
        model_type: "vector",
        resolution: "2k",
        aspect_ratio: "4:5",
        background_color: RECRAFT_BACKGROUND,
        colors: RECRAFT_PALETTE,
        response_format: "url",
      }),
    },
    { attempts: 4, backoffMs: 2000 }
  );

  const json = (await res.json()) as RecraftResponse;
  const url = json.data?.[0]?.url ?? json.data?.[0]?.image?.url;
  if (!url) {
    throw new Error(
      `recraft: response contained no asset URL (keys: ${Object.keys(json).join(",")})`
    );
  }
  const format = url.split("?")[0].toLowerCase().endsWith(".svg") ? "svg" : "png";
  return { url, format };
}

/** Downloads a generated asset. */
export async function downloadAsset(url: string): Promise<Buffer> {
  const res = await fetchWithRetry("recraft-cdn", url, { method: "GET" });
  return Buffer.from(await res.arrayBuffer());
}
