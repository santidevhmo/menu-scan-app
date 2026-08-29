# Spec — M3.1: port the Mistral extractor + cleanup layer into the edge function

**Date:** 2026-07-29 · **Status:** DESIGNED (planner) — awaiting executor implementation
**Context:** Priority Zero (ruling 29), sub-step M3.1. M0/M1/M2 closed; M3.0 closed 2026-07-29 (evals 098/099/099c) — the cleanup layer is now validated on ALL 9 menus with every constant sitting mid-plateau.
**Scope:** production edge code — `supabase/functions/analyze-menu/`. Planner specs, executor implements TDD-first. NO redeploy (the deployed fn stays untouched until a separate explicit deploy step). NO API calls in the gate.

## Goal

Stage-1 extraction becomes **one Mistral OCR `document_annotation` call per photo** + the deterministic `mistralCleanup` chain. GPT-4o remains ONLY for Stage-2 enrichment. The $0 gate is that the EDGE code, replaying the cached Mistral responses, reproduces eval 099c's scores exactly.

## Why the triggers must be disconnected (not just left in place)

`runPagedExtraction` currently short-circuits **any landscape page** to `needs_crops` (ruling 24) and routes dense pages to tiles. If those stay wired, the 3 wide menus + nikkori would still travel the **GPT tile path** in production and the migration would be inert where it matters most. Evidence that both triggers are now unnecessary:

- eval 095/097: all 3 wide menus, full item recall from ONE whole-image Mistral call, no tiling.
- eval 098: `nikkori` — the densest fixture, the menu that forced the 2×2 tile architecture — returns food-scope **48/48** from one call.

So M3.1 **disconnects the triggers** while **leaving the tile machinery intact and unreachable** (`runGroupedExtraction`, `verifyTileItems*`, `colocationStage`, `EXTRACT_PROMPT`/`EXTRACT_SCHEMA`, the `extract-pages` stage, the client's tile-cutting branch). That satisfies "prove moot before removing" — deletion is a separate step after M4 confirms nothing regressed.

## Design

### 1. New: `mistral-extract.ts` (the Stage-1 call)

- `MENU_ANNOTATION_SCHEMA` — copy verbatim from `scripts/probe-bakeoff-mistral-b1.ts` (the exact schema every eval 095–099 result was measured with). **Do NOT add a `description` to any field** — eval 096 proved that channel is a global lever that regressed polloteria ALL-5→2/5.
- `extractMistral(photo, apiKey): Promise<MistralExtraction>` — POST `https://api.mistral.ai/v1/ocr`, `model: "mistral-ocr-latest"`, `document: {type:"image_url", image_url: <data URL>}`, `document_annotation_format: {type:"json_schema", json_schema:{schema, name:"menu_extraction", strict:true}}`. Reuse the existing `MODEL_TIMEOUT_MS` + `AbortController` pattern from `extract.ts`.
- Returns `{ items: raw annotation items, page: Page | undefined, raw_response: string }` where `page` = `{blocks: pages[0].blocks ?? [], width: pages[0].dimensions.width, height: pages[0].dimensions.height}`. **The blocks come from the SAME response — no second API call.**
- Parse `document_annotation` (a JSON *string*) exactly as the probe's `reshape` does; reuse that logic.
- `extractMistralWithRetry` — one retry on timeout only (mirrors `extractWithRetry`'s intent), then throw. No GPT fallback: one stack, failures surface.

### 2. New: `mistral-cleanup.ts` (moved, not copied)

Move the pure rule functions out of `scripts/mistral-cleanup.ts` into the edge module — `dropDrinkSections`, `dropOtherCategoryItems`, `dropMisattachedOptions`, `dropSelfEchoWeightOptions`, `normalizeSectionTitle`, `mistralCleanup`, `toExtractedItems`, plus the private helpers and the four constants (`DRINK_SECTION_FRAC 0.8`, `MATCH_FLOOR 0.6`, `FAR_DIST 0.35`, `RESCUE_DIST 0.15`) — with chain order and behaviour **byte-for-byte unchanged**.

`scripts/mistral-cleanup.ts` then **re-exports from the edge module** and keeps only its CLI `main` (the offline re-score). ONE source of truth: the eval-099c gate stays runnable and can never drift from what production runs. `scripts/mistral-cleanup_test.ts` keeps passing unchanged (19/19).

**MUST NOT** call `parseItemGrams` or `postprocessItems` on Mistral output. Grams come only from the folded weight-options (M1 lesson: `parseItemGrams` clobbers summed combo grams — Megacharola 1800→1200); `postprocessItems` is GPT-tuned and *regresses* polloteria by splitting Shape-A options into phantom items (eval 095).

### 3. Rewire `runPagedExtraction`

```
for each photo (in parallel):
    raw   = extractMistralWithRetry(photo, mistralKey)
    items = mistralCleanup(toExtractedItems(raw.items), raw.page)   // that page's OWN blocks
then: 1 photo  -> those items
      N photos -> mergeItemSources(perPageItems)
```

- **Per-page cleanup with per-page blocks, then cross-page merge** — blocks are per-photo, so cleaning before the merge is the only correct order. This is exactly the sequence the harness gate validated in eval 099c.
- **Delete** the landscape short-circuit, the `photoDims` parameter, `isLandscape`/`landscapeIndexes`/`portraitIndexes`, the `DENSE_FAILURE` dense-signal branch, and the `needs_crops` assembly (all dead once Mistral reads whole images — orphans created by this change).
- **Keep** the `PagedExtraction` union type and `foldResults`. `needs_crops` simply never occurs now, so `index.ts` and the entire client stay **untouched** — no client release coupling in M3.1.
- Synthesize the metadata Mistral doesn't provide: `image_quality: {usable: true, issues: []}`, `image_layout: {dense: false, crop_direction: "none"}`. Verified safe: the client stores `image_layout` as `null` regardless and never reads `image_quality`; the harness scorer only needs the `image_quality` shape.
- Keep `extract` injectable (default `extractMistralWithRetry`) so tests stub it with zero network.

### 4. Key plumbing

`index.ts`: add `const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY")!` beside `OPENAI_API_KEY` and pass it to `runPagedExtraction`. `stage:"extract-pages"` keeps passing `OPENAI_API_KEY` (unreachable tile path). `model_id` for the extract stage becomes `"mistral-ocr-latest"`; enrich stays `"gpt-4o"`.

`scripts/eval-027-live.ts`: pass the Mistral key to `runPagedExtraction`. Its `needs_crops` branch becomes dead but stays (it still guards the tile path if ever re-enabled).

## Testing

Rewrite only the `runPagedExtraction` block of `extract_test.ts` — **the "portrait input ⇒ byte-identical" invariant is gone by construction** (ruling 29 makes Mistral the extractor for every menu; M4's vertical gates replace that safety net). Every other test in the file — `runGroupedExtraction`, tile merge, verify, crops — must stay green and untouched.

New/updated unit tests (all with a stubbed extractor, no network):
1. 1 photo → one extractor call; items are the cleaned items.
2. N photos → one call per photo, in parallel; result is the cross-page merge.
3. Per-page blocks: page 0's blocks are used to clean page 0's items and page 1's for page 1's (assert a misattached option is dropped on one page only).
4. Cleanup is applied (e.g. a `{name:"Peso", price:null, grams:400}` option folds into item grams).
5. No `needs_crops` is ever returned — including for a landscape-shaped photo (the old trigger is gone).
6. A retry happens once on timeout, then the error propagates.

## $0 gate — the acceptance criterion

New `scripts/replay-edge-mistral.ts`: calls the EDGE `runPagedExtraction` with an injected extractor that returns the **cached** `~/Downloads/MenusTesting/{menu}.mistral-b1-r{run}[.p{page}].raw.json` responses (parsed through the real `reshape`/`page` logic), then scores each menu with `scoreMenu`. Must reproduce eval 099c EXACTLY:

| menu | expected |
|---|---|
| polloteria ×3 | **5/5 each** |
| bistro ×3 | **5/5 each** |
| guest-house ×3 | 2/5 each |
| brasero · casa-nostra · mochomos | 4/5 · 4/5 · 4/5 |
| nikkori | 3/5 |
| brasero-two | 3/5 |
| el-marcos | 1/5 |
| **total** | **31/45** |

Plus the ruling-6 audit re-run: bistro `5 Formaggi` options empty; brasero-two `Taco Loiro` keeps `Pollo@150`; nikkori keeps 6 desserts; polloteria has no Malteadas/`Bebidas` and `Megacharola Boneless` grams 1800.

Any deviation means the port changed behaviour → STOP, do not paper over it by touching the rules.

## Deliberately NOT in this step

- Deleting the tile path / colocation stage / `extract-pages` stage (prove-then-remove, after M4).
- Any client change (`analyzeMenu.ts` untouched — `needs_crops` handling stays as dead-but-safe).
- Redeploying the edge function.
- The variant fold (eval 099b), nikkori's self-echo-with-price options, `price:0`→null — all M4 work items.
- Rotation (H2) and the rest of the horizontal launch plan, still parked.
