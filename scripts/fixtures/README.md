# scripts/fixtures — the oracle layer

Everything the extraction suite grades against lives here, versioned. Nothing in
this directory may be edited without an explicit Santiago ruling **adjudicated
from the menu photo** — not from model output, not from a previous dump.

| Folder / file | What it is |
|---|---|
| `*.expected.json` | The **grading sheet** per menu: item counts, section lists, and the pins (`items_with_options`, `category_expectations`, `grams_expectations`) plus the tolerances Santiago has ruled. |
| `drafts/*.png.draft.json` | The **name-level truth**: what the menu actually prints, hand-corrected by Santiago. Moved in-repo 2026-07-31 after 12 contradictions hid for months in `~/Downloads`. |
| `photos/*.png` | The **original menu photographs** — the oracle INPUT. Moved in-repo 2026-08-01 for the same reason. `photoPath()` in `scripts/photo-input.ts` is the only way code should reach them. |
| `caches/*.raw.json` | Versioned **backup** of the archived model responses the $0 gates replay (Stage-1a OCR `mistral-b1`/`mistral-pt`, structuring draws `eval103c-m41`, `eval117-r1..3`). The scripts currently read the working copies in `~/Downloads/MenusTesting`; restore from here if that scratch folder is ever lost. |

## Two oracles, not one (master-roadmap lesson 18)

A pin must hold against **both** the extraction dumps **and** the corrected
draft. After ANY edit in this directory run:

```
deno test --allow-read scripts/drafts_test.ts
```

Eval 107 shipped pins that scored the extractor perfectly while silently
breaking the guest-house draft for two days. That test exists to catch the class.

## Adding a new menu (the intake recipe)

1. Put the photo in `photos/`.
2. `deno run ... scripts/extract-draft.ts <Photo.png>` → hand-correct the draft
   against the print, save as `drafts/<Photo>.png.draft.json`.
3. Write `<menu>.expected.json`, and register the menu in `MENU_PHOTOS`
   (`scripts/probe-bakeoff-mistral-b1.ts`) so every harness picks it up.
4. **Score it BEFORE tuning anything** — a new menu is a held-out test exactly
   once, and that measurement is the only evidence of generalization the suite
   ever produces (eval 106). Afterwards it becomes a permanent suite member.

## Never

- `deno fmt` a glob that can reach this directory — it silently reformatted two
  oracle files once (lesson 15).
- Quote a single draw's score as quality; report the range (`score-c-draws.ts`).
