import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { logStructured } from "./clients/http";

/**
 * Supabase Storage. Both buckets are public-read: Instagram can only fetch
 * public HTTPS URLs, and print files are not secrets.
 */

export const ARTWORK_BUCKET = "artwork";
export const MOCKUP_BUCKET = "mockups";

let client: SupabaseClient | null = null;

function supabase(): SupabaseClient {
  client ??= createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_KEY"), {
    auth: { persistSession: false },
  });
  return client;
}

/** Uploads and returns the public URL. Upserts so retried jobs are safe. */
export async function uploadPublic(
  bucket: string,
  path: string,
  data: Buffer,
  contentType: string
): Promise<string> {
  const { error } = await supabase().storage.from(bucket).upload(path, data, {
    contentType,
    upsert: true,
  });
  if (error) {
    logStructured("error", "storage_upload_failed", { bucket, path, error: error.message });
    throw new Error(`storage: upload of ${bucket}/${path} failed: ${error.message}`);
  }
  const { data: pub } = supabase().storage.from(bucket).getPublicUrl(path);
  logStructured("info", "storage_uploaded", { bucket, path, bytes: data.length });
  return pub.publicUrl;
}
