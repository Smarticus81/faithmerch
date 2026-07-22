#!/usr/bin/env python3
"""Regenerate data/corpus/{kjv,asv,web}.json from the pythonbible packages.

Usage:
    pip install pythonbible pythonbible-kjv pythonbible-asv pythonbible-web
    python3 scripts/generate-corpus.py

The package files are MIT-licensed (verified in each wheel's METADATA);
the verse text itself is public domain. See data/corpus/README.md.
"""
import json
import os

import pythonbible as pb

OUT = os.path.join(os.path.dirname(__file__), "..", "data", "corpus")

VERSIONS = {
    "kjv": ("KJV", pb.Version.KING_JAMES, "pythonbible-kjv"),
    "asv": ("ASV", pb.Version.AMERICAN_STANDARD, "pythonbible-asv"),
    "web": ("WEB", pb.Version.WORLD_ENGLISH, "pythonbible-web"),
}


def main() -> None:
    os.makedirs(OUT, exist_ok=True)
    for slug, (label, version, pkg) in VERSIONS.items():
        verses = {}
        skipped = 0
        for vid in pb.verses.VERSE_IDS:
            book_num = vid // 1_000_000
            chapter = (vid % 1_000_000) // 1000
            verse = vid % 1000
            try:
                text = pb.get_verse_text(vid, version=version)
            except Exception:
                # Apocrypha ids exist in VERSE_IDS but not in these
                # Protestant-canon translations.
                skipped += 1
                continue
            if not text or not text.strip():
                skipped += 1
                continue
            book = pb.Book(book_num).title
            verses[f"{book.lower()} {chapter}:{verse}"] = text.strip()
        doc = {
            "translation": label,
            "source": f"{pkg} 0.0.2 (PyPI), part of the pythonbible project by avendesora",
            "sourceUrl": "https://github.com/avendesora/pythonbible",
            "fileLicense": "MIT (verified from wheel METADATA License-Expression)",
            "textLicense": "Public domain",
            "verses": verses,
        }
        path = os.path.join(OUT, f"{slug}.json")
        with open(path, "w") as f:
            json.dump(doc, f, ensure_ascii=False, separators=(",", ":"))
        print(f"{slug}: {len(verses)} verses written, {skipped} ids skipped")


if __name__ == "__main__":
    main()
