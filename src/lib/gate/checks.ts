import fs from "node:fs";
import path from "node:path";
import { PNG } from "pngjs";
import type { Check } from "@/lib/types";
import { normalizeVerseText } from "./normalize";
import { isCorpusTranslation, lookupVerse, parseVerseRef } from "./corpus";

/**
 * Everything the gate needs to evaluate one design. Fields mirror the
 * designs row; raw artwork is passed in so checks stay pure functions.
 */
export interface GateInput {
  concept: string;
  prompt: string;
  verseRef: string | null;
  translation: string | null;
  /** The verse text as actually rendered on the artwork. */
  verseText: string | null;
  artworkFormat: "svg" | "png" | null;
  widthPx: number | null;
  heightPx: number | null;
  dpi: number | null;
  colorCount: number | null;
  /** Raw SVG source, when artworkFormat === 'svg'. */
  artworkSvg?: string;
  /** Raw PNG bytes, when artworkFormat === 'png'. */
  artworkPng?: Buffer;
  /** Physical print width in inches; garment default. */
  printWidthIn?: number;
}

const MIN_RASTER_WIDTH = 4500;
const MIN_RASTER_HEIGHT = 5400;
const MIN_DPI = 300;
const MAX_INKS = 4;
const MIN_STROKE_PT = 1.2;
const DEFAULT_PRINT_WIDTH_IN = 12;
/** Fraction of partially-transparent pixels above which we flag a halo. */
const ALPHA_HALO_THRESHOLD = 0.01;

/**
 * Merchandise-safe translations. Hardcoded on purpose — NIV, ESV, NLT,
 * NASB, NKJV, MSG are copyrighted and their permission grants exclude
 * merchandise. Do not make this configurable.
 */
const LICENSE_ALLOWLIST = ["KJV", "ASV", "WEB"] as const;

export function checkVerseMatch(input: GateInput): Check {
  const key = "verse_match" as const;
  if (!input.verseRef) {
    return { key, status: "pass", note: "No verse referenced — check not applicable." };
  }
  if (!input.translation) {
    return {
      key,
      status: "fail",
      note: `Design references ${input.verseRef} but no translation is set, so the text cannot be verified against a corpus.`,
    };
  }
  if (!isCorpusTranslation(input.translation)) {
    return {
      key,
      status: "pass",
      note: `No public-domain corpus exists for ${input.translation.toUpperCase()} — text not verifiable here; the translation_license check governs this design.`,
    };
  }
  if (!input.verseText) {
    return {
      key,
      status: "fail",
      note: `Design references ${input.verseRef} (${input.translation}) but no rendered verse text was captured to compare against the corpus.`,
    };
  }
  const translation = input.translation.toUpperCase() as "KJV" | "ASV" | "WEB";
  if (!parseVerseRef(input.verseRef)) {
    return {
      key,
      status: "fail",
      note: `Could not parse verse reference "${input.verseRef}" — expected a form like "Matthew 6:28" or "Matthew 6:28-29".`,
    };
  }
  const corpusText = lookupVerse(translation, input.verseRef);
  if (corpusText === null) {
    return {
      key,
      status: "fail",
      note: `${input.verseRef} was not found in the ${translation} corpus — the reference may be wrong.`,
    };
  }
  const expected = normalizeVerseText(corpusText);
  const actual = normalizeVerseText(input.verseText);
  if (expected !== actual) {
    return {
      key,
      status: "fail",
      note:
        `Rendered text does not match ${translation} ${input.verseRef}. ` +
        `Corpus: "${truncate(corpusText, 90)}" — rendered: "${truncate(input.verseText, 90)}".`,
    };
  }
  return {
    key,
    status: "pass",
    note: `Rendered text exact-matches ${translation} ${input.verseRef} after normalization.`,
  };
}

export function checkTranslationLicense(input: GateInput): Check {
  const key = "translation_license" as const;
  if (!input.translation) {
    return {
      key,
      status: "pass",
      note: "No translation referenced — no license to clear.",
    };
  }
  const t = input.translation.toUpperCase();
  if ((LICENSE_ALLOWLIST as readonly string[]).includes(t)) {
    return {
      key,
      status: "pass",
      note: `${t} is public domain — on the merchandise allowlist.`,
    };
  }
  return {
    key,
    status: "fail",
    note: `${t} is copyrighted and its permissions exclude merchandise. Allowed translations: KJV, ASV, WEB.`,
  };
}

export function checkResolution(input: GateInput): Check {
  const key = "resolution" as const;
  if (input.artworkFormat === "svg") {
    return {
      key,
      status: "pass",
      note: "SVG artwork is resolution-independent — auto-pass.",
    };
  }
  if (input.widthPx === null || input.heightPx === null || input.dpi === null) {
    return {
      key,
      status: "fail",
      note: "Raster artwork is missing dimension or DPI metadata — cannot verify print resolution.",
    };
  }
  const failures: string[] = [];
  if (input.widthPx < MIN_RASTER_WIDTH || input.heightPx < MIN_RASTER_HEIGHT) {
    failures.push(
      `${input.widthPx}×${input.heightPx}px is below the ${MIN_RASTER_WIDTH}×${MIN_RASTER_HEIGHT}px minimum`
    );
  }
  if (input.dpi < MIN_DPI) {
    failures.push(`${input.dpi} DPI is below the ${MIN_DPI} DPI minimum`);
  }
  if (failures.length > 0) {
    return {
      key,
      status: "fail",
      note: `Raster artwork ${failures.join(" and ")} for print.`,
    };
  }
  return {
    key,
    status: "pass",
    note: `Raster artwork is ${input.widthPx}×${input.heightPx}px at ${input.dpi} DPI — meets the print minimum.`,
  };
}

export function checkAlphaHalo(input: GateInput): Check {
  const key = "alpha_halo" as const;
  if (input.artworkFormat === "svg") {
    return {
      key,
      status: "pass",
      note: "Vector artwork has no alpha raster to sample.",
    };
  }
  if (!input.artworkPng) {
    return {
      key,
      status: "warn",
      note: "Alpha channel could not be sampled — no raster data was provided to the gate.",
    };
  }
  let png: PNG;
  try {
    png = PNG.sync.read(input.artworkPng);
  } catch (err) {
    return {
      key,
      status: "warn",
      note: `PNG could not be decoded for alpha sampling: ${err instanceof Error ? err.message : String(err)}.`,
    };
  }
  const total = png.width * png.height;
  let partial = 0;
  for (let i = 3; i < png.data.length; i += 4) {
    const a = png.data[i];
    if (a > 0 && a < 255) partial++;
  }
  const ratio = partial / total;
  if (ratio > ALPHA_HALO_THRESHOLD) {
    return {
      key,
      status: "warn",
      note: `Partial-transparency fringing on ${(ratio * 100).toFixed(1)}% of pixels (threshold ${ALPHA_HALO_THRESHOLD * 100}%) — soft edges will halo on screen print.`,
    };
  }
  return {
    key,
    status: "pass",
    note: `Alpha channel is clean — ${(ratio * 100).toFixed(2)}% partial-transparency pixels (threshold ${ALPHA_HALO_THRESHOLD * 100}%).`,
  };
}

export function checkStrokeWeight(input: GateInput): Check {
  const key = "stroke_weight" as const;
  if (input.artworkFormat !== "svg" || !input.artworkSvg) {
    return {
      key,
      status: "pass",
      note: "Stroke measurement applies to vector artwork only — raster strokes are not deterministically measurable.",
    };
  }
  const viewBox = input.artworkSvg.match(
    /viewBox\s*=\s*["']\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+[\d.]+\s*["']/
  );
  const strokeWidths = [
    ...input.artworkSvg.matchAll(/stroke-width\s*[:=]\s*["']?([\d.]+)/g),
  ].map((m) => parseFloat(m[1]));
  if (strokeWidths.length === 0) {
    return {
      key,
      status: "pass",
      note: "No stroked paths — all shapes are filled outlines.",
    };
  }
  if (!viewBox) {
    return {
      key,
      status: "warn",
      note: "SVG has stroked paths but no parseable viewBox — stroke weight at print size cannot be computed.",
    };
  }
  const viewBoxWidth = parseFloat(viewBox[1]);
  const printWidthIn = input.printWidthIn ?? DEFAULT_PRINT_WIDTH_IN;
  const ptPerUnit = (printWidthIn * 72) / viewBoxWidth;
  const minPt = Math.min(...strokeWidths) * ptPerUnit;
  if (minPt < MIN_STROKE_PT) {
    return {
      key,
      status: "warn",
      note: `Thinnest stroke is ${minPt.toFixed(2)}pt at a ${printWidthIn}in print width — below the ${MIN_STROKE_PT}pt minimum, likely to break up on screen print.`,
    };
  }
  return {
    key,
    status: "pass",
    note: `Thinnest stroke is ${minPt.toFixed(2)}pt at a ${printWidthIn}in print width (minimum ${MIN_STROKE_PT}pt).`,
  };
}

export function checkInkCount(input: GateInput): Check {
  const key = "ink_count" as const;
  if (input.colorCount === null) {
    return {
      key,
      status: "warn",
      note: "Color count is missing — cannot verify the screen budget.",
    };
  }
  if (input.colorCount > MAX_INKS) {
    return {
      key,
      status: "warn",
      note: `${input.colorCount} distinct colors — over the ${MAX_INKS}-screen budget; every extra color is another screen and another cost line.`,
    };
  }
  return {
    key,
    status: "pass",
    note: `${input.colorCount} distinct colors — within the ${MAX_INKS}-screen budget.`,
  };
}

interface BlocklistFile {
  terms: string[];
}

let blocklistCache: string[] | null = null;

function loadBlocklist(): string[] {
  if (blocklistCache) return blocklistCache;
  const raw = fs.readFileSync(
    path.join(process.cwd(), "data", "trademark-blocklist.json"),
    "utf8"
  );
  blocklistCache = (JSON.parse(raw) as BlocklistFile).terms.map((t) =>
    t.toLowerCase()
  );
  return blocklistCache;
}

export function checkTrademark(input: GateInput): Check {
  const key = "trademark" as const;
  const haystack = [input.concept, input.prompt, input.verseText ?? ""]
    .join("\n")
    .toLowerCase();
  const hits = loadBlocklist().filter((term) => haystack.includes(term));
  if (hits.length > 0) {
    return {
      key,
      status: "fail",
      note: `Blocklist term${hits.length === 1 ? "" : "s"} found: ${hits.map((h) => `"${h}"`).join(", ")} — publishing risks a trademark claim.`,
    };
  }
  return {
    key,
    status: "pass",
    note: "No blocklist term found in concept, prompt, or rendered text.",
  };
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}
