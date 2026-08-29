# Menu Extraction Pipeline

> **Canonical file** for the flow and prompts. A snapshot copy also lives at
> `~/Downloads/menu-extraction-pipeline.md`.
>
> This is a technical reference, not a status tracker. Check Linear for current work and re-derive
> benchmark results through `scripts/`; neither belongs in this diagram.
>
> P2 `ENRICH_PROMPT` and `ENRICH_SCHEMA_OPENAI` ask the model for *knowledge* (ingredients, a
> conventional serving each, composition per 100 g). The **code** does all arithmetic:
> `resolveGrams` fits servings to the printed weight, while `sumIngredientMacros` multiplies and adds
> macros and derives calories by Atwater. `callGptEnrich` lives in `enrich.ts`. The full prompt is in
> the P2 appendix below.
>
> **What changed since the last diagram (all deployed):**
> - **Stage 1 uses two pinned calls.** **Stage 1a `mistral-ocr-4-0`** transcribes the photo to markdown, and
>   **Stage 1b `gpt-4.1-2025-04-14`** structures that *text* into `EXTRACT_SCHEMA`. Both are dated
>   snapshots — an alias silently substituting a model is exactly what broke a week of measurements
>   (evals 101/102). GPT-4o is kept for **Stage 2 enrichment only.**
> - **H2 rotation:** a sideways wide-menu capture is detected from OCR block geometry, straightened
>   client-side, and re-submitted once.
> - **Tile extraction:** the diagram's main path uses whole-image OCR. The code retains
>   `stage:"extract-pages"` → `runGroupedExtraction`, per-tile verification, `colocationStage`, and
>   `stage:"extract-crops"` as legacy support paths.
> - **Enrichment is batched** (10 items/batch, parallel, one-retry-on-short, then `reassembleEnriched`
>   backfills any item the model dropped — one enriched row per input, order preserved).
> - **Deterministic cleanup rewritten**: after per-page `postprocessItems` + `mergeItemSources`, one
>   `textStructureCleanup` runs over the merged items + the joined OCR markdown (C3).
> - **Observability**: the edge writes one `scan_log` row per scan (menu text only, never the photo;
>   never throws). Side-channel — not a pipeline stage.
>
> **Legend:** 🟢 deployed & gated · 🟡 deployed but not benchmarked/gated · 🔴 not built · 💤 present in code but not triggered (dormant).

```mermaid
sequenceDiagram
    autonumber
    actor U as 👤 User
    participant C as 📱 Client (Expo/RN)
    participant EF as ☁️ Edge Fn analyze-menu (Deno)
    participant M as 🌐 Mistral OCR (mistral-ocr-4-0)
    participant S as 🌐 GPT-4.1 (gpt-4.1-2025-04-14)
    participant EN as 🌐 GPT-4o (enrichment)

    U->>C: capture / pick menu photos
    Note over C: expo-camera / expo-image-picker<br/>intake stores ORIGINAL uri/dims (no compression)<br/>upload: passthrough original bytes if file ≤6.75MB<br/>else 2048px JPEG q0.95 fallback (ticket #3)

    rect rgb(20,60,30)
    Note over C,S: STAGE 1 — extraction (all provider keys stay server-side)
    C->>EF: POST stage=extract {photos, provider:"gpt-vision"}

    par Stage 1a — OCR each page (concurrent)
        EF->>M: ocrMistral(photo) 🟢
        M-->>EF: markdown (reading order) + text-block geometry (blocks[])
    end

    opt 🟢 H2 rotation — sideways page detected (evals 132–137)
        Note over EF: detectOrientation(blocks): wide-fraction of<br/>text boxes + reading-order drift, refuses unless decisive<br/>(≥20 blocks, correlations past MIN_CORRELATION)
        EF-->>C: {needs_rotation:[{page,degrees}], prior:[markdown]}
        C->>C: rotateImage(page, degrees) from the ORIGINAL
        C->>EF: POST stage=extract {photos:straightened, rotated:true, prior}
        EF->>M: re-OCR the straightened page(s)
        M-->>EF: corrected markdown + blocks
        Note over EF: acceptRotation: keep corrected read ONLY if positively<br/>upright AND ≥95% of printed numbers retained,<br/>else fall back to prior text (no third API call). rotated:true is a hard stop.
    end

    par Stage 1b — structure each page's text (concurrent)
        EF->>S: structureMenuText · EXTRACT_PROMPT + TEXT_PROMPT_SUFFIX + markdown<br/>strict json_schema · temp 0 · seed 17 · max_tokens 16384
        S-->>EF: page items[] (from text only, no image)
    end
    EF->>EF: postprocessItems() PER PAGE<br/>stripMenuNumbers → dropPriceNoteItems → foldVariantCards → promoteSections<br/>→ foldPerUnitPrice → nullPriceNoteSections → dropHeaderEchoes → extractInlineChoices<br/>→ filterServingFormatOptions → dropSiblingEchoOptions → parseItemGrams (fills items[].grams)
    EF->>EF: mergeItemSources() over pages (if >1) → ONE items list
    EF->>EF: textStructureCleanup(items, joinedMarkdown) — C3 deterministic:<br/>drop drink/other sections + self-named titles, fold unpriced/priced/welded-prefix cards<br/>+ section-choice lines, promote description-variants, demote outvoted sides
    EF->>EF: recordScan → scan_log (menu text only · observability · never throws)
    EF-->>C: items[] (+ grams) + image_quality{usable:true,issues:[]} + image_layout{dense:false}
    Note over EF,C: model_id: "mistral-ocr-4-0+gpt-4.1-2025-04-14"
    end

    Note over EF,C: Feature 1 — items: distinct food dish-names, no true duplicates
    Note over EF,C: Feature 2 — options: base variant on card, choices/add-ons in options[]
    Note over EF,C: Feature 3 — section_context: printed food sections, no spurious sections
    Note over EF,C: Feature 4 — categories + option price/grams, items[].grams postprocess-parsed

    rect rgb(70,50,20)
    Note over C,EN: STAGE 2 — enrichment (model = GPT-4o)
    C->>EF: POST stage=enrich {items, provider:"gpt-4o"}
    par batches of 10 items, concurrent
        EF->>EN: enrichBatch · P2 ENRICH_PROMPT · temp 0 · seed 17<br/>(enrichBatchWithRetry: 1 retry if the batch comes back short)
        EN-->>EF: printed_total_g + per-ingredient serving & per-100g composition<br/>+ confidence + allergens (NOT the item totals)
        EF->>EF: resolveGrams — fit inside-printed-weight servings to printed_total_g<br/>sumIngredientMacros — composition x grams, summed; calories by Atwater
    end
    EF->>EF: reassembleEnriched — one enriched row per input, in order,<br/>any dropped item backfilled with fallbackEnriched (confidence low, zeros)
    EF-->>C: enriched items[] (model_id: "gpt-4o")
    end

    C->>C: re-rank by goals — soft-clamped z-scores 🟢 (reuses saved parsed_items, no re-scan)
    C-->>U: sorted menu items (most goal-aligned first)

    Note over U,EN: Prompts P1 (EXTRACT_PROMPT) & P2 (ENRICH_PROMPT) — full verbatim text below this diagram
```

## Call order (happy path)

1. **Client** (`src/lib/analyzeMenu.ts` → `extractMenu`) captures/picks (originals stored) → uploads
   passthrough original bytes when the file is ≤6.75MB (data-URL, correct mime; 2048px JPEG q0.95
   fallback for oversized) → `POST analyze-menu {stage:"extract", provider:"gpt-vision"}` (all photos
   in one request).
2. **Edge `runPagedExtraction`** (`extract.ts`):
   - **Stage 1a** — `ocrMistralWithRetry` OCRs every page **first** (`mistral-ocr-4-0`,
     `api.mistral.ai/v1/ocr`, transcription only) → `{markdown, blocks}`.
   - **Orientation** — on the first pass (`rotated` unset), `detectOrientation(blocks)` per page. If any
     page is turned/upside-down it returns `{needs_rotation, prior}` and stops; the client straightens
     those pages and re-submits with `rotated:true` + `prior` (the echoed first-pass text). On the second
     pass `acceptRotation` keeps the corrected read only if it is positively upright **and** kept ≥95% of
     its printed numbers, else it uses `prior`. `rotated:true` is a hard stop — at most two tries.
   - **Stage 1b** — `structureMenuTextWithRetry` per page: `gpt-4.1-2025-04-14` (**PINNED**, ruling 30)
     turns the markdown into `EXTRACT_SCHEMA` using `EXTRACT_PROMPT + TEXT_PROMPT_SUFFIX + markdown`
     (temp 0, seed 17, max_tokens 16384). Retries once on timeout / `finish_reason=length`.
   - `postprocessItems` per page → `mergeItemSources` across pages → one `textStructureCleanup` over the
     merged items + all pages' markdown joined by `\n`. Returns `items[]` (+ `grams`), a synthetic
     `image_quality{usable:true}` and `image_layout{dense:false}` (Stage 1b works from text, so it cannot
     assess the photo), plus `raw_response` (the OCR + structuring payloads per page).
   - `recordScan` writes one `scan_log` row (menu text only; failures are swallowed).
3. **Client** sends the items back → `POST {stage:"enrich", provider:"gpt-4o"}` → `callGptEnrich`
   (**`enrich.ts`** since 2026-08-09, not `index.ts`): items are split into batches of 10 and enriched
   in parallel with **P2** (`ENRICH_PROMPT`, GPT-4o, temp 0, seed 17). **The model returns ingredient
   knowledge, not totals** — `printed_total_g`, and per ingredient a conventional `typical_serving_g`,
   a `within_printed_weight` flag and `*_per_100g` composition. `resolveGrams` then fits the inside
   servings to the printed weight and `sumIngredientMacros` multiplies and adds, deriving calories by
   Atwater. `reassembleEnriched` guarantees one enriched item per input, backfilling any drop. Returns
   per-item `printed_total_g / protein_g / carb_g / fat_g / estimated_calories / confidence /
   allergens`.
4. **Client** re-ranks items by the user's goals (soft-clamped z-scores — in `main`). Re-ranking reuses
   saved `parsed_items`; no re-scan.

## 💤 Dormant path — dense auto-cutter & tiles (present in code, NOT triggered)

Built and gated on the old GPT-4o-Vision architecture (critical-path #2, eval 055), then left unreachable
when Stage 1 became OCR-based. Kept in the repo — not deleted — but nothing on the live path invokes it:

- `runPagedExtraction` has **no `needs_crops` branch** anymore, so the edge never asks the client to cut
  tiles. The client (`extractMenu`) still contains the `needs_crops` handler (cut 2×2 tiles from
  originals → `stage:"extract-pages"`), but it is dead because the signal never arrives.
- `stage:"extract-pages"` → `runGroupedExtraction` (still uses **GPT-4o Vision** on tiles: parallel
  `detail:"high"` calls + `TILE_PROMPT_SUFFIX`, a per-tile `verifyTileItems` name-check pass, per-tile
  drink/other filter, `sectionLenient` merge, then `colocationStage` — a full-photo Mistral OCR
  co-location cleanup, fail-open). Reachable only if a client posts `extract-pages` directly.
- `stage:"extract-crops"` → `runCropExtractions` — legacy GPT-4o-Vision crop path; no client caller.

If dense-menu recall becomes a problem again on the OCR path, this is where the machinery lives — but it
would need re-validation against the OCR pipeline before being re-armed.

## Components by stage

| Component | How it works |
|---|---|
| Stage 1a — Mistral OCR transcription | `mistral-ocr-4-0` (pinned); photo → markdown + block geometry; transcription only, no vendor structuring |
| Stage 1b — text structuring | `gpt-4.1-2025-04-14` (pinned); `EXTRACT_PROMPT` + `TEXT_PROMPT_SUFFIX`; reuses `EXTRACT_SCHEMA` verbatim |
| H2 rotation | Geometry-only detector avoids rotating upright menus; one retry maximum, then falls back to `prior` |
| Food-item extraction (Feature 1) | Distinct dish names with no true duplicates |
| Food-item options (Feature 2) | Item owns options; base on card; deterministic postprocess chain |
| Sections & sub-sections (Feature 3) | Food-scoped `section_context`; postprocess + `textStructureCleanup` folds |
| Categories + option-price/grams (Feature 4) | Food-scoped categories + pins; `items[].grams` parsed by `parseItemGrams` without a schema change |
| Stage 2 enrichment (macros + allergens) | GPT-4o in batches of 10 with backfill. The model supplies knowledge; code does the arithmetic. Re-derive accuracy through the harness. |
| Goal re-ranking | Soft-clamped z-scores |
| Dense auto-cutter + tile path | Legacy support path; whole-image OCR is the diagram's main path |
| `stage:"extract-crops"` (`runCropExtractions`) | Legacy GPT-4o Vision crops support path |

---

## 📝 Prompt Appendix — full verbatim text (its own box)

### P1 · `EXTRACT_PROMPT` — `supabase/functions/analyze-menu/extract.ts`

Used on **both** the live Stage-1b text path (with `TEXT_PROMPT_SUFFIX`) and the dormant Vision tile path
(with `TILE`/`PAGE` suffixes). The base text is model-agnostic — the conventions live here.

```text
Read this restaurant menu. Return every item exactly as printed, in menu order:
name, description, price, category, section_title, and options.
Do NOT estimate calories or nutrition. Do NOT invent items you cannot read.
Extract all visible menu items from every provided photo and every menu section.
Do not stop after a representative sample, a section summary, or the first page.
There is no maximum number of items; keep going until every readable item is returned.
Never return a section header as an item.
Copy the nearest printed heading that visually groups an item into section_title.
When a heading contains smaller subheadings, each item belongs to its nearest
subheading, never the parent (a spirits list under a parent heading with per-spirit
subheadings uses the spirit subheading). Use only printed headings; never invent
a grouping that is not printed on the menu. Set section_title to null
only when no heading groups the item. Preserve the item name exactly; never prepend
or synthesize the heading into the name.
A heading is often larger text without its own price, weight, or description, but
it must also group menu items beneath it. Do not treat restaurant names, slogans,
or promotional text as section headings.
Use category "food" for appetizers, entrees, main dishes, and other prepared food.
Use "side", "dessert", or "drink" only when that role is clear; otherwise use "other".
An option is a printed choice about one item's composition: a protein or filling
choice, a paid add-on, a dietary swap, or a flavor choice. Capture each option with
its printed price and weight in grams when present; otherwise use null.
Serving formats and sizes (glass vs bottle, copa vs botella, small vs large) are
NOT options. Distinct products listed under a shared heading are separate items,
not options.
When the same base dish is printed several times with different fillings, proteins,
or preparations, return ONE item named after the base dish and put each printed
variant in options. Never return duplicate item names for variants of one dish.
A choice printed inside a description ("con X o Y", "choice of X or Y") is an
options list; capture each choice in options. Do not move options into the description.
Ingredients joined by "y" or "and" ("con jamón y queso", "with ham and cheese")
are parts of ONE dish, never options; keep them in the item's name or description.
Never invent an option from words inside a name or sentence unless the menu
prints a choice word ("o", "or", "a elegir", "choice of") or prints a separate
price or weight for that alternative.
When a printed weight or volume accompanies an item (e.g. "(70gr.)", "350 ml"),
keep it verbatim in that item's name or description; never omit or clean away
printed weights.
If a description is not printed, use an empty string. If a price is not printed, set it to null.
Assess the visible menu layout. Set image_layout.dense=true only when small text,
many tightly packed items, or a crowded multi-group layout risks incomplete
extraction from the full image. For side-by-side content use crop_direction
"left_right"; for vertically stacked content use "top_bottom". For a normal
menu set dense=false and crop_direction="none".
Assess image quality across all photos. Report blur, low_light, glare, or another concise issue.
Set usable to false only when the menu cannot be read reliably.
```

Response is `json_schema` **strict** (`EXTRACT_SCHEMA`): `image_quality {usable, issues[]}`,
`image_layout {dense, crop_direction}`, `items[] {name, description, price, category(food|side|dessert|drink|other),
section_title, options[] {name, price, grams}}`. `temperature: 0`, `seed: 17`. **Note (F4):** returned
items additionally carry `grams: number|null` — added by postprocess `parseItemGrams` from printed weight
text, NOT part of the schema the model fills.

**`TEXT_PROMPT_SUFFIX` (Stage 1b, ruling 30) — appended to P1 on the LIVE text path.** This is what turns
P1 from a vision instruction into a text-structuring one; it is present on every live extraction today:

```text
The menu is provided below as a verbatim OCR transcription of the photo, in
reading order; printed headings appear as markdown headings. Work only from
this text — there is no image, so set image_quality.usable=true with an empty
issues list and image_layout dense=false, crop_direction="none".

MENU TRANSCRIPTION:

```

**Dormant-path suffixes (💤 — only on the GPT-4o-Vision tile machinery, which nothing triggers now):**

`TILE_PROMPT_SUFFIX` — cropped-tile calls only:

```text
This image is one cropped tile of a larger menu photo; items at the edges
may be cut off. Transcribe only items whose printed name is completely visible
in this tile. Skip any partially visible or cut-off item entirely — do not
guess or reconstruct its name; a neighboring tile shows it in full.
```

`PAGE_PROMPT_SUFFIX` — per-page calls of a multi-photo `extract-pages` scan only:

```text
This photo is one page of a multi-page menu. Transcribe each item's card
completely: include its final printed line even when it is smaller or italic
(a trailing "a elegir"/"choice of" line with prices is part of that item's
options). Menus also print items inside boxed or bordered insert blocks and
sidebars; extract the items in every box exactly like items in the main
columns.
```

`VERIFY_PROMPT` — the dormant per-tile name-verification pass (`verifyTileItems`), GPT-4o Vision:

```text
You are verifying a menu transcription against a photo. The photo is one
cropped tile of a larger menu page; every candidate in the JSON list was
transcribed from THIS image. For each candidate answer ONE question from the
image only:
name_printed: does a printed menu item in this image correspond to this name?
Answer true when one does, ignoring small spelling differences, accents,
capitalization, and size or weight annotations like "(300gr)". Answer false
only when no printed dish corresponds to it — for example a name that combines
words from two different printed dishes is NOT printed.
When unsure, answer true.
```

### P2 · `ENRICH_PROMPT` — `supabase/functions/analyze-menu/enrich.ts`

> The prompt, the schema and `callGptEnrich` all live in `enrich.ts`, which is the importable
> module (`index.ts` calls `serve()` at module scope, so a harness can only ever test a *copy* of
> anything left there). The pre-B1 prompt this replaced asked the model for finished macro totals.

```text
You estimate the nutrition profile of restaurant menu items. For each item, work step by step:
1. Give "printed_total_g": the weight printed on the menu for this item — e.g. (280gr), 200g — or null when the menu prints none. Then list the most likely ingredients. If the description names them, use them; otherwise infer from the name and category. Tag each ingredient: protein | carb | fat | veg | other. Set "within_printed_weight" to false for anything the menu presents as served alongside the item rather than as part of it, because a printed weight normally describes the item itself and not what accompanies it. Give "typical_serving_g": what a normal restaurant serving of that ingredient is when it appears in this role, whether as the centrepiece, as a sauce or dressing, or as a garnish. Give the conventional serving for the ingredient itself — these are rescaled to the printed weight afterwards, so they do not need to add up to anything.
2. For each ingredient, give its composition PER 100 g of that ingredient as served: protein_per_100g, carb_per_100g and fat_per_100g. These describe the food itself, not the size of the portion — the amount in this serving is calculated from them and the gram weight, so give the composition and let the weight do the rest. Base them on what the food is actually made of, including its water content, and on how it is prepared (fat absorbed or added in cooking counts), rather than on which macro the ingredient is best known for. Where a food is normally cooked, sauced or seasoned before it reaches the table, give the figures for that prepared version — the plain or raw reference figure for the same food understates the fat that preparation adds. The item's totals are added up from these, rather than estimating the totals directly, so each ingredient's numbers must stand on their own.
3. Set "confidence" to "low" only when the name and description are evocative or promotional rather than descriptive, leaving you with little ingredient information to go on.
List "allergens" you can infer from the ingredients (e.g. dairy, nuts, gluten, shellfish, egg, soy). Use an empty allergens array when none are inferred; do not include "none". Preserve each item's name, description, price, and category exactly as given. Do NOT sort the items. Return one object per input item, in the same order.
```

**The model no longer computes the item's macros — the code does.** That is the whole design, and it
is the change that halved the error:

| step | who does it | where |
|---|---|---|
| Name the ingredients, tag each one, say what the printed weight covers | model | prompt step 1 |
| State a **conventional serving** per ingredient (not fitted to the dish) | model | `typical_serving_g` |
| State **composition per 100 g** (not the amount in this serving) | model | `*_per_100g` |
| **Fit** the inside-the-printed-weight servings to `printed_total_g` | **code** | `resolveGrams` |
| **Multiply** composition × grams and **add up** the item total | **code** | `sumIngredientMacros` |
| Calories by Atwater (4/4/9) on the unrounded sums | **code** | `sumIngredientMacros` |

⚠️ **Schema property ORDER is load-bearing** and is pinned by a test: strict mode emits fields in
declaration order, so `printed_total_g` → `ingredients[]` must precede the macro fields or the
chain-of-thought silently stops working. ⚠️ **Never name a food, dish or cuisine in step 2** —
measured harmful, and `enrich_test.ts` fails the build if one appears.

Enrichment runs via **GPT-4o** (`callGptEnrich`), parallel batches of 10 (`ENRICH_BATCH_SIZE`), temp 0,
seed 17. Temperature now travels with the model via `samplingFor()` — gpt-5.x **rejects** `temperature: 0`
and 400s the request, so hardcoding it would break any future model switch. Output adds
`printed_total_g / protein_g / carb_g / fat_g / estimated_calories / confidence / allergens[]` +
`ingredients[]` per item; `reassembleEnriched` guarantees one enriched object per input, order preserved,
backfilling any item the model dropped.

---

## How to keep this file current

Update this diagram the moment a feature closes, the flow changes, or P1/P2 (`EXTRACT_PROMPT` /
`ENRICH_PROMPT`), `TEXT_PROMPT_SUFFIX`, or the schema changes: flip the affected status flag, edit the
sequence-diagram notes and the Status table, sync the verbatim prompt appendix, then **re-copy the file to
`~/Downloads/menu-extraction-pipeline.md`** (Diagram discipline). This is the fresh-context source of truth
other LLMs read for "what does the pipeline look like right now"; a stale diagram misleads the next session.
It is linked from `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md`.
