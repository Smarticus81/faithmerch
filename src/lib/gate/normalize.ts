/**
 * Verse-text normalization for exact-match comparison.
 *
 * Per spec: whitespace, case, and curly quotes. Plus documented corpus
 * artifacts that would otherwise cause false failures:
 *  - KJV wraps translator-supplied words in square brackets ("I [am] God");
 *    printed designs render the word without brackets.
 *  - This WEB edition uses backticks as apostrophes ("don`t").
 *  - En/em dashes unified with hyphens.
 */
export function normalizeVerseText(text: string): string {
  return text
    .replace(/[‘’ʼ`]/g, "'") // curly/modifier apostrophes, backtick
    .replace(/[“”]/g, '"') // curly double quotes
    .replace(/[–—]/g, "-") // en/em dash
    .replace(/[[\]]/g, "") // KJV italics markers
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
