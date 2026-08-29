# Oracle Widening Round 2 Implementation Plan

> ✅ **FULLY EXECUTED 2026-08-22 — HISTORICAL RECORD ONLY. DO NOT RE-RUN.** All nine tasks are done
> (commits `e7e8d44` → `62d1f65`). **The unchecked `- [ ]` boxes below are the state the plan was
> WRITTEN in, not work outstanding.** Outcome: oracle **21 → 57 dishes** (44 proposed, 8 retired as
> unanswerable, 36 written — neither of the plan's projected 65/52 endpoints), `NOBOOST` **rejected**
> by the pre-committed deploy rule, and the oracle audited and confirmed sound at eval 170.
> Results live in ledger **evals 169 and 170** and `START-HERE.md`'s handoff block — read those for
> status, never this file.
>
> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> ⚠️ **This plan is mostly HUMAN-IN-THE-LOOP RULING, not code.** Only Tasks 1 and 8 are code. Tasks 2–7 each end at a gate where **Santiago must approve** before the entry is written. An agent may research and propose; it may not rule. Do not "unblock" a ruling task by deciding it yourself.

**Goal:** Grow the unweighted oracle from 21 to 65 dishes (52 if every name-only dish is retired) using model answers already bought, then run the pre-registered analysis that decides whether `NOBOOST` ships.

**Architecture:** Every new dish becomes a `Draft` in `scripts/unweighted-oracle-build.ts` — a mass band plus a per-100 g composition — and `deriveBands()` computes the four macro bands so nobody hand-writes arithmetic. The build script is made merge-by-name first (Task 1) because today it full-overwrites and would destroy 12 dishes. Scoring is replay-only against archived responses; no API call is made at any point.

**Tech Stack:** Deno + TypeScript. `deno test --allow-all`. USDA FoodData Central (FNDDS / Survey) for compositions.

## Global Constraints

- **API spend: $0.** Every dish in this plan is already enriched in `scripts/fixtures/caches/`. If a step seems to need an API call, the step is wrong — stop and re-read.
- **Production is edge fn `analyze-menu` v32 and does not change.** No prompt, schema, model pin or deploy in this plan.
- **Band tolerance is `BAND_TOLERANCE = 0.20`** (`scripts/unweighted-oracle.ts:52`). Never change it. A benchmark loosened until the score looks good is rigged.
- **Bands are computed by `deriveBands()`, never by hand.** Calories must stay Atwater-consistent with protein/carb/fat.
- **The assumed-ingredient rule** (Santiago, 2026-08-22): include an unstated ingredient only when it is **definitional to what the dish physically is** — never because a sibling dish has it, never because the category typically has it.
- **Price is never evidence of grams.** Not the dish's own price, not price parity with neighbours.
- **Menu text only.** Restaurant Instagram, photos and outside knowledge of the venue are out of scope (`DE CAMARÓN ROKA`'s lettuce was excluded on exactly this ground).
- **`retrieved_at` is the date the FDC record was fetched**, not the date the dish was ruled.
- **Never quote a figure from prose. Re-derive it** with the $0 commands in this plan.

---

## Current state — re-derived 2026-08-22, pin these

All eight arms on the **current 21-dish / 252-point** oracle, via
`deno run --allow-read --allow-env --env-file=.env.local scripts/bench-unweighted.ts 3 <arm> --replay`:

| arm | /252 | arm | /252 |
|---|---|---|---|
| `dual` (shipped v32) | **139** | `NOBOOST` | **149** |
| `dual@r2` | **131** | `NOBOOST@r2` | **150** |
| `baseline` (pre-dual) | **145** | `NOPUSH` | **145** |
| `ROLE` | **137** | `MASSCALL` | **118** |

`sim-arm-significance.ts dual+dual@r2 NOBOOST+NOBOOST@r2` → observed **+14.5**, 95% CI **−5.5 to +38**
(upper bound jitters ±1 between invocations; the lower bound sits at −5.5), NOBOOST ahead in **~90.8%**
of resamples.

## File structure

| file | responsibility | task |
|---|---|---|
| `scripts/unweighted-oracle-build.ts` | modify — merge-by-name instead of overwrite; then gains 44 new `Draft`s | 1, 2, 4–7 |
| `scripts/unweighted-oracle-build_test.ts` | create — proves the merge never drops a dish | 1 |
| `scripts/fixtures/unweighted-oracle.json` | generated output. **Never hand-edited from Task 1 onward.** | 1–7 |
| `docs/superpowers/specs/2026-08-22-oracle-widening-round-2-rulings.md` | create — the per-dish ruling record and the resumable status table | 2–7 |
| `scripts/sim-arm-significance.ts` | modify — add `--drop=<names>` for the pizza sensitivity row | 8 |
| `docs/superpowers/extraction-iteration-ledger.md` | append eval 169 | 9 |
| `docs/superpowers/START-HERE.md` | update the next-action block | 9 |

---

## Task 1: Make the build script merge instead of overwrite

**Why first:** `scripts/unweighted-oracle-build.ts` holds only the original 9 drafts and ends with
`Deno.writeTextFile(OUT, ...)`. Round 1's twelve dishes were written straight into the JSON, so
**running the script as documented today takes the oracle from 21 dishes back to 9 and silently
deletes round 1's work.** Every later task adds drafts to this script, so it must be safe first.

**Files:**
- Modify: `scripts/unweighted-oracle-build.ts` (the `entries`/write block, currently lines 283–303)
- Create: `scripts/unweighted-oracle-build_test.ts`

**Interfaces:**
- Consumes: `deriveBands`, `validateEntry`, `UnweightedEntry` from `./unweighted-oracle.ts` (already imported)
- Produces: `mergeEntries(existing: UnweightedEntry[], built: UnweightedEntry[]): UnweightedEntry[]` — exported, upserts by `name`, preserves the order of `existing` and appends anything new.

- [ ] **Step 1: Write the failing test**

Create `scripts/unweighted-oracle-build_test.ts`:

```typescript
import { assertEquals } from "jsr:@std/assert";
import { mergeEntries } from "./unweighted-oracle-build.ts";
import type { UnweightedEntry } from "./unweighted-oracle.ts";

const entry = (name: string, cal: number): UnweightedEntry => ({
  name,
  menu: "bistro",
  unweighted: true,
  mass_band_g: [100, 200],
  band: {
    calories: [cal, cal],
    protein_g: [1, 1],
    carb_g: [1, 1],
    fat_g: [1, 1],
  },
  assumed: "test",
  source: "USDA FoodData Central",
  retrieved_at: "2026-08-22",
});

Deno.test("mergeEntries keeps dishes that are not in the drafts", () => {
  const merged = mergeEntries([entry("KEEP ME", 1)], [entry("NEW", 2)]);
  assertEquals(merged.map((e) => e.name), ["KEEP ME", "NEW"]);
});

Deno.test("mergeEntries overwrites a dish the drafts redefine, in place", () => {
  const merged = mergeEntries(
    [entry("A", 1), entry("B", 2)],
    [entry("B", 999)],
  );
  assertEquals(merged.map((e) => e.name), ["A", "B"]);
  assertEquals(merged[1].band.calories, [999, 999]);
});

Deno.test("mergeEntries on an empty existing oracle returns the drafts", () => {
  const merged = mergeEntries([], [entry("A", 1)]);
  assertEquals(merged.map((e) => e.name), ["A"]);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `deno test --allow-all scripts/unweighted-oracle-build_test.ts`
Expected: FAIL — `mergeEntries` is not exported by `unweighted-oracle-build.ts`.

- [ ] **Step 3: Add `mergeEntries` and make the script merge**

⚠️ **Everything from line 283 to the end of the file (334) runs at module scope**, including the
`validateEntry` guard, the write, and the summary table printer. Importing the module from a test
would therefore rewrite the real oracle and print a table. The whole tail moves inside `main()`.

In `scripts/unweighted-oracle-build.ts`, replace **lines 283–303** (`const entries: UnweightedEntry[]
= DRAFTS.map(...)` through the `Deno.writeTextFile` call) with the block below, then **indent the
existing lines 305–334 — the `console.log` summary and its `pair` helper — into the same `main()`
body**, unchanged. They already read `entries`, which `main()` still defines.

```typescript
/**
 * Upsert drafts into whatever the oracle already holds, matched on `name`.
 *
 * ponytail: the JSON is the source of truth for dishes this script has no draft
 * for, and the script is the source of truth for the ones it does. A split brain,
 * accepted deliberately - the alternative is back-filling 12 round-1 dishes whose
 * per-100 g compositions were never committed anywhere machine-readable. Collapse
 * it by back-filling those drafts if this file ever needs to be authoritative.
 */
export function mergeEntries(
  existing: UnweightedEntry[],
  built: UnweightedEntry[],
): UnweightedEntry[] {
  const byName = new Map(built.map((e) => [e.name, e]));
  const merged = existing.map((e) => byName.get(e.name) ?? e);
  const seen = new Set(existing.map((e) => e.name));
  return [...merged, ...built.filter((e) => !seen.has(e.name))];
}

const built: UnweightedEntry[] = DRAFTS.map((d) => ({
  name: d.name,
  menu: d.menu,
  unweighted: true,
  mass_band_g: d.mass_band_g,
  band: deriveBands(d.mass_band_g, d.composition),
  assumed: d.assumed,
  source: "USDA FoodData Central",
  retrieved_at: d.retrieved_at ?? RETRIEVED,
}));

async function main() {
  let existing: UnweightedEntry[] = [];
  try {
    existing = JSON.parse(await Deno.readTextFile(OUT));
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  const entries = mergeEntries(existing, built);

  // Unchanged from the original: refuse to write anything invalid. It now checks
  // the MERGED set, so a bad round-1 entry surfaces here too.
  const problems = entries.flatMap((e) =>
    validateEntry(e).map((p) => `${e.name}: ${p}`)
  );
  if (problems.length > 0) {
    console.error("REFUSING TO WRITE - invalid entries:");
    for (const p of problems) console.error(`  ${p}`);
    Deno.exit(1);
  }

  await Deno.writeTextFile(OUT, JSON.stringify(entries, null, 2) + "\n");
  console.log(
    `wrote ${entries.length} dishes to ${OUT} ` +
      `(${existing.length} before, ${built.length} drafts applied)\n`,
  );

  // ...existing lines 305-334 (the summary table and the denominator note) go
  // here verbatim, indented one level. They already read `entries`.
}

if (import.meta.main) await main();
```

Add the optional per-draft date to the `Draft` interface at line 20:

```typescript
  assumed: string;
  /** Overrides RETRIEVED when this draft's FDC records were fetched on a different day. */
  retrieved_at?: string;
```

⚠️ `import.meta.main` is required — without it, importing the module from the test would rewrite the
real oracle as a side effect of running tests.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `deno test --allow-all scripts/unweighted-oracle-build_test.ts`
Expected: 3 passed, 0 failed.

- [ ] **Step 5: Prove the script is now non-destructive on the REAL oracle**

The oracle is committed and clean at this point, so git is the reference — no temp copy needed:

```bash
deno run --allow-write --allow-read scripts/unweighted-oracle-build.ts
git diff --exit-code scripts/fixtures/unweighted-oracle.json && echo "IDENTICAL - safe"
```

Expected: prints `wrote 21 dishes … (21 before, 9 drafts applied)` then `IDENTICAL - safe`.
🛑 **If the diff is non-empty, STOP.** The 9 rebuilt drafts disagree with the committed JSON, which
means either the JSON was hand-edited away from `deriveBands` output or a composition changed. Report
the diff to Santiago; do not "fix" the JSON.

- [ ] **Step 6: Confirm the whole suite is still clean**

Run: `deno test --allow-all scripts/ supabase/`
Expected: **exactly 2 failures** — the two long-standing ones. 3+ means one is yours. Do not pin the
pass count; it grows whenever a test is added.

- [ ] **Step 7: Commit**

```bash
git add scripts/unweighted-oracle-build.ts scripts/unweighted-oracle-build_test.ts
git commit -m "fix: oracle build script merges by name instead of overwriting

It held only the original 9 drafts and ended in a full-file write, so
running it as documented would have silently deleted round 1's twelve
dishes. Now upserts by name and never shrinks the oracle."
```

---

## Task 2: The two class rulings — 28 cm pizza and Nikkori roll

**Files:**
- Create: `docs/superpowers/specs/2026-08-22-oracle-widening-round-2-rulings.md`

**Interfaces:**
- Produces: two approved class rules, reused verbatim by Task 3's tables. A pizza class rule is
  `{ mass_band_g: [400, 450], composition: <per topping class> }`; a roll class rule is
  `{ mass_band_g: <per roll>, base: rice + nori grams }`.

- [ ] **Step 1: Create the rulings doc with the same header discipline as round 1**

Round 1's doc is `docs/superpowers/specs/2026-08-22-oracle-widening-rulings.md`. Open it and copy its
header conventions. The new file starts with:

```markdown
# Oracle widening round 2 — rulings

⚠️ **NOT AN ORACLE FILE.** Markdown in `specs/`, not JSON in `scripts/fixtures/`, so no harness can
read it as scoring data. Nothing here reaches a score until it is a `Draft` in
`scripts/unweighted-oracle-build.ts`.

⚠️ **FDC API, learned in round 1 and still true:** the search endpoint 400s/404s on any form of the
`dataType` parameter — search plain and filter for `Survey (FNDDS)` client-side off each hit's own
`dataType`. And a single 404 on a detail id is NOT evidence the record is gone: round 1 confirmed
transient 404s resolving on retry for ~20 of 51 valid ids. **Retry before concluding a citation is
broken.**

## Status — 44 dishes

| # | dish | menu | pile | ruled? |
|---|---|---|---|---|
```

Fill the table with all 44 rows from §4 of the spec, every `ruled?` cell set to `☐`.
**This table is the resume point.** A session picking this up cold reads it first.

- [ ] **Step 2: Research and propose the PIZZA class rule**

Fetch the FNDDS thin-crust restaurant pizza records and list the whole grid before choosing, exactly
as round 1 did for CAPRICCIOSA. The known anchor, from CAPRICCIOSA's `assumed` field:

- Mass: **400–450 g** for a 28 cm thin-crust pizza — Santiago's 2026-08-13 ruling. The 28 cm comes
  from the section header *"PIZZAS BISTRO — 28 CM"*, which Stage 1 drops; it is menu text.
- Venue: **restaurant**, not frozen. `FDC 2708663` = *thin crust, from restaurant or fast food*,
  meat-and-vegetable topping class, P 11.6 / C 26.6 / F 9.87 per 100 g. Frozen carries 46% more fat.

Propose one composition per topping class present in the 10 pizza-group dishes: **cheese-only**
(5 FORMAGGI, MARGARITA), **meat** (4 STAGIONI, HAWAIANA, PEPPERONI, JAMÓN CON CHAMPIÑONES, CAPRESE),
**meat-and-vegetable** (ITALIANA, MEXICANA), **vegetable** (VEGETARIANA). Cite the FDC id for each.

⚠️ CAPRICCIOSA's entry records **five** prior corrections — more than any other dish. Treat this as
the most error-prone ruling in the batch and show the full grid, not just the chosen cell.

- [ ] **Step 3: Research and propose the ROLL class rule**

Read the three already-ruled rolls' `assumed` fields for the established base:

```bash
python3 -c "
import json
o=json.load(open('scripts/fixtures/unweighted-oracle.json'))
for e in o:
    if e['name'] in ('Salmón Roll','Vegan Roll','Nikkori Maki'):
        print(e['name'], e['mass_band_g']); print(' ', e['assumed'][:600]); print()
"
```

Propose the rice-and-nori base carried over from those three, with fillings swapped per roll from
each dish's *por dentro / por fuera* text. State the mass band per roll and what drives it.

- [ ] **Step 4: Put both class rules to Santiago — GATE**

Present each as one sentence plus the evidence. **Stop. Do not proceed without approval.**
Record the approved wording verbatim in the rulings doc under `## Class rulings`.

- [ ] **Step 5: Commit the class rulings**

```bash
git add docs/superpowers/specs/2026-08-22-oracle-widening-round-2-rulings.md
git commit -m "rulings: round-2 class rules for 28 cm pizza and Nikkori roll"
```

---

## Task 3: The two class tables — 10 pizzas and 7 rolls

**Files:**
- Modify: `docs/superpowers/specs/2026-08-22-oracle-widening-round-2-rulings.md`
- Modify: `scripts/unweighted-oracle-build.ts` (add 17 `Draft`s)

**Interfaces:**
- Consumes: the two class rules approved in Task 2.
- Produces: 17 entries in the oracle. The 3 pizza exceptions are **not** in this task — they are Task 4.

- [ ] **Step 1: Build the pizza table**

One row per pizza: dish · topping class · FDC id · resulting kcal at the 425 g midpoint. Ten rows:
4 STAGIONI, 5 FORMAGGI, CAPRESE, HAWAIANA, ITALIANA, JAMÓN CON CHAMPIÑONES, MARGARITA, MEXICANA,
PEPPERONI, VEGETARIANA. Showing kcal is the point — an assignment error is visible without reading
citations.

⚠️ `JAMÓN CON CHAMPIÑONES` and `PEPPERONI` are **name-only** dishes. They are in this task rather
than Task 5 because the class rule supplies the portion (28 cm is on the section header) and the name
states the topping. Note that reasoning in their rows.

- [ ] **Step 2: Build the roll table**

Seven rows — Avocado, Duplex, Fildeflex, Ipanema Roll, Salmón Samba, Spicy Tuna Roll, Tuna Especial —
each with its *por dentro* and *por fuera* fillings, mass band, and resulting kcal.

- [ ] **Step 3: Put both tables to Santiago — GATE**

**Stop for approval.** Any row he rejects moves to an individual ruling; note the move in the doc.

- [ ] **Step 4: Add the approved drafts to the build script**

Append one `Draft` per approved row to `DRAFTS` in `scripts/unweighted-oracle-build.ts`. Shape,
using an approved pizza as the worked example:

```typescript
  {
    name: "MARGARITA",
    menu: "bistro",
    mass_band_g: [400, 450],
    // FDC <id>, RESTAURANT thin crust, CHEESE topping class - venue and crust
    // match CAPRICCIOSA's ruling; only the topping class differs.
    composition: {
      protein_per_100g: 0,   // <- the approved figure
      carb_per_100g: 0,      // <- the approved figure
      fat_per_100g: 0,       // <- the approved figure
    },
    assumed:
      '"Rebanadas de tomate fresco y albahaca deshidratada." Class ruling: 28 cm ' +
      "thin-crust Bistro pizza, 400-450 g (Santiago 2026-08-13, carried from " +
      "CAPRICCIOSA). 28 cm is on the SECTION HEADER and is dropped by Stage 1. " +
      "Topping class CHEESE per FDC <id>.",
    retrieved_at: "2026-08-22",
  },
```

- [ ] **Step 5: Regenerate and verify the count**

```bash
deno run --allow-write --allow-read scripts/unweighted-oracle-build.ts
```

Expected: `wrote 38 dishes … (21 before, 26 drafts applied)`.

- [ ] **Step 6: Run the guard rail**

```bash
deno run --allow-read --allow-env --env-file=.env.local scripts/bench-unweighted.ts 3 dual --replay
```

Expected: `over 38 of 38 ruled dishes`. 🛑 **If any dish reports as uncovered, STOP** — a name in a
`Draft` does not match the name in the archives. Fix the name, never the archive.

- [ ] **Step 7: Tick the 17 rows in the status table and commit**

```bash
git add scripts/unweighted-oracle-build.ts scripts/fixtures/unweighted-oracle.json \
        docs/superpowers/specs/2026-08-22-oracle-widening-round-2-rulings.md
git commit -m "rulings: 10 pizzas and 7 rolls ruled as classes, oracle 21 -> 38"
```

---

## Task 4: The three pizza exceptions

**Files:**
- Modify: the rulings doc, `scripts/unweighted-oracle-build.ts`

**Interfaces:**
- Consumes: the pizza mass band (400–450 g) from Task 2; only the composition differs.
- Produces: 3 entries. Oracle 38 → 41.

- [ ] **Step 1: Research each one individually**

| dish | menu text | why it leaves the class |
|---|---|---|
| `FLAMENKUCHEN` | *"Base de crema, tocino y cebolla caramelizada."* | **cream base, not tomato** — the class composition assumes tomato sauce |
| `QUESO AZUL` | *"Base de crema, queso azul, espinaca, jamón serrano y laminas de manzana verde."* | **cream base**, plus a fruit component |
| `OSTRICA` | *"Ostión ahumado, tocino y mostaza dijón."* | **smoked oyster and dijon** — no FNDDS pizza topping class covers it |

Each needs its own composition. The 400–450 g mass band still carries over — these are still 28 cm
pizzas — unless the evidence says otherwise; say so explicitly either way.

- [ ] **Step 2: Put the three to Santiago — GATE.** Stop for approval, one dish at a time.

- [ ] **Step 3: Add three `Draft`s**, same shape as Task 3 Step 4.

- [ ] **Step 4: Regenerate and check**

```bash
deno run --allow-write --allow-read scripts/unweighted-oracle-build.ts
deno run --allow-read --allow-env --env-file=.env.local scripts/bench-unweighted.ts 3 dual --replay
```

Expected: `wrote 41 dishes`, then `over 41 of 41 ruled dishes`.

- [ ] **Step 5: Tick the rows and commit**

```bash
git add -A && git commit -m "rulings: the three off-class pizzas, oracle 38 -> 41"
```

---

## Task 5: The 13 name-only answerability verdicts

**Files:**
- Modify: the rulings doc

**Interfaces:**
- Produces: for each of the 13, either a ruling (feeding Tasks 6–7) or a recorded retirement.
  Nothing is written to the oracle in this task.

**Why this is its own task:** all 21 currently-ruled dishes carry a menu description; not one is
name-only. The only name-only dish ever considered, `COLIFLOR ROKA`, was **retired at eval 156** —
Santiago's words, an item that thin *"shouldn't even be considered"*, *unanswerable rather than badly
answered*. Deciding these 13 as a group, before ruling them, keeps that precedent from being eroded
one convenient dish at a time.

- [ ] **Step 1: Apply the test to each of the eleven**

`JAMÓN CON CHAMPIÑONES` and `PEPPERONI` were handled in Task 3 (the class rule supplies the portion),
leaving eleven: `CHAMPIÑONES AL AJILLO`, `PAPAS BRAVAS`, `PARRILLADA VERDURAS` (andaluz);
`CEBOLLAS CAMBRAY`, `CHILE RELLENO`, `ORDEN DE TORTILLAS`, `PAPAS CAMBRAY` (brasero-two);
`Cazuela de Marlín`, `Doblada de Camarón y Marlín`, `Machaca de Marlín c/huevo o verdura`,
`Omelette de Camarón y Marlín` (el-marcos).

The test, one line per dish:

> Does the **name alone** pin both **what is on the plate** and **how much of it**?

Write the verdict and the reason. Worked both ways so the bar is visible:

- `ORDEN DE TORTILLAS` — *"orden de"* is a stated portion convention and a tortilla is one thing.
  **Answerable**, pending the count.
- `PARRILLADA VERDURAS` — "grilled vegetables" names neither which vegetables nor how many.
  **Unanswerable**, retire like COLIFLOR ROKA.

- [ ] **Step 2: Put all eleven verdicts to Santiago as one list — GATE.** Stop for approval.

- [ ] **Step 3: Record every retirement with its reason**

In the rulings doc under `## Retired — unanswerable`, one row each: dish, menu, the reason, the date.
Set those rows' `ruled?` cell to `☠️ retired` in the status table.

🔒 **A retirement is not an early stop.** It removes a dish that cannot be ruled, never one whose
score we dislike, and it is recorded **before that dish is scored**. Retiring a dish after seeing what
it does to the gap would invalidate the whole exercise.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "rulings: answerability verdicts for the 11 name-only dishes"
```

---

## Task 6: The 8 one-offs on `bistro` and `andaluz`

**Files:**
- Modify: the rulings doc, `scripts/unweighted-oracle-build.ts`

**Interfaces:**
- Consumes: Task 5's verdicts (a retired dish is skipped).
- Produces: up to 8 entries. Oracle 41 → up to 49.

**Batched by menu so one photo is researched at a time.**

- [ ] **Step 1: Rule the two bistro pastas**

| dish | menu text |
|---|---|
| `FRADIAVIOLA` | *"Crema de tomate con un toque de chile de árbol, espinacas y queso feta."* |
| `LINGUINNI PARISIENNE` | *"Pimientos, campiñones, jamón en salsa cremosa a base de quesos."* |

Three pastas are already ruled on this menu — `CARBONARA`, `PASTA ESPECIAL`, `FETUCCINI ALFREDO`.
Read their `assumed` fields first and stay consistent with the pasta base they establish:

```bash
python3 -c "
import json
o=json.load(open('scripts/fixtures/unweighted-oracle.json'))
for e in o:
    if e['name'] in ('CARBONARA','PASTA ESPECIAL','FETUCCINI ALFREDO'):
        print(e['name'], e['mass_band_g']); print(' ', e['assumed'][:500]); print()
"
```

⚠️ `ALFREDO PORTOBELLO` carries **the largest open divergence in round 1** — decomposed protein 41.5 g
against an FNDDS composite implying ~50 g of chicken on a 350 g plate, a factor-of-two disagreement on
the dish's headline macro, recorded and unresolved. Do not silently adopt either side as precedent.

- [ ] **Step 2: Rule the andaluz one-offs**

`QUESABONELESS` (*"Dos tortillas de harina, manchego, boneless con salsa al gusto"* — note *"Dos"* is
a stated count), `CROQUETAS DE ABUELA (8 pints.)` (*"Empanizadas y rellenas de jamón serrano, pollo y
queso, en crema bechamel"* — **8 pieces is stated in the name**), `MEDITERRÁNEA` (a salad; four salads
are already ruled on bistro — read them for the lettuce-base convention), plus any of
`CHAMPIÑONES AL AJILLO` / `PAPAS BRAVAS` / `PARRILLADA VERDURAS` that survived Task 5.

- [ ] **Step 3: Put each dish to Santiago individually — GATE.** Stop for approval on each.

- [ ] **Step 4: Add the approved `Draft`s, regenerate, verify**

```bash
deno run --allow-write --allow-read scripts/unweighted-oracle-build.ts
deno run --allow-read --allow-env --env-file=.env.local scripts/bench-unweighted.ts 3 dual --replay
```

Expected: the `wrote N dishes` count matches the status table's ticked rows, and the harness reports
`over N of N ruled dishes` with no uncovered dish.

- [ ] **Step 5: Tick the rows and commit**

```bash
git add -A && git commit -m "rulings: bistro pastas and andaluz one-offs"
```

---

## Task 7: The 16 one-offs on `brasero-two` and `el-marcos`

**Files:**
- Modify: the rulings doc, `scripts/unweighted-oracle-build.ts`

**Interfaces:**
- Consumes: Task 5's verdicts.
- Produces: up to 16 entries, completing the 44. Final oracle **65** if nothing was retired, **52** if
  all eleven name-only dishes were.

- [ ] **Step 1: Rule the brasero-two dishes**

Described: `TACO BRASERO` (*"Taco de carne asada de diezmillo en tortilla de su elección"*),
`TACO TRADICIONAL` (*"Taco de arrachera en tortilla de su elección"*), `TOSTA ATUM`, `TOSTA BRASIL
(picaña)`, `ROLLOS DE CREPA`. Plus any surviving name-only ones.

⚠️ **The two tacos matter more than their count suggests.** `TACO PORCO` (+2.67/draw) and
`TACO EL CAPRICHO` (+2.00) are NOBOOST's two largest wins and both are ~120 g. Two more tacos land
squarely in the bucket driving the effect under test. **Rule them on the menu text alone.** Do not
let the pre-registered prediction — that the gap shrinks — influence a taco's mass band in either
direction. If a taco's band feels like it is being chosen for its effect on the score, stop and hand
it to Santiago with that concern stated.

- [ ] **Step 2: Rule the el-marcos dishes**

`DE INDIO` (*"Dos huevos fritos montados sobre un huarache de maíz con frijoles refritos y bañados con
salsa verde, crema, cebolla y cilantro"* — *"Dos huevos"* is a stated count, and the three ruled
omelettes on this menu already fix egg at 110 g for two eggs), `BISQUETS DEL CENTRO` and
`BISQUETS C/ FRUTOS ROJOS` (both *"(Orden de dos)"* — a stated count of two), plus any surviving
marlín dishes.

⚠️ Round 1 recorded that **all three el-marcos omelettes sit at or above FNDDS's largest published
omelette portion (170 g)** — a systematic tendency an external review flagged. If `Omelette de
Camarón y Marlín` survives Task 5, do not simply extend that pattern; state where its mass comes from.

- [ ] **Step 3: Put each dish to Santiago individually — GATE.**

- [ ] **Step 4: Add the drafts, regenerate, verify final coverage**

```bash
deno run --allow-write --allow-read scripts/unweighted-oracle-build.ts
deno run --allow-read --allow-env --env-file=.env.local scripts/bench-unweighted.ts 3 dual --replay
```

Expected: `over N of N ruled dishes`, N matching the status table exactly, zero uncovered.

- [ ] **Step 5: Every row in the status table is now ticked or retired. Commit**

```bash
git add -A && git commit -m "rulings: brasero-two and el-marcos one-offs — all 44 resolved"
```

---

## Task 8: Add `--drop` to the significance sim

**Files:**
- Modify: `scripts/sim-arm-significance.ts` (the `rows` loop, lines 149–163)
- Create: `scripts/sim-arm-significance_test.ts`

**Interfaces:**
- Produces: `parseDrop(args: string[]): Set<string>` — exported; reads `--drop=A,B,C` and returns the
  names to exclude. Empty set when the flag is absent.

**Why:** 14 dishes sharing one class ruling are not 14 independent dishes, and the bootstrap resamples
dishes as if they were. The sensitivity row re-runs the comparison without them.
⚠️ Existing arg parsing at line 42 is `Deno.args.filter((a) => !a.startsWith("--"))`, so a new `--`
flag will not disturb the two positional arm names.

- [ ] **Step 1: Write the failing test**

Create `scripts/sim-arm-significance_test.ts`:

```typescript
import { assertEquals } from "jsr:@std/assert";
import { parseDrop } from "./sim-arm-significance.ts";

Deno.test("parseDrop returns an empty set when the flag is absent", () => {
  assertEquals(parseDrop(["dual", "NOBOOST"]).size, 0);
});

Deno.test("parseDrop reads a comma-separated list", () => {
  const d = parseDrop(["dual", "NOBOOST", "--drop=MARGARITA,PEPPERONI"]);
  assertEquals([...d].sort(), ["MARGARITA", "PEPPERONI"]);
});

Deno.test("parseDrop trims whitespace and ignores empty entries", () => {
  const d = parseDrop(["--drop=A, B ,"]);
  assertEquals([...d].sort(), ["A", "B"]);
});
```

🛑 The sim runs work at module scope. If importing it from a test executes the whole simulation,
guard the executable part with `if (import.meta.main)` in Step 3 — the same fix Task 1 applies.

- [ ] **Step 2: Run it and confirm it fails**

Run: `deno test --allow-all scripts/sim-arm-significance_test.ts`
Expected: FAIL — `parseDrop` is not exported.

- [ ] **Step 3: Implement**

Add near the top of `scripts/sim-arm-significance.ts`, beside the existing arg handling:

```typescript
/** `--drop=A,B` -> {A, B}. Used for the pizza sensitivity row: dishes sharing one
 *  class ruling are not independent, and the bootstrap resamples dishes. */
export function parseDrop(args: string[]): Set<string> {
  const flag = args.find((a) => a.startsWith("--drop="));
  if (!flag) return new Set();
  return new Set(
    flag.slice("--drop=".length).split(",").map((s) => s.trim()).filter(Boolean),
  );
}
```

Then in the `rows` loop (currently line 150), skip dropped dishes:

```typescript
const dropped = parseDrop(Deno.args);
const rows: Row[] = [];
for (const e of oracle) {
  if (dropped.has(e.name)) continue;
  const da = A.get(e.name)!, db = B.get(e.name)!;
  if (da.length === 0 || db.length === 0) continue;
```

Every `rows.length`-derived figure the sim prints — the `/N` denominators, the bootstrap, the
dishes-needed estimate — then follows automatically.

- [ ] **Step 4: Run the test and confirm it passes**

Run: `deno test --allow-all scripts/sim-arm-significance_test.ts`
Expected: 3 passed.

- [ ] **Step 5: Verify the flag actually changes the denominator**

```bash
deno run --allow-read scripts/sim-arm-significance.ts dual+dual@r2 NOBOOST+NOBOOST@r2 \
  --drop=CAPRICCIOSA
```

Expected: the bootstrap header reads `resamples of 20 dishes`, not 21, and the scale is `/240`.

- [ ] **Step 6: Full suite, then commit**

```bash
deno test --allow-all scripts/ supabase/   # expect exactly 2 failures
git add scripts/sim-arm-significance.ts scripts/sim-arm-significance_test.ts
git commit -m "feat: --drop flag on the significance sim for the pizza sensitivity row"
```

---

## Task 9: Run the pre-registered analysis and write it up

**Files:**
- Modify: `docs/superpowers/extraction-iteration-ledger.md` (append eval 169)
- Modify: `docs/superpowers/START-HERE.md` (replace the eval-168 next-action block)

🔒 **Nothing in this task may be reordered or reinterpreted after seeing a number.** The prediction on
record, from eval 168: **the +14.5 shrinks toward zero.**

- [ ] **Step 1: The guard rail — the 21 original dishes must be unmoved**

```bash
deno run --allow-read scripts/rescore-history.ts
```

then per arm:

```bash
deno run --allow-read --allow-env --env-file=.env.local scripts/bench-unweighted.ts 3 dual --replay
```

Every arm must still report **full coverage**, and each original dish's per-dish points must be
unchanged from the pinned table at the top of this plan (`dual` 139, `dual@r2` 131, `NOBOOST` 149,
`NOBOOST@r2` 150, `baseline` 145, `NOPUSH` 145, `ROLE` 137, `MASSCALL` 118 — those totals will now be
larger because the denominator grew; it is the **original 21 dishes' contributions** that must match).
🛑 If an original dish's score moved, the widening broke something. Stop and diagnose with
`superpowers:systematic-debugging` before reading any headline.

- [ ] **Step 2: The primary verdict**

```bash
deno run --allow-read scripts/sim-arm-significance.ts dual+dual@r2 NOBOOST+NOBOOST@r2
```

Record: observed difference, 95% CI, resample win fraction, leave-one-dish-out. **Whatever it says
stands.** Note the CI upper bound jitters ~±1 between invocations.

- [ ] **Step 3: The pre-registered plate-size split**

Recompute the `<250 g` vs `≥250 g` per-dish means on the full widened set. The 250 g line was fixed
in eval 168 **before** these dishes existed, so this is a genuine out-of-sample test — report it as
one, and report it whichever way it comes out.

- [ ] **Step 4: The pizza sensitivity row**

```bash
deno run --allow-read scripts/sim-arm-significance.ts dual+dual@r2 NOBOOST+NOBOOST@r2 \
  --drop=CAPRICCIOSA,4 STAGIONI,5 FORMAGGI,CAPRESE,HAWAIANA,ITALIANA,JAMÓN CON CHAMPIÑONES,MARGARITA,MEXICANA,PEPPERONI,VEGETARIANA,FLAMENKUCHEN,OSTRICA,QUESO AZUL
```

(Quote the argument if the shell splits on spaces.) Report alongside the primary, never instead of it.

- [ ] **Step 5: The free secondary — `baseline` vs `dual`**

```bash
deno run --allow-read scripts/sim-arm-significance.ts dual+dual@r2 baseline
```

On 21 dishes this reads **baseline +10 on the band metric (72% of resamples) but `dual` better on the
continuous metric (78%), with `dual` significantly better on mass alone (CI excludes zero)** — the
metrics disagree, and `baseline` has only one run against `dual`'s two. It costs nothing to re-run on
the wider set, and it re-tests the pipeline that is actually deployed. **Report it as secondary and
under-powered; do not let it become a headline without its own repeat run.**

- [ ] **Step 6: Apply the pre-committed deploy rule**

> If `NOBOOST` is positive overall **but still negative on plates ≥250 g, it does not ship.** It
> becomes the evidence for an arm that pushes small plates down **and** big plates up.

State the verdict in one sentence and say which branch of the rule produced it.

- [ ] **Step 7: Write eval 169 and update START-HERE**

Ledger entry covering: the final dish count and every retirement with its reason, the guard-rail
result, the primary verdict, the size split, the sensitivity row, the baseline secondary, and the
deploy decision. Then replace START-HERE's eval-168 next-action block with what is now true.

Record whether the eval-168 prediction was right. **A wrong prediction is a result and gets written up
as one** — findings are insights, not rules.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "eval 169: oracle at N dishes, NOBOOST verdict, deploy rule applied"
```

---

## Self-review notes

- **Spec coverage.** §4 dish list → Tasks 2–7. §5 ruling method → Tasks 2–4 (classes) and 6–7
  (one-offs). §6 pre-registered analysis → Task 9 Steps 2–6, with the sensitivity row's tooling in
  Task 8. §7 guard rail → Task 9 Step 1, plus a per-task coverage check after every regeneration.
  §8 cost → the Global Constraints `$0` line.
- **Not in the spec, added here:** Task 1. Discovered while writing this plan — the build script would
  have destroyed round 1's twelve dishes. It is a prerequisite, not scope creep.
- **Not in the spec, added here:** Task 9 Step 5, the `baseline` vs `dual` secondary. Free, and the
  21-dish numbers disagree across metrics, so it is worth carrying rather than discovering later.
- **Known gap, deliberate:** the per-topping-class FDC ids for pizzas and the per-roll mass bands are
  not written here because **they are Santiago's to rule** (Task 2). Every other value in this plan is
  concrete. A task that filled them in would be pre-empting the gate it exists to reach.
