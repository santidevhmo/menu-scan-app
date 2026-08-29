# START HERE

Entry point for any new session on Menu Scan. This file holds the **vocabulary**
and the **routing** — what the words mean, and which document answers which
question.

It asserts **no status, no score, and no next action.** Those live in
Linear: <https://linear.app/menu-scan-app>. Every previous version of this
file tried to hold them too, and every one of them went stale while still being read as current.

**Repository root:** `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app`. App code, edge
function, scripts, fixtures and oracles all live here. Confirm your active branch before editing.

**Durable knowledge is in a separate repo** — `menu-scan-kb`. Type
`/menuscan-product` to load it. The eval ledger, the lessons, the oracle rulings
and the closed-phase numbers all moved there.

---

## 0. THE MAP — read this first if any of the words below are unfamiliar

**What the product does.** The user photographs a restaurant menu. The app reads the
items off the photo (**Stage 1**), then for each dish asks a model to list its ingredients,
and for each ingredient two things: **how many grams** are in one serving, and **what it is per
100 g** (protein/carb/fat). **Our code does all the arithmetic** — grams × per-100 g, summed.
The model never reports a total. That split is deliberate: the model is good at knowing what food
is, and bad at addition.

### The vocabulary, in plain terms

| word | what it means |
|---|---|
| **Stage 1 / Stage 2** | Stage 1 reads the menu photo into a list of items. **Stage 2 is the macro estimate.** All the work in this phase is Stage 2. |
| **oracle** | The **answer key**. A hand-built, USDA-sourced record of what each test dish really contains. It lives in `scripts/fixtures/unweighted-oracle.json` (+ a weighted one). **It never runs in the app** — it exists only to grade us. It stores **bands only** — `mass_band_g`, four macro `band`s and a prose `assumed` — with **no per-ingredient array**; the decomposition lives in the rulings docs. |

🪤 **FOUR FILES GET CONFUSED FOR EACH OTHER. THEY ARE NOT THE SAME THING** (eval 168):

| file | what it holds | dishes |
|---|---|---|
| `scripts/fixtures/caches/*.raw.json` | **the model's ANSWERS.** What GPT guessed. Free to re-grade. | **68** |
| `scripts/fixtures/unweighted-oracle.json` | **the RIGHT answers**, hand-ruled. The unweighted oracle. | **57** |
| `scripts/fixtures/macro-oracle.json` | the right answers for **printed-weight** dishes. The separate weighted oracle. | **8** |
| `scripts/fixtures/*.expected.json` | **STAGE 1 ONLY** — did we read the right item NAMES off the photo. **No macros at all.** | n/a |

**65 dishes in the whole project have hand-checked macros.** 68 dishes have the model's guesses, and
after round 2 all but a handful are ruled — the 8 unruled were **retired as unanswerable** (their menu
line is only a name), not left as a to-do.

⚠️ **`unweighted-oracle.json` is GENERATED — never hand-edit it.** Add a `Draft` to
`scripts/unweighted-oracle-build.ts` and re-run it; `deriveBands()` does the arithmetic. **Put the
derivation in the `assumed` STRING, not a code comment** — comments never reach the JSON, which is
what a future session re-derives from.

| word | what it means |
|---|---|
| **band** | The pass window for one number. Not a single value — a range. A macro **passes** if the app's answer lands inside the band. Currently **the average dish ±20%**, plus a small-miss allowance (6 g for a macro, 50 kcal). |
| **draw** | One repeat of the exact same question. The model is not deterministic, so every dish is asked **3 times** and all 3 are scored. |
| **harness** | The script that runs a benchmark and prints a score. `bench-unweighted.ts` (no-weight dishes), `bench-mixed-menu.ts` and `bench-macros.ts` (printed-weight dishes). |
| **arm** | **A variant of the pipeline being tested** — one changed thing (a prompt sentence, a schema field, a different batching) run through the harness so its score can be compared. Think "experimental condition". Arms are named: `baseline`, `dual`, `P`, `A`, `S3`… |
| **replay** | Re-scoring **saved** model answers instead of buying new ones. Costs **$0** and calls no API. This is why a corrected oracle re-grades all of history for free. |
| **ledger** | The logbook, one numbered entry per experiment, newest last. It lives in the `menu-scan-kb` repo at `docs/pipeline/ledger.md`. It is the memory of this project. |

---

## ⚖️ THE TWO SCORES — NEVER MERGE THEM

The benchmark is split because the product is split.

| | what it covers | how common | denominator |
|---|---|---|---|
| **weighted** | dishes whose menu **prints a gram weight** ("Ribeye 300gr") | ~33% of real items | **96 checks** |
| **unweighted** | dishes printing **no weight** at all | **~67% of real items** | **684 checks** (widened 108→252 eval 167, then 252→684 eval 169, 2026-08-22) |

**The unweighted half is the whole problem.** It is most of a real menu and it is
the weaker number.

**Where the score currently is:** re-derive it. Never read it out of a document, including this
one. The closed Phase-5 exit numbers and the eval that produced them are recorded once, in
`menu-scan-kb` at `docs/pipeline/closed-phases.md`.

---

## 1. What am I supposed to be working on?

**Linear is the answer:** <https://linear.app/menu-scan-app>. Open it before reading further.

There are **two roadmaps, nested** — the product one, and an extraction sub-roadmap inside it.
Read them in this order and the ambiguity disappears:

**① `docs/sunny-lemon-development-plan.md` — THE PRODUCT ROADMAP.** 16 phases, bootstrap →
launch. Its §0 convention: find the lowest-numbered unchecked sub-phase and **confirm with
Santiago before starting**. Its statuses were reconciled against the real codebase on 2026-08-06
— read its PROVENANCE header first, because the file predates this repo and its original commit
hashes belong to an archived project.

**② `docs/archive/plans/2026-07-04-ocr-extraction-master-roadmap.md`.** This is **extraction
quality only** — one workstream, sitting inside Phase 9 of ①. It is closed history, not a source
of active work.

Which one applies: **product/UI/feature work → ①. Extraction accuracy, prompts, evals, oracles,
the edge function → ②.** If a phase or priority is asserted anywhere other than Linear, it is stale
— fix it or ignore it, never believe it.

---

## Where everything lives

| Question | Answer |
|---|---|
| What is done, what is next | Linear — <https://linear.app/menu-scan-app> |
| The product roadmap, 16 phases | `docs/sunny-lemon-development-plan.md` |
| The engineering contract | `AGENTS.md` |
| The design system | `DESIGN.md` |
| Why a model / prompt / oracle decision was made | `/menuscan-pipeline` |
| What was already tried and failed | the ledger — `/menuscan-pipeline` |
| Competitors, prior art | `/menuscan-research` |
| Closed phases, old plans and specs | `docs/archive/` — reference only |
| Every handoff this file used to carry | `docs/archive/start-here-handoffs-2026.md` |

## Non-negotiables

- Read `AGENTS.md` before changing the app or pipeline.
- Never run a paid model call without Santiago's explicit approval.
- Never edit oracle files without Santiago's ruling from the menu photo.
