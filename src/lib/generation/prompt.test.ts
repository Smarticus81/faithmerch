import { describe, expect, it } from "vitest";
import { buildArtworkPrompt } from "./prompt";
import { countSvgColors, svgDimensions } from "./svg";

describe("buildArtworkPrompt", () => {
  it("quotes every literal string that must render as text", () => {
    const prompt = buildArtworkPrompt({
      concept: "botanical engraving of lilies",
      verseText: "Consider the lilies of the field",
      verseRef: "Matthew 6:28",
      inkCount: 3,
    });
    expect(prompt).toContain('\"Consider the lilies of the field\"');
    expect(prompt).toContain('\"MATTHEW 6:28\"');
  });

  it("always appends the negative constraints and separation count", () => {
    const prompt = buildArtworkPrompt({ concept: "an eagle", inkCount: 4 });
    expect(prompt).toContain("artwork plate only");
    expect(prompt).toContain("no garment and no mockup");
    expect(prompt).toContain("no gradients");
    expect(prompt).toContain("hard flat shapes, crisp edges");
    expect(prompt).toContain("ready for 4 screen separations");
  });

  it("omits verse parts when no verse is set", () => {
    const prompt = buildArtworkPrompt({ concept: "an eagle", inkCount: 2 });
    expect(prompt).not.toContain('\"');
  });
});

describe("svg helpers", () => {
  it("counts distinct fill/stroke colors, ignoring paper white", () => {
    const svg = `<svg><rect fill="#141210"/><path stroke="#B08A31"/><circle fill="#b08a31"/><rect fill="#ffffff"/></svg>`;
    expect(countSvgColors(svg)).toBe(2);
  });

  it("expands 3-digit hex before deduping", () => {
    const svg = `<svg><rect fill="#fff"/><rect fill="#000"/><rect fill="#000000"/></svg>`;
    expect(countSvgColors(svg)).toBe(1);
  });

  it("reads viewBox dimensions", () => {
    expect(svgDimensions(`<svg viewBox="0 0 800 1000"/>`)).toEqual({
      width: 800,
      height: 1000,
    });
    expect(svgDimensions(`<svg width="10"/>`)).toBeNull();
  });
});
