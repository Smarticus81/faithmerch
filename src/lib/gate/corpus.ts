import fs from "node:fs";
import path from "node:path";

/**
 * Deterministic public-domain scripture lookup. This module is the only
 * verse-truth source in the system — verse_match never consults a model.
 */

export const CORPUS_TRANSLATIONS = ["KJV", "ASV", "WEB"] as const;
export type CorpusTranslation = (typeof CORPUS_TRANSLATIONS)[number];

interface CorpusFile {
  translation: string;
  verses: Record<string, string>;
}

const cache = new Map<CorpusTranslation, CorpusFile>();

function corpusPath(translation: CorpusTranslation): string {
  return path.join(
    process.cwd(),
    "data",
    "corpus",
    `${translation.toLowerCase()}.json`
  );
}

export function loadCorpus(translation: CorpusTranslation): CorpusFile {
  const cached = cache.get(translation);
  if (cached) return cached;
  const parsed = JSON.parse(
    fs.readFileSync(corpusPath(translation), "utf8")
  ) as CorpusFile;
  cache.set(translation, parsed);
  return parsed;
}

export function isCorpusTranslation(
  translation: string
): translation is CorpusTranslation {
  return (CORPUS_TRANSLATIONS as readonly string[]).includes(
    translation.toUpperCase()
  );
}

/** Aliases → the canonical (pythonbible) book titles used as corpus keys. */
const BOOK_ALIASES: Record<string, string> = {
  psalm: "psalms",
  "song of solomon": "song of songs",
  canticles: "song of songs",
  revelations: "revelation",
};

export interface ParsedRef {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd: number;
}

/**
 * Parses "Matthew 6:28", "1 John 4:19", "Psalm 46:10", and single-chapter
 * ranges like "Matthew 6:28-29" (hyphen or en dash). Returns null when the
 * reference does not fit that shape.
 */
export function parseVerseRef(ref: string): ParsedRef | null {
  const m = ref
    .trim()
    .match(/^([1-3]?\s*[A-Za-z][A-Za-z .]*?)\s+(\d+):(\d+)(?:\s*[-–]\s*(\d+))?$/);
  if (!m) return null;
  let book = m[1].replace(/\s+/g, " ").trim().toLowerCase();
  book = BOOK_ALIASES[book] ?? book;
  const chapter = parseInt(m[2], 10);
  const verseStart = parseInt(m[3], 10);
  const verseEnd = m[4] ? parseInt(m[4], 10) : verseStart;
  if (verseEnd < verseStart) return null;
  return { book, chapter, verseStart, verseEnd };
}

/**
 * Returns the corpus text for a reference (ranges are joined with a single
 * space), or null if any verse in the range is not in the corpus.
 */
export function lookupVerse(
  translation: CorpusTranslation,
  ref: string
): string | null {
  const parsed = parseVerseRef(ref);
  if (!parsed) return null;
  const { verses } = loadCorpus(translation);
  const parts: string[] = [];
  for (let v = parsed.verseStart; v <= parsed.verseEnd; v++) {
    const text = verses[`${parsed.book} ${parsed.chapter}:${v}`];
    if (!text) return null;
    parts.push(text);
  }
  return parts.join(" ");
}
