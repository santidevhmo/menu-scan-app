# Spec — Mistral option misattribution guard (colocation via native blocks)

**Date:** 2026-07-28 · **Status:** design approved (Santiago, this session), pre-implementation
**Context:** Priority Zero (ruling 29) — GPT-4o→Mistral-OCR extraction migration. Sub-step: close the last M2 gap (bistro `5 Formaggi` carrying two misattached options) **at the extraction/cleanup layer**, before M3 edge wiring.
**Scope of change:** harness-only ($0). `scripts/mistral-cleanup.ts` + its test + its offline re-score main. NO production edge code (that is M3). NO API calls.

## Problem

Mistral's structured extraction transcribes printed text correctly but sometimes **binds a printed note to the wrong dish**. On bistro, the general note *"Agrega a tu pasta o ensalada: Pollo, Camarón"* (add chicken/shrimp to your pasta or salad) was attached as two priced options (`Pollo $20`, `Camarón $25`) onto the first pizza, `5 Formaggi`. Showing "add shrimp" on a pizza is the waiter-embarrassment / trust-critical class, not a cosmetic nit — Santiago wants it fixed before M3.

This is a **misattribution**, not an invention (the text is real, just on the wrong card). It is a distinct failure mode from the invention class the colocation stage (ruling 15) was built for — which means colocation is **not** fully moot under Mistral, but it becomes **free and native** (Mistral returns page blocks with geometry in the same response, no separate OCR call).

### Approaches considered
- **Extraction instruction (schema field description).** REJECTED — eval 096 (M2) proved a schema field `description` is a global lever with disqualifying collateral: it regressed polloteria ALL-5→2/5 (suppressed the self-echo weight-options grams depends on) and made bistro worse (options 1→15 FP, tagged "28 cm" as a size option on every pizza). The prohibition *idea* worked (it removed the misattachment), but the channel is too blunt to use on the shared schema.
- **Add-on marker keywords** ("Agrega"/"Add"/"+"). REJECTED — a multilingual keyword list is language/menu-specific and fails worldwide (ruling 7; the "must generalize globally" constraint).
- **Tolerate it** (scorer `tolerated_option_names`). REJECTED by Santiago — tolerance hides it from the gate but still ships it to the user; the point is to remove it from the output.
- **Spatial colocation via Mistral's free page blocks.** ADOPTED — operates on the actual root cause (spatial card ownership); menu-generic (pure geometry); $0.

### Success bar (Santiago ruling, this session)
**Drop** the misattached option (option A). No relocation to the correct dishes (a separate future feature). "Fixed" = the wrong options are gone from the dish.

## The rule — `dropMisattachedOptions(items, blocks)`

Runs per item that carries options. Uses `pages[0].blocks` from the Mistral response — each block has `top_left_x/y`, `bottom_right_x/y`, `content`, `type`.

Helpers (reuse the module's existing `norm`):
- `norm(s)` → NFD strip accents, lowercase, split on non-alphanumeric, drop empties → token list.
- `center(block)` → `[(tlx+brx)/2/W, (tly+bry)/2/H]` in normalized page coords (each in [0,1]); `W/H` = `pages[0].dimensions`.
- `ov(a, b)` → fraction of `a`'s tokens present in `b`'s token set.
- `bidi(a, b)` → `min(ov(a,b), ov(b,a))` — high **only** when the two token sets are nearly identical (i.e. the block is *mostly* the name, not merely contains a shared word). This is what defeats single-token collisions (`Pollo` inside a pizza description; `Alitas` inside a combo description).

Algorithm, per item with ≥1 option:
1. **Anchor:** `anchor` = block maximizing `bidi(norm(item.name), norm(block.content))`; `anchorStrength` = that max.
2. For each **option:** `src` = block maximizing `bidi(norm(option.name), norm(block.content))`; `optStrength` = that max.
3. **Drop the option** iff **all three**: `anchorStrength ≥ 0.6` **AND** `optStrength ≥ 0.6` **AND** `dist(center(anchor), center(src)) > 0.35` (normalized-coordinate Euclidean distance).
4. **Otherwise keep** — fail-open on any weak/ambiguous/no-match case. Uncertainty never deletes.

If `blocks` is absent/empty → skip entirely (keep all options). If an item has no options → skip.

### Why it's safe (measured, cached b1 r1 raw responses)
With the bidirectional match + fail-open gate, only high-confidence matches are ever eligible to drop, and the measured separation is a ~3× gap:

| | eligible (anchorS≥0.6, optS≥0.6) | distance | action |
|---|---|---|---|
| bistro `5 Formaggi` → `Pollo` | yes (1.00 / 1.00) | **0.56** | DROP |
| bistro `5 Formaggi` → `Camarón` | yes (1.00 / 1.00) | **0.57** | DROP |
| polloteria Paletas flavors (`Uva`…`Fresa`) | yes | 0.06–0.12 | keep |
| polloteria exact-card options | yes | 0.00 | keep |
| polloteria Cubeta component (`Dedos de queso 5 piezas`) | yes | 0.17 | keep |
| polloteria Shape-A `M/G`, `Alitas 6/12/20 PZ`, `Grandes/Jumbo`, self-echoes, combo comps | **no (weak match)** | — | keep (fail-open) |

Largest KEPT strong-match distance = **0.17**; bistro drops at **0.56–0.57**. Threshold 0.35 sits in the middle of a wide gap. Real single-token flavor options are either near their dish (kept) or weakly matched (kept). The rule never touches the release-critical polloteria option set.

## Integration
- `mistralCleanup(items)` → `mistralCleanup(items, blocks?)`. New chain order: `dropDrinkSections` → `dropOtherCategoryItems` → **`dropMisattachedOptions`** → `dropSelfEchoWeightOptions` → `normalizeSectionTitle`. (Misattached options are removed before the self-echo fold; the bistro options are priced non-weight options so the fold never touched them anyway — order is for clarity.)
- The offline re-score main in `mistral-cleanup.ts` must load `blocks` from `${menu}.mistral-${TAG}-r${r}.raw.json` (`pages[0].blocks` + `dimensions`) and pass them to `mistralCleanup`. (The `.dump.json` files carry only items — blocks live in `.raw.json`, which is cached for all runs.)
- **M3 (edge wiring, later):** the edge already holds the full Mistral response, so passing `blocks` is free. Spec'd separately.

### Constants (ruling-7 note)
`0.6` (match-strength floor) and `0.35` (far-distance threshold) are **generic algorithm constants**, not menu-specific counts/names/geometry — allowed (cf. the 0.65/0.35 tile overlap, the 0.75 bestSim threshold). Justified by the measured 0.17-vs-0.56 gap.

## Testing / gate ($0, offline)
Unit tests (`mistral-cleanup_test.ts`):
1. Bistro shape: item anchored top-left, an option whose only tight-match block is far → **both options dropped**.
2. Near option (strong match, small distance) → kept.
3. Weak match (single token shared with a far block) → kept (fail-open).
4. No blocks passed → kept (fail-open).

Regression gate (re-score all 9 cached `b1` dumps, blocks wired from `.raw.json`, ×3 runs r1/r2/r3):
- **polloteria ALL-5 ×3** (unchanged from M1).
- **bistro → 5/5 ×3** (options FP 1→0; items/section/categories/grams still PASS).
- **guest-house recall 48/48 ×3, zero-invention** unchanged (its options/section/grams stay Phase-2-deferred; the rule must not change its recall or invent).

## Deferred / caveats
- **Vertical-menu validation → M4.** This filter runs on every menu once the extractor swaps, but B1 dumps exist only for the 3 wide menus today. The fail-open design keeps it conservative; re-validate against the 6 vertical B1 dumps at M4 before the extractor ships. The `0.35` threshold may need confirming on wider data then.
- **Threshold-free hardening (not built now):** if M4 shows a vertical false-drop, replace the fixed distance with "nearest-item ownership" (drop only if the option's block is closer to a *different* item's anchor than its own). More moving parts; deferred until data demands it (YAGNI).
- **Relocation (option B)** — re-attaching add-on notes to the correct dishes — is a separate future feature, explicitly out of scope.
