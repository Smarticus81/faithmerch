/**
 * Prompt template for Recraft. Every literal string that must render as
 * text on the artwork goes inside escaped double quotes — Recraft's text
 * accuracy on quoted strings is dramatically better — and the negative
 * constraints are always appended (they measurably improve output).
 */

export interface PromptInput {
  /** Operator's design concept, e.g. "botanical line engraving of lilies". */
  concept: string;
  /** Exact verse text to render, already validated against the corpus. */
  verseText?: string | null;
  /** e.g. "Matthew 6:28" — rendered as attribution line. */
  verseRef?: string | null;
  /** Number of screen separations the palette allows. */
  inkCount: number;
}

const NEGATIVE_CONSTRAINTS =
  "artwork plate only, no garment and no mockup, no gradients, no drop shadows, " +
  "no photographic texture, hard flat shapes, crisp edges";

export function buildArtworkPrompt(input: PromptInput): string {
  const parts: string[] = [input.concept.trim()];
  if (input.verseText) {
    parts.push(`the text \"${input.verseText.trim()}\" rendered accurately`);
  }
  if (input.verseRef) {
    parts.push(`attribution line \"${input.verseRef.trim().toUpperCase()}\"`);
  }
  parts.push(NEGATIVE_CONSTRAINTS);
  parts.push(`ready for ${input.inkCount} screen separations`);
  return parts.join(", ");
}
