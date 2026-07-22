/** Shared domain types. The DB schema (src/db/schema.ts) mirrors these. */

export const DESIGN_STATUSES = [
  "draft",
  "generating",
  "ready",
  "approved",
  "killed",
  "publishing",
  "live",
  "failed",
] as const;
export type DesignStatus = (typeof DESIGN_STATUSES)[number];

export const SUPPLIERS = ["gelato", "printful"] as const;
export type Supplier = (typeof SUPPLIERS)[number];

export const ARTWORK_FORMATS = ["svg", "png"] as const;
export type ArtworkFormat = (typeof ARTWORK_FORMATS)[number];

/** Quality-gate check keys. The gate itself lands in phase 2. */
export const CHECK_KEYS = [
  "verse_match",
  "translation_license",
  "resolution",
  "alpha_halo",
  "stroke_weight",
  "ink_count",
  "trademark",
] as const;
export type CheckKey = (typeof CHECK_KEYS)[number];

/**
 * One quality-gate result. `status` is what this run concluded:
 * pass, or the check's severity (fail blocks approval, warn does not).
 * `note` must always say specifically what was found — never generic.
 */
export interface Check {
  key: CheckKey;
  status: "pass" | "warn" | "fail";
  note: string;
}

/** Translations whose license permits merchandise. Hardcoded by design. */
export const ALLOWED_TRANSLATIONS = ["KJV", "ASV", "WEB"] as const;
export type AllowedTranslation = (typeof ALLOWED_TRANSLATIONS)[number];

export interface Design {
  id: string;
  slug: string;
  concept: string;
  prompt: string;
  model: string;
  verseRef: string | null;
  translation: string | null;
  verseText: string | null;
  artworkUrl: string | null;
  artworkFormat: ArtworkFormat | null;
  widthPx: number | null;
  heightPx: number | null;
  dpi: number | null;
  colorCount: number | null;
  flatMockupUrl: string | null;
  modelMockupUrls: string[];
  garmentSku: string | null;
  garmentName: string | null;
  supplier: Supplier;
  costCents: number | null;
  priceCents: number | null;
  checks: Check[];
  status: DesignStatus;
  shopifyProductId: string | null;
  shopifyHandle: string | null;
  igMediaId: string | null;
  createdAt: string;
  decidedAt: string | null;
  publishedAt: string | null;
  error: string | null;
}

export function hasFailedCheck(design: Pick<Design, "checks">): boolean {
  return design.checks.some((c) => c.status === "fail");
}

export function failedCheckCount(design: Pick<Design, "checks">): number {
  return design.checks.filter((c) => c.status === "fail").length;
}
