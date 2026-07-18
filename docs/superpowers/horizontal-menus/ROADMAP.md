# Horizontal Menus Roadmap (critical-path #4) — dedicated plan

> **What this is:** the working plan for critical-path #4 (horizontal/landscape menu handling), structured like the master roadmap: phases with cheap-probe-first iteration, frozen-gate discipline, and user rulings at checkpoints. Master roadmap: main repo `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md` ("Release scope decision" item 4). Read its **Strategy Rules** and **Lessons learned** before any phase.

**Status:** ACTIVE 2026-07-15 · Phase 1 in progress; current blocker = invented cross-card items from the overloaded dense-landscape tile.
**Working directory:** the worktree `/private/tmp/menu-scan-app-extraction-eval-harness`, branch `feat/extraction-eval-harness` (pushed to origin). Main checkout is device-builds only; never commit there (docs excepted).

## Division of labor (formalized from ticket #3, which closed under this model)

- **Planner/orchestrator LLM (this plan's author):** analysis, brainstorming, probe design, dump diagnosis, oracle adjudication support, gate judgment, ledger/diagram/roadmap/memory writes, task-block authoring.
- **Executor LLM:** receives self-contained task blocks pasted from here (zero-context format: exact code, exact commands, expected outputs). Owns: writing code, TDD self-checks, `deno check`/`tsc`, commits, launching detached runs, monitoring logs, reporting raw results back. **Hard rules for every task block:** never launch a multi-run gate without an explicit user cost approval relayed in the block; never commit in the main checkout; stop at checkpoint lines and report — checkpoints are the planner's.
- **User:** oracle rulings (ORACLE-CHANGEs are user-only), convention rulings, cost approvals, device scans.

## Evidence base (2026-07-13, ledgered as eval 059 context)

Three landscape-upright fixtures photographed/collected by the user, all in `/Users/santiagoaguirre/Downloads/MenusTesting/`, drafts extracted via `scripts/extract-draft.ts` and hand-corrected by the user in place (`*.draft.json`, user edits 2026-07-13 19:00–20:01):

| Menu | File | Dims | Draft result | Character |
|---|---|---|---|---|
| Bistro | `BistroMenu.png` | 2384×1844 | 26 items, structure right, ~±10MXN price misreads (user-fixed) | least dense; near-pass |
| Polloteria | `PolloteriaMenu.png` | 2274×1572 | 42 items where manual count says ~40 food + 15 drink entries — badly under-extracted, names mangled (El Tendedero→"El Tenderete", Megacharola→"Megacharlones", Papabones!→"PapaBoneless"), **dense detector did NOT fire** | dense; the star failure |
| GuestHouse | `GuestHouseMenu.png` | 2606×1580 | 49 items, cleanest; Enhancements column-pairing price misreads; per-oz/per-size pricing open | English (bake-off asset) |

User manual category counts (fixture truth): Polloteria food = Entradas 6, Pa'Compartir 3, Ensaladas 3, Crispy Chicken 5, Especialidades 5, Sandwiches & Hamburguesas 10, Sides 4, Pollo Kids 4 (= 40 food); drinks = Bebidas 14 + Malteadas 1 (6 options) — drinks are F5-deferred, parked in fixtures, NOT gated. GuestHouse = Raw Bar 6, Starters 4, Salads 4, Butcher's Best 5, Enhancements 12, Entrees 8, Sides 8 (49 incl. Seafood Plateau handling per ruling below).

Key diagnostic facts:
1. **All 3 photos are landscape-UPRIGHT** (readable text, wide). They exercise wide-layout handling. The roadmap's #4 trigger scenario — portrait photo with the menu rotated 90° — is exercised by ROTATED COPIES of these same photos (Phase 3); one oracle serves both arms.
2. **The dense detector returned dense=false on Polloteria** despite classic overload symptoms (under-count + name mangling). Landscape-dense is a detector blind spot; the failure-as-signal branch (timeout/length) also never fired.
3. **Misreads correlate with the overloaded single-call read.** Nikkori precedent: names distorted in whole-page reads came back clean from tiles. Expectation: fixing dense-landscape (Phase 1) fixes most misreads for free. Residual stable misreads = the deliberately-ungated name-spelling class → owned by the post-release name-verification pass / model bake-off (Polloteria joins the bake-off fixture set: Spanish + dense + stylized names).
4. **~90% of size-variant items lost their variant text entirely** (model dropped "G (300gr) $179" halves, filled `price` with one value). NOT postprocess-recoverable (lesson #6: never-emitted text has no downstream lever) → Phase 2 is extraction-convention work, not a parser.

## Architecture decisions (locked with user 2026-07-13)

- **ONE pipeline, no horizontal fork.** Orientation is an input property. No separate edge function/stage. Landscape behavior enters only as: (a) client-side upright rotation before upload (pipeline never sees rotated pixels); (b) aspect-ratio-parameterized dense-detection/tile-geometry inside the existing functions. A unit test pins *portrait input ⇒ byte-identical behavior to today* — vertical safety is proven by construction during iteration, not by burning gates.
- **Mode/aspect-scoped prompt changes only** (master-roadmap lesson from v6/v7): any P1 sentence added for landscape evidence must be scoped to where it was measured, never global, unless probe evidence justifies global.
- **Cost policy:** iterate on `EVAL_MENUS`/single-menu probes ($0.05–0.30) + offline re-scoring of archived dumps and the 3 corrected drafts ($0). The 6-menu vertical suite re-runs live ONLY at the Phase-4 combined exit gate (9 menus ≈ $1.35–1.50/attempt, user-approved per attempt).

## Rulings

1. ✅ **Size-variant fold shape = Shape A (user, 2026-07-13):** card = smallest printed size (its price+grams); other sizes = priced options with grams in the option name (`{"name":"Ensalada Boneless","price":158,"grams":150,"options":[{"name":"G (300gr)","price":179,"grams":300}]}`). Covers Alitas 6/12/20 PZ, GuestHouse Parmesan filet 7oz/10oz 65/85, Seafood Plateau FOR TWO 150 / FOR THREE+ 280. Tomahawk 6.50 PER OZ = per-unit pricing (PER_UNIT_NOTE family), separate micro-ruling at Phase 2 if it surfaces. **Shape-A option pins enter the fixtures at PHASE 2 KICKOFF, not Phase 0** — the corrected drafts (= Phase-0 truth) still carry variant text embedded in titles, so pinning Shape A now would break fixture↔draft self-consistency; Phase 2's exit is precisely closing that gap.
2. ✅ **Polloteria aderezos prose option = `unchecked: true`** (user, 2026-07-13; Plato Surtido precedent) on the Cubeta Pollotera entry.
3. ⏳ **Detector strategy (after Phase 1 diagnosis):** prompt-rule vs deterministic assist (aspect ratio + expected-density heuristics) — decide on probe evidence, not upfront.
4. ⏳ **New-menu gate dims** for Phase 4 (recommend: same 5 frozen dims, food-scoped, same as the vertical six).
5. ✅ **Fixture-count decisions (user, 2026-07-13):** Bistro gates 24 food dishes (Pizzas 15 + Ensaladas 4 + Pastas 5); the 2-item "Agrega a tu pasta o ensalada" block is IGNORED (tolerated via section_headers + the ±3 items band). Polloteria: Malteadas stays inside Bebidas (drinks, ungated) → 40 food + 15 drink. GuestHouse: 48 food-scope items; Seafood Plateau = one item, section_title null. All three corrected drafts verified against manual counts 2026-07-13.
6. ✅ **Horizontal Phase-1/Phase-2 boundary (user, 2026-07-14):** printed size variants that Phase 1 temporarily emits as multiple item representations (currently Grande/Jumbo and combined+split Alitas) remain owned by Phase 2's mandatory Shape-A fold and do not by themselves block Phase 1. This is NOT permission to ship duplicate cards: Phase 2 must fold them before release. Unprinted/invented items remain release-blocking in Phase 1. Because eval 067 proved the item-count band can pass while inventions survive, Phase-1 probes require raw-dump/photo audit for inventions in addition to the numeric scorer.
7. ✅ **Dense horizontal support remains mandatory (user, 2026-07-15):** closing this roadmap by declaring horizontal menus unsupported is not an option; most horizontal menus Santiago has observed are dense. Santiago is open to evidence from both upstream nested-tile density reduction and a genuinely spatial/card-ownership verifier, but this is not live-cost approval—the probes still require separate designs, checkpoints, estimates, and explicit approvals. Guided capture of 3–4 overlapping close-up photos is also a research candidate, not a ruling: it may improve text scale but must prove full-column/edge coverage without relying on users to crop correctly.

## Phases

### Phase 0 — Fixtures from the corrected drafts ($0) ← NEXT
Build `scripts/fixtures/{bistro,polloteria,guest-house}.expected.json` from the user-corrected `*.draft.json` + manual counts. Include: food/drink split (drinks parked à la nikkori), `sections` + `section_expectations`, `items_with_options` (incl. rulings 1–2 once made), `category_expectations`, `grams_expectations` (Polloteria's printed grams are rich), cropped-price bebidas simply omitted from gated checks (drinks ungated). Validate each fixture offline against its corrected draft via `score-dump.ts` — the corrected draft should score ALL PASS against its own fixture (self-consistency check); the UNCORRECTED original extraction (re-runnable) documents the measured gap. Scorer must not need code changes; if a fixture shape lacks scorer support, that's a planner review item, TDD'd.
**Exit:** 3 fixtures committed, self-consistent offline, gaps documented in the ledger.

### Phase 1 — Dense-landscape handling — IN PROGRESS (full trail: ledger evals 060–062 + rulings 2026-07-14)
Status 2026-07-14: detector blind spot diagnosed (eval 060: dense=false, crop_direction=none 3/3 — landscape's 768px-shortest-side rescale crushes text; the model never signals). Cure proven: forced 2×2 tiles recover full coverage (4×1col REJECTED — section loss). Hygiene ladder landed (ledger 061-062): tolerated_categories scorer field, dropBannerEchoOptions, nullPriceNoteSections, tile-pass twin fold + truncation drop in merge.ts, misread pin retargets. Residual = recombination phantoms + double-flake twins → **USER RULING 2026-07-14: duplication/invention is trust-critical (release-blocking); the name-verification pass is pulled from the post-release OPTIONAL list into THIS phase (tile path only)**; band stays +5. Remaining sub-steps: (1c) verification pass build + probe; (1d) polloteria ×3 confirmation; (1e) aspect-scoped detector trigger (edge reads image dims from the file header; landscape-only P1 density suffix — portrait never sees it) + false-positive probes on bistro/guest-house; then the Phase-1 exit criteria below.
Original phase design (kept for reference):
1. **Detector diagnosis (~$0.15):** Polloteria ×3 phase-1 — is dense=false stable? Does `image_layout.crop_direction` say anything useful? Ledger the base rate before touching anything (lesson #7: instrument before theorizing).
2. **Detector fix:** per ruling 3 — candidate levers in cost order: aspect-aware deterministic assist in the detector consumer (no model change); a single mode/aspect-scoped P1 layout-assessment sentence (probe-driven, one variable at a time, watch the 5 vertical menus' detector false-positive rate on archived evidence first, live spot-probes only if the change could plausibly reach them).
3. **Landscape tile geometry:** extend `gridCropRects(w, h)` to return a landscape grid (start 3×2, same overlap philosophy) when w>h; portrait path byte-identical (unit-pinned). A/B on Polloteria (~$0.30/round) oracle-scored: 2×2 vs 3×2 vs no-tiling baseline. Tile fidelity rules stay (PNG from originals).
4. Re-check Polloteria names/counts through the winning path — quantifies how much of the misread class Phase 1 already killed.
**Exit:** Polloteria passes its scoped dims ×3 consecutive probes through the production path (detector fires, tiles win) AND raw-dump/photo audit finds zero unprinted/invented items; printed multi-representation size variants remain Phase-2-owned per ruling 6. Bistro + GuestHouse unregressed (offline + 1 live probe each); vertical portrait behavior unit-pinned unchanged.

### Phase 2 — Size-variant extraction convention (P1 + filter revision, full probe discipline)
Blocked on: ruling 1, and Phase 1 (variant items on Polloteria must be read through working dense handling before measuring). Work: revise the F2 "sizes are NOT options" scope — printed size variants WITH their own printed price/weight become options (macro-relevant: M 150gr vs G 300gr doubles macros); copa/botella-style format-only variants (no per-size print) stay excluded. Touches P1 (one sentence at a time, non-local-side-effect discipline) + `filterServingFormatOptions` (TDD; the wine-format tests must keep passing). Validate: offline vs ALL archived vertical dumps ($0) → sensitive-menu live probes (brasero/brasero-two are the serving-format-filter menus) → 3-menu landscape probes.
**Exit:** all size-variant targets in the 3 new fixtures extracted per the ruled shape ×3 probes; zero new option FPs on the vertical archive + probed menus.
**MANDATORY RESTORE (user-approved 2026-07-14, Phase-1 decoupling):** `polloteria.expected.json` moved `"Ensaladas"` from required `sections` to tolerated `section_headers` because its size-variant card titles (Phase 2's exact subject) mutate per run and killed Phase 1's section_context 3/3. Phase 2 CANNOT close until "Ensaladas" is moved back into `sections` and passes — the tolerance is temporary by ruling, not a truth change.

### Phase 3 — Rotation arm (the original #4 scenario)
Create rotated copies (`sips -r 90`) of the 3 landscape photos = portrait files with sideways text (the expected real capture). Client: detect + rotate upright before phase-1 (candidate signals: EXIF orientation, aspect + cheap heuristic, or P1 image_quality/layout on a failed first read — brainstorm at kickoff with Phase-1 evidence in hand); tiles cut from the ROTATED upright image. Harness mirrors the client rule (photo-input.ts). Assertions: each rotated twin scores == its upright twin (same oracle); the 6 portrait vertical menus NEVER trigger rotation (false-positive discipline); device photos may carry EXIF the PNG twins lack — device verification covers that gap.
**Exit:** rotated twins pass scoped dims ×3; zero rotation false-positives on vertical menus across those runs.

### Phase 4 — Combined exit gate + device verification
`eval-027-live.ts` grows the 3 new fixtures (detector expectations per fixture; rotation assertions per Phase 3). **Gate: 3/3 consecutive all-green on ALL 9 menus × frozen dims + detector + rotation assertions** (~$1.35–1.50/attempt, user approval per attempt). Then device: scan at least Polloteria (dense landscape) + one rotated capture on the iPhone; offline-score via `score-dump.ts` (ticket-#3 protocol). Close-out: ledger, pipeline diagram (landscape/rotation branches), master-roadmap #4 tick, memory.

## Deferred / known limits (do NOT work here)
- Stable name misreads surviving Phase 1 → bake-off + post-release name-verification pass (Polloteria = new bake-off fixture; GuestHouse = the English menu E2 needed).
- Drinks on the new menus (F5): counts parked in fixtures.
- OCR-model alternatives for misreads: bake-off track (after critical-path #5), not here.
- The pixelated third Google-Maps menu the user discarded; user may source another dense-landscape photo later — add as fixture, same flow, no plan change.

## Reference Block (verbatim essentials)
- Gate runner: `scripts/eval-027-live.ts` (GATE_DIMS = [items, options, section_context, categories, grams]; never plain `--gate`). Scorer: `scripts/eval-extraction.ts` (`scoreMenu`, self-check). Offline: `scripts/score-dump.ts <menu> <dump.json>`. Drafts: `scripts/extract-draft.ts`. Production input mirror: `scripts/photo-input.ts` (passthrough ≤9M b64; 2048/q95 fallback).
- Menus: `/Users/santiagoaguirre/Downloads/MenusTesting/` (6 vertical + BistroMenu.png, PolloteriaMenu.png, GuestHouseMenu.png + corrected `*.draft.json`).
- `OPENAI_API_KEY` in worktree `.env.local` (gpt-4o Tier-1 30k TPM/90k TPD). Long runs: `nohup … > log 2>&1 &`, poll the log, never pipe. Ledger every experiment: `docs/superpowers/extraction-iteration-ledger.md`.
- Edge fn (deployed test project uonuiadueykynbetxxrw) — no edge changes expected before Phase 4; back up before any redeploy.
