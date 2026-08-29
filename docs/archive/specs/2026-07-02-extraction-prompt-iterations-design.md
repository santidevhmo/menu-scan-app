# Extraction Prompt Iterations Design (post-baseline)

Design for iterating `EXTRACT_PROMPT` after the Iteration 001 baseline
(`docs/superpowers/extraction-eval-log.md`). Goal: turn the two red
dimensions — item completeness and option detection — green across the
five-menu benchmark without regressing categories, section context, or
image quality.

## Confirmed option definition

An **option** is a printed per-item choice the customer makes about that
item's composition: protein or filling choices, paid add-ons, dietary swaps
(e.g. gluten-free pasta), and flavor choices (e.g. colada flavors).

**Not options:** serving formats or sizes (copa vs botella, glass vs bottle),
and lists of distinct products under a generic heading (a wine's name under
"Vino Blanco" is the product's name, not an option).

This definition changes Nikkori ground truth: `Coladas` (Piña/Fresa/Limón/
Mango) is a legitimate options target.

## Baseline failure analysis (from raw outputs)

- **El Marcos (45/36 items, 0/5 options):** one root cause. Variant-bearing
  items were exploded into duplicate-name items with empty options
  (`REVUELTOS ×3`, `FRITOS ×2`, `CHILAQUILES ×3`, `HOT CAKES ×2`,
  `WAFFLES ×2` = the +9 over-count and the 5 missed options targets).
- **Casa Nostra (23/33 items):** numbered menu with gaps in extracted
  numbers (39, 42–49, 58–59 …) — skipped rows/columns. Its options "miss"
  is a transcription artifact: item extracted as "…ubricca" vs fixture
  substring "…ubriaca", so `name_contains` failed.
- **Nikkori (118/120, 10 false-positive options, section FAIL):** all false
  positives are drink serving formats or product lists (`Copa | Botella`,
  bottle-only wines). Sections used the parent heading `LICORES` instead of
  nearest subheadings (Vodka, Ron, Tequila, Whisky, Digestivo) and invented
  `ROLLOS`/`SANGRÍA` groupings.
- **Brasero (28/28, 1 options miss):** Pasta Alfredo's prose choice
  ("Camarón o Pollo") not captured while the same-format Pasta Parmesano was.

## Approach

Prompt-rules-only iterations, one focused hypothesis per paid run, logged
append-only in `docs/superpowers/extraction-eval-log.md` per the mandatory
protocol (entry written before the run, results and decision after). Model
settings stay fixed: `gpt-4o`, temperature 0, seed 17. Cost is accepted
(~$0.15/run); attribution of effects matters more than run count.

### Iteration 002 — options and variant folding

Prompt rule additions (exact wording drafted at implementation):

1. **Variant folding:** when one base dish repeats with different fillings,
   proteins, or preparations (each possibly with its own price), emit ONE
   item whose `options[]` carries each variant with its printed price/grams.
   Never emit duplicate item names for variants of the same dish.
2. **Option definition:** encode the confirmed definition above, with the
   copa/botella and product-list exclusions stated explicitly.
3. **Prose choices:** a choice written inside the description ("con X o Y",
   "choice of X or Y") is an options list.

Harness/ground-truth corrections shipped with this iteration (logged as
scoring changes, distinct from the prompt hypothesis):

- Nikkori fixture: add `Coladas` to `items_with_options`.
- Casa Nostra fixture: shorten the fragile options-target substring to
  `"frutti di mare"` so a 1-character OCR wobble can't mask a real pass.

Expected effect: El Marcos items → 36 and options 5/5; Nikkori options
false positives → 0 (Coladas only); Brasero 2/2 options; Casa Nostra
options targets resolvable.

### Iteration 003 — completeness on numbered/dense menus

Prompt rule: menus often number their items; transcribe every printed item
number and extract every numbered row — a gap in the number sequence means
a missed item. For unnumbered dense menus, scan column by column and do not
stop mid-section. Target: Casa Nostra 33/33, Nikkori 120/120, no
regression elsewhere.

### Iteration 004 — nearest section vs parent heading

Prompt rule sharpening: when one or more subheadings sit between a parent
heading and an item, `section_title` is the nearest subheading, never the
parent (LICORES → Vodka/Ron/Tequila/Whisky/Digestivo). A heading must
visually group the items beneath it; do not invent groupings that are not
printed. Target: Nikkori section dimension PASS.

### Measured escalation (only if a rule fails its run)

- **Completeness escalation:** add per-item `item_number: string | null` to
  `EXTRACT_SCHEMA` (and align `index.ts`) so number gaps become
  mechanically checkable. Schema change, so it gets its own iteration.
- **Last resort:** two-pass extraction or deterministic post-processing
  (e.g. duplicate-name folding in code). Out of scope unless prompt and
  schema iterations both flatline; requires its own design.

## Success criteria

All five dimensions aggregate-PASS on the five-menu benchmark, with the
harness's existing bars unchanged (except the two fixture corrections
above). Every iteration — pass or fail — appended to the eval log with
hypothesis, exact diff summary, per-menu scores, and decision.

## Scope

`EXTRACT_PROMPT` in `supabase/functions/analyze-menu/extract.ts`, the two
fixture files named above, and the eval log. No client changes, no Stage 2
(enrichment) changes, no new dependencies. Iterations run on branch
`feat/extraction-eval-harness`.
