# OCR Extraction Master Roadmap

## 🎯 CURRENT PHASE — the ONLY place this is written down

> **Scope: EXTRACTION QUALITY ONLY.** This roadmap is one workstream, not the product plan. The
> product-level roadmap — 16 phases, bootstrap to launch — is
> **`docs/sunny-lemon-development-plan.md`**, and this work sits inside its Phase 9. For anything
> about profiles, history, feedback, paywall, onboarding, auth or UI, go there instead.
>
> **Update this block when a phase closes. Do not restate it anywhere else** — this project has
> repeatedly lost sessions to status copied into a second file and then left to rot.
> Entry point for new sessions: `docs/superpowers/START-HERE.md` (routing only, no status).

**ACTIVE: critical-path #5 — Stage-2 enrichment accuracy benchmark ("macro enrichment").**
Macro accuracy has never been gated. The enrichment model is already decided (GPT-4o); what is
missing is a measured benchmark, including printed-weight items so P2's "prefer printed weights"
rule is actually measured (grams flow from Feature 4's `items[].grams`). Scope detail: item #5 of
"Release scope decision" below.

> **🚧 IN PROGRESS — benchmark built, SIX fixes measured. B4 scored 36/36, the first clean sweep and
> the first time anything has beaten the baseline. Needs a repeat run before it means anything.
> Nothing deployed.**
>
> **Branch `worktree-stage2-macro-benchmark`** (off `main` at `04e77ab`). All of this phase's
> work lives there, NOT on `main`. The local worktree is `.claude/worktrees/stage2-macro-benchmark/`
> — that path is gitignored, so on a fresh machine just `git checkout worktree-stage2-macro-benchmark`
> and work in the repo root.
>
> ### Taking over? Read this block, then the log. Everything else is history.
>
> **Where the phase stands (2026-08-08):** the harness, the USDA oracle and the scoring are done
> and frozen. Six prompt/schema iterations have been measured against them. Production is
> **untouched** — the deployed edge function still runs the original pre-B1 prompt. Total spend on
> this phase to date: **$0.226**.
>
> | Commit | What | Deployed? |
> |---|---|---|
> | `58dfc1f` `73efc15` `6bd5752` `f8ca5a2` | harness: prompt/schema export, pure scoring, runner, raw archiving | — |
> | `4300e4f` → `242ab9e` | USDA calculator, FDC helper, approved recipes, provenance guard | — |
> | `0476481` | Stage 2 pinned to `gpt-4o-2024-08-06` | ✅ deployed |
> | `ce91e91` | response-boundary hardening | ✅ deployed |
> | `a4ebf0f` | oracle re-frozen under one printed-weight rule; $0 re-score | — |
> | `1768a1d` | **B1** — required per-ingredient `grams` | ❌ **on branch only** |
> | `1ce5139` | **B10** — per-ingredient macros, item totals summed in code | ❌ **on branch only** |
> | `766be47` | **B11** — carb-trap sentence in the prompt (**falsified, reverted by B12**) | ❌ **on branch only** |
> | `692a8af` | **B12** — per-100 g composition, priced in code; B11's food list deleted | ❌ **on branch only** |
> | `06fd49a` | **B13** — step-2 clause rejecting the raw reference figure (**falsified, kept**) | ❌ **on branch only** |
> | `55f924d` | portion scorer — displacement metric, benchmark-only, $0 | — |
> | `fae3291` `ff93de2` `950c334` `3ce44b7` | **B4** — conventional servings + printed-weight scope tag, fitted in code | ❌ **on branch only** |
>
> **The measured story, in one table.** Failed field/draws, scored under the PASTEL beans
> tolerance (see Rulings) — 36 field/draws total:
>
> | run | failed | what fails | mean \|error\| |
> |---|---:|---|---:|
> | baseline-002r | **6** | CESAR calories −24%, CESAR fat −32% | 18.6% |
> | iter-b1-001 (grams only) | 13 | spread over 5 item/field combinations | 25.5% |
> | iter-b10-001 (summed) | 7 | **carbs ×6**, one Salmone calorie draw | 20.6% |
> | iter-b11-001 (carb sentence) | **6** | **carbs ×6** — CESAR ×3, PASTEL ×3 | 19.6% |
> | iter-b12-001 (per-100 g) | 11 | **fat ×5**, calories ×2, carb ×4 | 26.8% |
> | iter-b13-001 (raw-reference clause) | 6 | fat ×4, carb ×2 | 21.3% |
> | **iter-b4-001 (conventional servings)** | **0** | **nothing** | **16.7%** |
> | **iter-b4-002 / 003 / 004 (reproduction)** | **1 / 0 / 1** | PASTEL fat only | 16.1–17.3% |
>
> ✅ **B4 is the first iteration to beat the baseline, and it REPRODUCED.** Four runs, twelve draws:
> **2 failed field/draws out of 144 (1.4%)**, against the best prior result of 6 out of 36. Quote the
> **range 0–1**, never iter-b4-001's zero alone.
>
> Both failures are one named defect: PASTEL's cheese serving drops 50 g → 30 g in 2 of 12 draws, and
> since cheese is that dish's dominant fat its fat falls to −44.1%. Everything else is near
> deterministic — beans tagged outside the printed weight in **12/12**, `printed_total_g` read
> correctly in **12/12**, Salmone displacement 14.3% in **12/12**.
>
> Still not settled: a large share of passing fields sit within a few points of their band edge, so a
> tighter tolerance would fail them.
>
> **What the six iterations established (all from archived responses, $0 to re-check):**
>
> 1. **B1 alone regressed things**, but proved the model **portions** well — its gram sums land
>    exactly on the printed weight on 2 of 3 dishes, which it never did before.
> 2. **B10 proved the model can add.** Once given per-ingredient macros, the item totals it emits
>    match our computed sums almost exactly and stop being multiples of 5.
> 3. **B11 proved prompt wording is not the lever, and that a food list BACKFIRES.** PASTEL's carb
>    sum was 50 g in both runs. The sentence listed `corn kernels` among high-carb foods and the
>    model took the licence: sweet corn went 15 g → **20 g** of carb at 30 g. That list was a
>    roll-call of our own three fixtures' ingredients — **the test set had leaked into the shipped
>    prompt.** `enrich_test.ts` now guards step 2 against any food name mechanically.
> 4. **B12 SOLVED per-ingredient composition.** Asked for composition per 100 g instead of "the
>    amount in this serving", the model returns USDA values to the decimal — corn **19** vs USDA
>    18.7, tomato sauce 5 vs 5.3, parmesan `35.8/3.2/25.8` vs `35.75/3.22/25.83`. The knowledge was
>    always there; asking for an *amount* was destroying it, because an amount comes back as a round
>    number anchored to the ingredient's **category tag** (anything tagged `carb` got 20 or 30 g
>    whatever the food or weight).
> 5. **Therefore: composition is done, PORTIONING is the whole remaining carbohydrate problem.**
>    PASTEL's carb now passes 3/3. CESAR still fails because its croutons are portioned 30 g against
>    the oracle's 20 g while priced correctly at 72 g/100 g; Salmone fails two draws because its
>    baguette portion **collapsed from 50 g to 10 g** between draws.
> 6. **B12's bill was fat, on all three dishes** — the model's fat is below the oracle on all six
>    fats measured. B12 guessed the cause was a raw-vs-prepared basis error, and it also deleted step
>    2's only fat signal in the same commit, so the run was confounded. **B13 resolved both** — see #7.
> 7. **B13 falsified prompt wording for the second time, and this one is decisive.** Telling the model
>    outright that the raw reference figure is the wrong answer moved **zero** fat values: Caesar
>    dressing 40, croutons 10, chicken 3.6, parmesan 25.8 — identical to B12 to the decimal, and
>    CESAR's fat error is **−35.5% in all three draws of both runs**. So the deleted fat signal was
>    never the cause either. Also: **the model is not quoting *raw*.** Raw chicken breast is ~1.2 g
>    fat/100 g and it says 3.6. It picks a **leaner but real** product where the oracle picks a richer
>    as-prepared one. That is a product disagreement, not a basis error.
> 8. **Fat now decomposes to PORTIONING, exactly like carbohydrate did.** CESAR's whole 10.3 g fat
>    gap is **91% one ingredient** (Caesar dressing) — and 5.78 g of that 9.34 g is the portion call
>    (20 g vs the oracle's 30 g) against only 3.56 g for the composition.
>
> 9. **B4 closed it, and cheaply.** Two $0 measurements set it up: an ablation showing the model's own
>    composition scores **36/36 once given the oracle's grams**, and a new portion scorer showing
>    CESAR's *displacement* — the share of a dish's mass on the wrong ingredient — was **20.0% in all
>    fifteen draws of all five prior runs**, never once moving. Asked for a **conventional serving**
>    instead of a number that had to sum to the printed weight, the model said Caesar dressing is 30 g
>    (the oracle's figure exactly; it had said 20 g every time before) and tagged PASTEL's beans as
>    sitting *outside* the printed weight unprompted, closing a −21.1% total error frozen since B1.
>    Result: **0 failed field/draws.** The backlog's two-call design was never needed.
> 10. **The pattern that has now won three times out of three:** take arithmetic away from the model
>    and leave it knowledge. B10 took the addition, B12 the multiplication, B4 the fitting. The two
>    changes that only added instructions (B11, B13) moved nothing.
>
> ⚠️ **Everything from here down to the B14 block was written when the set was THREE dishes.** Those
> figures are still correct for that set and are what B14's 8-dish numbers replaced; read them as the
> history that motivated widening, not as current status.
>
> ### ⚠️ ORACLE RE-FROZEN 2026-08-08 — read this before any number above
>
> `a60eb2a` re-picked CESAR's Caesar dressing from 57.8 g fat/100 g (the top of ~40 USDA entries) to
> the market median 36.67. **Our oracle was stricter than reality and the model was closer to it than
> we were.** Re-scored history, $0, `deno run --allow-read scripts/rescore-history.ts`:
>
> | run | was | now | mean abs error |
> |---|---:|---:|---:|
> | baseline-002 | 6 | **0** | 16.7% |
> | iter-b13-001 | 6 | 3 | 18.3% |
> | **iter-b4-001…004** | 0/1/0/1 | **0 0 0 0** | **13.6–14.7%** |
>
> **The baseline's only six failures were the two CESAR fields we just corrected, so B4 no longer beats
> it on the headline count — they tie at 0.** B4 leads on mean absolute error instead. The failure
> count is now a **saturated gate**: two very different pipelines both score 0, so mean absolute error
> is the primary number from here and the count is a floor that must not regress.
>
> A $0 re-derivation then showed **~70% of the fat lean was our own oracle**. The three remaining
> top-five errors are portion problems, two are composition. **B5 was designed against the old lean
> and is not being run** — see the log's "B5 premise re-derived" entry.
>
> ### 🏁 CHECKPOINT SET — `stage2-b4-checkpoint` (tag → `22a1ac5`)
>
> **Santiago ruled on 2026-08-08 that B4 is the best version yet and the state to fall back to.** If a
> later evaluation regresses, restore from this tag; if the phase stops, publish from it. Full ruling,
> the absolute-error table behind it, and the rules for superseding it are in the log's **Rulings**
> section. `git show stage2-b4-checkpoint` prints the measured result.
>
> ⚠️ **That bar is RETIRED.** It read "0–1 failed field/draws, not the baseline's 6" and described the
> saturated 3-dish set. Since B14 the live bar is **24–27 of 96 with mean error 21.0–21.2%**. What has
> not changed is the rule: a new result replaces the checkpoint only if it beats that *range* over at
> least 4 runs × 3 draws — one better run is never enough.
>
> ### 💰 COST IS NOT A CONSTRAINT — ruling, Santiago 2026-08-08
>
> *"This is what this session and evaluations are for: to clear out all hypotheses we have on our core
> feature and on ensuring it works and on making it better. Cost is not an issue in these sessions, so
> don't limit yourself to not iterating and experimenting that much due to cost."*
>
> **Never narrow scope, skip an experiment, or recommend stopping on cost grounds.** State the dollar
> estimate and get his approval before any paid run — that rule stands — but price is never an argument
> against running one. A previous session recommended stopping at $0.374 partly on cost; he corrected
> it.
>
> ### ✅ B14 DONE 2026-08-09 — the set is 8 dishes and the metric works again
>
> Santiago approved five new dishes, their USDA recipes, a sub-3 g scoring floor and both paid arms.
> 8 runs × 3 draws × 8 dishes, **$0.96**. Full entry in the log under **baseline-w1…w4 / iter-b4-w1…w4**.
>
> | arm | failed field/draws | mean abs error |
> |---|---|---:|
> | baseline (pre-B1 prompt) | 39/96, all four runs | 37.7% |
> | **B4** (GPT-4o) | **24–27/96** | **21.0–21.2%** |
> | **B9** (GPT-5.5) | **14–19/96** | **15.5–17.2%** |
>
> **The saturation was real and total.** On the old three dishes both arms score **0 of 48 each**; every
> bit of discriminating signal came from the five new dishes. **B4 now beats the baseline ~2× on both
> metrics**, where on three dishes it could only tie.
>
> **The bar moved.** "0–1 failed of 144" described a saturated set and is **retired as a target**. The
> live bar is **24–27 of 96 with mean error 21.0–21.2%**, over 4 runs × 3 draws.
>
> **B4's mechanism generalised to dishes it was never designed against** — NEW YORK 44.8% → 4.8% error,
> French Fries 46.9% → 6.1%, and it tagged the chimichurri as outside the printed 400 g unprompted. The
> hand audit found **no invented or unprinted ingredient** on any of the five.
>
> **Two NEW open targets replace the PASTEL cheese wobble:**
> - **Coleslaw — B4 REGRESSED, 0/48 → 22/48**, the one dish the baseline wins. B4 portions the dressing
>   at 20 g against the oracle's 30 g, and dressing is a slaw's entire fat. First evidence that
>   portion-fitting can *hurt* a small side dish.
> - **Gnocchi — 44/48**, the worst remaining dish.
>
> ⚠️ **Several remaining failures are portion disagreements where BOTH parties are defensible** (gnocchi
> 150 g vs 110 g, tortilla 60 g vs 72 g, dressing 20 g vs 30 g). That is the Caesar-dressing situation,
> not proven model error. **The oracle is Santiago's alone** — flagged, not changed.
>
> ### 🎯 NEXT ACTIONS, in this order
>
> **1. ~~Widen the fixture set~~ — DONE, see above.** Historical note on why it mattered: three dishes is
> *why* the failure count saturated — baseline and B4 both scored 0 of 36, so the metric could no longer
> separate a naive pipeline from a good one. Santiago's direction was to take new dishes from data the
> extraction phase already produced.
>
> ```bash
> deno run --allow-read scripts/find-weighted-dishes.ts    # $0, no model calls
> ```
>
> lists **120 distinct printed-weight dishes** across the archived extraction dumps in
> `scripts/fixtures/caches/`. CESAR itself came from that corpus (menu `andaluz`). A printed weight
> matters because it is exactly what B4's mechanism keys off — `printed_total_g` plus
> `within_printed_weight`.
>
> Adding a dish is **not** automatic. Each needs a USDA-sourced oracle recipe with real `fdc_id`s, and
> **Santiago approves every recipe personally** — that ruling has not changed. `scripts/usda-oracle.ts`
> provides `searchFoods` / `fetchNutrients` against the free FDC API (key in `.env.local`), and
> `bench-macros_test.ts` now fails the build if any dish's stored totals stop matching its own
> ingredients.
>
> Two traps the current three fixtures already taught:
> - **Do not pick the richest USDA entry when several are defensible.** That is what made the Caesar
>   dressing wrong for six runs. Check the spread first; prefer the median of real products.
> - **Beware dishes whose defining ingredient is unprinted.** PASTEL AZTECA is a tortilla casserole
>   whose menu never says tortilla, so its oracle inflates everything else (cheese to 20.5% of plate
>   weight). Santiago ruled to leave it — but it is why PASTEL cannot serve as a portion target.
>
> ### ✅ B9 DONE 2026-08-09 — the ceiling is the TASK, not GPT-4o
>
> `gpt-5.5-2026-04-23` (newest **dated** snapshot on the account; the `gpt-5.6-*` entries are floating
> aliases and are ruled out by pinning discipline), 4 runs × 3 draws, ~$0.47.
>
> | arm | failed field/draws | mean abs error |
> |---|---|---:|
> | GPT-4o (B4) | 24–27/96 | 21.0–21.2% |
> | GPT-5.5 | **14–19/96** | **15.5–17.2%** |
>
> *(Figures below the table were written before the same-day PASTEL re-freeze and are corrected here.)*
>
> **A model a generation and a half newer moves the total essentially nothing.** No model upgrade was
> ever going to close this. ⚠️ **Confound: GPT-5.5 rejects `temperature: 0`** (only its default 1),
> so the arm cannot run at production parity; its wider spread is consistent with sampling, its best
> run is partly luck, and the ranges overlap. **Treat the two as level.**
>
> **The totals are level, the composition is not.** GPT-5.5 improves every dish GPT-4o struggled with
> (Gnocchi 44→27, ENFRIJOLADAS 28→14, Coleslaw 22→12) and **regresses two it had exact — Salmone
> 0→12/48 and PASTEL 0→13/48.**
>
> 🔑 **The single most valuable finding of the phase so far: ONE mechanism defect explains every open
> target.** `resolveGrams` fits servings to the printed weight **proportionally**, so the more complete
> a model's ingredient list, the more the principal component is diluted. GPT-5.5 listed 358 g of
> servings inside Salmone's printed 200 g against GPT-4o's 220 g, and its salmon scaled to 112 g
> against the oracle's 140 g. **Coleslaw is the same defect** — the fit under-weights dressing against
> cabbage. Fixing the fit is worth more than any model or wording change.
>
> ⚠️ **PASTEL's regression is mostly OUR ORACLE.** GPT-5.5 lists tortillas at 90 g; the menu never
> prints tortilla and the oracle excludes what is not printed, so the better-reasoning model is scored
> wrong for being right. The fixture's own documented artifact now penalises a model. **Revisiting that
> fixture is Santiago's call.**
>
> 🔴 **THAT RULING WAS REVERSED THE SAME DAY.** The 2026-08-09 PASTEL re-freeze (tortilla added)
> re-scored both arms at $0 and the ranges **stopped overlapping**: GPT-4o **24–27/96 at 21.0–21.2%**,
> GPT-5.5 **14–19/96 at 15.5–17.2%**. The "level, do not switch" reading was substantially our own
> fixture punishing the model that correctly named the tortilla. **Switching is a live question and
> Santiago's call.** `ENRICH_MODEL` is still `gpt-4o-2024-08-06`; nothing is deployed. App-wide
> write-up kept outside this phase: `docs/model-findings.md`.
>
> ✅ **The `resolveGrams` fix this block used to recommend is FALSIFIED ($0 ablation).** Protecting
> the principal component made failures WORSE on both arms (GPT-4o 103→105, GPT-5.5 66→69 of 384).
> Coleslaw's scale factor is **exactly 1.00** in all 12 GPT-4o draws, so the fit was never its cause.
> **The remaining open targets are portion/ORACLE disagreements, not mechanism defects.**
>
> ### 🎯 NEXT ACTIONS
>
> **Both items this block previously listed are resolved** — the `resolveGrams` fix was falsified at
> $0 (above), and the PASTEL fixture question was ruled on and applied. What is left is not code:
>
> 1. **Santiago's call: switch models, or not.** GPT-5.5 now measurably beats GPT-4o on the benchmark.
>    Not a measurement question any more.
> 2. **Santiago's call: the three portion/oracle disagreements** — Coleslaw dressing 20 g vs 30 g,
>    Gnocchi 150 g vs 110 g, ENFRIJOLADAS tortilla 60 g vs 72 g. Both readings are defensible in each,
>    and the PASTEL episode is the precedent for what happens when the oracle is wrong: it silently
>    flatters whichever model shares its flaw.
>
> **Open defects, none blocking:** PASTEL's cheese serving drops 50 g → 30 g in 2 of 12 draws (the only
> strict failure left); the PASTEL tortilla artifact above; and the oracle-strictness question, now
> partly answered — a $0 USDA check found the model **right** about Caesar dressing and Mexican cheese,
> and the oracle right about baked salmon, croutons and heavy cream.
>
> **Deployment remains unauthorised.** Being the publishable state is not permission to publish.
>
> 📊 **Prior to weigh, not a prohibition (Santiago, 2026-08-08).** The scoreboard on *kinds of change*
> so far: **prompt wording 0 for 2** (B11, B13 — ~$0.076, zero target numbers moved), **mechanism
> changes 2 for 2** (B10, B12 — both worked by taking arithmetic away from the model and leaving it
> knowledge). That is evidence about where to look first, not a closed door: these iterations exist
> to break and confirm hypotheses, so a wording idea with a *new* mechanism behind it and a stated
> falsifier is still a legitimate run. Bring the prior into the brainstorm; don't let it end one.
>
> Design B4 with `superpowers:brainstorming` and get Santiago's approval on the shape before
> spending anything.
>
> ⚠️ **Open question for Santiago before more money goes on fat (his call alone, no change proposed):**
> on all six fats the oracle picks the richer as-prepared FDC entry and the model picks a leaner real
> one — both defensible foods. If the oracle is meant to represent a *typical* restaurant plate rather
> than the richest available entry, some of what is scored as model error is an oracle choice. Raised
> in the iter-b13-001 notes, Finding 5.
>
> **Do NOT do any of these without a new ruling:** deploy anything — including B4, which has beaten
> baseline exactly once and is unreproduced; re-run a baseline (two exist); re-open the
> printed-weight scope question (ruled,
> applied blind); change the frozen oracle (Santiago's alone); or put any food, dish or cuisine name
> into the nutrition step of the prompt (measured harmful, and now unit-tested). **Deprioritise**
> B2/B5/B6 — no run data stands behind them, unlike B4 — but that is sequencing, not a ban.
> **B9 is DONE (2026-08-09) and no longer belongs on that list.**
>
> **Read in this order — these files are the whole phase:**
> 1. `stage2-macro-benchmark.md` — Backlog (B1–B11), Runs, Rulings. **This is the living
>    document.** Its Runs table is the only record of what was measured.
> 2. `plans/2026-08-07-stage2-macro-benchmark.md` — the paid-run procedure (archiving, hand
>    audit, what to report). Tasks 1–5 are COMPLETE; do not re-execute them.
> 3. `specs/2026-08-07-stage2-macro-enrichment-benchmark-design.md` — the approved design:
>    tolerance bands, the three items, what is explicitly NOT in scope, and how Stage 2 works.
> 4. `specs/2026-08-07-usda-macro-oracle-design.md` + `plans/2026-08-07-usda-macro-oracle.md` —
>    the **frozen** oracle reference. Complete; nothing to execute.
>
> Supporting evidence: `research/2026-08-07-macro-estimation-prior-art.md` (NutriBench, FDA
> tolerance basis, "Lost in the Middle" batching, LLM-confidence calibration). Read it before
> proposing any change to the enrichment prompt or schema.
>
> **Current gates:** the oracle is frozen — changing any FDC ID, edible grams, or raw/cooked
> basis needs Santiago's approval, same as when it was built. Every paid run stays separately
> gated on his explicit approval with a stated dollar estimate.
>
> ### ℹ️ The `1 failed` in the test suite is NOISE — do not spend time on it
>
> The full suite reports `330 passed | 1 failed`. **That one failure is `scripts/tile-cut_test.ts`
> and it does not matter.** Santiago's position (2026-08-08): not important, not blocking, not
> worth a session. Treat it as the known-good baseline number and move on.
>
> It is here only so you can tell it apart from a real regression:
>
> - **It cannot affect macros.** It tests the image tile cutter; Stage 2 is text-only and never
>   sees a photo.
> - **It guards code that cannot run.** The tile path is dead under the (c) pipeline — see the
>   trace under critical-path #2 below.
> - **It can only ever pass on Santiago's machine.** Line 54 hardcodes
>   `~/Downloads/MenusTesting/PolloteriaMenu.png`, outside the repo.
> - **The cause recorded in earlier handoffs was wrong**, corrected here so nobody re-investigates:
>   it is NOT a "Polloteria image dimension mismatch". The image is exactly the 2274×1572 the test
>   passes in. `gridCropRects` reads `tileFrac = width > height ? 0.65 : 0.6`; the H1.2b
>   landscape-overlap change (`f9b2029`) widened landscape tiles to 65%, and this test's hardcoded
>   `1364×943` (the 60% portrait numbers) was never updated. If anyone ever does fix it, it is two
>   numbers → `1478, 1022`.
>
> **The rule for a new session:** `330 passed | 1 failed` with only `tile-cut_test.ts` red is a
> CLEAN run. Any *other* failure is yours.


**OPEN ALONGSIDE, not a blocker: the real-restaurant field test.** Every scan to date has been a
photo of a screen or a gallery import — paper, real lighting, angles and glare are untested.
Unblocked 2026-08-05: TestFlight build 5 carries the fix for the crash that had blocked it
(ledger eval 141). Do it opportunistically; it does not gate #5.

**AFTER #5:** the model bake-off track (see "Release scope decision"). **NOT NOW:** everything
under POST-RELEASE in that same section.

**Non-extraction work** (app design, UI, product behaviour) is out of this roadmap's scope by
design — see the scope line below; it is governed by `AGENTS.md` and `DESIGN.md`.

---

> **What this is:** the roadmap you return to *between* conversations. It is NOT an individual feature plan. Each of the 5 features below gets its own `superpowers:writing-plans` plan, written and executed in its own conversation, using the kickoff template at the bottom.

> **📊 Live pipeline diagram (SOURCE OF TRUTH for the flow + prompts):** `docs/superpowers/diagrams/menu-extraction-pipeline.md` — a Mermaid **sequence diagram** of the current extraction/enrichment flow (Client → Edge Fn: Stage 1a Mistral OCR → Stage 1b GPT-4.1 structuring → postprocess → merge → textStructureCleanup → Stage 2 GPT-4o enrichment → client re-rank; H2 rotation active; dense-tile path dormant), with both full prompts (P1 `EXTRACT_PROMPT`, P2 `ENRICH_PROMPT`) verbatim and a 🟢/🟡/🔴/💤 status legend. A snapshot copy is at `~/Downloads/menu-extraction-pipeline.md`. **MANDATORY: whenever you close a feature OR change P1/P2 or the flow, update this diagram (status colors, notes, prompt text) and re-copy it to Downloads — see "Diagram discipline" below.**

## Context

For several sessions the extraction eval loop chased all scoring dimensions at once (item totals, sections, options, categories) across 6 menus, and no iteration passed everything on more than one menu. Offline re-scoring showed iterations **trading dimensions against each other** (iter-010/011 gained options but broke item extraction on nikkori/brasero-two). Iteration 001 was re-certified as the best-known baseline with a ±2-pass noise floor.

The fix is process, not prompt: split the core OCR feature into 5 sequenced sub-features, work each one in its own conversation with its own narrow plan, close it only when its scoped dimension passes on all menus across 3 consecutive live runs, then freeze it as a permanent regression gate before starting the next.

**Scope of the whole roadmap: extraction only.** Success = the extraction JSON is correctly filled. UI work (toggleable options, "Huevos → Revueltos" display) is out of scope and comes after all 5 features close. UI notes are recorded per feature as future intent only.

---

## Strategy Rules (read before every feature — then read "Lessons learned" below)

- **One feature per plan per conversation.** Never iterate on two dimensions at once. This is the rule the whole roadmap exists to enforce.

- **Exit gate (uniform): the feature's scoped dimension passes on ALL 6 menus in 3 of 3 consecutive live eval runs.** Menus: `brasero`, `brasero-two`, `casa-nostra`, `el-marcos`, `mochomos`, `nikkori`. This supersedes the ±2 noise-floor *acceptance* rule for **closing** a feature (±2 stays useful for judging progress mid-iteration).

- **Cumulative regression gates (passing consistency) — the core rule:** once a feature is closed, its scoped check joins a frozen regression suite. From then on, every later feature's exit gate is:

  > **active feature's dimension passes 3/3 on all menus AND every previously-completed feature's check also passes in those same 3 runs.**

  Feature N is **not done** if it broke features 1..N-1. A prompt/schema change that wins the active dimension but regresses a frozen one is **rejected outright** — this is exactly the dimension-trading failure (iter-010/011) the roadmap prevents. Because all dimensions are scored from the **same** API responses, re-checking frozen gates costs **zero** extra API calls.

  **Practical (do not skip):** the crop-aware runner `scripts/eval-027-live.ts` hardcodes its gate dimension list (`GATE_DIMS`, currently `["items"]`). When you start a feature, **widen that array to include every closed dimension plus your new one** (F2 → `["items","options"]`, F3 → add `section_context`, …). `scoreMenu` already scores all dimensions per response, so this is a one-line edit with zero extra API cost. Forget it and the run prints `GATE PASS` while silently never checking the frozen gates.

- **Ledger discipline:** every iteration inside a feature logs to `extraction-iteration-ledger.md` and `extraction-eval-log.md` in the worktree, as today.

- **Diagram discipline (do NOT skip on close):** the moment a feature closes — or any change lands to the prompts (P1 `EXTRACT_PROMPT` / P2 `ENRICH_PROMPT`), the schema, or the call flow — update `docs/superpowers/diagrams/menu-extraction-pipeline.md`: flip that stage's status flag (🔴/🟡→🟢), update the sequence-diagram notes and the Status table, edit the verbatim prompt appendix if the prompt changed, then re-copy the file to `~/Downloads/menu-extraction-pipeline.md`. The diagram is the fresh-context source of truth for "what does the pipeline look like right now"; a stale diagram misleads the next LLM.

---

## Lessons learned — GENERAL rules for future iterations (read before ANY prompt/eval work)

Distilled from Features 1–4 and the 2026-07-10 per-page-wiring close (ledger evals 045–048). These are not menu-specific; they are the mistakes an LLM will repeat unless told not to.

1. **Temp-0 + fixed seed is NOT determinism.** GPT-4o flips between document-global "transcription modes" (verbatim-caps vs normalized-title-case; weights kept vs silently dropped) under the SAME `system_fingerprint`. Never conclude a change works — or that it broke something — from 1–2 runs. Nor is a passed 3/3 gate a proof; it's a sample. That's why frozen gates re-check on every later run.
2. **Cheap probes before expensive gates.** A full 6-menu 3-run gate is ~$0.90 and ~11 min. A targeted `EVAL_MENUS=<menu>` run is ~$0.03–0.12. When iterating, probe the sensitive menu(s) ×6+ first; only run the full gate when probes are clean. Burning gates to discover what a probe would have shown is the main money/time waste.
3. **Prompt edits have NON-LOCAL side effects.** One added sentence about printed weights caused a never-before-seen failure on a *different* menu (a dish card returned as a section heading). Corollaries: (a) any P1 change requires probes on ALL sensitive menus plus the full frozen-dim gate; (b) instruct WHAT to preserve, never WHERE/HOW to lay it out — layout-literalism pressure ("exactly where it is printed") is what caused the heading split; (c) iterate ONE sentence at a time so causality stays attributable.
4. **Adjudicate from the menu photo, never from model output or fixture history.** The "Omelette de Camarón [Marlin]" option looked like a model false positive; reading the photo showed the menu prints "…de Camarón **y** Marlin" — one dish — so the model was wrong and the fix was linguistic ("y/and" joins ≠ "o/or" choices). Before ANY oracle change, look at the photo (the Read tool renders images).
5. **"UNCHECKED" is a scorer semantic, not a deletion.** Removing an expectation whose target the model *sometimes* extracts flips the failure to a false positive instead of fixing it. Model tolerance explicitly (e.g. `unchecked: true` on an `items_with_options` entry) with self-checks, and don't silently repurpose an existing fixture shape that already has a meaning (`options: []` = "require some option").
6. **Fix at the layer where the information still exists.** Text the model never emitted (a dropped "(70gr.)", a skipped option line) is NOT postprocess-recoverable — the prompt is the only lever. Conversely, when the info survives extraction, deterministic postprocess beats prompt work (F2/F4 precedent). Decide the layer first; don't iterate prompts for what a fold can do, or postprocess for what was never transcribed.
7. **Instrument before theorizing.** One `console.log` of `system_fingerprint` killed a wrong "backend drift window" theory in a single 8-run probe — without it, the plan was "wait for a better window" that did not exist. When behavior is nondeterministic, log the discriminating variable and measure the base rate BEFORE choosing a fix.
8. **Long runs: detach + monitor, and never filter the live log.** A 10-min tool timeout killed a gate mid-run (wasted ~$0.90); piping gate output through `tail`/`grep` destroyed run-1 diagnostics of another. Launch gates with `nohup … > log &` and watch the log file; keep the raw log intact.
9. **Failure dumps are overwritten per attempt** (`<menu>.eval027-r<N>.actual.json`). Check file mtimes before diagnosing from a dump — it may be from a different attempt than you think.
10. **A behavior-preserving refactor can still fail the gate.** The wiring refactor built byte-identical requests, yet gates failed for days-old model-side flakiness that eval 047 happened to miss. Before touching code on a gate failure, ask: does the failing path even run the changed code? Diff the request, not just the diff.

11. **A deterministic rule's predicate must be tested against what it EXCLUDES, not only what it catches.** C2-3 v1's predicate — "a section with ≥2 priced, description-less items" — read as reasonable in the spec and in fact describes the *majority of all menu sections*, because most menus list dishes as just name + price. It folded 9 REAL sections across 6 menus in one run (brasero `ACOMPAÑAMIENTOS` 7 dishes, guest-house `ENHANCEMENTS` 12, nikkori `POSTRES` — the 6 desserts eval 099c had fought to preserve) and took the suite from 32/45 to **20/45**; only 3 of 12 collapses were intended. **Before adopting any rule that deletes or merges items, enumerate EVERY place it fires across all fixtures and justify each one individually. That firing list is the deliverable — not the score.** A rule can raise the total while destroying real dishes.

12. **Validate a rule with the SAME matcher the code will use.** C2-3 v2 correctly keyed on "the heading carries its own price", but matched section→heading with `.includes()`. So section `VEGETARIANO` matched the *item* heading `HONGO VEGETARIANO $285`, borrowed that price, and folded 8 real mochomos dishes. The planner's own validation probe used `.includes()` too, and therefore reported "fires on exactly 2 headings, zero collateral" for a rule that was about to delete 8 dishes. **An approximate probe validates an approximate rule.** The fix was exact match: heading text, minus `#`s, minus its price, must EQUAL the section title.

13. **A rule that can delete data goes LAST in the plan and carries a predeclared abort condition.** C2-3 was sequenced last of the C2 rules with explicit aborts ("any menu drops a dim; any collapse on a currently-passing menu; any collapse you cannot justify"). Both failures above were caught by that abort plus the firing list — **not** by the planner's reasoning, which had already blessed both designs. Write the abort conditions into the task block before the executor starts, and make the executor report the firing list even when the score improves.

14. **Audit whole objects, never a hand-picked field projection.** A dump audit that printed `name | price | grams | section` but not `options` "proved" a silent data-loss defect (a dropped `DOBLE $950` variant) that did not exist — the variant was right there in `options`. It was escalated to the user as the worst finding of the step before being retracted (ledger eval 104c). **A projection that omits a field cannot distinguish "absent" from "not selected".** Same class caused two further false alarms in one session: a case-sensitive grep that "proved" printed text was missing, and a substring check that flagged a correctly-rejoined wrapped heading as an invention. All three made the model look worse than it was.

15. **The Bash tool's working directory RESETS between calls — always use `git -C <worktree>` and absolute paths.** A bare `cat >> docs/…` followed by `git commit` landed a ledger entry and a commit on the WRONG branch in the primary folder (`feat/selectable-options`) (`feat/selectable-options`), sweeping in 6 unrelated untracked docs; it was unpushed and reverted with `git reset --mixed HEAD~1`. Related: **never run `deno fmt` over a glob that can include oracle/fixture files** — `deno fmt scripts/fixtures/*.json` silently reformatted two truth files nobody had authorized touching. Fixture and ledger paths are the two places where a careless shell glob does real damage. **RECURRED 2026-08-01, by the author of lessons 24-27 on the same day: `git add docs` (a DIRECTORY) staged 7 previously-untracked plan/handoff files alongside the 1 file actually edited, and pushed them.** No damage — docs only, nothing overwritten, and Santiago chose to keep them — but it changed what his repo tracks without asking. **The rule is not "be careful with git add", it is: NAME THE FILES YOU EDITED. `git add path/to/a.md path/to/b.md`, never `git add docs` or `git add -A <dir>`.** A directory add cannot distinguish your work from whatever else happened to be sitting there, and `git status` at session start is not a memory you will still have 200 tool calls later.

16. **A predicted score gain is a HYPOTHESIS — name the failing assertions it will flip, and measure them, before writing "+N dims" into a ruling.** Ruling 33 was recorded as "worth 1 dim (polloteria `options`)". It was worth **zero**: the dim was failing on SIX false positives and the rule addressed two of them, so the score did not move at all. Nobody had ever listed what was actually blocking that dimension — the number was inferred from the one cause that had been diagnosed. **Before promising a gain, enumerate the specific assertions currently failing and show which ones the change flips. If you cannot enumerate them, say "unknown" instead of a number.** A confident wrong estimate sends the next session chasing the wrong work.

17. **Produce BOTH halves of a before/after yourself, in the same session — never trust a baseline quoted in a document or an earlier turn.** Mid-session a measurement of "4 false positives" was treated as the pre-change baseline; in fact an executor's change had landed on disk between the earlier check and that run, so it was the AFTER number. The true before was 6. The error was caught only by `git stash`-ing the implementation, re-measuring, and restoring. **The method: stash/revert the change → measure → restore → measure.** This is distinct from lesson 9 (stale dump files): there the artifact was old, here the WORKING TREE had moved under a number that was still on screen. Any "X → Y" claim needs both X and Y measured under conditions you controlled.

18. **A fixture pin has TWO oracles, not one — the extraction dumps AND the corrected draft.** Required (non-`unchecked`) option pins were built for polloteria that scored the extractor perfectly while missing 3 targets against `PolloteriaMenu.png.draft.json`, because the draft still encoded the pre-Shape-A shape. **Eval 107 shipped exactly this bug on guest-house and nobody noticed for two days** — its 3 Shape-A pins were promoted to required against the extractor alone. Ruling 1's fixture↔draft consistency warning stayed LIVE in the drafts long after ruling 32 closed it for the fixtures. **Run `deno test scripts/drafts_test.ts` after ANY fixture edit** — it now enforces both oracles automatically. Corollary: `unchecked` is often not laziness; it can be the only shape that satisfies both oracles until the draft is promoted.

19. **Make a pin STRICT only for STRUCTURE; keep it LOOSE for WORDING (Santiago, 2026-07-31).** "One card, two printed sizes, two prices" is a layout pattern that recurs on menus worldwide — safe to assert strictly (polloteria's Ensaladas/Crispy Chicken/Alitas). *"Elige entre papas fritas o ensalada verde"* is one menu's Spanish phrasing — the next menu says "served with your choice of", "au choix", or nothing. **A strict pin fitted to wording tunes the grader to a single menu and will fail the next ten.** Santiago's framing: "we want to code this feature not adapted to work on a specific one like Polloteria but break on 10 different others." Corollary worth keeping separate in your head: **the draft records what the menu SAYS; pin strictness is an independent dial.** Record the printed truth either way, then choose how hard to grade it. Same family as the eval-106 vocabulary-coupling finding and the still-unmet need for a HELD-OUT menu.

20. **A GATE MAY ONLY READ THE MOST UPSTREAM CACHED ARTIFACT — the raw model response. A gate that scores a DERIVED artifact is blind to the code that derived it.** `score-c-dumps.ts`, the $0 harness the whole C2 step was gated on, scored `*.dump.json` — which had already been through `postprocessItems` when the probe ran — and re-ran only `mistral-cleanup`. So eval 110's three `postprocess.ts` fixes scored a flat **35/45 while actually being worth +2 dims**, and the first gate run said "no change" for work that took brasero-two from 3/5 to ALL-5. It hid for four evals purely by luck: every C2 rule until then happened to live in `mistral-cleanup.ts`, which IS re-run. **The tell is a change you can prove is correct — by unit test and by hand-inspecting the dump — that moves the score by exactly zero.** Do not explain that away; check what the harness actually reads. **The fix is structural, not procedural:** rebuild from `*.raw.json` through the real chain (`postprocessItems` per page → `mergeItemSources`), delete the derived-artifact read entirely rather than leaving an opt-out flag, and prove the rebuild is a strict no-op at unchanged code before believing any new number. Guard it with a **sensitivity test** — inject a stub transform and assert it reaches the output — and verify the guard goes RED by deliberately reintroducing the bug; a guard never seen to fail is not a guard. Note this is the mirror image of lesson 9: there the archived artifact was from a different *run*, here it was from a different *version of the code*. Archive-analysis probes reading `.actual.json` are fine — the rule is about anything whose number is used as a gate.

21. **SUSPECT OUR OWN POSTPROCESS BEFORE THE MODEL. Diff `.nopost.dump.json` against `.dump.json` FIRST.** In one session, THREE separate "model defects" were our own code destroying a correct extraction: `promoteSections` exploded brasero-two's `TACO LOIRO` card — which the model had emitted in *exactly* the fixture's target shape — into two standalone dishes under a fake section; `foldVariantCards` silently DELETED el-marcos's printed `FRITOS` card because its key ignored `section_title`; and `echoesOwnItemName` dropped the printed choice `verdura` from `Machaca de Marlín c/huevo o verdura`. **All three had been recorded in the ledger as model or prompt problems**, one of them with a confident diagnosis ("children arrive lowercase, an `extractInlineChoices` compliance case") that was derived from the POST-processed dump and therefore blamed the model for our own damage. The raw model output is archived — read it. **The tell is a defect that looks like the model half-understanding something**: it got one of two choices, it split a card, it kept the item but lost the variant. Models rarely fail that tidily; deterministic code does.
22. **A DELETE/MERGE RULE'S REAL DELIVERABLE IS THE LIST OF THINGS IT REFUSES.** For el-marcos's multi-version cards, an unguarded shared-prefix rule fires **51 times across the 9 fixtures** and would merge real dishes on 7 of them (`Gnocchi alla sorrentina` + `Gnocchi toscano`, `PASTA AL PESTO` + `PASTA ALFREDO`, mochomos's whole `TACOS` family). Guarded it fires 6 times. **The guards were found by listing every candidate and asking of each "why is this NOT the pattern?"** — not by describing the pattern and hoping. Write the refusals into the test suite by name: they are what stops a future session from "simplifying" the guard, and two of the el-marcos refusals would otherwise have re-merged a card the previous eval had just restored. Corollary: prefer a discriminator drawn from LAYOUT (is this text printed on a line of its own? is it a `#` heading?) over one drawn from vocabulary — layout carries no language assumption, which is the eval-106 generalization limit.
23. **VALIDATE WITH THE SAME MATCHER THE CODE WILL USE — this is lesson 12, and it has now been violated FOUR MORE TIMES, every time by the planner's own probe.** In a single session: (a) a fold-key emulation joined name+section with a SPACE separator, but section titles contain spaces, so the strip corrupted names and manufactured a fake "guest-house 3/5 → 2/5 regression"; (b) a heading comparison skipped `normalizeSectionTitle`, so `# PolloKids` never matched "Pollo Kids" and `P O S T R E S` never matched "POSTRES" — reporting two REAL sections as fold candidates; (c) a grouping excluded the base card whose name IS the prefix, hiding two of the four true cases; (d) a suffix matcher demanded a following SPACE where the menu printed a period (`Regionales. Con pollo…`), silently dropping a true case. **Every one produced a confident, wrong number.** Practical rules: import the real helper instead of re-implementing it; when you must re-implement, copy it verbatim and say so in a comment; use a separator that cannot occur in the data (`\x01`, never a space); and compare on TOKENS, not raw string boundaries, when the surrounding code already tokenizes. **If a probe result surprises you, suspect the probe before the finding.**

24. **A PREDICTED *REGRESSION* IS A HYPOTHESIS TOO — and "I verified the guard goes RED" only counts for the break you actually tried.** The C3 spec stated that keeping the old per-page cleanup order "will move dims for a reason that has nothing to do with quality", and that a guard test asserting edge-output === harness-output would pin that order "forever". Both were false. Measured: per-page and post-merge cleanup are a **strict no-op on all 9 fixtures — both score 40/45** — because eight menus are single-page (where the two orders are identical by construction) and the one two-page menu has no fold reaching across its pages. The guard passed happily under the wrong order. **It was found only because the RED-verification was run twice, once per failure mode:** breaking the chain wholesale turned all three tests red (the break the guard was written for), while breaking only the ORDER left them all green and turned a different, synthetic unit test red. **Lesson 16 says a predicted GAIN is a hypothesis; this is the same rule pointed the other way — a predicted BREAKAGE is one too, and it is the more dangerous form, because a wrong "this would break things" is what future sessions cite when refusing to simplify.** Practical rules: (a) name the specific failure mode each guard covers, then break exactly that mode and watch it fail — a guard verified against a different break is unverified; (b) when a design choice turns out to be unobservable on the current data, say so in the code comment and keep the choice on stated reasoning, rather than leaving behind a confident claim the data does not support; (c) an unobservable-but-correct choice belongs in the same bucket as the held-out menu — argued, not measured.

25. **TUNING AGAINST ONE ARCHIVED RESPONSE PER MENU IS A DESIGN SET OF SIZE ONE — the rules end up fitted to a single DRAW, not to the model.** The whole C2 step optimised deterministic folds against exactly one cached response per fixture and reached 40/45. The first ×3 LIVE gate scored **33/31/33** and was unstable: five dims flipped across identical runs and guest-house read 48 dishes, then 36, then 48. The tempting explanations were an input-fidelity mismatch (the cached OCR came from a 2048/q95 re-encode while production sends the passthrough original) and OCR drift. **A $0.004 probe refuted both: all three markdowns were byte-identical in length with the same heading, and the fold fired under all three.** The bisect — same markdown, different items — put the variable in the ITEM LIST: `gpt-4.1` returns a different but equally valid structuring of the same text on each call, and folds keyed on the incidental shape of one response stop firing. **A pinned model removes vendor substitution, not sampling variance (ruling 30 said so; this is the measurement).** Practical consequences: (a) a score computed from one cached response per menu is a measurement of one draw, and must never be reported as the extractor's quality; (b) any deterministic rule layered on a generative model needs to be validated against SEVERAL draws of the same menu, not one — held-out DRAWS matter as much as the still-missing held-out MENU; (c) prefer rules keyed on things the model cannot vary (the printed text, the layout) over rules keyed on how the model happened to group things that time; (d) when a live gate disagrees with an offline one, bisect INPUT vs ITEMS before theorising — it cost $0.004 here and refuted two confident hypotheses, one of them recorded in the ledger an hour earlier.

26. **A PAID RUN THAT DOES NOT ARCHIVE ITS RAW RESPONSES IS UNREPEATABLE EVIDENCE — archive on EVERY menu and EVERY run, passing ones included.** The first ×3 live gate cost ~$0.30 and surfaced the only release-blocking defect the project has (guest-house silently returned 36 of 48 dishes on one run in three). It could not be diagnosed at all: `eval-027-live.ts` dropped `raw_response` inside its own extract helper, and the caller wrote scored items **only when a dimension failed**. So the run that proved the defect exists could not show what the model actually said, and answering "was it truncated, or did the model skip sections?" would have meant paying again. **Archive the raw before you spend, not after you regret it.** Corollaries: (a) archive PASSING runs too — when you later find instability, the passing draw is half the comparison and it is gone; (b) put a page/run index in every archive filename — a probe in this same session wrote both pages of a two-page menu to one path, page 1 silently overwrote page 0, and a later read analysed half the menu and reported a confident wrong number; (c) raw archives are kilobytes and live runs are dollars, so there is never a storage argument for discarding them. This is lessons 20/21 pointed at the WRITE side: those say a gate must READ the most upstream artifact, this says an expensive run must CREATE one.

27. **WHEN A LIVE NUMBER DISAGREES WITH AN OFFLINE NUMBER, SUSPECT THAT THEY ARE MEASURING DIFFERENT SAMPLES BEFORE YOU SUSPECT DIFFERENT CODE.** A ×3 live gate scored 33/31/33 against an offline 40/45 and the gap read as a 7-9 dimension live-only defect. Two confident mechanisms were proposed — an input-fidelity mismatch (cached OCR came from a 2048/q95 re-encode, production sends the passthrough original) and OCR model drift — and **both were refuted by a $0.004 probe**: all three markdowns were the same length with the same heading and the same fold behaviour. Re-scoring against three fresh draws instead of one archived draw put the offline number at 34/36/36 and **the gap shrank to ~2 dims**. There was no live defect; the two numbers were samples of different sizes from a varying distribution. **The diagnostic order that works, cheapest first: (1) is the offline baseline one sample or many? (2) hold the input constant and vary only the model output, then the reverse — the bisect that localises it; (3) only then look for a code difference.** Doing this backwards costs a day and produces two ledger entries that have to be retracted.

28. **TWO TOOLS THAT BOTH REPORT A NUMBER MUST SHARE ONE MEASUREMENT PATH — a second copy does not announce itself, it just prints a clean table of wrong numbers.** The macro benchmark had two: the live runner (`bench-macros.ts`) and the $0 re-scorer (`rescore-history.ts`). They had drifted apart in **four** ways at once, and a 2026-08-09 audit found all four only because ONE of them was noticed by accident. (a) **Tolerance bands were declared twice**, so a newly-approved band applied to new runs and not to the history they were being compared against — the comparison silently stops being like-for-like. (b) **The runner paired model items to oracle dishes BY POSITION, the re-scorer BY NAME**; the oracle had just grown from three dishes to eight, so one reordering would have landed every score on the wrong dish with nothing in the output to show it. (c) **The PASTEL beans tolerance existed in only one of them**, so the runner printed failures the published figure forgave. (d) **Era handling existed in only one of them**, and the archive spans three response shapes — the wrong reader returns ZERO for every macro and prints `-100%` across the board, which reads exactly like a catastrophic model regression. That last one had **already happened once** in this phase and produced a tidy, entirely false table. **The fix is deletion, not documentation:** one module (`scripts/macro-measure.ts`) owns era detection, dish pairing, alternative oracle readings and the bands, and every tool imports it. **Documentation alone does not work here** — a zero-context session cannot be expected to rediscover an incident it never saw — so `macro-measure_test.ts` fails the build if a second copy of any of the four reappears, and each guard was verified to actually fire by reintroducing the defect. Corollary, and the reason this is expensive: **bad measurement code is worse than bad feature code.** A broken feature is visible; a broken measurement silently redirects every future iteration, and you spend real money iterating against numbers that mean nothing.

---

## Prior art — DoorDash's menu-transcription pipeline (researched 2026-07-09, Feature 2)

DoorDash runs LLM menu-photo transcription in production at scale. Their published system was studied during Feature 2 and shaped our option semantics. **Read before proposing pipeline/architecture changes** — don't re-derive what they already learned.

**Sources (downloaded local copies — the originals are behind a 403 for fetch tools):**
- `/Users/santiagoaguirre/Downloads/Using LLM to transcribe restaurant menu photos  - DoorDash.pdf` (DoorDash Eng blog, 2025-03-19 — the primary source; note the filename contains a non-breaking space before " - DoorDash")
- `/Users/santiagoaguirre/Downloads/How DoorDash uses AI Models to Understand Restaurant Menus.pdf` (ByteByteGo's analysis of the same system)

**Their pipeline:** menu photo → TWO transcription models in parallel (Model 1: OCR→LLM summarization, stable but weak context; Model 2: multimodal vision LLM = our GPT-4o approach, better context but fragile on bad photos) → a **guardrail ML classifier** (LightGBM beat every neural alternative) scoring photo + OCR + LLM-output features to predict transcription accuracy → above threshold: auto-publish; below: route to **human transcription** (which also produces their labeled training data). Their #1 failure mode: **linking attributes to the correct parent item** — exactly what Features 3–4 harden. Their "extraction order" (Category | Name | Price | Calorie | Description) is the *column order of their output table*, not a pipeline sequence — extraction is single-pass, like our P1. Their schema: categories → items → attributes; modifiers/add-ons attach to the item, never become new items — the convention Feature 2 adopted (2026-07-09, user-locked).

**Adoption decisions (2026-07-09, user-aligned):**
1. ✅ Adopted: item-owns-options modifier model (Feature 2's fold convention); eval-gated iteration (we already had it — our fixture gate IS the guardrail at 6-menu scale); routing hard layouts to a different path (our dense-crop recipe ≈ their human-routing).
2. 📌 Post-F5 backlog — **use `image_quality` in the client**: P1 already returns `image_quality {usable, issues[]}`; the app should prompt a photo re-take when `usable=false` (or issues are severe) BEFORE paying for extraction — the cheapest version of their guardrail. Slot it with the Stage-2/UX work after the extraction features close.
3. 📌 Post-F5 backlog — consistency-as-confidence: run-to-run/model disagreement flags low-confidence items in the UI (their lesson: no single model wins; disagreement is signal). Do NOT dual-run models per scan yet (doubles cost).
4. 📌 The planned feedback feature (AGENTS.md: "wrong scan / wrong result" reports) doubles as the **label factory**: each user correction = (photo, corrected truth) pair — the data a real DoorDash-style guardrail classifier would need. No new build; just don't drop the feedback plans.
5. ❌ Rejected for now: separate OCR+LLM pipeline (their own data shows weaker context understanding; only worth it at uncontrolled-photo scale), trained guardrail classifier (needs thousands of labels we don't have), human-transcription workforce (n/a — our user IS the human in the loop).
6. Feature order stays F3 → F4 → F5 (user decision 2026-07-09): our sequence already mirrors their category→item→attribute hierarchy and attacks their hardest problem (linkage) next.

---

## Release scope decision (user, 2026-07-10) — READ BEFORE PICKING UP ANY WORK

Features 1–4 are CLOSED and the user chose **release momentum over roadmap completeness**. The core feature the release must deliver: *user photographs a menu (one or several pages) → every food item + its variants extracted → macros enriched precisely (printed grams + ingredients) → items sorted by the user's nutritional goals.*

**Pre-release critical path (work on THESE, in this order):**
1. **Production wiring of the per-page multi-photo recipe** ✅ DONE 2026-07-10 (3/3 gate, ledger eval 048) — shared `runPagedExtraction` in `extract.ts`: edge `stage:"extract"` + eval runner both call it (1 photo ⇒ 1 call; N photos ⇒ N parallel high-detail calls → `merge.ts` → ONE unified menu; enrichment once/scan); `extractWithRetry` now production; multi-page detail locked `high` (`auto` A/B deferred to the cost pass). Closing the gate required P1 v3 (keep printed weights verbatim; "y/and" joins are one dish — see diagram appendix) + Plato Surtido options ORACLE-CHANGE (`unchecked: true`). Spec/plan in the worktree (`docs/superpowers/specs/2026-07-10-per-page-multi-photo-wiring-design.md`).
2. **Dense-menu auto-cutter** ✅ DONE 2026-07-12 (3/3 gate eval 055 + same-day device verification) — two-phase stateless: phase-1 `stage:"extract"` returns `{needs_crops}` on dense signal (`image_layout.dense` OR terminal timeout/length after retry); client cuts 2×2 PNG tiles from ORIGINALS (`gridCropRects`+`prepareTile`) → `stage:"extract-pages"` → `runGroupedExtraction` (tile calls get `TILE_PROMPT_SUFFIX`, page calls get P1 v7 `PAGE_PROMPT_SUFFIX`; per-tile drink filter; sectionLenient merge; post-merge `dropHeaderEchoes`). Closing the gate took: `dropSiblingEchoOptions` postprocess, Chipo one-indel scorer tolerance (user ruling), v7 page-scoped completeness (global v6 REGRESSED — mode-scope prompt rules!). Detector 100% correct all campaign (5 normal menus never trigger — credit guard). Known limits ledgered: Churrasquería box recall ~25% (union-of-2, post-release), device tile fidelity below eval (ImagePicker re-encode suspect — client-fidelity follow-up). Spec/plan/ledger in the worktree.

   ⚠️ **THE TILE PATH IS DEAD CODE AS OF THE (c) MIGRATION — traced 2026-08-08, not previously
   recorded.** Everything described above still exists in the repo but **can no longer execute in
   production**. The chain, verifiable in four steps:

   | # | Fact | Where |
   |---|---|---|
   | 1 | The client only calls `stage:"extract-pages"` from inside `if (Array.isArray(data?.needs_crops))` | `src/lib/analyzeMenu.ts:265` |
   | 2 | Only `runPagedExtraction` (the deployed `stage:"extract"` handler) could emit that signal | `supabase/functions/analyze-menu/index.ts:256` |
   | 3 | It **hardcodes** `image_layout: { dense: false, crop_direction: "none" }` — the dense detector was not carried over to the Mistral path | `supabase/functions/analyze-menu/extract.ts:719` |
   | 4 | `needs_crops` therefore appears **only** as a union member in `PagedExtraction` and is never constructed anywhere | `extract.ts:629` |

   So `gridCropRects`, `cutTile`, `runGroupedExtraction`, `stage:"extract-pages"`,
   `stage:"extract-crops"`, `TILE_PROMPT_SUFFIX` and the whole tile-hygiene stack are unreachable
   from the app. Dense pages now go through Mistral OCR whole.

   **This was never decided — it happened by omission.** The (c) migration (eval 126) replaced
   vision extraction with `mistral-ocr-4-0` + `gpt-4.1` and simply did not port the dense
   detector. No ledger entry claims tiling was removed, and no measurement compared tiled vs
   whole-read under (c). **Do not read this as "Mistral proved tiling unnecessary" — that
   comparison has not been run.** What we do have, from the pre-(c) era: eval 091 measured
   whole-read *beating* tiling on guest-house (49 vs 34/48, tiling lost the entire Enhancements
   section), and the E1 bake-off carries "a strong OCR model reads dense pages whole" as an
   explicit *hypothesis*, still untested.

   **Open decision for Santiago (not macro work, not scheduled, LOW priority):** either (a) delete
   the tile stack and its tests as confirmed-dead, (b) keep it dormant and fix `tile-cut_test.ts`
   so the suite is green, or (c) treat "is dense-page recall still adequate without tiling?" as a
   real gap and measure it — polloteria is the dense fixture the tile path was built for, and
   nothing has re-checked it under (c). Option (c) is the only one that produces evidence.

   ⚠️ **Do not pick this up on your own initiative.** Santiago has ruled the failing
   `tile-cut_test.ts` unimportant, and the dead code is harmless where it sits. Of the three, only
   (c) asks a question worth answering, and it is a paid extraction run — his call, not a
   tidy-up job. Leave it alone unless he raises it.
3. **Client compression fidelity fix** ✅ DONE 2026-07-12 (ledger evals 056-058 + device 3/3; spec/plan `2026-07-12-client-compression-fidelity-*` in the worktree) — NO JPEG re-encode setting cleared the oracle row (4-arm ladder + q90/q95 probes: q0.85/q0.90 stably misread small price digits, q95 still lost el-marcos options + mochomos section_context 4/4). **Shipped: passthrough uploads** — originals ≤6.75MB file (≈9M b64 vs the 10M cap) upload untouched as correct-mime data URLs; 2048px/q0.95 fallback only for oversized. Intake compression removed (primary folder (`feat/selectable-options`)'s stale intake files were double-compressing and feeding tiles a 1024px copy — the T9 device delta's root cause); eval gate phase-1 input = the production mirror permanently. ImagePicker re-encode DISPROVEN (gallery PNGs byte-identical at quality:1). Norteños = tolerated header (oracle). New offline tool: `scripts/score-dump.ts`.
4. **Horizontal/landscape menu handling** ✅ **CLOSED 2026-08-04** (ledger evals 132–137; H2 rotation deployed as edge fn v22 and device-verified: a wide menu photographed sideways was detected, straightened client-side, resubmitted, and recovered 24/24 with 23 of 24 items byte-identical to its upright twin). **The `docs/superpowers/horizontal-menus/` folder is a CLOSED-phase archive — do not re-enter it for work, and do not treat its `DELEGATION-BRIEF.md` / `DELEGATION-PROMPT.txt` as an entry point; new sessions start at `docs/superpowers/START-HERE.md`.** Historical detail follows, kept because the ledger references it — *original scope note (user 2026-07-12):* detect menu orientation and extract accordingly. Expected user behavior: a physically landscape menu gets photographed in portrait, rotated 90° (menu's left edge at the top, right edge at the bottom — as if the menu in front of you were flipped 90°). Candidate approach: detect the rotation (EXIF, aspect ratio + a cheap model signal, or P1's layout assessment) and rotate the image upright client-side before phase-1; tiles then cut from the rotated image. Never tested — all 6 fixtures are portrait-upright; needs at least one landscape fixture (can reuse an existing menu photographed/rotated sideways) + detector false-positive assertions on the 6 upright menus (same discipline as the dense detector). ⚠️ **HISTORICAL — this pointer is retired.** It used to read "SINGLE SOURCE OF TRUTH = the containerized sub-roadmap on branch `feat/extraction-eval-harness`". That branch is an ancestor of `main` and that folder is now a closed archive in this repo; current status lives in the 🎯 CURRENT PHASE block at the top of this file. Stable scope facts only: LAUNCH SCOPE incl. rotation (container ruling 27); launch plan is H1 tiling → H2 rotation → H3 wiring → H4 combined gate; Phase-2 eval set (GH Shape-A + polloteria Ensaladas) lives in container ROADMAP MANDATORY RESTORE. ✅ **The 2026-07-22 "PRIORITY ZERO" (container ruling 29) — the GPT-4o→Mistral-OCR extraction migration — LANDED and is the deployed pipeline** (Stage 1a `mistral-ocr-4-0` transcription → Stage 1b `gpt-4.1-2025-04-14` structuring → Stage 2 GPT-4o enrichment; deployed eval 126, current edge fn v24). It is **not** an open priority; see AGENTS.md's "OCR / Extraction Model Decision" for the live pipeline.**
5. **Stage-2 enrichment accuracy benchmark** ← **⬅ ACTIVE (see 🎯 CURRENT PHASE at the top)** (user reorder 2026-07-12: runs BEFORE the model bake-off) — macro accuracy has never been gated (the enrichment model is decided: GPT-4o, same as extraction — Gemini 2.5 Flash discarded 2026-07-10); include printed-weight items so the "prefer printed weights" P2 rule is measured (grams now flow from F4's `items[].grams`). Note: if the later bake-off changes the extraction backend, spot-check the benchmark on the winner's output shape.

**Model bake-off track (user, 2026-07-11; resequenced 2026-07-12) — run AFTER the Stage-2 benchmark (#5). Order is now: #3 compression → #4 horizontal → #5 Stage-2 benchmark → bake-off:**
- **E1 — Chandra-OCR-2** (`datalab-to/chandra-ocr-2`: Qwen3.5-based, 5B, 90+ languages, hosted Datalab API, OpenRAIL-M free <$2M revenue). Pipeline: photo → Chandra transcription → GPT-4o **text-mode** structuring into `EXTRACT_SCHEMA` → same postprocess → `scoreMenu` on the SAME 6 Spanish fixtures. Also run nikkori WITHOUT tiling — hypothesis: a strong OCR model reads dense pages whole, which would make the auto-cutter's tile cost optional. Decide by oracle scores, never by public benchmarks (olmOCR is English-document-heavy).
- **E2 — Infinity-Parser2-Pro** (`infly/Infinity-Parser2-Pro`: Qwen3.5-based, 35B, EN/ZH only, Apache 2.0, NO hosted API → rent an H100 + vLLM):
  - Run on the Spanish fixtures too (user request 2026-07-11: "just to see real results") despite the model card's multilingual-degradation warning — score it, don't assume.
  - **Dense English menu protocol (user-adjudicated side-by-side):** ⚠️ REMINDER — first source a dense ENGLISH menu photo (none in fixtures; all 6 are Spanish). Then have BOTH GPT-4o and Infinity-Parser2-Pro read the SAME photo and emit TWO separate JSON files with menu items in the SAME (printed-menu) order; the user opens the photo alongside each JSON and counts reading errors per model. This is the routing decision input for English menus.
  - If a routed pipeline beats GPT-4o on our oracles → add a language-routing layer (English → winner; other languages → GPT-4o or Chandra, per E1).
- **DoorDash-inspired runtime guardrails** (analysis 2026-07-11, see Prior art section): (a) OCR text as auxiliary LLM input ("every OCR-detected item must appear in output"); (b) price-token-count completeness check (cheap OCR counts price tokens; extraction returning far fewer items → auto-retry); (c) agreement-based union-of-2 (already ledgered). Post-release unless the exit gate stalls again.
- **Layout-first candidates (added 2026-07-17 per the external research, ledger eval 070):** benchmark layout-first pipelines, not only pure-VLM swaps — Mistral OCR as coordinates/box provider + LLM grouping (supersedes the unconcluded 2026-06-23 extractor-swap evaluation), Gemini 3.x vision, PaddleOCR-VL/PP-StructureV3 (self-host). If the horizontal container's Eval 071 co-location gate proves the geometry signal, hypothesis D (layout parser → bounded tokens → LLM grouping) is the end-state candidate.
- **Fixture-diversity gaps (flagged 2026-07-12):** (a) landscape/horizontal menus — PROMOTED to critical-path #4 above (user 2026-07-12); (b) **camera-taken photos** (HEIC, EXIF rotation, real lighting) vs gallery imports — field smoke-test with the standalone Release build; (c) the dense ENGLISH menu E2 needs anyway.

**POST-RELEASE (deliberately deferred — do NOT work on these now, even if a file or plan mentions them):**

*OPTIONAL — reference only, neither urgent nor mandatory (user ruling 2026-07-12). These three exist as documented ideas to read when relevant; no one should schedule them:*
- **Union-of-2 recall guardrail** — run each page's extraction twice in parallel, merge the union (targets read-recall flakes like the Churrasquería box ~25%); doubles extraction cost; risk of phantom accumulation — must be oracle-validated before any wiring. (Also listed as DoorDash guardrail (c) in the bake-off track above.)
- **Name-verification pass** — a second cheap model pass re-checking extracted item NAMES against the photo to kill stable misreads/phantoms ("Chiplo", "Marc Antonio", "Pollo Roll"); name spelling is deliberately ungated today.
- **Option-price perfection beyond the F4 gate** — known tolerated misses (Revueltos 84/90 migration, Plato Surtido's 82, jamón@78 price-null flake) stay tolerated; macro-inverting variants are already handled by F2's fold convention.

*Remaining deferred scope:*
- **Wide-menu dense discrimination (cost optimization)** — container ruling 24 (2026-07-18) tiles ALL landscape pages (~$0.24 vs ~$0.05 on the rare simple wide menu; dense wide scans actually get ~$0.05 cheaper) because evals 086–088 proved cheap single-signal dense detection infeasible on wide photos: the prompt brackets without separating, items/MP fails on dense under-reads, and physical text size interleaves (bistro 10.9px sits between polloteria 9.2 and nikkori 12.2 after the 768 rescale). If revisited post-release: OCR-geometry caches exist for all 9 fixture menus (`~/Downloads/MenusTesting/*.mistral-ocr-2048q95.json`); OCR blocks-per-megapixel showed a 1.6× boundary gap on only N=2 dense samples — collect many more wide fixtures before trusting any threshold.
- **Sibling-aware existence twin rule (tile-path colocation)** — container ruling 25 (2026-07-19) tolerates the rare "Petrica" class for release: an unanchored final item whose name is within the existence tier's loose allowance (≤len/3 edits) of a printed line that a better-matching final sibling owns at the SAME price (observed 1/6 audited tile-path gate runs; scorer-invisible — only ruling-6 photo audits see it). The parked fix: drop such items as corrupted duplicates; validate first at $0 by replaying every archived dump (gate: the eval-089b-r1 Petrica drops, zero false drops on all clean runs).
- **Feature 5 — drinks** (deferred 2026-07-10; food-first value; the crop path's drink filter stays).
- **Combo suggestions** (drink+dish macro pairings) — idea only.
- **`image_quality` photo-retake prompt in the client** and **consistency-as-confidence flags** (the existing Post-F5 backlog items in the DoorDash section above).
- Everything in AGENTS.md's "Planned post-MVP" list (onboarding, paywall).

Rationale (user, 2026-07-10): options matter mainly where variants invert macros (already solved by F2's fold convention); coarse categories were always extracted; drinks don't serve the food-sorting core. Price extraction stays in results — it's free — but is not to be perfected further pre-release.

---

## Feature Sequence (MVP order)

Food first because the app's value is macro-sorted **food**; drinks come last.

### Feature 1 — Extract all Food menu items ✅ CLOSED 2026-07-06
- **Plan file:** `docs/superpowers/plans/2026-07-04-feature-1-extract-food-items.md` (see its Execution Log for the final results, distinct-dish convention, el-marcos re-adjudication, and Feature 2–5 gotchas).
- **Goal:** every food item on the menu appears exactly once in the JSON; count matches the fixture's food total.
- **Scoped dimension:** `items` count, food category only.
- **Harness work:** split each fixture's `total_items` into food/drink counts (currently combined — e.g. el-marcos 45 = food + drink). Add a category/dimension filter flag to `eval-extraction.ts` so a run scores only the active feature's dimension plus already-frozen gates.
- **Frozen gates when starting:** none (first feature).
- **Exit gate:** `items` (food) passes on all 6 menus, 3/3 runs.

### Feature 2 — Extract options of Food items ✅ CLOSED 2026-07-09
- **Plan file:** `docs/superpowers/plans/2026-07-09-feature-2-extract-food-options.md` (see its Execution Log for the fold convention, oracle rulings, the deterministic postprocess chain, and Feature 3–5 gotchas).
- **Goal:** food items with choices (e.g. "Caesar Salad" → Chicken / Fish) carry those choices in `options`.
- **Scoped dimension:** `options` pass + `optionRecall`, food items only.
- **Harness work:** reuse existing `items_with_options` fixtures; el-marcos option corrections already applied.
- **Frozen gates when starting:** Feature 1 (`items`/food — now a COMPLETENESS gate: distinct food dish-names within ±3, no true duplicates; section-header hygiene was moved to Feature 3). Fixtures are distinct-dish counts; el-marcos re-adjudicated to 28.
- **Run the gate via `scripts/eval-027-live.ts`, NOT the plain `eval-extraction.ts --gate`** — Nikkori passes `items` ONLY through the crop-merge path that script routes; a single full-page call spuriously fails it. See feature-1 plan Execution Log "Gotchas".
- **Feature 1 close-out context is in `2026-07-04-feature-1-extract-food-items.md` (Execution Log) + ledger iterations 025–029.** Read those before starting: the Chilaquiles/Revueltos variants and el-marcos are your primary option targets; brasero-two is count-fragile near +3.
- **UI intent (future):** options render as toggles in the already-merged selectable-options UI so the user sees macro deltas.
- **Exit gate:** `options` passes on all 6 menus, 3/3 runs, **AND** Feature 1 (`items` completeness) still green in those runs.

### Feature 3 — Extract sections & sub-sections ✅ CLOSED 2026-07-10
- **Plan file:** `docs/superpowers/plans/2026-07-10-feature-3-extract-sections.md` (see its Execution Log for the section-oracle rulings, food-scoping, the nondeterminism catalogue, and Feature 4–5 gotchas).
- **Goal:** section hierarchy is captured; trimmed item names get their parent section so "Revueltos" reads as "Huevos → Revueltos".
- **Scoped dimension:** `sections` list match + full-item-name rule.
- **Harness work:** reuse `sections` fixture arrays; el-marcos Huevos full-name expectations already in fixtures.
- **Frozen gates when starting:** Features 1, 2.
- **UI intent (future):** display "Huevos → Revueltos" so trimmed titles aren't confusing.
- **Exit gate:** `sections` passes on all 6 menus, 3/3 runs, **AND** Features 1–2 still green.

### Feature 4 — Extract each item's closest section + category ✅ CLOSED 2026-07-10
- **Plan file:** `docs/superpowers/plans/2026-07-10-feature-4-section-category-price-grams.md` (see its Execution Log for the user-verified price/grams oracle, the postprocess-filled `items[].grams` design, dropPriceNoteItems, and Feature 5 gotchas).
- **Goal:** each item is tagged with its nearest section ("Cocktails", "Steaks", "Desserts") and coarse category (Appetizer / Main / Drink).
- **Scoped dimension:** `section_context` + `categories`.
- **Harness work:** reuse `section_expectations` per fixture; may need more expectation entries per menu.
- **Grams capture (added 2026-07-09, user request):** printed weights/volumes are high-value for Stage-2 macro accuracy (P2 already prefers printed weights over guesses). Today grams exist ONLY on options (`options[].grams`); item-level weights ride as text inside `name`/`description` ("CHILAQUILES (70gr.)", "(350mL)"). At F4 kickoff decide: add an item-level `grams` field to the schema + a scoped check, or keep text-embedded and verify P2 parses it. Known limit to watch: digit misreads in small print (60gr→650gr, ledger iter-036).
- **Option/variant PRICE accuracy (added 2026-07-09, user request):** `options[].price` is already extracted but NOT gate-checked — Feature 2's gate verified option NAMES only, so a wrong option price passes silently (proven live: el-marcos Revueltos' "Con jamón, chorizo o tocino" option came back @84 instead of the printed @90 when the model dropped the middle line; the fold maps prices correctly whenever all lines are transcribed). F4 harness work: extend `items_with_options` targets with expected option prices and make the scorer verify price (and grams, above) per matched option — the user-facing price/macro deltas on option toggles depend on both.
- **Frozen gates when starting:** Features 1, 2, 3.
- **Exit gate:** `section_context` + `categories` pass on all 6 menus, 3/3 runs, **AND** Features 1–3 still green.

> **Stage-2 note:** grams flowing from Feature 4 feed enrichment directly — when benchmarking Stage 2, include printed-weight items (el-marcos gramajes, nikkori ml) in the comparison so the "prefer printed weights" P2 rule is actually measured.

### Feature 5 — Extract all Drink menu items ⏸ DEFERRED POST-RELEASE (user decision 2026-07-10 — see "Release scope decision" above)
- **Goal:** every drink item appears exactly once; count matches the fixture's drink total.
- **Scoped dimension:** `items` count, drink category.
- **Harness work:** uses the drink counts created in Feature 1's fixture split.
- **Frozen gates when starting:** Features 1, 2, 3, 4.
- **Exit gate:** `items` (drink) passes on all 6 menus, 3/3 runs, **AND** Features 1–4 still green.

---

## Reference Block — COPY THIS VERBATIM INTO EVERY INDIVIDUAL FEATURE PLAN

### Branches

```
┌────────────────────────────────┬─────────────┬─────────────────────────────────────────────────────────────────────────┐
│             Branch             │   Status    │                                 Purpose                                 │
├────────────────────────────────┼─────────────┼─────────────────────────────────────────────────────────────────────────┤
│ feat/extraction-eval-harness   │ Active WIP  │ ← eval-log.md is here — measuring extraction quality across iterations;  │
│                                │             │   includes offline re-scoring against corrected El Marcos options;       │
│                                │             │   tracking pass/fail rates and option detection improvements             │
├────────────────────────────────┼─────────────┼─────────────────────────────────────────────────────────────────────────┤
│ feat/options-extraction-eval   │ 7 commits   │ Earlier extraction eval setup — GPT-4o vision caller, prompt configs,    │
│                                │             │   scoring framework with TDD                                             │
├────────────────────────────────┼─────────────┼─────────────────────────────────────────────────────────────────────────┤
│ feat/multi-goal-zscore-sorting │ Merged      │ ✓ Goal ranking algorithm (soft-clamped z-scores) — already in main       │
├────────────────────────────────┼─────────────┼─────────────────────────────────────────────────────────────────────────┤
│ feat/selectable-options        │ Current     │ ✓ Menu option UI selection feature — already in main                     │
├────────────────────────────────┼─────────────┼─────────────────────────────────────────────────────────────────────────┤
│ feat/phase3-goal-selection     │ Merged      │ ✓ Goal filtering logic — already in main                                 │
└────────────────────────────────┴─────────────┴─────────────────────────────────────────────────────────────────────────┘
```

**Working directory:** eval work happens in the worktree `/private/tmp/menu-scan-app-extraction-eval-harness` on branch `feat/extraction-eval-harness`.

### Files (reference — NOT MANDATORY TO READ ALL)

> Relevant files NOT MANDATORY TO READ ALL. Reading all results in burned context and unable to start task. Keep these as reference and to read when necessary.

- All evaluation results → `/private/tmp/menu-scan-app-extraction-eval-harness/docs/superpowers/extraction-eval-log.md`
- `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app/CLAUDE.md`
- `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app/AGENTS.md`
- `/private/tmp/menu-scan-app-extraction-eval-harness/docs/superpowers/extraction-options-handoff.md`
- `/private/tmp/menu-scan-app-extraction-eval-harness/docs/superpowers/extraction-iteration-ledger.md`
- `/private/tmp/menu-scan-app-extraction-eval-harness/docs/superpowers/specs/2026-07-03-two-pass-options-design.md`
- `/private/tmp/menu-scan-app-extraction-eval-harness/docs/superpowers/plans/2026-07-03-two-pass-options-iteration-009.md`
- `/private/tmp/menu-scan-app-extraction-eval-harness/supabase/functions/analyze-menu/postprocess.ts`
- `/private/tmp/menu-scan-app-extraction-eval-harness/scripts/eval-extraction.ts`
- `/private/tmp/menu-scan-app-extraction-eval-harness/scripts/fixtures/*.expected.json`

### Edge Function (menu scanning)

```bash
curl -s -X POST "https://uonuiadueykynbetxxrw.supabase.co/functions/v1/analyze-menu" \
  -H "Authorization: Bearer <EXPO_PUBLIC_SUPABASE_ANON_KEY from .env>" \
  -H "Content-Type: application/json" \
  -d '{"photos":["<base64 img1>","<base64 img2>"],"goals":[],"provider":"gpt-vision","stage":"extract"}'
```

Anon key is in `.env` as `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Response includes `items`, `raw_response`, `latency_ms`, `model_id`. Local `supabase serve` runs also need `OPENAI_API_KEY` set in the environment (per prior sessions).

---

## Per-Feature Kickoff Prompt (paste into a NEW conversation)

```
Read CLAUDE.md and AGENTS.md and follow them strictly.
Read the master roadmap at docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md.

We are on Feature N: <name>.

Use superpowers:writing-plans to create the individual plan for THIS FEATURE ONLY.
Scope: extraction JSON only — no UI work.
Exit gate: the feature's scoped dimension passes on all 6 menus in 3/3 consecutive
live runs, AND every previously completed feature (<list closed features>) still
passes in those same runs. The feature is NOT done if any earlier feature regressed.
Copy the roadmap's Reference Block (branches, files, curl) verbatim into the plan.
On close: update the pipeline sequence diagram (docs/superpowers/diagrams/menu-extraction-pipeline.md)
— status flags, notes, and prompt appendix if P1/P2 changed — and re-copy it to ~/Downloads (Diagram discipline).
Last step: revoke any OpenAI API key pasted into chat or exposed during live evals.
```

## Progress Checklist

- [x] Feature 1 — Extract all Food menu items ✅ CLOSED 2026-07-06 (completeness gate; see feature-1 plan Execution Log)
- [x] Feature 2 — Extract options of Food items ✅ CLOSED 2026-07-09 (fold convention; 3/3 live gate eval 038; see `2026-07-09-feature-2-extract-food-options.md` Execution Log)
- [x] Feature 3 — Extract sections & sub-sections ✅ CLOSED 2026-07-10 (food-scoped section_context, 3/3 live gate eval 044; see `2026-07-10-feature-3-extract-sections.md` Execution Log)
- [x] Feature 4 — Extract closest section + category ✅ CLOSED 2026-07-10 (categories/grams/option-price gate, 3/3 eval 047; postprocess-filled `items[].grams`; see `2026-07-10-feature-4-section-category-price-grams.md` Execution Log)
- [ ] Feature 5 — Extract all Drink menu items ⏸ DEFERRED POST-RELEASE (user decision 2026-07-10; pre-release critical path = production wiring → dense auto-cutter → Stage-2 benchmark — see "Release scope decision")
