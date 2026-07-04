# Iteration 010 — Sections-with-Priced-Children + Two-Pass Options Re-Land

- Date: 2026-07-03
- Status: approved by user (dialogue, 2026-07-03)
- Branch: `feat/extraction-eval-harness`
- Continues: `2026-07-03-two-pass-options-design.md` (Iteration 009) and
  `docs/superpowers/extraction-eval-log.md`

## Goal

Turn options aggregate-green on six fixtures while items, categories,
section context, and image quality stay aggregate-green. Fix the two
general failure classes observed on the new Brasero menu without any
hardcoded, menu-specific text values:

1. Inline choice lines dropped (Taco Loiro's `A elegir: (picaña $165 -
   pollo $150)`).
2. Price-less group labels inverted into items with their priced entries
   demoted to options (the CERDO / RES / POLLO / ATÚN grid).

## Context

- Active baseline: corrected Iteration 005 single-pass prompt. Aggregate
  green on items, categories, section context, image quality; options red.
- Iteration 009 (two-pass) was implemented in `968982b`, benchmarked, and
  reverted in `4d0f3b7`. Mechanics were proven: index merging handled
  duplicate names, all ten calls completed within timeout. Most option
  "false positives" were fixture debt — the post-run adjudication
  confirmed El Marcos really prints those choices.
- The qualified matcher (price/description qualifiers, one-to-one target
  matching) has landed and been offline re-scored. El Marcos fixture
  correction was deferred to this work.
- Manual run against the second Brasero menu
  (`brasero-menu-two-ocr-result-20260703-195733.json`) shows the current
  deployed baseline extracts the protein grid inverted (Cerdo/Res/Pollo/
  Atún as items carrying the dishes as options) and drops Taco Loiro's
  choice line entirely. It also misread printed `TACO SONORA` as
  "Taco Sombrero".
- Testing spend is unconstrained for this work (user, 2026-07-03).

## Ground truth decisions (user-adjudicated, 2026-07-03)

- **Taco Loiro**: item name is `Taco Loiro (sirloin)` — the parenthetical
  is printed at the same size/weight as the name, so it stays in the
  name. Price $165. Options: `picaña` $165, `pollo` $150.
- **Protein grid**: 7 standalone items, each with `section_title` set to
  its closest printed label:
  - Cerdo → Bandiola Adobada (60gr) $110; Chistorra (60gr) $100
  - Res → Sirloin (60gr) $135; Picaña (60gr) $140; Chicharrón (80gr) $90
  - Pollo → Pechuga al Limón Rellena de Queso Envuelta en Tocino (60gr) $110
  - Atún → Filete de Atún Sellado con Rub Rojo a la Parrilla (60gr) $110

  The four protein labels are section titles and must never be emitted as
  items.
- **`section_title` is the closest label only** — flat, no parent-path
  concatenation (`Cerdo`, not `Especialidades Brasero → Cerdo`).
- The printed name is `TACO SONORA`; "Taco Sombrero" is a misread.
- The new fixture uses **only `BraseroMenuTwo_TWo.png`** (single photo).
  Manual count: **25 items** — 12 Especialidades Brasero tacos, 7 grid
  items, 4 Guarniciones, 2 Postres. Exactly **1 option-bearing item**
  (Taco Loiro).
- The photo shows a partial upside-down page at the top. Its items are
  not expected; if extraction emits them, adjudicate rather than
  auto-fail.

## Phase 1 — Fixture debt (offline, free)

- Re-read `ElMarcosMenu.png` to settle the Plato Surtido price ($72
  extracted vs $82 adjudicated); report the printed price to the user
  before encoding.
- Correct `scripts/fixtures/el-marcos.expected.json` per the adjudicated
  ground truth, using qualified-matcher price/description qualifiers to
  target the right duplicate-name cards:
  - Revueltos $90 card → Jamón, Chorizo, Tocino
  - Fritos $90 card → Jamón, Chorizo, Tocino
  - Hot Cakes $78 card → Jamón, Tocino, Huevo
  - Plato Surtido card (price per photo check) → Queso cottage, Yogurt
  - Waffles → no options
  - Pa' los Bukis → no options (grouped/conditional combos stay
    description-only until the data model supports option groups)
- Verify the Casa Nostra Cesar row against `CasaNostraMenu.png`: if the
  lettuce choice (entera / en trozos) is printed inside the one priced
  row, encode it per the adjudicated rule "choices inside one priced row
  are structured options", and note the fixture change in the eval log.
- Create `scripts/fixtures/brasero-two.expected.json` from the ground
  truth above (single photo, 25 items, sections including Cerdo / Res /
  Pollo / Atún, one option target `Taco Loiro (sirloin)` with picaña $165
  and pollo $150).
- Verify: `deno run --allow-read scripts/eval-extraction.ts --self-check`
  passes with six fixtures; offline re-score of the iter-004 and iter-009
  archives under the corrected fixtures, appended to the eval log as an
  offline note (free preview of how much of 009's red was fixture debt —
  brasero-two has no archived actuals yet, so it is excluded from the
  re-score).

## Phase 2 — Restore two-pass extraction

Re-apply the Iteration 009 implementation from `968982b` (revert of
`4d0f3b7`). All proven behavior is kept exactly:

- gpt-4o for both passes, temperature 0, seed 17;
- independent 120-second timeout per pass;
- Pass 2 receives the original photos plus indexed Pass 1 items;
- strict `item_index` validation (integer, in-bounds, unique) — invalid
  indices fail the extraction;
- Pass 2 transport/schema failure fails the whole extraction (never
  silently empty options);
- `postprocessItems` runs after the merge;
- `raw_response` carries both raw passes as `{ items, options }`.

Verify: the Iteration 009 unit-test suite is green
(`deno test supabase/functions/analyze-menu/`), plus `deno check` on the
touched files.

## Phase 3 — The two general rules, one per pass

No menu-specific or language-specific strings anywhere. Exact prompt
wording is finalized in the implementation plan; the rules are:

**Pass 1 — single added rule (priced-children section rule).** Draft:

> If a label has no price of its own and the entries printed under it
> each have their own price, that label is a section title. Record it as
> those entries' `section_title`. Never output the label itself as an
> item, and never convert its priced entries into options.

This is the only Pass 1 change; the rest of the corrected baseline prompt
is frozen. It targets the grid inversion and the recurring "section
header emitted as item" failures on El Marcos and Nikkori.

**Pass 2 — concept-based option definition.** Draft signals:

1. Text inside a single item's block — in whatever language the menu
   uses — that invites choosing one of several mutually exclusive
   alternatives is an options list, regardless of formatting (inline
   sentence, bolded lead-in, parenthetical, dash- or slash-separated).
2. An alternative that carries its own printed price or weight is one
   option with that price/grams.
3. A choice printed inside an item's block belongs to that item; a label
   printed above multiple independently priced entries is a section, not
   an option parent.

Plus the adjudicated constraints: separate priced rows are separate cards
(never options of one another); ingredients joined by "and"-equivalents
remain description text; nested conditional combos remain
description-only.

Verify: unit tests on the Pass 2 prompt-builder output; `pnpm lint`.

## Phase 4 — Iteration 010 paid benchmark and gate

- Fresh paid run on all six fixtures: brasero, brasero-two, casa-nostra,
  el-marcos, mochomos, nikkori.
- Archive actuals to `~/Downloads/MenusTesting/iter-010/*.actual.json`.
- Append an Iteration 010 entry to
  `docs/superpowers/extraction-eval-log.md` in the established format
  (hypothesis, change list, per-menu/aggregate table, what worked, what
  failed, decision).
- **Gate** (same protocol as prior iterations): if any currently-green
  aggregate dimension regresses, revert the change, log it, and stop for
  user input. Options must reach aggregate-green.
- Brasero-two pass criteria: ≥22/25 items (≤3 misses), grid items mapped
  to Cerdo/Res/Pollo/Atún section titles with no protein pseudo-items,
  Taco Loiro options captured.
- Nikkori item completeness (~106/120) is a known-red tracked item and
  explicitly out of scope; it gets its own later iteration.
- On green: deploy the two-pass extraction to the main repo's
  `supabase/functions/analyze-menu` and the user re-verifies in the iOS
  simulator against both Brasero photos.

## Phase 5 — Allergen removal (separate branch, after Phase 4 is green)

Remove all allergen functionality from the app:

- allergen-selection UI (from the 2026-06-21 allergen-selection work) and
  any allergen display on menu items and results;
- allergy/allergen state in stores and persistence;
- the results-screen allergen disclaimer card and any allergen filtering
  logic;
- `allergens` sentence in `ENRICH_PROMPT`; `allergens` property and
  `required` entries in `ENRICH_SCHEMA_OPENAI` and `ENRICH_SCHEMA_GEMINI`;
  `allergens` in `EnrichedItem` and related types;
- any allergen references in the extraction path.

Documentation must move in the same phase so future sessions don't
resurrect the feature:

- AGENTS.md: remove the mandatory allergen-disclaimer requirement, the
  allergy/ingredient-exclusions bullet, and the Stage 2 "retains per-item
  `allergens`" sentence;
- check the development plan file (sunny-lemon-development-plan.md) for
  matching references and propose edits to the user.

Verify: type-check and lint green; a repo-wide search for
allergen/allergy terms returns no functional code references; app builds
and runs.

## Out of scope

- Nikkori completeness fix (dense-menu extraction capacity — own
  iteration).
- Option-groups data model (nested conditional combos stay
  description-only).
- Enrichment changes beyond allergen removal.
