# Scripture corpus

`kjv.json`, `asv.json`, `web.json` — full verse text for the three
translations whose licenses permit merchandise. These files are the ONLY
source of truth for the `verse_match` quality check: rendered verse text must
exact-match a corpus entry (after normalization). Never an LLM.

## Provenance and licensing

Generated from the **pythonbible** project's text packages on PyPI:
`pythonbible-kjv` / `pythonbible-asv` / `pythonbible-web`, version 0.0.2,
by avendesora — <https://github.com/avendesora/pythonbible>.

License verification (the spec requires verifying the *file's* license, not
just the text's):

- **Package files:** MIT — verified from each wheel's `METADATA`
  (`License-Expression: MIT`, `Classifier: License :: OSI Approved :: MIT License`).
- **Verse text:** public domain — KJV (crown copyright expired outside the
  UK), ASV (1901, expired), WEB (explicitly dedicated to the public domain
  by ebible.org).

## Format

```json
{
  "translation": "KJV",
  "source": "...", "sourceUrl": "...",
  "fileLicense": "...", "textLicense": "...",
  "verses": { "matthew 6:28": "And why take ye thought for raiment? ..." }
}
```

Keys are `"<book title, lowercased> <chapter>:<verse>"` using pythonbible's
66 canonical book titles (note: "psalms", "song of songs"). Each translation
has ~31,100 verses; Protestant canon only.

## Text quirks the normalizer must handle

- KJV wraps translator-supplied words in square brackets: `I [am] God`
- WEB (this edition) uses backticks as apostrophes: `` don`t ``
- WEB uses straight double quotes and multi-space runs inside verses

Regenerate with `scripts/generate-corpus.py` (documented inside the script).
