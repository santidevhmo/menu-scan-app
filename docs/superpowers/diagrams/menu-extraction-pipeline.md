# Menu Extraction Pipeline — Current Status

> # ⛔ STALE AS OF 2026-07-29, STILL STALE AT 2026-08-01 — DO NOT TREAT THIS FILE AS TRUTH
>
> **2026-08-01 update — the rewrite is now DUE and deliberately not done yet.** The earlier note said this
> file would be rewritten once C3 landed. C3 HAS landed: the edge function now runs Stage-1a Mistral OCR
> (`mistral-ocr-4-0`, pinned) → Stage-1b `gpt-4.1-2025-04-14` (pinned) → `postprocessItems` per page →
> `mergeItemSources` → one `textStructureCleanup`. **But the DEPLOYED function still runs the OLD path**, so a
> correct diagram has to show BOTH until the deploy step happens, and the deploy is blocked by C4 (the first
> 9-menu ×3 live gate failed 0/3). Rewriting now would document a third state that is about to change again.
> Authoritative until then: `docs/superpowers/horizontal-menus/DELEGATION-BRIEF.md` progress log (newest first).
>
> Everything below describes the pipeline as of **2026-07-12** and is now wrong in its most important
> respect: the Stage-1 extractor. Since then the extraction stack has changed twice —
> a **production colocation stage** (container ruling 15), and then the **Stage-1 extractor migration**
> away from GPT-4o Vision (container rulings 29 and **30**: Stage-1a = Mistral OCR `markdown`,
> Stage-1b = a PINNED model snapshot using the existing `EXTRACT_PROMPT`/`EXTRACT_SCHEMA`; GPT-4o kept
> for Stage-2 enrichment only). The tile/auto-cutter machinery described below is being made unreachable
> rather than deleted, and the whole-image read makes tiling moot on every fixture measured so far.
>
> **Authoritative sources instead of this file:**
> - status + NEXT ACTION → `docs/superpowers/horizontal-menus/DELEGATION-BRIEF.md` (newest PROGRESS LOG
>   entry) on branch `feat/extraction-eval-harness`
> - rulings + phase plan → `docs/superpowers/horizontal-menus/ROADMAP.md` (same branch)
> - every experiment → `docs/superpowers/extraction-iteration-ledger.md` (same branch)
>
> This file gets rewritten when the migration closes (master-roadmap "Diagram discipline" requires it at
> that point, not before — writing a diagram for a half-built architecture would just create a second
> stale artifact). Kept as-is meanwhile because it accurately documents what is still DEPLOYED.


> **Canonical file** (roadmap links here; keep it updated as Features 2–5 close).
> A snapshot copy also lives at `~/Downloads/menu-extraction-pipeline.md`.
>
> **Last updated:** 2026-07-12 (night) — **client compression fidelity CLOSED 🟢 (critical-path #3, ledger evals 056-058 + device 3/3).** Phase-1 uploads now PASSTHROUGH original bytes (file ≤6.75MB ⇒ base64 ≤9M chars, correct-mime `data:` URL; oversized ⇒ 2048px JPEG q0.95 fallback — q0.85/q0.90 stably misread small price digits, q95 still lost el-marcos/mochomos dims 4/4). The old 1024px/q0.7 intake compression is GONE (it measurably lost options/grams/sections on 3 of 6 menus); intake stores ORIGINAL uri/dims, compression happens only at upload, tiles still cut from originals. Eval gate phase-1 input = the same production mirror (`scripts/photo-input.ts`), permanently. ImagePicker re-encode suspicion DISPROVEN (gallery PNGs byte-identical at quality:1). New: `scripts/score-dump.ts` scores any device/console dump offline; el-marcos "Norteños" = tolerated header (oracle, printed as a DISH). Prior (same day): dense-menu auto-cutter CLOSED 🟢 (critical-path #2, 3/3 gate eval 055, device-verified). Two-phase stateless flow: phase-1 `stage:"extract"` returns `{needs_crops:[pageIdx]}` when a page dense-signals (`image_layout.dense` OR terminal timeout/length after retry — failure-as-signal); the client cuts that page into 4 proven 2×2 PNG tiles (60%×60%, origins 0/40%, `gridCropRects`) from the ORIGINAL photo (`prepareTile`, ≤2048px, PNG) and re-submits ALL pages via new `stage:"extract-pages"` (groups of 1 photo or 4 tiles) → `runGroupedExtraction`: tiles run parallel `detail:"high"` + per-tile drink filter + `TILE_PROMPT_SUFFIX` (skip cut-off items) + sectionLenient tile merge; cross-page merge + post-merge `dropHeaderEchoes`. Old `stage:"extract-crops"`/pre-cut-tile routing deleted. **P1 CHANGED (v5 + v7, see appendix):** v5 never-invent-options rule (choice word or printed price/weight required); v7 `PAGE_PROMPT_SUFFIX` (card completeness: trailing "a elegir" lines + boxed inserts) applied ONLY to multi-photo page calls — the global variant regressed single-photo menus (v6, reverted). New deterministic postprocess: `dropSiblingEchoOptions` (price-null option echoing a same-section sibling name = re-attached dish). Scorer: `containsWithOneIndel` one-letter tolerance in the section-check lookup (Chipo→Chiplo, user ruling); per-fixture `items_over_tolerance` (nikkori +6). Prior (2026-07-10): per-page wiring CLOSED (critical-path #1, eval 048); P1 v3 weights-verbatim + y/and rules; F4 CLOSED; Stage-2 locked to GPT-4o.
> **Legend:** 🟢 done · 🟡 built but not gated/benched · 🔴 not built yet.

```mermaid
sequenceDiagram
    autonumber
    actor U as 👤 User
    participant C as 📱 Client (Expo/RN)
    participant EF as ☁️ Edge Fn analyze-menu (Deno)
    participant V as 🌐 GPT-4o Vision
    participant EN as 🌐 GPT-4o (enrichment)

    U->>C: capture / pick menu photos
    Note over C: expo-camera / expo-image-picker<br/>intake stores ORIGINAL uri/dims (no compression)<br/>upload: passthrough original bytes ≤6.75MB<br/>else 2048px JPEG q0.95 fallback (ticket #3)

    rect rgb(20,60,30)
    Note over C,V: STAGE 1 — extraction (keys stay server-side)
    alt Normal menu — runPagedExtraction 🟢 (wired + 3/3 gate 2026-07-10, eval 048)
        C->>EF: POST stage=extract {photos}
        alt 1 photo
            EF->>V: ONE call · P1 EXTRACT_PROMPT<br/>strict json_schema · temp 0 · seed 17 · ~$0.03<br/>(extractWithRetry: 1 retry on timeout/length)
            V-->>EF: items[] + image_layout + image_quality
        else N photos (multi-page menu = ONE menu)
            par one call PER page, concurrent
                EF->>V: P1 · detail:"high" · extractWithRetry
                V-->>EF: page items[]
            end
            EF->>EF: mergeItemSources() (merge.ts) — ONE unified items list;<br/>usable=AND, issues deduped, layout=first dense page's
        end
    else 🟢 Dense menu — auto-cutter (critical-path #2, 3/3 gate eval 055 + device-verified 2026-07-12)
        EF-->>C: {needs_crops:[pageIdx]} — page dense-signaled<br/>(image_layout.dense OR terminal timeout/length after retry)
        C->>C: gridCropRects(w,h) → 4 tiles 60%×60% (origins 0/40%)<br/>prepareTile: crop from ORIGINAL photo, PNG, ≤2048px
        C->>EF: POST stage=extract-pages {pages: [[photo] | [t1..t4], …]}
        par each dense page: 4 tile calls, concurrent
            EF->>V: P1+TILE_PROMPT_SUFFIX · detail:"high" · extractWithRetry
            V-->>EF: tile items[] (drinks filtered per tile)
        end
        EF->>EF: tile merge (sectionLenient) → cross-page mergeItemSources()<br/>→ post-merge dropHeaderEchoes()
    end
    EF->>EF: postprocessItems()<br/>stripMenuNumbers → dropPriceNoteItems → foldVariantCards<br/>(incl. 3+-card variant families) → promoteSections → dropHeaderEchoes<br/>→ extractInlineChoices (price-null guard) → filterServingFormatOptions<br/>(+ unenumerated / C-U-per-unit / per-person / weight / self-echo filters)<br/>→ dropSiblingEchoOptions (same-section sibling echo, price-null only)<br/>→ parseItemGrams (fills items[].grams — NOT model-filled)
    EF-->>C: items[] (+ grams + image_layout, image_quality)
    end
    Note over EF,C: 🟢 Feature 1 CLOSED — scoreMenu items dimension:<br/>distinct food dish-names ±3, no true dups<br/>(section-headers → Feature 3)
    Note over EF,C: 🟢 Feature 2 CLOSED 2026-07-09 — options dimension (food only):<br/>base variant on card, alternatives/choices/add-ons in options[]<br/>🟢 per-page recipe WIRED into production extract + 3/3 gate 2026-07-10
    Note over EF,C: 🟢 Feature 3 CLOSED 2026-07-10 — section_context (food-scoped):<br/>all printed food sections as section_titles, no spurious,<br/>expectations any-match; section_headers tolerated-not-required;<br/>drink sections parked in fixtures for Feature 5
    Note over EF,C: 🟢 Feature 4 CLOSED 2026-07-10 — categories (food-scoped set + pins),<br/>option price/grams verified vs user-read photos,<br/>items[].grams postprocess-parsed from printed weights (350gr / 250g / 1kg)

    rect rgb(70,50,20)
    Note over C,EN: STAGE 2 — enrichment 🟡 (macro-accuracy benchmark not finalized; model = GPT-4o)
    C->>EF: POST stage=enrich {items[]}
    EF->>EN: callGptEnrich · P2 ENRICH_PROMPT
    EN-->>EF: items[] + protein_g/carb_g/fat_g/kcal + allergens
    EF-->>C: enriched items[]
    end

    C->>C: re-rank by goals — soft-clamped z-scores 🟢
    C-->>U: sorted menu items (most goal-aligned first)

    Note over U,EN: Prompts P1 (EXTRACT_PROMPT) & P2 (ENRICH_PROMPT)<br/>full verbatim text below this diagram
```

## Call order (happy path)

1. **Client** captures/picks (originals stored) → uploads passthrough original bytes when the file is ≤6.75MB (data-URL with correct mime; 2048px JPEG q0.95 fallback for oversized) → `POST analyze-menu {stage:"extract"}` (all photos in ONE request; the edge splits per page).
   *Dense menus:* response is `{needs_crops:[pageIdx]}` → client cuts each flagged page into 4 PNG tiles from the ORIGINAL (`gridCropRects` + `prepareTile`) → `POST {stage:"extract-pages", pages:[[photo]|[t1..t4],…]}` → one unified menu (stateless full re-submit).
2. **Edge `runPagedExtraction`** (wired 2026-07-10): 1 photo ⇒ one `runExtraction` call (P1 + strict `EXTRACT_SCHEMA`, temp 0, seed 17, default detail); N photos ⇒ one `detail:"high"` call **per page in parallel** → `mergeItemSources()` (`merge.ts`) → ONE unified menu. Every call goes through `extractWithRetry` (1 retry on timeout / `finish_reason=length`). Each call postprocesses (`postprocessItems`); returns `items[]` + `image_layout` (first dense page's, else page 1's) + `image_quality` (AND/dedup).
   *Grouped path (`stage:"extract-pages"`, dense re-submit):* `runGroupedExtraction` — 1-photo group ⇒ page call (P1+`PAGE_PROMPT_SUFFIX`); 4-tile group ⇒ parallel `detail:"high"` calls (P1+`TILE_PROMPT_SUFFIX`) + per-tile drink filter + sectionLenient tile merge; then cross-page merge + post-merge `dropHeaderEchoes`. (`stage:"extract-crops"` and pre-cut tiles are deleted.)
3. **Client** sends the items back → `POST {stage:"enrich"}` → `callGptEnrich` (GPT-4o) with **P2** (`ENRICH_PROMPT`) → returns per-item `protein_g / carb_g / fat_g / estimated_calories / allergens`.
4. **Client** re-ranks items by the user's goals (soft-clamped z-scores — already in `main`). Re-ranking reuses saved `parsed_items`; no re-scan.

## Status by stage

| Stage | State | Note |
|---|---|---|
| Food-item extraction (Feature 1) | 🟢 CLOSED | completeness gate: distinct dish-names ±3, no true dups |
| Food-item options (Feature 2) | 🟢 CLOSED 2026-07-09 | fold convention (item owns options; base on card); deterministic postprocess: foldVariantCards + extractInlineChoices + option filters; 3/3 live gate (eval 038) |
| Per-page multi-photo wiring (critical-path #1) | 🟢 CLOSED 2026-07-10 | `runPagedExtraction` shared by edge `stage:"extract"` + eval runner (gate proves the real code); `extractWithRetry` now production; `mergeItemSources` → `analyze-menu/merge.ts`; multi-page detail locked `high` (`auto` A/B deferred to cost pass); N pages merge into ONE menu (enrichment runs once/scan). 3/3 gate eval 048 after P1 v3 hardening (weights-verbatim + y/and rules) + Plato Surtido options ORACLE-CHANGE (`unchecked: true`). Watch item: nikkori crop-count 52/48 edge (2× on 2026-07-10, in-band in the closing gate) |
| Sections & sub-sections (Feature 3) | 🟢 CLOSED 2026-07-10 | food-scoped `section_context`: sections list + any-match item pins; rulings — Churrasquería = section with entries, Pa' los Bukis = tolerated header; postprocess adds variant-family fold + dropHeaderEchoes + price-null parser guard; 3/3 live gate (eval 044) |
| Categories + option-price/grams (Feature 4) | 🟢 CLOSED 2026-07-10 | food-scoped categories set + per-item pins; option prices/grams verified (user-read oracle); `items[].grams` parsed by postprocess `parseItemGrams` (EXTRACT_SCHEMA unchanged); `dropPriceNoteItems` kills $-amount pseudo-items; 3/3 live gate (eval 047). Known tolerated misreads: Mac and Cheese 250gr→"150g", Revueltos jamón 84/90 migration, Plato Surtido 82 never transcribed |
| Drinks (Feature 5) | ⏸ DEFERRED POST-RELEASE | user decision 2026-07-10 (roadmap "Release scope decision"). Schema captures drinks already; gate not run. Inherits `drink_sections` fixtures + must unfilter drinks in the crop path. Pre-release critical path instead: per-page wiring → auto-cutter → Stage-2 benchmark |
| Stage 2 enrichment (macros + allergens) | 🟡 | `enrich` stage wired (GPT-4o only; Gemini 2.5 Flash discarded 2026-07-10); macro-accuracy benchmark not finalized (AGENTS.md) |
| Dense-menu auto-cutter (critical-path #2) | 🟢 CLOSED 2026-07-12 | two-phase stateless: detector (dense flag OR terminal timeout/length = failure-as-signal) → client cuts proven 2×2 PNG tiles from originals → `stage:"extract-pages"` `runGroupedExtraction`. 3/3 gate (eval 055) after: `dropSiblingEchoOptions`, Chipo one-indel scorer tolerance (user ruling), P1 v7 page-scoped completeness suffix (global v6 regressed → reverted; v7.1 box-label refuted 0/8 by probe). Detector 100% correct across the campaign (5 normal menus never trigger). Device-verified same day (3-scan iPhone checklist; transient first-call 500 disproven by byte-identical curl repro). Known limits: Churrasquería box recall ~25% on brasero-two (post-release union-of-2), device tile fidelity below eval baseline (ImagePicker re-encode suspect — client-fidelity follow-up) |
| Client compression fidelity (critical-path #3) | 🟢 CLOSED 2026-07-12 | phase-1 passthrough uploads (originals ≤6.75MB; 2048/q95 fallback — every lower JPEG setting stably lost gated dims, ledger eval 056); intake compression removed; gate input = production mirror permanently; device 3/3 dims-green (nikkori + brasero-two scan 2); ImagePicker re-encode DISPROVEN; known limit: the q95 fallback's el-marcos/mochomos misreads (rare, oversized photos only) |
| Goal re-ranking | 🟢 | soft-clamped z-scores merged to `main` |

---

## 📝 Prompt Appendix — full verbatim text (its own box)

### P1 · `EXTRACT_PROMPT` — `supabase/functions/analyze-menu/extract.ts`

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

Response is `json_schema` **strict** (`EXTRACT_SCHEMA`): `image_quality {usable, issues[]}`, `image_layout {dense, crop_direction}`, `items[] {name, description, price, category(food|side|dessert|drink|other), section_title, options[] {name, price, grams}}`. `temperature: 0`, `seed: 17`. **Note (F4):** the returned items additionally carry `grams: number|null` — added by postprocess `parseItemGrams` from printed weight text, NOT part of the schema the model fills.

**Mode-scoped suffixes (auto-cutter, 2026-07-12 — appended to P1, never sent together):**

`TILE_PROMPT_SUFFIX` — ONLY on cropped-tile calls (dense flow):

```text
This image is one cropped tile of a larger menu photo; items at the edges
may be cut off. Transcribe only items whose printed name is completely visible
in this tile. Skip any partially visible or cut-off item entirely — do not
guess or reconstruct its name; a neighboring tile shows it in full.
```

`PAGE_PROMPT_SUFFIX` (P1 v7) — ONLY on per-page calls of a multi-photo scan (and 1-photo groups of `extract-pages`); the global variant (v6) regressed single-photo menus and was reverted:

```text
This photo is one page of a multi-page menu. Transcribe each item's card
completely: include its final printed line even when it is smaller or italic
(a trailing "a elegir"/"choice of" line with prices is part of that item's
options). Menus also print items inside boxed or bordered insert blocks and
sidebars; extract the items in every box exactly like items in the main
columns.
```

### P2 · `ENRICH_PROMPT` — `supabase/functions/analyze-menu/index.ts`

```text
You estimate the nutrition profile of restaurant menu items. For each item, work step by step:
1. List the most likely ingredients. If the description names them, use them; otherwise infer from the name and category. Tag each ingredient: protein | carb | fat | veg | other.
2. From those ingredients and the likely preparation (e.g. grilled vs fried), estimate per typical single restaurant serving: protein_g, carb_g, fat_g, estimated_calories. If the item's name or description contains explicit weight or portion info — e.g. (280gr), chicken (80gr), 2 chicken breasts sliced — use it as the primary basis for gram estimates rather than a typical portion; prefer printed weights over guesses.
3. Set "confidence" to "low" only when the name and description are evocative or promotional rather than descriptive, leaving you with little ingredient information to go on.
List "allergens" you can infer from the ingredients (e.g. dairy, nuts, gluten, shellfish, egg, soy). Use an empty allergens array when none are inferred; do not include "none". Preserve each item's name, description, price, and category exactly as given. Do NOT sort the items. Return one object per input item, in the same order.
```

Enrichment runs via GPT-4o (`callGptEnrich`); output adds `protein_g / carb_g / fat_g / estimated_calories / confidence / allergens[]` per item, order preserved.

---

## How to keep this file current

As each feature closes, update the sequence-diagram notes/`rect` status colors + the Status table, and note any prompt/schema change here (P1/P2 are the source of truth other LLMs read). This file is linked from `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md`.
