# START HERE

Entry point for any new session on Menu Scan. This file keeps only a compact handoff pointer;
the detailed, time-sensitive macro status lives in its executable plan and run ledger.

**Repository root:** `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app`. App code, edge
function, scripts, fixtures, oracles, docs and ledgers all live here. Macro-enrichment work is
currently on linked-worktree branch `worktree-stage2-macro-benchmark`; confirm the active branch
before editing. Older docs reference a `.worktrees/extraction-eval-harness` folder; **it no
longer exists** (merged into `main`, eval 138). Read any such path as "this repo".

---

## 1. What am I supposed to be working on?

There are **two roadmaps, nested** — the product one, and an extraction sub-roadmap inside it.
Read them in this order and the ambiguity disappears:

**① `docs/sunny-lemon-development-plan.md` — THE PRODUCT ROADMAP.** 16 phases, bootstrap →
launch. Its §0 convention: find the lowest-numbered unchecked sub-phase and **confirm with
Santiago before starting**. Its statuses were reconciled against the real codebase on 2026-08-06
— read its PROVENANCE header first, because the file predates this repo and its original commit
hashes belong to an archived project.

**② `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md` → the `🎯 CURRENT PHASE`
block.** This is **extraction quality only** — one workstream, sitting inside Phase 9 of ①. It is
the single source of truth for what is active *within extraction*, and the only place that is
written down.

Which one applies: **product/UI/feature work → ①. Extraction accuracy, prompts, evals, oracles,
the edge function → ②.** If a phase or priority is asserted anywhere other than these two blocks,
it is stale — fix it or ignore it, never believe it. The active Stage-2 macro handoff below is
the explicit exception: it is the bounded Phase-9 workstream record, not a competing roadmap.

**Stage-2 macro enrichment IS THE ACTIVE WORK. → Start at the `🆕 2026-08-20 HANDOFF` block
below; it is written so a zero-context session can take over from it alone.** Everything between here
and that block is older context that it supersedes where they disagree. Phase spend to date:
**~$35.7** (~$2.52 to 2026-08-09, ~$19 on 2026-08-12, ~$6 on 2026-08-13, ~$5.5 on 2026-08-16,
~$5.2 on 2026-08-19; **2026-08-20 cost $0**).

📄 **Prefer a page to a wall of markdown? `docs/superpowers/how-testing-works.html`** explains the
whole measurement setup in plain language, with a glossary of every term this phase uses.

🔴 **BEFORE YOU COMPARE ANY UNWEIGHTED NUMBER: the scoring rule and the dish count BOTH changed on
2026-08-20.** Bands are now the average dish ±20% (they used to inherit the mass range's width,
±6% to ±29%, unchosen), a miss under 6 g / 50 kcal also passes, and the set is **9 dishes, not 6**.
**A score from before that date is not comparable to one after it** — re-score both arms first.

🚀 **LIVE NOW: edge function `analyze-menu` v32, deployed 2026-08-19 (Santiago authorised).**
**v32 = v31 + the DUAL PASS + pass 2's SYSTEM envelope.** Unweighted dishes went **25 → 35–36/72**;
weighted dishes are unchanged (**14–17/96** vs a fresh **15/96** control) because pass 1's request body
is byte-identical (5491 bytes, verified). Stage 2 is **1.56–1.92× slower**, ~$0.03 → ~$0.05 per scan.
Full detail: the 2026-08-19 handoff block, now superseded by the 2026-08-20 one. **Rollback to v31:**
```bash
git checkout dbf3f79 -- supabase/functions/analyze-menu/ && \
  supabase functions deploy analyze-menu --project-ref uonuiadueykynbetxxrw
```
✅ **`main` now contains it** — PRs #18 → #17 → `main` merged 2026-08-19, and `main`'s
`supabase/functions/analyze-menu/` byte-matches what is deployed.

History — **v31, deployed 2026-08-16**, superseded by the above.
**v31 = v30 + the two ZEROING BUG FIXES, and nothing else.** Verified before shipping: the delta
against v30 is `enrich.ts` + its tests only — `ENRICH_PROMPT`, `ENRICH_SCHEMA_OPENAI`, the model pin
and `ENRICH_BATCH_SIZE = 10` are all byte-identical, so **macro accuracy is unchanged by design**
and no re-baseline is owed. 212 edge-function tests pass, 0 failed.
What it fixes: a dropped batch item and a 120 s timeout both used to reach `fallbackEnriched` and
show the user **0 kcal** (Polloteria lost 16 of 95 items). `enrichBatchWithRetry` now re-asks for
only the missing items in batches of 3, plus `MAX_CONCURRENT_BATCHES = 5`.
**Rollback = `git checkout abe5e12 -- supabase/functions/analyze-menu/ && supabase functions deploy
analyze-menu --project-ref uonuiadueykynbetxxrw`.**

History — **v30, deployed 2026-08-11**, superseded by the above. It is
`macro-best-v8` **plus the forced `serving_pieces` field** (this branch). Measured before shipping:
**0–3/96 at 12.0–12.5%** against v29's **2–3/96 at 14.3–14.5%**, 4 runs × 3 draws, two runs perfect.
Model pin unchanged. Smoke-tested live: printed weights read, stated counts honoured, allergens
present. **Rollback (HISTORICAL — v30 is two versions behind; the live rollback is the v32 one above):**
```bash
git checkout ce91e91 -- supabase/functions/analyze-menu/ && \
  supabase functions deploy analyze-menu --project-ref uonuiadueykynbetxxrw
```
⚠️ This used to read *"deploy from `origin/main`"*, which is not an executable instruction: **`supabase
functions deploy` uploads the WORKING DIRECTORY**, so the pinned code has to be checked out first.
Every rollback line in these docs takes the `git checkout <sha> -- <path> && deploy` form for that
reason.

⚠️ **The piece count only HALF works.** Sushi rolls get 8 (32 of 42), stated counts are honoured, and
every single-plate dish correctly gets 1 — but **all 26 Bistro pizzas got 1**, so the pizza case that
motivated the feature still fails. The MACRO gain is what justified the deploy; the stepper gain is
partial.

⚠️ **The app has NOT shipped the matching label.** `portions.ts` draws a count as a plain number
(`10`) on this branch, but that is app code: until TestFlight **build 7**, build 6 draws a counted
item as `3/8` / `all`. Working, not the intended form.

---

## 🆕 2026-08-20 HANDOFF — A ZERO-CONTEXT SESSION CAN TAKE OVER FROM THIS BLOCK ALONE

📄 **Read this first if you want the whole measurement setup in plain language:**
`docs/superpowers/how-testing-works.html` — what the app does, why there are two scores, how an oracle
dish is built, how a pass is decided, and a glossary of every term used in this phase. Written for
Santiago and for a cold session. Open it in a browser.

### ⛔ THE NEXT ACTION, IN ONE LINE

**ONE PAID RUN, ~$0.50–0.60, AWAITING SANTIAGO'S APPROVAL — do not run it without asking.**

```bash
deno run --allow-read --allow-write --allow-env --allow-net \
  --env-file=.env.local scripts/bench-unweighted.ts 3 dual
```

Three dishes joined the oracle on 2026-08-20 and sit on two menus the unweighted harness has never
enriched (`el-marcos`, `brasero-two`), so there are **no archived answers** and they cannot be scored
for free. This run produces the first full 9-dish score and the first reading ever for eggs, tacos and
dessert.
⚠️ **EXPECT THE SCORE TO DROP.** Three untested dish forms are joining at once; TACO PORCO needs the
model to add an unstated tortilla and BROWNIE is the set's only carb-dominant dish. **A number that
falls when harder dishes arrive is the benchmark working, not a regression.**

### 🔴 THE MOST IMPORTANT THING ON THIS PAGE: THE RULER CHANGED ON 2026-08-20

**Any unweighted score from before 2026-08-20 is NOT comparable to one after it.** Two scoring rules
and the dish count all changed the same day. Re-score both arms before quoting any gain.

| | before | now |
|---|---|---|
| how wide a band is | whatever the dish's MASS range happened to be — **±6% to ±29%, unchosen** | **the average dish ±20%, the same for every dish** |
| a small miss in grams | failed if outside the band | **passes: 6 g for a macro, 50 kcal** |
| dishes in the set | 6 | **9** |
| the denominator | a hardcoded 72 | **`dishes × 4 × draws`** — printed by the build script |

**Same-ruler, and it must be the SAME DISHES too — the two arms cover different ones.** On the five
dishes BOTH arms have archives for (CAPRICCIOSA, CARBONARA, ENSALADA GRIEGA, TIRAS DE POLLO, Salmón
Roll): shipped `dual` **41/60**, pre-dual `baseline` **32/60**, **gap 9**.
Whole-archive replays print **`dual` 52/72 over 6 of 9 dishes** and **`baseline` 32/60 over 5** — those
two are NOT comparable to each other, and the harness now says so in its own footer.
⚠️ **The pre-swap pair "44/72 vs 35/72" is retired.** It was measured with COLIFLOR ROKA in the set and
PAPAS FRITAS out, so it cannot be reproduced; do not quote it.

### ⚖️ WHY THE BAR MOVED, AND WHY IT IS NOT RIGGING

Bands used to be `mass range × one fixed composition`, so CAPRICCIOSA — pinned to 400–450 g — had to
hit its fat within **±6%**, a bar no kitchen meets twice, while CARBONARA's 250–450 g bought it
**±29%**. **The widest-band dish scored 12/12 and the narrowest 3/12**: the benchmark was partly
measuring how tightly each dish had been written down.

🔑 **The anti-rigging guard is the GAP, and it is what makes a loosened bar defensible.**
`scripts/sim-tolerance-sweep.ts` scores the shipped pipeline AND the pre-dual baseline at every
candidate bar. If the gap between them shrinks, the bar has stopped telling good from bad.
**±25% both discriminated better AND flattered the headline 36 → 48. Santiago took ±20% precisely
because it does not flatter it.**
⚠️ **The gap narrowed 11 → 9 when the gram allowance landed.** It survives the check, but a narrowing
gap is the early sign of a bar gone soft — **re-check it as dishes are added.**
⚠️ The sweep script is now **HISTORICAL**: `deriveBands` emits the new bands, so its "today's bands"
row reads the NEW ones and the original comparison cannot be reproduced. Do not quote its numbers.

### 🍟 THE SET IS 9 DISHES, AND WHY THESE NINE

Chosen by **which dish FORM had never been measured**, not by description quality. **10 more salads and
16 more sushi rolls were available and deliberately skipped** — they grow the number and teach nothing.
`scripts/find-unweighted-candidates.ts` does the shortlisting for $0.

| dish | menu | form | points |
|---|---|---|---|
| PAPAS FRITAS | andaluz | side (replaced COLIFLOR) | **11/12** ✅ free |
| CARBONARA | bistro | pasta | 10/12 |
| ENSALADA GRIEGA | bistro | salad | 10/12 |
| Salmón Roll | nikkori | sushi | 9/12 |
| CAPRICCIOSA | bistro | pizza | 6/12 |
| TIRAS DE POLLO | andaluz | fried chicken | 6/12 |
| **OMELETTE CUBANA** | el-marcos | **eggs — new** | ⛔ needs the run |
| **TACO PORCO** | brasero-two | **taco — new** | ⛔ needs the run |
| **BROWNIE** | brasero-two | **dessert — new** | ⛔ needs the run |

🔑 **PAPAS FRITAS came free at 11/12** — it was already a neighbour in andaluz's archived batches, so
the shipped pipeline had been answering it all along. It is now the best dish in the set. **The five
survivors are unchanged**, which is what proves the oracle edit moved nothing it should not have.

☠️ **COLIFLOR ROKA IS RETIRED — do not add it back.** Its menu line is only its name; the real dish
(the restaurant's own photos) is battered cauliflower on lettuce under a chipotle mayo, none of which
is knowable from the text the pipeline receives. Santiago: an item this thin *"shouldn't even be
considered"* — **unanswerable rather than badly answered**, so failing it measured the menu's silence.
Four arms were partly judged on it.
⚠️ **Its removal costs something: it guarded the BOTTOM of the set** — the dish that would catch an arm
scaling everything downward. **Nothing guards the bottom now.** Weigh that against any arm that shrinks
a plate.

### 🔑 TWO STANDING RULINGS ON BUILDING A RECIPE (Santiago, 2026-08-20)

Both were corrections to a draft of mine, and both are now in `AGENTS.md`.

1. **A TOPPING IS PRICED AS A TOPPING.** I read *"virutas de bacon"* and charged **15 g of rashers**
   (P 16 / F 31 against the ruled P 10 / F 27). *Virutas* means **shavings** → 5 g. This is the same
   error class as the 30 g dipping container, and it **inflates protein hardest**, because cured meat
   and hard cheese are the most protein-dense things on a menu.
2. **WHERE FNDDS HAS NO COMPOSITE RECORD, DECOMPOSE INTO INDIVIDUAL INGREDIENTS.** Both of my
   single-record drafts were wrong. FNDDS carries the omelette's cheese+meat+**vegetables** axis only
   for egg WHITE and egg SUBSTITUTE, never whole egg, so onion and pepper had no representation. And
   **every FNDDS pork-taco record carries CHEESE that this taco does not have — worth HALF its fat**
   (276 kcal / 16 g → 218 / 8). That is the variant error that has bitten this oracle six times; caught
   before it shipped this time.

### ☠️ FALSIFIED AT $0 — DO NOT RE-OPEN ANY OF THESE

All three looked obviously correct beforehand. **Every one was killed for nothing**, by replaying
archived answers with the fix applied. That is the cheapest thing this phase does; use it first.

| idea | measured | script |
|---|---|---|
| correct the SIDE-DISH weights to Santiago's own ruled grams | 46 → **66 failed** | `sim-accompaniment-ceiling.ts` |
| lift lean dishes to normal calorie density via FAT | 46 → **80 failed** | `sim-decomposition-ceiling.ts` |
| give every dish a PERFECT MASS | 36 → **35 points** | `sim-mass-ceiling.ts` |

🔑 **The two transferable lessons.** (a) **The oversized side is LOAD-BEARING** — 6 of 8 weighted dishes
are already too LOW, so shrinking a side only removes calories a dish needed. On Salmone toscano the
ruled 15 g baguette fixes carbs (173% → 19% off) and **breaks calories** (4% → 26%), because the bread
was propping up a salmon that is 32% short on fat. (b) **A missing INGREDIENT cannot be fixed by
scaling a MACRO** — COLIFLOR ROKA is *capeado*, and batter is flour AND oil, so pouring in fat
overshoots fat and never touches carbs. **That is also why Arm PF ("add cooking fat", 37/72) could
never have won**, and Arm A ("ask for the plate total", 12/72) stays rejected — now re-derived at
today's oracle rather than quoted from an old note.

### 🪤 TWO SCORER TRAPS, AND THE RULE THAT CATCHES THEM

Both are lesson 28 in miniature and both happened this session.

- A hand-rolled scorer read **33 where the harness reads 36.** The harness scores each item's
  **ARCHIVED totals**, not a recomputation from its ingredients, and the two diverge on ENSALADA
  GRIEGA.
- Forcing every dish to its band **midpoint** is not a mass correction: it **breaks CARBONARA**, which
  already sits in-band at 281 g scoring a perfect 12/12.

🔑 **THE RULE: every simulator must reproduce the published score in its control row, or none of its
other rows is believed.** All four sims now do. This is why corrections keep surfacing as noise —
silent agreement would be the dangerous outcome.

### 🧭 PARKED AS SCOPE CREEP — the enrichability gate (Santiago's call, 2026-08-20)

The spec is written and committed at `docs/superpowers/specs/2026-08-19-enrichability-gate-design.md`
and **it is NOT the next action.** Santiago named it scope creep: it makes no macro more accurate. Its
measured content is still true and worth keeping for when it is picked up:

- **~40% of real menu items give the model no usable ingredient evidence** — 25% bare titles plus ~15%
  descriptions naming no ingredients, counted **once per unique item** across 343 items on 10 menus.
- The model's `confidence` field is a **poor gate**: as an AND with the description rule it sends **1%**
  of items to Weak; on its own it wrongly demotes **41%** of good items.
- Santiago's chosen shape: **Ranked / Weak / Excluded** tabs, and the *user-supplied description*
  feature (let the user add detail so the model can retry) deferred to **after release**.
- ⚠️ Its §5.1 open decision still stands: putting the field in `ENRICH_SCHEMA_OPENAI` **breaks pass 1's
  byte-identical request** and the weighted guarantee resting on it. Stage 1b is the recommended home.

### 🚧 STILL OPEN, AND HONESTLY STATED

- **Burgers and soups cannot be added to the benchmark.** Neither has a single described, no-weight
  instance across all ten archived menus. Filling those forms needs a new menu photo.
- **The unweighted path is the product's unfinished half** — measured, **67% of real menu items print no
  weight**, and 4 of 10 menus print none at all. Every cheap lever on it is now dead; the next move is
  genuinely expensive.
- **Santiago's fallback, kept open deliberately:** if this stalls for weeks, **ship the weighted half
  honestly** — printed-weight dishes are at ~84% and genuinely good — and say plainly in the UI that
  no-weight items are rough.
- **The accompaniment defect is closed as unfixable-by-weight, not solved.** See the $0 table above.

### ✅ WHAT IS TRUE ABOUT PRODUCTION (verify, never trust this line)

**Production is edge fn `analyze-menu` v32 and NOTHING in this session changed it.** No prompt, no
schema, no model pin, no deploy. Verify against the server with
`mcp__supabase__list_edge_functions`, never against a doc. `main` byte-matches it. TestFlight build 7
is submitted.

---
## ⚠️ SUPERSEDED WHERE IT DISAGREES — the 2026-08-19 handoff

### ⛔ THE NEXT ACTION, IN ONE LINE

**Go after the ACCOMPANIMENT defect** — sides and sauces are sized from a nutrition-LABEL serving
rather than what is served: **24% of weighted items, 12–20% of those dishes' calories.** It is the
largest known weighted defect and the only substantial one left. ⚠️ **A weight fix ALONE makes sauces
WORSE**: chimichurri is 2× too heavy AND ~3× too lean, and the errors currently cancel. Prose (Arm S)
and a duplicate schema field (S4) have both failed at it.

✅ **Everything else in this phase is CLOSED**: v32 deployed and verified against the server, PRs #17
and #18 merged, `main` byte-matching production, TestFlight build 7 submitted. **Nothing is unmerged,
undeployed, unbuilt, or owed a run.** Before starting the accompaniment work, invoke
`superpowers:brainstorming` — it is a new solution design, and Santiago's standing rule requires it.

### ✅ WHAT WAS BUILT AND MEASURED (2026-08-19, evals 151–152, ~$5.2)

🚀 **DEPLOYED 2026-08-19, Santiago authorised: edge fn `analyze-menu` v32.** Verified against the
server (`mcp__supabase__list_edge_functions`), not against this file. **v32 = v31 + the dual pass +
pass 2's system envelope, and nothing else** — `ENRICH_PROMPT`, `ENRICH_SCHEMA_OPENAI`, the model pin
and `ENRICH_BATCH_SIZE = 10` are all untouched, and pass 1's request body is byte-identical (5491
bytes, verified).

**ROLLBACK TO v31, one command:**
```bash
git checkout dbf3f79 -- supabase/functions/analyze-menu/ && \
  supabase functions deploy analyze-menu --project-ref uonuiadueykynbetxxrw
```

### 🔀 MERGE STATE — read before touching the PRs

✅ **BOTH PRs ARE MERGED (2026-08-19).** #18 → `feat/forced-serving-pieces`, then #17 → `main`, 87
commits. **`main`'s `supabase/functions/analyze-menu/` now byte-matches what is deployed** — verified
with `git diff origin/main HEAD -- supabase/functions/analyze-menu/`, which is empty.

⚠️ **HISTORICAL, and worth knowing because it lasted weeks:** `main` was behind production from v30
until this merge. v30/v31 both ran unmerged branch code, ~533 lines adrift, so **anyone deploying from
`main` would have silently rolled back two versions of macro work.** Closed now; re-check with that
same `git diff` before trusting it again.
🔑 **DEPLOYING AND MERGING ARE INDEPENDENT.** Deploying uploads the working directory to Supabase;
merging moves code into `main`. Neither triggers the other, and merging ships nothing to users.
### 📱 THE APP BINARY — build 7

**TestFlight build 6 is commit `ccd3b04` (2026-08-09) and predates the ENTIRE portion control.** The
12 app commits since it include the editor, the per-piece line, the input sanitisers, the
"18 means 18 rolls" unit fix, the nativewind `textAlign` crash fix, and the zero-portion parser fix.

✅ **BUILD 7 IS BUILT, VERIFIED AND SUBMITTED (2026-08-19)** — id
`cf7b5088-9280-4bac-a2e8-a97744e217fd`, commit `9745c39`, version 1.0.0 / build 7 (EAS
`autoIncrement` + `appVersionSource: "remote"` — the number is NOT in `app.json`). Santiago ran
`eas submit --platform ios --latest`; App Store Connect accepted the upload.
**TestFlight:** https://appstoreconnect.apple.com/apps/6798478137/testflight/ios

🔑 **THE TWO HALVES SHIP ON DIFFERENT CLOCKS, and confusing them wastes a session.** The macro
improvement is **server-side (edge fn v32) and already reaches EVERY user, including build 6** — no
app update needed. **Build 7 adds only the portion-editor UI.** So "did the dual pass work?" is
answerable from any build; "does the portion control work?" needs build 7.

🔬 **VERIFIED BY UNPACKING THE `.ipa`, not by trusting the build status** — the same three-row check
that diagnosed the build-3 crash, run against `Payload/menuscanapp.app/main.jsbundle`:

| string | build 3 (crashed) | build 7 |
|---|---|---|
| project ref `uonuiadueykynbetxxrw` | 0 | **1** ✅ |
| anon key prefix `eyJhbGciOi` | 0 | **1** ✅ |
| `"Missing Supabase env vars"` | 1 | **0** ✅ |

The feature is in the binary too: `"Close portion editor"`, `"comes in"`, `"Whole order"` all present.
⚠️ **Use `grep -a`** — `main.jsbundle` is Hermes BYTECODE, so plain `grep` reports "binary file
matches" and a bare `-c` returns 0 for strings that ARE there. Multi-part template literals are split
across the string pool, so search for a SINGLE literal, never a concatenated sentence.

🔍 **"Why is Hermes involved at all?" — a fair question, and the answer is: nobody opted in.** Hermes
is the **default React Native JS engine** since RN 0.70 / Expo SDK 48, so an Expo SDK 56 build uses it
unless `app.json` sets `"jsEngine": "jsc"`. It does not. Nothing in `src/` references Hermes; it is
what the iOS build compiles the JS *into*. **Verified, not assumed** — the bundle's first 8 bytes are
`c6 1f bc 03 c1 03 19 1f` (the Hermes bytecode magic `0x1F1903C103BC1FC6`), it contains
`HermesInternalBytecode.js`, and `hermes-compiler` is in `pnpm-lock.yaml`. Check the header with
`xxd -l 8` before believing any claim about this file's format, including this one.

✅ **The env-var trap that broke build 3 is CLOSED.** `eas env:list --environment production` carries
both `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` against project ref
`uonuiadueykynbetxxrw`. Build 3 shipped with them undefined; the minifier constant-folded the guard so
the ONLY surviving string was `"Missing Supabase env vars"`. **Verify a shipped bundle carries the
project ref before trusting a build** — see `plans/2026-08-05-testflight-photo-crash-handoff.md`.
ℹ️ Its traps 1–3 (iCloud `xattr`, Metro's compiled-in port, device reachability) are **LOCAL-build
only** and do not apply to an EAS cloud build.

| measure | today | dual pass + system envelope |
|---|---|---|
| **weighted** | **15/96** (fresh same-day control) | **14, 15, 17 /96** — no detectable cost |
| **unweighted** | **25/72** (35%) | **35, 36 /72** (49–50%) — two runs |
| **latency** | 1× | **1.56–1.92×** — below the 2.4× that declined GPT-5.5 |
| **cost per scan** | ~$0.03 | ~$0.05 |

✅ **Pass 1's request body is BYTE-IDENTICAL — 5491 bytes before and after** the envelope parameter
existed. The weighted guarantee is verified, not merely argued.
⚠️ **Pass 2 now sends a request shape PRODUCTION HAS NEVER SENT** (the `system` envelope) — the shape
every arm in this phase was measured through, and covered by tests, but a harness is not a deployment.
⚠️ **The accompaniment defect is untouched** (24% of weighted items, 12–20% of their calories).

⚠️ **The "16–18/96" baseline on record could NOT be fully re-derived.** Only one focused `mixed`
archive survives and it replays to 18/96 — the "16" was lost to the overwrite hazard `--run` fixes.
**Quote the 15/96 fresh control.**

### 🔴 THE ENVELOPE FINDING — the most important thing on this page

**The plan claimed the unweighted gain transferred BY CONSTRUCTION. It does not.**

| | how the request is actually built |
|---|---|
| `callOpenAI` — **every ARM this phase** | **two** messages: prompt as **`system`**, items as `user`, `{"items":[…]}` |
| `enrichBatch` — **production, and pass 2** | **one** `user` message with the items appended |

Same prompt (md5-verified), same batching, envelope the only difference: **38/72 → 31/72**, and
**CAPRICCIOSA — the 28 cm pizza that motivated the entire plate-weight thread — goes 6 → 0.**

✅ **FIXED AND CONFIRMED (eval 152): pass 2 now sends the `system` envelope, and it recovered most of
the gap — 31 → 35, 36/72 over two runs.** The ladder, all same-oracle: user+shipped **25** →
user+sentence **31** → **system+sentence 35–36** → `callOpenAI`+sentence 38 (one run). **The envelope
alone is worth 4–5 points of 72.** `enrichBatch` takes a defaulted `envelope` option and **pass 2 is
its only caller** — pass 1's bytes are unchanged and verified.

🔑 **This retro-taints every arm scored through `callOpenAI` against a `callGptEnrich` baseline** —
Arm P (37), P-inline (29), SplitOnly (21). Some rejections may have been rejections of an ENVELOPE
rather than an idea. **A prior for the next brainstorm, NOT a to-do list** — re-running rejected arms
is expensive and none of them are shipping candidates.

⚠️ **The +6 is NOT "the sentence alone"**: `baseline` selects mixed batches, `dual` unweighted-only,
so it bundles sentence WITH batching. Correct as a shipping number, unsound as a mechanism claim.
⚠️ **One run per cell** — 31 vs 38 is one run each. Direction is corroborated (pass 2 moved unweighted
calories by a median 0.99× across 45 neighbours); the SIZE of the gap is not.

**The next experiment:** `enrichBatch` gains a defaulted envelope option, pass 2 sends the `system`
shape, pass 1 keeps today's **exactly** — touching the shared path destroys the byte-identical
guarantee the whole weighted result rests on. ~$1. Lands ~38 → ship the full gain; ~31 → falsified.

### The 60-second version

The app estimates macros for menu items. It breaks each dish into ingredients, asks the model what
each ingredient IS (composition per 100 g), and **the code does all the arithmetic**. It is good at
dishes that print a weight and bad at dishes that do not, and the second group is most of a real menu.

| score | dishes | points | current | harness |
|---|---|---|---|---|
| weighted, sent ALONE together | 8 | 96 | 6–9 failed | `scripts/bench-macros.ts` |
| **weighted, INSIDE ITS REAL MENU** | 8 | 96 | **16–18 failed (2 runs)** | `scripts/bench-mixed-menu.ts` |
| **unweighted (no grams)** | 6 | 24 | **25–28/72 (2 runs)**; best arm **38/72** | `scripts/bench-unweighted.ts` |

**Never merge these numbers.**

🔴 **THE MOST IMPORTANT THING TO GET RIGHT, AND THE EASIEST TO GET WRONG: THERE IS NO "93% WEIGHTED
PIPELINE".** That figure is `bench-macros.ts` sending the 8 fixtures **alone, together** — a grouping
production never builds. In real menus weighted scores **16–18/96 ≈ 82%**.

| what a weighted dish travels with | score |
|---|---|
| the other 7 fixtures (the old benchmark) | 6–9/96 ≈ **93%** ← *not a real situation* |
| a mixed group of 10 real items — **production today** | **16–18/96 ≈ 82%** |
| a group of 10 other WEIGHTED dishes (Arm P-10) | 21–25/96 ≈ 76% |

**Splitting the menu does not recover 93% — it moves away from it.** Santiago asked this directly on
2026-08-18; it is the single likeliest thing for a new session to get wrong.

⚠️ **The weighted figure has moved TWICE and BOTH times because the ORACLE got stricter, never because
the pipeline got worse: 0–3/96 → 4–6/96 (accompaniment weights) → 6–9/96 (PASTEL's bean composition).**
Santiago approved carrying each.

🚀 ~~**PRODUCTION: edge fn `analyze-menu` v31 (2026-08-16).** Everything since is unshipped and
COMMITTED on `feat/forced-serving-pieces`, not pushed (PR #17 open, Santiago ruled it the LAST thing
to work on).~~ ⚠️ **STALE — all three clauses. Production is v32 (2026-08-19), PRs #17 and #18 are
MERGED, and `main` byte-matches the deployed function.** `ENRICH_BATCH_SIZE = 10` is still true.

### 📋 WHAT THE PLAN BUILDS, AND WHY IT IS THE ONLY SHAPE LEFT

| pass | sends | answers used for |
|---|---|---|
| **1** | the whole menu — **today's call, byte-identical** | weighted items |
| **2** | unweighted items only, with the Arm P sentence | unweighted items |

**Both of its numbers already exist**: weighted **16–18/96 by construction** (pass 1 is unchanged),
unweighted **38/72** (measured as Arm P-10's pass 2). The cost is **money and latency, not accuracy** —
~$0.03 → ~$0.05 per scan, Stage 2 ~1.5–2× slower.

🔑 **WHY UNWEIGHTED ITEMS ARE SENT TWICE** — the question a new session will ask. Not to retry them.
**Their PRESENCE in pass 1 is what holds the weighted items' batches at today's composition.** Remove
them and the weighted score moves: that is exactly Arm P-10, measured at 21–25/96 over three runs.

⚠️ **Latency can still sink this.** GPT-5.5 was declined for production on a 2.4× Stage-2 latency
alone. The plan's Task 5 measures the ratio and treats it as a decision input.

### ☠️ ALREADY TRIED AND REJECTED — DO NOT RE-RUN ANY OF THESE

Every row was paid for. A session that "discovers" one of these is repeating spend.

| arm | what it was | weighted (real menus) | unweighted | verdict |
|---|---|---|---|---|
| **P** | split each batch of 10, sentence on the unweighted half | 27/96 | 37/72 | ❌ costs weighted |
| **P-10** | partition FIRST, then chunk each side at 10 | **21–25/96** (3 runs) | **38/72** | ❌ real trade, Santiago declined this shape |
| **P-inline** | the sentence as a per-item condition, NO split | 15/96 | **29/72** | ❌ no gain |
| **SplitOnly** | the split with the prompt UNCHANGED | — | **21/72** | ❌ worse than baseline |
| **S, S2, S3, S4** | the sauce-decomposition thread | 5–13/96 | 26/72 | ❌ all rejected |
| **A, A-conditional, C, thresholds** | plate-weight family | — | 12–31/72 | ☠️ retired |

🔑 **THE 2×2 THAT EXPLAINS ALL OF IT — Arm P is an INTERACTION, not a lever:**

| | shipped prompt | + Arm P's sentence |
|---|---|---|
| **mixed batch** | 25–28 baseline | **29** (P-inline) |
| **split batch** | **21** (SplitOnly — *worse than nothing*) | **37–38** (P / P-10) |

**Neither half works alone.** The sentence opens *"The items in this request print no weight"* — true
of the WHOLE request only when the batch is homogeneous. **The model honours an unconditional fact
about the request far better than a per-item condition inside it.** The split is not valuable in
itself; it is what makes the instruction statable as a fact.

⚠️ **A claim that "batch composition is the lever, not the words" was MY hypothesis and the $0.50
control FALSIFIED it.** Third arm in this phase to die between a plausible story and a measurement
(after A-conditional and S3). **A hypothesis that explains every prior result is not thereby true.**

### 📊 THE SCOREBOARD THAT PREDICTS ARMS — read before designing one

**Prompt wording is 0 for 6. Schema force is 6 for 8.** Full detail and riders in `AGENTS.md`.

| approach | record | cases |
|---|---|---|
| a sentence in `ENRICH_PROMPT` | **0 for 6** | B11, B13, B23, two `serving_pieces` wordings, Arm S, P-inline |
| a required field in the schema | **6 for 8** | B4, B15, forced `serving_pieces`, B24b, S2, S3 |

Riders: ask for a **number**, not a string; **free text invites merging**; **field ORDER is
load-bearing**; a field that **overlaps** an existing one returns a copy; and **a per-item condition in
prose is applied indiscriminately**.

### 💸 RUNS ARE ~$0.40–0.50 PER ARM NOW, NOT ~$2

The bill is almost entirely **OUTPUT** tokens (~1,265 tokens of prompt+schema per call), so **the lever
is how many items you ENRICH, never how you word the prompt.** `callGptEnrich` fires each batch as its
**own request**, so a scored dish is influenced only by the ≤9 items sharing its call — both harnesses
therefore send only the batches their fixtures land in. **Do not add `--full-menu` to "be thorough":
4.5× the cost, no change to the score.** Santiago reloads in $10 increments and asked for this
explicitly (2026-08-18). ⚠️ **Cut arithmetic that changes nothing; NEVER cut a menu, a dish, a draw or
a real neighbour.**

### 🧾 EVERY RUN IS LOGGED AND RE-SCORABLE FOR $0 — KEEP IT THAT WAY

- **`docs/superpowers/extraction-iteration-ledger.md`** — one entry per eval, newest last, with scores
  and cost. **Currently at eval 150.** Add one before your session ends.
- **`docs/superpowers/stage2-macro-benchmark.md`** — the full evidence for each run.
- **Raw responses are COMMITTED** (`scripts/fixtures/caches/`, 204 files), so any oracle correction
  re-scores history for **$0**: `--replay` on either harness, and `scripts/rescore-history.ts` for the
  weighted archive (it DISCOVERS its runs — do not reintroduce a hand-maintained list).
- **Use `--run <label>`** on a repeat run or it overwrites its predecessor and the range is lost.

### 🚧 STILL OPEN, AND NOT ADDRESSED BY THE PLAN

### 🎯 THE ACCOMPANIMENT DEFECT — the next piece of work, briefed for a cold start

**In one line: when a dish comes with a sauce or a side, the app sizes it like a NUTRITION LABEL
rather than like a PLATE.**

**The mechanism, exactly.** An ingredient the model marks `within_printed_weight: false` is the one
class `resolveGrams` **never rescales**, so whatever number arrives reaches the user untouched. B21
asks for the *standard reference amount* — for a spooned sauce that is USDA's **30 g dipping
container**, not the ~15 g actually served.

| | |
|---|---|
| weighted items carrying at least one accompaniment | **32 of 133 = 24%** |
| the accompaniment's share of those dishes' calories | **12–20%** |
| ingredients the model gave **exactly 30 g** | **21 of 48** (and 46 of 48 were multiples of 5) |

🔴 **THE TRAP — THE OBVIOUS FIX MAKES THE APP WORSE, AND THIS IS THE MOST IMPORTANT LINE HERE.**
Chimichurri's two errors currently **cancel**: it is **2× too heavy** and **3.8× too lean**.

| | kcal |
|---|---|
| what the app reports today | **48** |
| target | **~79** |
| **after "just halve the grams"** | **24** — twice as wrong, in the same direction |

**Any fix must move WEIGHT and COMPOSITION together, or it must not move either.**

☠️ **FOUR ARMS HAVE ALREADY DIED ON THIS. Do not re-run them.**

| arm | what it was | outcome |
|---|---|---|
| **S** | a sentence in the prompt | **ignored** inside a dish; the sauce never moved |
| **S2** | a required STRING field | always answered, but invited **MERGING** of ingredients |
| **S3** | a required ARRAY of `{name, share_pct}` | 🔑 **the PROBE worked** — chimichurri fat 15 → 50 — **and the BENCHMARK rejected it**: 5–13/96 weighted vs a 4–6 baseline, and **26/72 unweighted vs 28** |
| **S4** | S3 + a duplicate `amount_as_served_g` | 7–10/96, rejected |

🔑 **THE LESSON S3 BOUGHT, AND IT IS THE ONE TO CARRY INTO THE BRAINSTORM: a probe measures the
MECHANISM, the benchmark measures the DISH.** S3 provably made the model answer correctly about
chimichurri and still made the app worse overall. **A convincing probe is not a shippable arm.**

📊 **The prior to weigh:** prompt wording is **0 for 6**; a required schema field is **6 for 8** — but
S3 and S4 are two of that scoreboard's failures, so schema force is not a guarantee *here*.

**Where the evidence is:** search `stage2-macro-benchmark.md` for `ARM S3`, `ARMS S3 AND S4 ARE
REJECTED`, and `SAUCE DECOMPOSITION PROBE`.

---

## ⚠️ EVERYTHING BELOW THIS LINE IS THE SUPERSEDED 2026-08-16 HANDOFF

It is kept because parts of it are still the only record of an oracle ruling or a falsified
direction. **Where it disagrees with the 2026-08-19 block above, the block above wins.** Three things
in here are now STALE and are corrected at their own headings: its prompt-wording scoreboard says
"0 for 5" (it is **0 for 6**), its "Suggested next steps" predates the P-10 result, and **every
unweighted arm figure it quotes was measured through `callOpenAI`'s envelope, not production's** —
see THE ENVELOPE FINDING above before trusting any of them.
**Do not take a next action from below this line.**

### The one insight that matters most — SIZE WAS THE SYMPTOM, ASSEMBLY IS THE DISEASE

Unweighted dishes come out far too small — a 28 cm pizza at ~520 kcal. The obvious fix is to estimate
the plate weight. **That was tried four ways and it does not work.** Proven at $0 by
`scripts/sim-plate-rescale.ts`: set the pizza to **450 g, the TOP of its verified band, and it still
returns 812 kcal against its band**, because its decomposition is 1.81 kcal/g where real pizza is
~2.4–2.75. **Rescaling preserves proportions, so no total can fix wrong proportions.**

☠️ **RETIRED — do not open another plate-weight arm:** Arm A (12/72), A-conditional (28/72), Arm C
(never scored), every threshold variant (simulated, best 31/72).

### What actually worked: ARM P — still the best, still unshipped

One sentence appended **for unweighted items only**: give `typical_serving_g` as *the amount of that
ingredient actually present in one order as it is served*, not the standalone reference serving.
Weighted items keep a byte-identical request, so B21 is not falsified. `armP` in
`scripts/probe-plate-arms.ts`.

| dish | baseline | **Arm P** | Arm PF | Arm PD | S3 |
|---|---|---|---|---|---|
| CARBONARA | 9/12 | **12/12** | 12/12 | 11/12 | 6/12 |
| ENSALADA GRIEGA | 10/12 | **12/12** | 8/12 | 10/12 | 5/12 |
| Salmón Roll | 6/12 | 5/12 | 4/12 | 0/12 | 8/12 |
| CAPRICCIOSA | 0/12 | 2/12 | 3/12 | 3/12 | 0/12 |
| COLIFLOR ROKA | 0/12 | 3/12 | 3/12 | 3/12 | 0/12 |
| TIRAS DE POLLO | 3/12 | 3/12 | **7/12** | 3/12 | 7/12 |
| **TOTAL** | **28/72** | **37/72** | **37/72** | 30/72 | **26/72** |

**P and PF are TIED.** P's old one-point lead lived inside an oracle error that was corrected on
2026-08-16. They fail differently — P wins the salad, PF wins the chicken strips — so there is a real
choice there, not a winner.

### ✅ THAT BLOCKER IS CLEARED — ARM P WAS JUDGED AND REJECTED (2026-08-18)

This section used to read "Arm P is not safely shippable, for a reason the benchmark cannot see —
building that harness is the highest-value next step in the phase." **The harness was built, it ran,
and the fear was correct: Arm P costs weighted dishes 16/96 → 27/96.** See the block at the top.
**Nothing here is waiting on Santiago any more; the next step is the P-10 arm.**

### ❌ FALSIFIED 2026-08-16 — do not re-run these

The whole "fix the sauces" thread. It is closed, and each step closed a direction:

| arm | what it was | result |
|---|---|---|
| **S** | a SENTENCE asking to decompose prepared mixtures | **ignored inside a dish.** NEW YORK returned `chimichurri 30 g / fat 15` under both arms, identical |
| **S2** | a required STRING `composed_of` | always answered, but helped only where the model volunteered shares. **Invited MERGING** — `shrimp + breading + oil` collapsed into `breaded shrimp 150 g` |
| **S3** | a required ARRAY `parts` of {name, share_pct} | chimichurri fat **15 → 50** in a probe, controls held. **But 5–13/96 weighted and 26/72 unweighted — below baseline on both** |
| **S4** | S3 + required `amount_as_served_g` | **7–10/96, and it never actually ran**: the model returned the new field IDENTICAL to `typical_serving_g` in **364 of 364** ingredients, including all 36 accompaniments |

🔑 **TWO LESSONS THAT SHOULD SHAPE THE NEXT ARM:**

1. **A required field whose meaning OVERLAPS an existing field returns a COPY.** Schema force compels
   an ANSWER, not a DIFFERENT answer. Before adding a field, ask what question it answers that no
   existing field can.
2. **A probe measures the mechanism; the benchmark measures the dish.** S3's probe result was REAL
   (chimichurri 15 → 50) and still lost, because the composition fix helps where a mixture dominates
   and hurts where it does not — CESAR went 11% → 25% of fields failed while Salmone improved
   49% → 34% error. **This is the SECOND arm to die between probe and benchmark** (A-conditional was
   the first). Budget the benchmark before believing a probe.

### 📊 ⚠️ STALE SCOREBOARD — superseded, wording is now 0 for 6 (P-inline, 2026-08-18)

**Prompt wording is ~~0 for 5~~ 0 for 6. Schema force is 6 for 8.** Full detail and the riders are in `AGENTS.md`.

| approach | record | cases |
|---|---|---|
| a sentence in `ENRICH_PROMPT` | **0 for 6** | B11, B13, B23, two `serving_pieces` wordings, Arm S, **P-inline** |
| a required field in the schema | **6 for 8** | B4, B15, forced `serving_pieces`, B24b, S2, S3 |

Riders: ask for a **number**, not a string; a **free-text** field invites merging; **field ORDER is
load-bearing** (strict mode emits in schema order, so a field must precede what it constrains); and a
field that **overlaps** an existing one returns a copy.

### 🚧 THE DEFECT THAT IS STILL REAL AND STILL UNFIXED

**Accompaniments are sized from a nutrition-LABEL serving instead of what is served.** An ingredient
marked `within_printed_weight: false` is the ONE class `resolveGrams` never rescales, so its number
reaches the plate untouched — and B21 asks for the standard reference amount, which for a spooned
sauce is USDA's **30 g dipping container** rather than the ~15 g actually served.

| | |
|---|---|
| weighted items carrying at least one accompaniment | **32 of 133 = 24%** |
| the accompaniment's share of those dishes' calories | **12–20%** |
| ingredients the model gave exactly 30 g | **21 of 48**, and 46 of 48 were multiples of 5 |

**Two mechanisms have now failed to move it: prose (Arm S) and a duplicate field (Arm S4).**

⚠️ **A weight fix ALONE makes sauces WORSE, and this is why the rulings and an arm must land
together.** Chimichurri's two errors currently cancel: it is 2× too heavy and ~3× too lean. Halving
the grams without fixing the composition takes it from 48 kcal to 24 against a ~70 kcal target.

### ⚖️ SETTLED 2026-08-16 — do not reopen these

- ✅ **The printed-weight SCOPE question** (months open). Simulated at $0 by
  `scripts/sim-scope-rule.ts`: today's rule — the model decides per ingredient — scores **7/288**,
  while "the printed weight covers the whole plate" scores **31/288**, 4.4× worse. **Option A is
  falsified.** Independent support: El Marcos prints *"el gramaje se refiere a los ingredientes
  principales"*. ⚠️ The test is partly circular (the oracle encodes the convention), which is why the
  menu text matters. **"Main ingredients" is already plural in practice** — 94% of weighted dishes
  put 2+ ingredients inside, and all 7 that put exactly one are steaks or a chicken breast.
- ✅ **`within_printed_weight` is NOT unstable.** It differs across draws of the same prompt in
  **2 of 420 = 0.5%**. An earlier claim in this file that it "flips at random" was asserted from three
  anecdotes with no denominator and is **retracted**.
- ✅ **The "real-restaurant field test" is CLOSED as a FALSE PREMISE** (Santiago, 2026-08-16). These
  docs claimed for weeks that "every scan is a photo of a screen"; the fixture menus are **real phone
  photos of real paper menus**. Do not reintroduce it or gate anything behind it.
- ✅ **The pizza's oracle band** was re-sourced from the FROZEN USDA record to the RESTAURANT one
  (FDC 2708660 → 2708663), verified against the API. It did NOT rescue the pizza.

### ⚠️ THE ORACLE HAS BEEN WRONG SIX TIMES, ALWAYS THE SAME WAY

Every one is the right FOOD and the wrong **variant**. FNDDS encodes venue, crust, preparation and
topping class as SEPARATE records, and the wrong axis moves a band 30–46%.

| entry | wrong record | wrong axis | outcome |
|---|---|---|---|
| CARBONARA | pasta with cream sauce | **no meat** (menu says *tocino*) | fixed → FAILING→PASSING |
| ENSALADA GRIEGA | salad dressing NFS | **creamy** not *vinagreta* | fixed → FAILING→PASSING |
| CAPRICCIOSA | 14" cheese-only | topping class | fixed |
| CAPRICCIOSA | chain regular crust | crust | fixed |
| CAPRICCIOSA | thin crust FROM FROZEN | **venue** | fixed 2026-08-16 |
| PASTEL AZTECA | canned pinto, no added fat | **venue** — a restaurant serves *refried* | 🔴 **OPEN, needs a ruling** |

🔑 **Two of the four "pipeline defects" in the first unweighted run were the ORACLE's fault.
Re-source before believing any single-dish failure**, and search FDC for every variant
(`scripts/unweighted-portions.ts --search <terms>`) before choosing one.

✅ **THAT LAST OPEN RULING IS CLOSED (2026-08-17).** PASTEL AZTECA's beans moved to **FDC 2707397
`Refried beans, from fast food / restaurant`** (177 kcal/100 g, fat 9.48) from `Pinto beans, from
canned, no added fat` (137, 0.93). Santiago's ruling; the 30 g weight he set on 2026-08-16 is
unchanged. It cost 3 points on the weighted set, all of them that dish (2/36 → 9/36).
⚠️ Recorded tension worth knowing before the next sourcing decision: 2707397 IS the richest of the
FNDDS refried family (90 / 99 / 89 / 119 / 177), which the standing "prefer the median, never the
richest" rule would reject. It is taken because it is the **only entry at this dish's venue** — the
newer, more specific rule wins over the older one. **Not propagated to ENFRIJOLADAS**, whose *salsa de
frijol* is a sauce the dish is bathed in, a genuinely thinner food than a scoop beside a plate.

### 📌 Santiago's accompaniment rulings, APPLIED 2026-08-16

| accompaniment | was | ruled | basis |
|---|---|---|---|
| chimichurri | 30 g | **15 g** | USDA spooned-on-food amounts (1 tbsp 16–17 g). The 30 g the model returns is USDA's **dipping-container** portion |
| baguette | 45 g | **15 g** | one slice, from USDA's 324 g / 22" baguette ≈ 15 g per inch |
| beans | 80 g | **30 g** | **his judgement**, midpoint of a ruled 25–35 g. ⚠️ NOT USDA-backed: USDA publishes 130 g but that is beans **as the food**, and there is no published side-of-a-plate portion |

Applied by `scripts/apply-accompaniment-rulings.ts`, which **refuses to write** unless it first
reproduces every stored oracle total from the shipped file.

### 📊 Two dishes no arm has fixed, and they fail for DIFFERENT reasons

- **COLIFLOR ROKA (0–3/12)** — its mass is fine; its **identity** is wrong. The pipeline returns
  25–110 kcal and near-zero fat for a **battered, deep-fried, sauced** dish, because its description
  is EMPTY and *"Roka"* is defined only on another line of the menu (`CAMARÓN ROKA … capeado y
  bañado`). **No prompt sentence fixes this** — four arms have tried. It needs cross-item menu
  context. Measured: undescribed macro-relevant items get **1.93 ingredients vs 4.87**; ~28% of
  macro-relevant items are undescribed (food 10%, **sides 85%, desserts 100%**).
- **TIRAS DE POLLO (3/12)** — only Arm PF moved it (to 7/12) by adding cooking fat, and PF regressed
  the salad by the same amount.

### 🧭 ⚠️ SUPERSEDED — do not take a next action from here

This section used to rank the next experiments. **All of it has been run.** Arm P, Arm P-10,
P-inline and the split-only control are measured and rejected; the accompaniment-weight defect is the
only item that survives, and it is recorded under "STILL OPEN" in the 2026-08-18 block at the top.

**→ The current next action is the first line of the 2026-08-18 handoff: execute
`docs/superpowers/plans/2026-08-18-dual-pass-enrichment.md`.**

---

## 2026-08-13 — the unweighted oracle, detail

**The 96-point benchmark only ever described dishes that PRINT A WEIGHT.** All 8 fixtures print one,
so `resolveGrams` pins their grams and the plate is never guessed. There are now **TWO scores, and
they must never be merged or quoted for each other:**

| score | dishes | points | result |
|---|---|---|---|
| weighted (existing) | 8 | 96 | **~96% passing** |
| **unweighted (NEW)** | 6 | 24 | **28/72 = 39%** over 3 draws ← this is the BASELINE. Arm P later reached **37/72** on the corrected band; see the 2026-08-16 handoff at the top |

That gap is the real state of macro enrichment. Build: `scripts/unweighted-oracle-build.ts` →
`scripts/fixtures/unweighted-oracle.json`. Score: `scripts/bench-unweighted.ts`.

🔑 **PRICE IS NOT EVIDENCE OF GRAMS** (Santiago, 2026-08-13, rejecting a band argued from price
parity): *"A menu can have an expensive pizza of 1k+ dollars, doesn't mean it weighs 10x the size of
a large pizza."* Never use price in an oracle, a prompt, or code.

⚠️ **An oracle built from GENERIC USDA records will fail a pipeline that is right.** Two of the first
run's four "pipeline defects" were the oracle's own fault — a cream-sauce pasta record with no meat
where the menu says *tocino*, a creamy dressing where the menu says *vinagreta*. **Re-source before
believing any single-dish failure.** Four such errors are tabulated in the ledger.

🔴 **The headline finding — a right mass with the wrong FOOD.** COLIFLOR ROKA scores 0/4: the
pipeline returns 25 kcal and **0 g fat for a battered, deep-fried, sauced dish**. Its description is
empty, and *"Roka"* is defined only on ANOTHER LINE of the same menu (`CAMARÓN ROKA … capeado y
bañado`). Enrichment never sees it. **This points the opposite way from the batching defect** —
there, isolating items helped; here, cross-item context would have. Any arm that isolates items
further makes this dish worse.

🔴 **Fat is the weakest macro — wrong on 5 of 6 dishes** (0 g vs 14–19, 20 vs 58–65, 20–22 vs 31–44,
25–29 vs 35–63; high on the Salmón Roll). Carbs pass almost everywhere.

⚠️ **Arm A cannot fix COLIFLOR ROKA** — it supplies a plate WEIGHT, and that dish's weight is already
right. Judge Arm A on Capricciosa and Tiras de Pollo, never on the set total.

---

## 2026-08-12 SESSION — the batch-size curve. Still valid.

Spend: **~$11.50**. **Nothing was changed in production. `ENRICH_BATCH_SIZE` is still 10, nothing
was deployed, and the code below is uncommitted on `feat/forced-serving-pieces`.**

**The batch-size curve was measured and it killed its own fix.** Small batches fix the instability
AND fix a real drop bug — and cost 4× the accuracy on dishes that print a weight:

| | b10 (production) | b3 |
|---|---|---|
| macro spread, unweighted dishes (median) | 35% | 7–12% |
| genuine item drops, all 10 menus | **16** (Polloteria) | **0** in 30 runs |
| **accuracy, 8 weighted fixtures** | **0–4/96 at 12.3–13.9%** | **13–15/96 at 17.9–18.9%** |
| wall-clock, 10 menus | 521 s | 304–353 s |

**So a single global batch size cannot win both, and this was never a tuning problem.** A control run
(batch 8 through `callGptEnrich`) reproduced B21 exactly, so the code path is innocent and batch size
is genuinely the cause. Full numbers, the OSTRICA/TAYLOR BAY worked examples, and the
"what this does NOT establish" list are the last entry in
`docs/superpowers/stage2-macro-benchmark.md`.

🔑 **Read this before designing the next arm: the two open defects are probably ONE defect.** Offered
as a prior, not a finding — the model appears to calibrate across the items sharing a call. Where a
printed weight pins the grams, that context HELPS; where the plate is guessed, it makes the guess
depend on batch-mates, which is the instability. If so, both defects reduce to **nothing pins the
plate for a dish that prints no weight**, and Arm A (required `typical_total_g`) is the shape of a fix
for both — re-judge it SOLO, since batched runs are now known to be untrustworthy.

🔴 **A REAL PRODUCTION BUG WAS FOUND AND IS STILL LIVE: Polloteria loses 16 of its 95 items at
`ENRICH_BATCH_SIZE = 10`.** The wing sauces (BBQ, Ranch, Buffalo, +13) come back with zeroed macros —
`fallbackEnriched`'s signature — and come back correct at b3. Lowering the batch size is not the way to
fix it, because of the accuracy cost above. **Unfixed and unassigned.**

⚠️ **`ENRICH_BATCH_SIZE` was pinned at 10 to stop early-stopping. That fear did not reproduce**: zero
short returns across 125 calls at sizes 1/3/5/10. The comment in `enrich.ts` is stale as a
justification.

✅ **Shipped in code (not deployed): `MAX_CONCURRENT_BATCHES = 5`.** `callGptEnrich` used to fire every
batch at once; Polloteria at batch 3 is 19 simultaneous requests, and a rate-limited call that fails
twice gets its item ZEROED rather than merely delayed. Capped in waves, with a test verified to fail
without the cap. 30 tests pass.

⚠️ **Correction, applies to every figure below: "15 per call" was really 10 + 5.** `callGptEnrich`
chunks internally at `ENRICH_BATCH_SIZE`, so the 15-dish batched runs were a group of 10 plus a
remainder of 5.

⚠️ **`0–3/96 at 12%` describes ONLY dishes that print a weight.** `bench-macros.ts` sends all 8
fixtures in one call and all 8 print weights, so `resolveGrams` pins their grams and the plate is never
guessed. The benchmark is structurally blind to the instability defect. Most real menu items are
unweighted, and they are ungated.

⚠️ **"Solo is stable" was a 5-dish selection artifact.** Across 15 dishes, five swing ≥19% sent ALONE
(Tiras de Pollo 505–796 kcal at batch 1). Batch size is not the whole fix.

---

## 2026-08-11 SESSION — still valid except where the block above corrects it

Two defects were found that change the priority order, and one product feature was built. Total
spend for the day: **~$2.05** across seven probes. Everything below this block predates it.

### 🚨 #1 PRIORITY — batching makes macros unstable IN PRODUCTION. ⚠️ "Code-only fix" is now KNOWN WRONG — see the 2026-08-12 block.

**What "batch" means here:** one user, one photo, one scan produces ~40 menu items. The edge
function chunks them into groups of `ENRICH_BATCH_SIZE = 10` and makes ~4 model calls. A "batch" is
one such group — it is INTERNAL to a single scan, nothing to do with multiple users or scans.

Same dish, same unchanged pipeline, five draws each. The only variable is grouping:

| dish | SOLO (1 item/call) | BATCHED (15/call) |
|---|---|---|
| OSTRICA | 173,172,172,172,177 → **3%** | 525,205,243,242,242 → **88%** |
| MEXICANA | 358,359,359,358,359 → **0%** | 499,335,339,362,639 → **62%** |
| BRAISED SHORT-RIB GF | 525,529,529,529,525 → **1%** | 500,379,501,501,653 → **53%** |

Alone the model is essentially deterministic; batched, the same dish swings 39–88%. Two diners
scanning the same menu get different calories, and the goal RANKING is sorted on those numbers.
Probe: `scripts/probe-plate-arms.ts solo|noise|curve`.
✅ **The curve was MEASURED on 2026-08-12 — see the top block. Do not re-run it.** Its verdict: small
batches fix this and cost 4× the accuracy on weighted dishes, so a batch-size change is NOT the fix.
⚠️ Both figures in the table above are "15 items submitted", which `callGptEnrich` ran as 10 + 5.

### 🚧 #2 — every statement of size EXCEPT printed grams is ignored

3 draws, calories as the metric: printed grams 200→400 g moves the answer **2.14–2.37×**, while
**28→40 cm moves 1.06–1.36×**, "6 pz"→"12 pz" **1.00×**, "for 2 people" **0.62–1.22×**, "chica"→
"grande" **1.02–1.32×**. Not dish-specific — pizza, wings, pasta and salad are equally flat.

**Why:** nothing in the pipeline estimates the PLATE. The model gives ingredients and a typical
serving of each; the dish mass is whatever they SUM to (~231 g mean regardless of dish).
`resolveGrams` is the only place the plate exists as a concept, which is why printed grams are the
only channel that works. Asked plainly OUTSIDE the prompt, the same model says a 28 cm pizza is
**750 g** where the pipeline says 250 g — **the knowledge is there and nobody asks for it.**

### ❌ Measured and NOT shipped — do not re-run these

| arm | what it was | outcome |
|---|---|---|
| **A** — split batch, required `typical_total_g` | weighted items keep today's request byte-identically | restores size response (1.68–1.81×) but pushed the Salmón Roll out of band |
| **C** — separate parallel plate call | `ENRICH_PROMPT` untouched | worse than A everywhere; it asks COLD, A asks with decomposition context |
| **A-conditional** — ask always, anchor only when the menu states a size | `statesSize()` detector, food-agnostic | looked best on 4 solo dishes; **the 15-dish BATCHED run then measured mostly batch noise** — re-judge on solo before believing it |

⚠️ **The noise floor is median 25% / worst 88%** (batched). Any arm must beat **that dish's own**
noise, not a flat threshold. Three draws is too few where spread approaches 90%.

### ✅ Shipped this session (client only, no pipeline change)

**The portion control** — every item carries `portion` (share of one order) and `piecesPerOrder`
(what it is cut into). A row reads `1` or `8 / 12`; tapping opens an editor with `I'll have` and
`comes in`. **Macros are always `itemMacros × portion` — the divisor never enters the arithmetic**,
so correcting a wrong piece count cannot move a calorie. 15 tests in `src/lib/portions_test.ts`.
~~Branch `feat/forced-serving-pieces`, PR #17 open with an unread CodeRabbit review — Santiago's
ruling: PR #17 is the LAST thing to work on.~~ ✅ **DONE 2026-08-19: the CodeRabbit review was worked
(one real bug — `parsePortionInput("0.001")` returned 0, not null, which prices a row at 0 kcal), and
PR #17 is MERGED to `main`.** 🏗️ **TestFlight build 7 is building**; build 6 shows the old label.

⚠️ One workaround worth knowing: the quantity `TextInput` sets `textAlign` via `style`, never
`className` — `nativewind@5.0.0-preview.4` ships a `TextInput` whose `nativeStyleMapping` is
`{ textAlign: true }` against code calling `path.split(".")`, so any text-align class crashes the
render.

### 📌 Rulings made this session

- **The ingredient rule** — now in `AGENTS.md`: the DESCRIPTION is the source of truth above all
  else; the NAME implies only what the dish form requires (a roll's rice, a burger's bun); nothing
  else is ever invented. Settled by the Salmón Roll, whose 150 g of unlisted rice is 42 of its 54 g
  of carbs and whose result an independent cross-check put at ~592 kcal.
- **"Portions for 2 people" is not a model problem** — the user reduces it with the stepper.
- **The unweighted-dish oracle is PARKED**, half-built (`scripts/macro-band-score.ts`,
  `scripts/unweighted-oracle.ts`, `scripts/unweighted-candidates.ts`, 14 tests). It needs six
  per-recipe rulings from Santiago and is NOT blocking. Its spec honestly records that official
  databases publish ingredients and generic composites, **never restaurant plate weights** — so any
  such oracle is a labelled *reconstruction*, good for catching gross errors, not fine grading.

---

🔍 **Never trust a doc for what is deployed — check the live function.** These docs claimed "v28 / B4
/ not deployed" for two days while v29 served every scan; that was found on 2026-08-11 by comparing
the live bundle against this repo's `ENRICH_PROMPT`, which is the only fingerprint that cannot lie.
`mcp__supabase__list_edge_functions` gives version and `updated_at`. **When you deploy, edit these
lines in the SAME commit** — the 35-minute gap is exactly how it happened.

History, both superseded: **`macro-best-v8` as v29** (2026-08-09 15:46 MST) and **B4 as v28**
(2026-08-09). Production before those ran the original pre-B1 prompt — the
worst version measured (39/96 failed, 37.7% error); B4 measured (**24–27/96, 21.0–21.2%**).
Verified live: `printed_total_g` read correctly on all three smoke-test dishes, allergens present,
`model_id` = the pin. **Rollback = redeploy from `ce91e91`**:
`git checkout ce91e91 -- supabase/functions/analyze-menu/ && supabase functions deploy analyze-menu --project-ref uonuiadueykynbetxxrw`.
⚠️ **A known regression shipped with it:** B4 is WORSE than the old version on small dressed side
dishes (Coleslaw 0/48 → 22/48) — it under-portions dressing. Accepted as the price of a ~2× net win.
**GPT-5.5 is NOT deployed and was NOT chosen** — see the model block below.

Read **② the roadmap's `🎯 CURRENT PHASE` block first** — it carries the full takeover briefing:
every commit and whether it is deployed, the runs side by side, and what each proved. Then read
`docs/superpowers/stage2-macro-benchmark.md`, the living document (Backlog, Runs, Rulings).
`docs/superpowers/plans/2026-08-07-stage2-macro-benchmark.md` holds the paid-run procedure; its
Tasks 1–5 are COMPLETE. The USDA plan is the oracle/provenance reference:
`docs/superpowers/plans/2026-08-07-usda-macro-oracle.md`.

**One-line state (⚠️ SUPERSEDED — current numbers are in the 2026-08-16 handoff block at the top; production is v32 (dual pass) and the weighted score is 6–9/96 isolated, 14–17/96 in real menus):** **`macro-best-v8` + forced `serving_pieces` is the best measured version at 0–3/96 and 12.0–12.5%, and it IS live as edge function v30 (2026-08-11).** On the 8-dish set, 4 runs x 3 draws: **baseline 24/96 at 34.2%, B21 0–3/96 at 12.1–14.1%**, with one perfect run and six of eight dishes at 0/48. Verified beyond the fixtures on **72 real items from all nine archived menus**: black-box ingredient 1.4%, undecomposable 2.8%. Drinks and alcohol are deliberately OUT (post-launch). ~~The biggest remaining unknown is the real-restaurant field test — every scan to date is a photo of a screen.~~ **FALSE, corrected by Santiago 2026-08-16: the fixture photos ARE real phone photos of real paper menus.** Always re-derive numbers with `deno run --allow-read scripts/rescore-history.ts`; figures written in prose are snapshots.

🏁 **Fallback checkpoint: git tag `stage2-b4-checkpoint` → commit `22a1ac5`.** Restore from it if an
evaluation regresses. `git show stage2-b4-checkpoint` prints the result;
`git diff stage2-b4-checkpoint -- supabase/functions/analyze-menu/` shows what has drifted.
⚠️ **That tag message quotes PRE-re-freeze numbers** — the current ones are in the log's Rulings. Do
not move or delete the tag. ✅ **B4 was deployed on 2026-08-09** (see above) — the "publishable is not
permission to deploy" caveat that used to sit here is spent. **The rollback target is `ce91e91`,
the pre-B1 state**, not this tag.

✅ **The saturated gate is FIXED — the fixture set is now 8 dishes.** It used to be that
baseline-002 and B4 both scored 0 of 36 and were indistinguishable. B14 (2026-08-09) added five
dishes and the metric separates them again: **B4 24–27/96 vs baseline 39/96**. On the original three
dishes both arms still score 0 of 48 each, so **never quote a 36-field figure as current** — those
belong to the retired 3-dish set. Report both numbers: failed field/draws AND mean absolute error.

💰 **Cost is NOT a constraint (Santiago, 2026-08-08).** These sessions exist to clear hypotheses about
the core feature. **Never narrow scope, skip an experiment, or recommend stopping on cost grounds.**
State the dollar estimate and get his approval before a paid run — but price is never an argument
against running one.

### ✅ ALREADY DONE — do not redo, do not re-run, do not re-litigate

Every line here was executed and measured. A new session that "discovers" one of these is
repeating paid work. Full detail in the log's Runs table and Rulings.

| Thing | Outcome |
|---|---|
| Benchmark harness, USDA oracle, scoring | Built, frozen |
| B1, B10, B11, B12, B13 | Measured. B11 and B13 **falsified** (prompt wording moved nothing) |
| **B4** — conventional serving + printed-weight tag, fitted in code | **The current best pipeline.** Tag `stage2-b4-checkpoint` |
| **B14** — widen the fixture set | **DONE.** 3 dishes → **8** |
| **B9** — cross-model arm | **DONE.** GPT-5.5 beats GPT-4o |
| Oracle re-freezes ×3 | printed weights (`a4ebf0f`), Caesar dressing (`a60eb2a`), **PASTEL tortilla (2026-08-09)** |
| Sub-3 g absolute scoring floor | Approved and applied |
| **`resolveGrams` "protect the principal"** | **FALSIFIED at $0** — made failures worse on both arms. Not shipped |
| Measurement-code duplication (4 divergences) | Fixed; `macro-measure.ts` is the single path, guarded by tests |
| **Deploying B4** | ✅ **DONE 2026-08-09 — edge fn v28.** Rollback target `ce91e91` |
| **Pipeline-integrity arm** (real menus, batches of 10, both models) | **DONE.** Both models clean: no drops, order kept, no truncation. Found a latent production break — see below |
| **USDA adjudication of Coleslaw + ENFRIJOLADAS portions** | **DONE, oracle UNCHANGED on both.** USDA backs the oracle. Coleslaw's regression is genuine model error |
| **GPT-5.5 as the production model** | **CONSIDERED AND DECLINED** — better macros, ~2.4× slower. Not a measurement gap; a product call already made |

**Deliberately NOT done, and each needs a ruling before anyone starts:** deploying anything
FURTHER (B4 was authorised and deployed 2026-08-09 as v28; nothing else is); switching production
to GPT-5.5 (considered and declined — 2.4× slower); changing the oracle; re-running a baseline;
putting any food/dish/cuisine name in the prompt's nutrition step (measured harmful, unit-tested).

### 🎯 WHAT IS ACTUALLY LEFT (everything else on this page is history)

⛔ **THIS SECTION IS SUPERSEDED — read the 2026-08-12 block at the top first.** It said the
benchmark work was finished; two open defects (batching instability, and size being a dead channel)
mean it is not. The two items below are still real and still need Santiago. **The batch-size curve is
now MEASURED and closed as a fix** — it is no longer the next action.

**The benchmark work was believed finished as of 2026-08-09.** Two items remained, and neither is a
measurement question — both need Santiago, not another run:

1. 🔴 **The printed-weight SCOPE ruling — the one open technical finding.** Our oracle assumes "the
   printed weight = the whole plated dish" for all eight fixtures. The menus contradict that. Gnocchi
   is not a portion dispute: **all three arms overshoot it in the same direction** (baseline +107%
   calories, GPT-4o +26%, GPT-5.5 +17%), Casa Nostra prints the same **180 g on five different pasta
   dishes**, and Andaluz prints weights as small as **30 g** (`ESPÁRRAGOS con jamón serrano`) and
   **50 g** — which are ingredients, not plates. On that menu the number sits right after the
   accompaniment clause. Re-reading Casa Nostra's weights as the principal component moves **Gnocchi
   +39%** and **Salmone +27%** — and Salmone currently scores **0/48**, so it could break a passing
   fixture. ⚠️ **This re-opens a question the docs mark CLOSED ("ruled, applied blind"), so it needs a
   NEW ruling. Nothing has been changed.** Suggested first step, $0: classify all eight fixtures'
   printed weights against the menu photos before touching any one dish — a per-dish patch would
   recreate the inconsistency the PASTEL re-freeze just fixed.
2. 📱 ~~The real-restaurant field test — never done, and now the highest-value unknown.~~
   ✅ **CLOSED 2026-08-16 (Santiago): its premise was false.** The fixture menus are real phone
   photos of real paper menus, so paper, lighting, angle and glare are already measured.

**Also open, lower value:** Coleslaw-type small dressed side dishes regressed under B4 (0/48 → 22/48)
and USDA has confirmed the oracle right about that dressing — so it is a genuine model error and a
legitimate engineering target. ENFRIJOLADAS' real gap is its **chicken** portion (all three arms run
protein +33–48% over the oracle's 25 g), not its tortilla.

**Side finding, not chased:** extraction misread two Andaluz printed weights (30 g → 20 g, 50 g →
90 g). Found because a claim sourced from `find-weighted-dishes.ts` — which parses archived
*extraction* text — did not survive checking the photo. **Adjudicate from the photo, never from a
script's output** (lesson 4).

### 📚 History — these were the "next actions" and are all DONE

1. ✅ **Widen the fixture set — DONE 2026-08-09.** The set is **8 dishes**: the original three plus
   NEW YORK (brasero), French Fries and Coleslaw (polloteria), Gnocchi alla sorrentina (casa-nostra)
   and ENFRIJOLADAS (el-marcos). Adding more dishes later follows the same route:
   `scripts/find-weighted-dishes.ts` lists 120 printed-weight candidates, each needs a USDA recipe
   with real `fdc_id`s, and **Santiago approves every recipe personally.**
2. ✅ **B9 — the cross-model arm — DONE 2026-08-09.** `gpt-5.5-2026-04-23`, 4 runs × 3 draws, ~$0.47.
   **GPT-5.5 14–19/96 at 15.5–17.2% vs GPT-4o 24–27/96 at 21.0–21.2%.** Ranges non-overlapping —
   GPT-5.5 wins on macros. ⚠️ The first reading said "level, do not switch" and was **reversed** the
   same day by the PASTEL re-freeze. **It was nevertheless DECLINED for production on latency.**
3. ✅ **Pipeline-integrity arm — DONE 2026-08-09 (~$0.72).** 🔑 **It caught a latent production break
   that ten paid runs had missed:** `enrichBatch` hardcoded `temperature: 0`, which gpt-5.x rejects
   outright, so **switching `ENRICH_MODEL` alone would have 400'd every scan.** The benchmark could
   never have caught it — `bench-macros.ts:151` quietly drops the parameter for an overridden model,
   so the whole measured GPT-5.5 arm ran a request shape production cannot send. Fixed in `a9fce10`.
   **General lesson: a benchmark that reaches the model by its OWN path is not evidence that the
   DEPLOYED path works.** Re-runnable at any time: `deno run --allow-read --allow-write --allow-env
   --allow-net scripts/bench-pipeline.ts [model …]`.

🔴 **B9's VERDICT WAS REVERSED by the 2026-08-09 PASTEL fix — read this before quoting it.**
PASTEL AZTECA's oracle now includes its tortilla (Santiago's ruling; a pastel azteca is a tortilla
casserole the way a cheeseburger has a bun). Under the old, tortilla-free oracle GPT-4o and GPT-5.5
overlapped and the session concluded "task ceiling, do not switch models". Under the corrected
oracle the ranges **do not overlap**:

| model | failed/96 | mean abs error |
|---|---|---|
| `gpt-4o-2024-08-06` | 24–27 | 21.0–21.2% |
| `gpt-5.5-2026-04-23` | **14–19** | **15.5–17.2%** |

⛔ **RESOLVED — the model question is CLOSED, do not re-open it as a measurement task.** Santiago
considered the switch on 2026-08-09 and **declined it**. GPT-5.5 wins on macros but the
pipeline-integrity arm showed it is **~2.4× slower** on Stage 2 (101 s vs 41 s on a 55-item menu) and
it says mineral water has 252 kcal. `ENRICH_MODEL` stays `gpt-4o-2024-08-06`. Confound that still
stands and is now moot: GPT-5.5 rejects `temperature: 0`, so it ran at its default 1 and carries more
spread. App-wide write-up, kept outside this phase: **`docs/model-findings.md`**.

✅ **The "fix resolveGrams" idea is FALSIFIED, $0.** Protecting the principal component when fitting
made the failure count WORSE on both arms (GPT-4o 103→105, GPT-5.5 66→69 of 384). Production
`resolveGrams` is unchanged. Two claims from the previous session were corrected by measurement:
Coleslaw's scale factor is **exactly 1.00** in all 12 GPT-4o draws, so the fit is a no-op there and
cannot be its cause; and the severe compression is a GPT-5.5 phenomenon (scales 0.53–0.83) not a
pipeline one (GPT-4o 0.87–1.06).

✅ **The three portion disagreements were ADJUDICATED against USDA on 2026-08-09 ($0). Two are
closed and the oracle was NOT changed; the third turned out to be a different question entirely.**

| dish | USDA evidence | outcome |
|---|---|---|
| **Coleslaw** (dressing 20 g vs 30 g) | USDA's own default serving of coleslaw dressing is **31 g** (1 tbsp = 15.6 g). At 30 g the dish is 108 kcal/100 g, inside the real-product cluster (107–124). At 20 g it is 84 — **below every real coleslaw in FDC** bar the fat-free ones | **CLOSED. Oracle right at 30 g.** So B4's Coleslaw regression is **genuine model error** and a real target — the opposite outcome to the Caesar dressing episode |
| **ENFRIJOLADAS** (tortilla 60 g vs 72 g) | FNDDS corn tortilla: small **18 g**, medium **28 g** → 24 g each is the midpoint | **CLOSED. Oracle right at 72 g**, and worth only 2%. The dish's real gap is its **chicken** — all three arms run protein +33–48% over the oracle's 25 g |
| **Gnocchi** (150 g vs 110 g) | — | **NOT a portion dispute.** It is the printed-weight **scope** question — see "What is actually left" above |

**B5 is designed but shelved**, not falsified — see
`specs/2026-08-08-b5-preparation-and-oracle-dressing-design.md` and the log's "B5 premise re-derived"
entry. The re-freeze shrank its target from three dishes to one field on one dish.

⚠️ **Never put a food, dish or cuisine name into the nutrition step of `ENRICH_PROMPT`.** B11 did
(its "high carb" list was a roll-call of our own three fixtures) and it measurably made sweet corn
worse. `enrich_test.ts` now fails the build if one reappears.

📊 **Measured insight, not a rule — prompt wording has a poor track record here.** B11 and B13 each
spent a paid run on step-2 wording and each moved its targeted number by **zero**; the two changes
that did work (B10, B12) both took arithmetic *away* from the model and left it knowledge. That is
**two data points against wording and two for mechanism**, which is a prior to weigh in the next
brainstorm — not a closed door. If a hypothesis says wording is the lever *for a different reason*,
say what would falsify it and run it.

🧭 **The commands that tell you the truth, all $0:**

```bash
deno test --allow-all scripts/ supabase/          # expect 389 passed | 2 failed (see below)
deno run --allow-read scripts/rescore-history.ts  # CURRENT score of every archived run
deno run --allow-read scripts/rescore-history.ts <run-id>… --by-dish   # specific runs, per dish
deno run --allow-read scripts/sim-scope-rule.ts   # $0: the printed-weight scope rule, A vs C

# $0 replay - score ARCHIVED responses of any unweighted arm against the CURRENT oracle.
# This is what makes an oracle correction free; it calls no API.
# `dual` is the SHIPPED path (v32). --allow-env --env-file are REQUIRED even for a
# replay: probe-plate-arms.ts reads OPENAI_API_KEY at import time and throws
# without it, even though a replay calls no API.
deno run --allow-read --allow-env --env-file=.env.local \
  scripts/bench-unweighted.ts 3 <baseline|dual|P|P10|PF|PD|A|A-cond|S3|SplitOnly> --replay

# PAID. Weighted set, one run of 3 draws. BENCH_ARM is optional (S3 | S4). ~$0.05.
BENCH_RUN_ID=iter-<name>-w1 [BENCH_ARM=S3] deno run --allow-read --allow-write \
  --allow-env --allow-net --env-file=.env.local scripts/bench-macros.ts

# PAID, ~$0.40 per arm. The MIXED-MENU harness: the same 8 weighted dishes scored
# INSIDE their own real menus, which is the regime production runs and the one
# bench-macros.ts is structurally blind to. Arms: mixed (today) | P.
# It sends ONLY the batches the fixtures land in - equivalent by construction,
# 77% cheaper. DO NOT add --full-menu to "be thorough": it costs 4.5x and buys
# nothing for the score (see the cost entry in the benchmark log).
deno run --allow-read --allow-write --allow-env --allow-net \
  --env-file=.env.local scripts/bench-mixed-menu.ts 3 <mixed|dual|P|P10|Pinline>

# $0 replay of the above. Add --full-menu to replay the 2026-08-17 whole-menu run.
deno run --allow-read scripts/bench-mixed-menu.ts 3 <mixed|dual|P|P10|Pinline> --replay
```

`rescore-history.ts` is the **source of truth for every number in these docs.** Any figure written
in prose is a snapshot of when it was written; that command is what is true now. All measurement
logic lives in `scripts/macro-measure.ts` and **must never be re-implemented anywhere** — see
lesson 28, and `scripts/macro-measure_test.ts` fails the build if it is.

ℹ️ **The suite's `2 failed` is noise — BOTH are known and neither is yours.** `389 passed | 2 failed`
is a CLEAN run:

| red test | why it is noise |
|---|---|
| `scripts/tile-cut_test.ts` | Santiago ruled it unimportant; it tests the image tile cutter and Stage 2 never sees a photo |
| `scripts/macro-measure_test.ts` → *"only macro-measure.ts knows the archive eras"* | **a false positive.** The guard forbids the string `protein_per_100g` outside `macro-measure.ts`; `unweighted-oracle.ts` and `unweighted-oracle-build.ts` use it as an ORACLE COMPOSITION FIELD, not as archive-era detection. Red since 2026-08-13. **Left red deliberately — narrowing a measurement guard is Santiago's call** |

Any *other* failure is yours. Details in ②.

Then read:

1. ②'s **"Release scope decision"** — the numbered critical path and the POST-RELEASE list of
   things deliberately *not* to work on.
2. ②'s **"Lessons learned"** — lessons 1–28 are mistakes previous LLMs actually made in this
   codebase. Lessons 11–28 are the expensive ones. **Lesson 28 is the one to read first if you are
   about to touch anything that produces a number** — bad measurement code is worse than bad feature
   code, because it silently redirects every future iteration. Read them before designing any rule or
   predicting any score.
3. **`docs/superpowers/extraction-iteration-ledger.md`**, newest entries LAST — every experiment
   and what was measured. Read the last few for current state; do not re-run anything REJECTED.
4. **`AGENTS.md`** and **`CLAUDE.md`** — product scope, stack, and behavioural rules. Both govern.

⚠️ **Known contradiction, unresolved:** ① specifies Supabase auth; `AGENTS.md` says "Use Clerk.
Do not build custom auth." Neither is installed. Ask Santiago before any auth work.

## 2. Santiago's standing rules

These outlive any phase.

- **He personally decides** all fixture/oracle changes, extraction-convention rulings, photo
  adjudications, and **every live-run cost approval**. Present options with a recommendation and
  WAIT. State the dollar estimate before asking.
- **Use the `superpowers:systematic-debugging` skill for ANY debugging**, and
  `superpowers:brainstorming` for ANY brainstorming of new evaluations, iterations or solutions.
- **End-of-task reports must be SIMPLE and VISUAL.** Lead with tables, plain language, and gloss
  project jargon on first use. His approval depends on understanding — and a term that implies
  something *false* is worse than a verbose one. Before asking him to authorise anything, spell
  out what it is NOT.
- **Never quote a single run as quality — report the RANGE across runs.** The model returns a
  different but equally valid item list each call.
- **A numeric scorer pass is never a gate by itself.** Every live run's raw dump must also pass a
  by-hand audit against the menu photo for invented or unprinted items.
- **A frequency claim needs a denominator.** "Reproduces reliably" / "it's rare" are claims about
  a COUNT — record the count and the machine it ran on, or write neither. (This cost two sessions:
  eval 139 called a crash "reliable" from one occurrence, eval 140 called it "rare" from two runs
  whose machine was never established. Both were wrong.)
- **Ledger every experiment** in the iteration ledger before your session ends, and commit + push
  on `main` after every commit.

## 3. Closed — do not re-enter

These phases are finished. Their folders stay in place because the ledger references their paths,
but they are history, not work:

| Area | Where | State |
|---|---|---|
| Extraction Features 1–4 | roadmap "Feature Sequence" | CLOSED — frozen as regression gates |
| Per-page multi-photo wiring | critical path #1 | CLOSED |
| Dense-menu auto-cutter | critical path #2 | CLOSED |
| Client compression fidelity | critical path #3 | CLOSED |
| Horizontal/landscape menus + rotation | `docs/superpowers/horizontal-menus/` | CLOSED |
| TestFlight photo crash | `plans/2026-08-05-testflight-photo-crash-handoff.md` | SOLVED |

## 4. Before you build anything on a device

`plans/2026-08-05-testflight-photo-crash-handoff.md` has the environment traps — iCloud
`FinderInfo` breaking `codesign`, Metro's compiled-in port, verifying a shipped bundle actually
carries its env vars. **Each of those cost a session.** Read that file's trap section before any
local iOS build or EAS build.

## 5. Non-extraction work

The master roadmap covers **extraction only** — it says so in its own scope line. App design, UI
and product behaviour are governed by `AGENTS.md` (features, stack, architecture, UI rules) and
`DESIGN.md` (the design system, which is the source of truth for typography and styling).
