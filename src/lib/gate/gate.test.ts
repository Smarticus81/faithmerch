import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { runQualityGate, type GateInput } from "./index";
import { normalizeVerseText } from "./normalize";
import { lookupVerse, parseVerseRef } from "./corpus";
import type { Check } from "@/lib/types";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/** PNG with only fully-opaque and fully-transparent pixels. */
function hardEdgePng(size = 32): Buffer {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (size * y + x) * 4;
      const inside = x > size / 4 && x < (3 * size) / 4;
      png.data[i] = 20;
      png.data[i + 1] = 18;
      png.data[i + 2] = 16;
      png.data[i + 3] = inside ? 255 : 0;
    }
  }
  return PNG.sync.write(png);
}

/** PNG whose alpha ramps 0→255, i.e. heavy partial transparency. */
function fringedPng(size = 32): Buffer {
  const png = new PNG({ width: size, height: size });
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (size * y + x) * 4;
      png.data[i] = 20;
      png.data[i + 1] = 18;
      png.data[i + 2] = 16;
      png.data[i + 3] = Math.round((x / (size - 1)) * 255);
    }
  }
  return PNG.sync.write(png);
}

const KJV_MATTHEW_6_28 =
  "And why take ye thought for raiment? Consider the lilies of the field, how they grow; they toil not, neither do they spin:";

const baseInput: GateInput = {
  concept: "Consider the lilies — botanical engraving",
  prompt: 'Botanical engraving, "Consider the lilies", artwork plate only',
  verseRef: "Matthew 6:28",
  translation: "KJV",
  verseText: KJV_MATTHEW_6_28,
  artworkFormat: "svg",
  widthPx: null,
  heightPx: null,
  dpi: null,
  colorCount: 3,
  artworkSvg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 1000"><path d="M0 0h800" fill="none" stroke="#141210" stroke-width="2"/></svg>`,
};

const byKey = (checks: Check[]) =>
  Object.fromEntries(checks.map((c) => [c.key, c]));

/* ------------------------------------------------------------------ */
/* Acceptance criteria from the build spec                             */
/* ------------------------------------------------------------------ */

describe("acceptance", () => {
  it("an NIV verse at 150 DPI returns exactly two failures with correct notes", () => {
    const checks = runQualityGate({
      concept: "Be still — minimalist mountains",
      prompt: 'Mountains with "Be still, and know that I am God"',
      verseRef: "Psalm 46:10",
      translation: "NIV",
      verseText:
        "He says, “Be still, and know that I am God; I will be exalted among the nations, I will be exalted in the earth.”",
      artworkFormat: "png",
      widthPx: 2048,
      heightPx: 2560,
      dpi: 150,
      colorCount: 2,
      artworkPng: hardEdgePng(),
    });

    const failures = checks.filter((c) => c.status === "fail");
    expect(failures).toHaveLength(2);

    const c = byKey(checks);
    expect(c.translation_license.status).toBe("fail");
    expect(c.translation_license.note).toContain("NIV");
    expect(c.translation_license.note).toContain("KJV, ASV, WEB");
    expect(c.resolution.status).toBe("fail");
    expect(c.resolution.note).toContain("2048×2560");
    expect(c.resolution.note).toContain("150 DPI");
    // NIV has no public-domain corpus; the license check is what blocks it
    expect(c.verse_match.status).toBe("pass");
  });

  it("a KJV SVG returns all passes", () => {
    const checks = runQualityGate(baseInput);
    expect(checks).toHaveLength(7);
    for (const check of checks) {
      expect(check.status, `${check.key}: ${check.note}`).toBe("pass");
    }
    // every check writes a specific, non-generic note
    for (const check of checks) {
      expect(check.note.length).toBeGreaterThan(20);
    }
  });
});

/* ------------------------------------------------------------------ */
/* verse_match                                                         */
/* ------------------------------------------------------------------ */

describe("verse_match", () => {
  it("passes when rendered text differs only by case, whitespace, and quote style", () => {
    const checks = byKey(
      runQualityGate({
        ...baseInput,
        verseText:
          "AND WHY TAKE YE THOUGHT FOR RAIMENT?  Consider the lilies of the field, how they grow; they toil not, neither do they spin:",
      })
    );
    expect(checks.verse_match.status).toBe("pass");
  });

  it("fails with corpus vs rendered excerpts when the text is wrong", () => {
    const checks = byKey(
      runQualityGate({ ...baseInput, verseText: "Consider the lilies." })
    );
    expect(checks.verse_match.status).toBe("fail");
    expect(checks.verse_match.note).toContain("does not match KJV Matthew 6:28");
    expect(checks.verse_match.note).toContain("Consider the lilies.");
  });

  it("fails when the reference is not in the corpus", () => {
    const checks = byKey(
      runQualityGate({ ...baseInput, verseRef: "Matthew 99:1" })
    );
    expect(checks.verse_match.status).toBe("fail");
    expect(checks.verse_match.note).toContain("Matthew 99:1");
    expect(checks.verse_match.note).toContain("not found in the KJV corpus");
  });

  it("fails when a verse is referenced but no rendered text was captured", () => {
    const checks = byKey(runQualityGate({ ...baseInput, verseText: null }));
    expect(checks.verse_match.status).toBe("fail");
    expect(checks.verse_match.note).toContain("no rendered verse text");
  });

  it("passes as not-applicable when no verse is referenced", () => {
    const checks = byKey(
      runQualityGate({
        ...baseInput,
        verseRef: null,
        translation: null,
        verseText: null,
      })
    );
    expect(checks.verse_match.status).toBe("pass");
    expect(checks.verse_match.note).toContain("not applicable");
  });

  it("supports ASV and WEB corpora and the Psalm→Psalms alias", () => {
    expect(lookupVerse("ASV", "Psalm 46:10")).toContain(
      "Be still, and know that I am God"
    );
    expect(lookupVerse("WEB", "John 3:16")).toContain(
      "God so loved the world"
    );
  });

  it("joins verse ranges with a space", () => {
    const single28 = lookupVerse("KJV", "Matthew 6:28")!;
    const single29 = lookupVerse("KJV", "Matthew 6:29")!;
    expect(lookupVerse("KJV", "Matthew 6:28-29")).toBe(
      `${single28} ${single29}`
    );
  });

  it("parses numbered books", () => {
    expect(parseVerseRef("1 John 4:19")).toEqual({
      book: "1 john",
      chapter: 4,
      verseStart: 19,
      verseEnd: 19,
    });
    expect(lookupVerse("KJV", "1 John 4:19")).toContain("We love him");
  });
});

/* ------------------------------------------------------------------ */
/* translation_license                                                 */
/* ------------------------------------------------------------------ */

describe("translation_license", () => {
  it.each(["NIV", "ESV", "NLT", "NASB", "NKJV", "MSG"])(
    "fails %s (copyrighted, merchandise excluded)",
    (translation) => {
      const checks = byKey(runQualityGate({ ...baseInput, translation }));
      expect(checks.translation_license.status).toBe("fail");
      expect(checks.translation_license.note).toContain(translation);
    }
  );

  it.each(["KJV", "kjv", "ASV", "WEB"])("passes %s", (translation) => {
    const checks = byKey(
      runQualityGate({ ...baseInput, translation, verseRef: null, verseText: null })
    );
    expect(checks.translation_license.status).toBe("pass");
  });
});

/* ------------------------------------------------------------------ */
/* resolution                                                          */
/* ------------------------------------------------------------------ */

describe("resolution", () => {
  it("auto-passes SVG", () => {
    const checks = byKey(runQualityGate(baseInput));
    expect(checks.resolution.status).toBe("pass");
    expect(checks.resolution.note).toContain("resolution-independent");
  });

  it("passes raster at exactly the minimum", () => {
    const checks = byKey(
      runQualityGate({
        ...baseInput,
        artworkFormat: "png",
        artworkSvg: undefined,
        artworkPng: hardEdgePng(),
        widthPx: 4500,
        heightPx: 5400,
        dpi: 300,
      })
    );
    expect(checks.resolution.status).toBe("pass");
  });

  it("fails raster with missing metadata", () => {
    const checks = byKey(
      runQualityGate({
        ...baseInput,
        artworkFormat: "png",
        artworkSvg: undefined,
        widthPx: null,
        heightPx: null,
        dpi: null,
      })
    );
    expect(checks.resolution.status).toBe("fail");
    expect(checks.resolution.note).toContain("missing dimension or DPI");
  });
});

/* ------------------------------------------------------------------ */
/* alpha_halo, stroke_weight, ink_count, trademark                     */
/* ------------------------------------------------------------------ */

describe("alpha_halo", () => {
  it("passes a hard-edged PNG", () => {
    const checks = byKey(
      runQualityGate({
        ...baseInput,
        artworkFormat: "png",
        artworkSvg: undefined,
        artworkPng: hardEdgePng(),
        widthPx: 4500,
        heightPx: 5400,
        dpi: 300,
      })
    );
    expect(checks.alpha_halo.status).toBe("pass");
  });

  it("warns on heavy partial transparency with the measured percentage", () => {
    const checks = byKey(
      runQualityGate({
        ...baseInput,
        artworkFormat: "png",
        artworkSvg: undefined,
        artworkPng: fringedPng(),
        widthPx: 4500,
        heightPx: 5400,
        dpi: 300,
      })
    );
    expect(checks.alpha_halo.status).toBe("warn");
    expect(checks.alpha_halo.note).toMatch(/\d+(\.\d+)?% of pixels/);
  });

  it("warns when no raster data is available to sample", () => {
    const checks = byKey(
      runQualityGate({
        ...baseInput,
        artworkFormat: "png",
        artworkSvg: undefined,
        artworkPng: undefined,
        widthPx: 4500,
        heightPx: 5400,
        dpi: 300,
      })
    );
    expect(checks.alpha_halo.status).toBe("warn");
    expect(checks.alpha_halo.note).toContain("no raster data");
  });
});

describe("stroke_weight", () => {
  it("warns on strokes below 1.2pt at print size", () => {
    // viewBox 800 wide at 12in print → 1.08pt per unit; 0.5 units = 0.54pt
    const checks = byKey(
      runQualityGate({
        ...baseInput,
        artworkSvg: `<svg viewBox="0 0 800 1000"><path stroke-width="0.5" stroke="#000" d="M0 0h10"/></svg>`,
      })
    );
    expect(checks.stroke_weight.status).toBe("warn");
    expect(checks.stroke_weight.note).toMatch(/0\.5\dpt/);
  });

  it("passes when there are no stroked paths", () => {
    const checks = byKey(
      runQualityGate({
        ...baseInput,
        artworkSvg: `<svg viewBox="0 0 800 1000"><rect width="10" height="10" fill="#000"/></svg>`,
      })
    );
    expect(checks.stroke_weight.status).toBe("pass");
    expect(checks.stroke_weight.note).toContain("filled outlines");
  });
});

describe("ink_count", () => {
  it("warns above 4 colors", () => {
    const checks = byKey(runQualityGate({ ...baseInput, colorCount: 5 }));
    expect(checks.ink_count.status).toBe("warn");
    expect(checks.ink_count.note).toContain("5 distinct colors");
  });

  it("warns when the count is unknown", () => {
    const checks = byKey(runQualityGate({ ...baseInput, colorCount: null }));
    expect(checks.ink_count.status).toBe("warn");
  });
});

describe("trademark", () => {
  it("fails on a blocklist term and names it", () => {
    const checks = byKey(
      runQualityGate({
        ...baseInput,
        concept: "Just Do It — but make it faith",
      })
    );
    expect(checks.trademark.status).toBe("fail");
    expect(checks.trademark.note).toContain('"just do it"');
  });

  it("passes clean designs", () => {
    const checks = byKey(runQualityGate(baseInput));
    expect(checks.trademark.status).toBe("pass");
  });
});

/* ------------------------------------------------------------------ */
/* normalize                                                           */
/* ------------------------------------------------------------------ */

describe("normalizeVerseText", () => {
  it("normalizes case, whitespace, and curly quotes per spec", () => {
    expect(normalizeVerseText("“Be  Still,”  he said")).toBe(
      '"be still," he said'
    );
    expect(normalizeVerseText("don’t")).toBe("don't");
  });

  it("strips KJV italics brackets and unifies backtick apostrophes", () => {
    expect(normalizeVerseText("I [am] God")).toBe("i am god");
    expect(normalizeVerseText("don`t")).toBe("don't");
  });
});
