# Stage-2 Macro Enrichment Accuracy Benchmark — Design

**Date:** 2026-08-07 · **Status:** approved, not yet implemented
**Roadmap position:** critical-path #5 in `plans/2026-07-04-ocr-extraction-master-roadmap.md`
(the ACTIVE item). Macro accuracy has never been gated.

---

## 1. Purpose

Measure whether GPT-4o's Stage-2 nutrition estimate agrees with a careful manual
ingredient lookup performed by Santiago.

**What this is NOT:** a measurement of truth. The restaurant's actual dish has real macros
that neither the model nor a human lookup knows. This benchmark grades *agreement with a
careful human*, which is the honest bar for a menu-ranking app. Tolerance bands are set
accordingly — tight enough to catch real errors, loose enough not to grade noise.

**Out of scope, permanently, for this phase:** photos, OCR, Stage-1a/1b extraction, the P1
prompt, the app UI. Stage 2 receives menu items as **JSON text** and never sees an image.
Everything upstream stays frozen.

---

## 2. How Stage 2 actually works (traced 2026-08-07, edge fn v24)

Recorded because the design depends on it and it was not written down anywhere.

| Step | Where | Behaviour |
|---|---|---|
| 1 | `src/app/review.tsx:39` | app calls `enrichMenu(result.items, "gpt-4o")` with the whole extracted menu |
| 2 | `src/lib/analyzeMenu.ts:352` | POST `{items, provider, stage:"enrich"}` to `analyze-menu` |
| 3 | `index.ts:284` → `callGptEnrich` | entry for the enrich stage |
| 4 | `index.ts:198` | `chunk(items, ENRICH_BATCH_SIZE)` — **batches of 10** |
| 5 | `index.ts:199` | `Promise.all` — **all batches fire in parallel** |
| 6 | `index.ts:152` `enrichBatch` | **one GPT-4o call per batch of 10.** Single user message = `ENRICH_PROMPT` + `JSON.stringify(items)`. `temperature: 0`, `seed: 17`, strict `json_schema` |
| 7 | `index.ts:171` | returns fewer items than sent ⇒ **retry the batch once**; fails twice ⇒ `[]` |
| 8 | `enrich.ts:55` `reassembleEnriched` | match back by name; anything dropped is backfilled by `fallbackEnriched` — **all zeros, `confidence: "low"`** |

Not one call per item; not the whole menu in one call. A 48-item menu is 5 parallel calls.
**Three items is a single call.**

### The reasoning step, and its gap

`ENRICH_PROMPT` instructs an explicit two-step method: (1) list likely ingredients and tag
each `protein|carb|fat|veg|other`, (2) *from those ingredients* and the likely preparation,
estimate the macros. The strict schema enforces the order, so the model emits:

```
name → description → price → category
  → ingredients[]                                  ← step 1, generated FIRST
  → protein_g → carb_g → fat_g → estimated_calories ← step 2
  → confidence → allergens
```

Because OpenAI strict mode generates fields in schema order, `ingredients[]` is genuine
chain-of-thought written into the output, not a post-hoc label.

**Verified against OpenAI's docs (context7, 2026-08-07).** Their own prompt-generation guide
ships a `META_PROMPT` — the instructions OpenAI's schema generator itself follows — which
states verbatim:

> *"field order matters. any form of 'thinking' or 'explanation' should come before the
> conclusion"*

So the ordering is not incidental: putting the reasoning field before the conclusion fields is
OpenAI's documented recommendation, and the current schema follows it correctly.

**The gap:** each ingredient is only `{name, category}`. There is **no gram weight per
ingredient**. The model records *what* is in the dish and never *how much*, then jumps
straight to four totals. Its portion assumption is unrecoverable from its output.

This is the single most important fact for the oracle design (§4) and the source of
backlog item B1 (§8).

---

## 3. The three starting items

Chosen for: a printed weight, a complete ingredient list, three different menus, three
different macro shapes. Spreading across menus and cuisines is deliberate — lesson 19 is
that a rule fitted to one menu's conventions breaks on the next ten.

| # | Item | Menu | Printed weight | Archetype under test |
|---|---|---|---|---|
| 1 | `CESAR (200 g)` — $275 | andaluz | `200 g` (in name) | protein-forward, low-carb; globally known dish so the oracle is solid |
| 2 | `Salmone toscano` — $330 | casa-nostra | `200g` (in description) | fat-dominant, cream sauce + bread side |
| 3 | `PASTEL AZTECA (300gr.)` — $94 | el-marcos | `300gr.` (in name) | carb-dominant, regional Mexican — the generalization test |

Exact archived text (verbatim, `\n` preserved as printed):

```json
{"name":"CESAR (200 g)","description":"Lechuga, queso parmesano rallado, croutones,\npollo a la plancha y aderezo cesar de la casa.","price":275,"category":"food","section_title":"ensaladas","options":[]}
{"name":"Salmone toscano","description":"Salmon al horno bañado en crema toscana blanca con ajo, espinaca, alcachofa, tomate deshidratado y alcaparra, acompañado con baguette. 200g","price":330,"category":"food","section_title":"Frutti di mare","options":[]}
{"name":"PASTEL AZTECA (300gr.)","description":"Con pollo, salsa de tomate, chile verde, cebolla, elote y mezcla de quesos, servido con frijoles.","price":94,"category":"food","section_title":"MEXICANOS","options":[]}
```

**Provenance:** each of the three appears with exactly **one distinct version** across every
archived run in `scripts/fixtures/caches/` and `device-scans/` — they are stable extractions,
not draw-dependent.

**Mandatory first implementation step:** verify all three descriptions against the menu
photos in `scripts/fixtures/photos/` (`AndaluzMenu.jpg`, `CasaNostraMenu.png`,
`ElMarcosMenu.png`). If extraction misread an ingredient, the benchmark would grade
enrichment against a wrong input. Lesson 4: adjudicate from the photo, never from model
output or fixture history.

### Known open question, expected to be finding #1

The printed weight is **ambiguous about what it covers**. `Salmone toscano … 200g` almost
certainly means 200g *of salmon*, with the baguette extra. `CESAR (200 g)` probably means the
whole salad. `ENRICH_PROMPT` says "prefer printed weights over guesses" and says nothing about
whether that weight is the dish or one component. If the model reads item 2's `200g` as the
whole plate, its calories come in low — a prompt defect, not an oracle disagreement. Do not
pre-emptively fix this; let the baseline show whether it happens.

---

## 4. The oracle

`scripts/fixtures/macro-oracle.json` — one entry per item, edited by Santiago.

```json
{
  "menu": "andaluz",
  "name": "CESAR (200 g)",
  "description": "Lechuga, queso parmesano rallado, croutones,\npollo a la plancha y aderezo cesar de la casa.",
  "price": 275,
  "category": "food",
  "section_title": "ensaladas",
  "options": [],
  "printed_weight": "200 g",
  "oracle": {
    "calories": 430,
    "protein_g": 38,
    "carb_g": 14,
    "fat_g": 25,
    "assumed": "150g grilled chicken breast, 60g romaine, 30g parmesan, 25g croutons, 40g full-fat caesar dressing; chicken grilled not breaded"
  }
}
```

(The `oracle` numbers above are an illustrative shape, not Santiago's values. He fills them.)

The item fields above `printed_weight` are the **production `ExtractedItem` shape** and are
sent to the model unchanged. `grams` is deliberately absent from the stored oracle: it is
filled by running the real `parseItemGrams` (see §5), not hand-written.

### Why `assumed` is required, not optional

Per §2, the model never records portions. If a number disagrees, `assumed` is the **only
portion record in the entire comparison** — it is what distinguishes "we disagree on what is
in a caesar" (composition) from "we disagree on how much chicken" (portion). Those have
different fixes. Without it, every failure costs a round trip back to Santiago.

Effort is bounded: one line per item, written once. If an item fails and the line does not
explain why, break down that item only — do not pre-pay full per-ingredient detail for items
that pass.

---

## 5. The harness

`scripts/bench-macros.ts`.

### Required prerequisite change

`ENRICH_PROMPT` and `ENRICH_SCHEMA_OPENAI` currently live in `index.ts`, which calls `serve()`
at module scope and therefore cannot be imported by a script. **Move both into `enrich.ts`**
— the pure, side-effect-free module that exists for exactly this reason — and have `index.ts`
import them. Behaviour-identical; no logic moves.

The alternative (copying the prompt into the script) is forbidden. Lesson 23: re-implementing
the real logic in a probe produced confident wrong numbers four separate times in one session.
The harness must run the real prompt object, not a lookalike.

### Behaviour

1. Read `macro-oracle.json`.
2. Build the production item shape and run the real `parseItemGrams` over it, so `grams` is
   populated exactly as production populates it.
3. Call GPT-4o directly with the imported prompt + schema, `temperature: 0`, `seed: 17`,
   model `gpt-4o` — identical parameters to `enrichBatch`.
4. Repeat for **N draws (default 3)**.
5. **Archive every raw response**, passing draws included, to
   `scripts/fixtures/caches/macro-bench.<runId>-d<N>.raw.json`. Lesson 26: a paid run that
   does not archive its raw responses is unrepeatable evidence, and the passing draw is half
   of any later comparison.
6. Print the comparison table and the per-item draw tally.

### Mirror verification (once, before any number is believed)

Send the same three items to the **deployed** edge function via `stage:"enrich"` and confirm
the harness path produces equivalent output. Lesson 20: a rebuilt path must be proven a
strict no-op before its numbers mean anything. Record the result in the log; re-run it only
if `enrich.ts` or `index.ts` changes.

---

## 6. Scoring

Per item, per draw. **All four must clear or the item fails that draw.**

| Field | Band |
|---|---|
| `estimated_calories` | ±20% of oracle |
| `protein_g` | ±30% of oracle |
| `carb_g` | ±30% of oracle |
| `fat_g` | ±30% of oracle |

Not scored in this phase: `ingredients[]` contents, `allergens[]`, `confidence`
(§7 opens confidence separately), `name`/`price`/`category` passthrough.

**Report the range across draws, never a single run.** `temperature: 0` + a fixed seed is not
determinism — lesson 1, learned expensively in this codebase. A result reads:

```
CESAR (200 g)        3/3 PASS
Salmone toscano      1/3 PASS   ← calories 2 draws low
PASTEL AZTECA        0/3 PASS   ← fat consistently over
```

A single-draw number is never quoted as quality.

**Zero-division guard:** an oracle value of 0 (plausible for `carb_g` on a pure-protein dish)
makes a percentage band undefined. Rule: when the oracle value is 0, pass if the model value
is ≤ 3 g. Absolute, not relative.

---

## 7. Vague descriptions — phase 2, deferred

Opened only after the baseline exists, and brainstormed then rather than designed now.

Sizing, measured 2026-08-07 across all archived artifacts: **193 of 521 distinct items (37%)
carry no description at all** — just a name.

"No description" does not mean "unknowable": `PARRILLADA VERDURAS` is self-evidently grilled
vegetables, whereas `COLIFLOR ROKA` genuinely is not guessable. The promotional case Santiago
described (`POWER NOODLES` / *"you'll burn your mouth off"*) is a third shape again — a
description that exists but carries no food information.

The `confidence: high|medium|low` field already exists and `ENRICH_PROMPT` already instructs
`low` for evocative/promotional names. **Whether it actually fires correctly is unmeasured.**
That measurement is the natural first step of phase 2, and it is free — it re-reads the
baseline's archived responses.

---

## 8. Backlog — experiments for later in THIS phase

Recorded now so they are not lost; **none run until the baseline produces a failure list.**

- **B1 — per-ingredient grams.** Add a `grams` field to each entry of `ingredients[]`, forcing
  the model to commit to portions out loud before totalling. Directly targets the §2 gap.
  Note this is exactly the pattern OpenAI's own `META_PROMPT` prescribes — portions are
  "thinking" that currently is not written down before the conclusion (see §2). That raises
  the prior, but it does **not** promote it above a hypothesis: per §10 it stays untested until
  measured, and lesson 16 is that a confident predicted gain sends the next session chasing the
  wrong work.
- **B2 — batch-size sweep.** `ENRICH_BATCH_SIZE` is 10 and has never been varied. Test 5 / 15 /
  20 on the same items. Cramming more items into one call may cost per-item attention; nobody
  has measured it. Note the 3-item benchmark is a single call at every batch size, so B2 needs
  a larger item set to be observable — size it when it is picked up.
- **B3 — printed-weight scope.** Resolve the §3 ambiguity (whole dish vs one component) if the
  baseline shows it firing.

---

## 9. Artifacts — exactly three

Deliberately smaller than the OCR phase, which carried six (iteration ledger, eval log, master
roadmap, per-feature plans, specs, pipeline diagram) and still drifted.

| File | Owner | Nature |
|---|---|---|
| `scripts/fixtures/macro-oracle.json` | Santiago | data he edits |
| `scripts/bench-macros.ts` | code | runs the test, prints the table |
| `docs/superpowers/stage2-macro-benchmark.md` | log | append-only |

The log has three sections and no status that can rot:
- **Backlog** — ideas to test (seeded with §8)
- **Runs** — date · what changed · score range · verdict
- **Rulings** — decisions Santiago made, so they are not relitigated

No separate ledger, no eval log, no spec to re-sync on close. This spec is written once and
is not a living status document.

---

## 10. Method

1. Baseline the pipeline **exactly as it ships**. Change nothing first.
2. Compare against the oracle. Produce the **failure list** — the specific assertions failing.
3. Brainstorm a fix against that list.
4. Change **one thing**. Re-run. Report the range.
5. Log what was tried and what it scored, pass or fail.
6. Repeat.

Standing rules that apply throughout:

- A predicted gain is a hypothesis until measured; enumerate which failing assertions a change
  is expected to flip, or write "unknown" instead of a number (lesson 16).
- Produce both halves of any before/after in the same session; never quote a baseline from a
  document (lesson 17).
- A numeric pass is never a gate by itself — eyeball the raw dump too.
- Nothing deploys to production until grounded data supports it.

---

## 11. Cost

| | |
|---|---|
| 3 draws × 3 items (one GPT-4o call per draw; 3 items is under the batch size of 10) | ~$0.03 |
| 1 mirror-verification call against the deployed function | ~$0.01 |
| **First baseline total** | **< $0.05** |

Text-only calls. No photo, no OCR, no extraction call in this phase. Every subsequent
iteration is the same order of magnitude.

---

## 12. Definition of done for the first step

The baseline is complete when:

- all three descriptions are photo-verified,
- the mirror verification passes,
- three draws are archived, and
- the log carries a Runs entry with the per-item range and Santiago's read of the failure list.

Closing the whole phase — what "macro accuracy is gated" means — is decided after the baseline,
because the right bar depends on how far off the model actually is.
