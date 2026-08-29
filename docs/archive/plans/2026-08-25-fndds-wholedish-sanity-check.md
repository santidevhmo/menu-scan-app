# FNDDS whole-dish lookup — sanity check — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find out, before anyone builds anything, whether USDA's published **whole-dish** portion weights could replace or extend `FORM_G`'s 24 hand-written rows — and specifically whether FNDDS publishes a *serving-level* weight for a restaurant dish or only volume measures like "1 cup".

**Architecture:** A read-only offline probe. It reuses `scripts/fndds-resolve.ts` (already written, already carrying four hard-won API rules) to look up one English search term per dish, then compares the published portion weight against the oracle's ruled mass band. No model calls. Nothing enters the scan path.

**Tech Stack:** Deno, TypeScript, the USDA FoodData Central API via the existing cached resolver.

**Spec:** This plan. Background is **eval 178 ①**, **eval 179**, and **eval 180 ⑥/⑦** in `docs/superpowers/extraction-iteration-ledger.md` — read all three before starting, especially eval 179, which rejected a *different* FNDDS shape and must not be mistaken for rejecting this one.

**Cost:** **$0 in model calls.** USDA's API is free. It is rate-limited to 1,000 requests/hour **per IP**, and the resolver caches to `scripts/fixtures/fndds-cache.json`, so a re-run is nearly free.

---

## Global Constraints

- **Zero model calls.** Every dish name is already known. If you find yourself wanting to call GPT, stop — that is Task 4's question, not this plan's.
- **Never put the USDA API in the scan path.** `fndds-resolve.ts:27` and eval 180 ⑦ both say so: ~304 calls per cold scan against a 1,000/hour **per-IP** budget is about three scans an hour for the entire app. This probe is offline table-building only. Production would ship the CC0 bulk file.
- **Write every search term from the dish's NAME and DESCRIPTION only, before looking at its mass band.** Peeking at the band and then picking the term that matches is how a lookup gets fitted to the answer key. This is the same discipline `sim-form-table.ts` documents.
- **Report the portion DESCRIPTION, never just the number.** A record publishing "1 cup, 170 g" and one publishing "1 serving, 340 g" are different findings, and the difference decides whether this idea is viable at all.
- **`--allow-net` is required**; `--env-file=.env.local` is not (no model key needed), but harmless.
- **This plan produces a finding, not a feature.** Nothing here ships. It ends in a ledger entry and a recommendation.

---

## The question, stated so it can come back "no"

`FORM_G` has **24 rows** and sizes **82%** of dishes on menus it was built from, **33%** on menus it has not seen. The proposal is to swap those rows for FNDDS's thousands.

**Three things must all be true for that to work.** The probe tests each, and any one of them failing is a real answer:

| # | Question | How it fails |
|---|---|---|
| **A** | Does FNDDS have a record for the dish at all? | Low coverage → no better than 24 hand rows |
| **B** | Does that record publish a **serving-level** portion, not just "1 cup"? | Volume-only → inherits eval 179's unit problem, where a wrong unit is wrong by an unbounded multiple |
| **C** | When it does, does the weight land in the oracle's ruled mass band? | Out of band → the lookup is worse than the hand table it would replace |

**Pre-committed comparison** — `FORM_G`'s target lands inside the ruled mass band on **48 of 57 (84%)**. Re-derive it with `deno run --allow-read scripts/sim-form-table.ts` before comparing; do not trust the number printed here.

**Proposed bar, subject to Santiago's override:** worth building if B holds on a clear majority of covered dishes **and** C is within ~10 points of 84%. If B fails, the answer is no regardless of A and C, and the write-up should say so in the heading.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `scripts/fixtures/fndds-dish-terms.json` | One English search term per dish, hand-written from name + description. The single input a human supplies. | Create |
| `scripts/probe-fndds-wholedish.ts` | The probe. Reads the terms, resolves each, classifies the portions, scores against the band. | Create |
| `scripts/probe-fndds-wholedish_test.ts` | Unit tests for the one piece of real logic: portion classification. | Create |
| `scripts/fixtures/fndds-cache.json` | The resolver's existing disk cache. Grows. | Modified by running |
| `docs/superpowers/extraction-iteration-ledger.md` | Eval 188 write-up. | Append |

---

### Task 1: Classify a published portion as serving-level or volume-level

This is the only real logic in the probe, so it gets tested first and on its own. Everything else is I/O.

**Files:**
- Create: `scripts/probe-fndds-wholedish.ts`
- Create: `scripts/probe-fndds-wholedish_test.ts`

**Interfaces:**
- Consumes: `Portion` from `./fndds-resolve.ts` — `{ desc: string; grams: number }`.
- Produces: `export type PortionKind = "serving" | "volume" | "piece" | "weight"` and `export function classifyPortion(desc: string): PortionKind`.

- [ ] **Step 1: Write the failing test**

Create `scripts/probe-fndds-wholedish_test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyPortion, bestServingPortion } from "./probe-fndds-wholedish.ts";

Deno.test("a whole-dish serving is recognised as serving-level", () => {
  assertEquals(classifyPortion("1 serving"), "serving");
  assertEquals(classifyPortion("1 order"), "serving");
  assertEquals(classifyPortion("1 plate"), "serving");
  assertEquals(classifyPortion("1 medium pizza (11-12\")"), "serving");
  assertEquals(classifyPortion("1 taco"), "serving");
});

Deno.test("a volume measure is NOT a serving — this is the finding the probe exists for", () => {
  assertEquals(classifyPortion("1 cup"), "volume");
  assertEquals(classifyPortion("1 tablespoon"), "volume");
  assertEquals(classifyPortion("1 fl oz"), "volume");
});

Deno.test("countable units are their own class, not servings", () => {
  assertEquals(classifyPortion("1 slice"), "piece");
  assertEquals(classifyPortion("2 pieces"), "piece");
});

Deno.test("a bare weight carries no portion information", () => {
  assertEquals(classifyPortion("100 g"), "weight");
  assertEquals(classifyPortion("1 oz"), "weight");
});

Deno.test("bestServingPortion prefers a serving over a cup, and divides out a leading count", () => {
  const got = bestServingPortion([
    { desc: "1 cup", grams: 170 },
    { desc: "2 servings", grams: 600 },
  ]);
  assertEquals(got?.kind, "serving");
  assertEquals(got?.gramsPerUnit, 300);
});

Deno.test("bestServingPortion returns null when only volume measures are published", () => {
  assertEquals(
    bestServingPortion([{ desc: "1 cup", grams: 170 }, { desc: "1 tablespoon", grams: 15 }]),
    null,
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run:
```bash
deno test --allow-all scripts/probe-fndds-wholedish_test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Write the minimal implementation**

Create `scripts/probe-fndds-wholedish.ts` with just this at the top for now:

```ts
// $0 SANITY CHECK: could FNDDS's published whole-dish portions replace FORM_G?
//
// ⚠️ THIS IS NOT THE SHAPE EVAL 179 REJECTED. That one DECOMPOSED a dish into
// ingredients and looked each one up, and both its arms lost to FORM. This looks up
// the DISH ITSELF - the shape Menu-Match (WACV 2015) supports and the one FORM
// already implements, just with 24 handwritten rows instead of thousands of
// published ones. Decomposition failing says nothing about it.
//
// ⚠️ NEVER IN THE SCAN PATH. 1,000 req/hour PER IP; a cold scan is ~304 calls.
// Offline probing only - production would ship the CC0 bulk download.
import type { Portion } from "./fndds-resolve.ts";

export type PortionKind = "serving" | "volume" | "piece" | "weight";

// Order matters: "1 medium pizza" must read as a serving before "piece" gets a
// chance at it, and "1 fl oz" must read as volume before "oz" makes it a weight.
const PATTERNS: [PortionKind, RegExp][] = [
  ["serving", /\b(serving|order|plate|meal|entree|sandwich|burrito|taco|pizza|roll|bowl|burger|wrap)\b/],
  ["volume", /\b(cup|tablespoon|tbsp|teaspoon|tsp|fl\.? ?oz|fluid ounce|pint|quart|liter|litre|ml)\b/],
  ["piece", /\b(piece|pieces|slice|slices|pc|each|item|unit|link|patty|leaf|clove|fillet|filet|breast|wing)\b/],
];

/** What KIND of thing a published portion string measures. */
export function classifyPortion(desc: string): PortionKind {
  const d = desc.toLowerCase();
  for (const [kind, re] of PATTERNS) if (re.test(d)) return kind;
  return "weight";
}

export interface ServingPortion {
  desc: string;
  kind: PortionKind;
  gramsPerUnit: number;
}

/**
 * The best serving-level portion a record publishes, or null if it publishes none.
 *
 * A leading count is divided back out - "2 servings, 600 g" is 300 g per serving -
 * the same rule `gramsPerUnit` in fndds-resolve.ts already applies.
 */
export function bestServingPortion(portions: Portion[]): ServingPortion | null {
  for (const p of portions) {
    if (classifyPortion(p.desc) !== "serving") continue;
    const lead = p.desc.trim().match(/^(\d+(?:\.\d+)?)/);
    const count = lead ? parseFloat(lead[1]) : 1;
    if (count > 0) {
      return { desc: p.desc, kind: "serving", gramsPerUnit: p.grams / count };
    }
  }
  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run:
```bash
deno test --allow-all scripts/probe-fndds-wholedish_test.ts
```
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/probe-fndds-wholedish.ts scripts/probe-fndds-wholedish_test.ts
git commit -m "eval 188: portion classifier for the FNDDS whole-dish check"
```

---

### Task 2: Write the search terms by hand, blind to the bands

**Files:**
- Create: `scripts/fixtures/fndds-dish-terms.json`

**Interfaces:**
- Produces: `Record<string, string>` — oracle dish name → English search term.

🔴 **The integrity of the whole probe rests on this task.** Write each term from the dish's **name and description only**. Do not open `unweighted-oracle.json`'s `mass_band_g` or `band` fields while doing it, and do not revise a term after seeing a result.

- [ ] **Step 1: Print the dish names and descriptions, and nothing else**

Run:
```bash
deno run --allow-read --allow-write --allow-net --allow-env \
  --env-file=.env.local scripts/trace-dish.ts --help 2>/dev/null || true
```
Then, to get the list without the bands, run:

```bash
python3 - <<'PY'
import json
o = json.load(open('scripts/fixtures/unweighted-oracle.json'))
for e in o:
    print(f"{e['menu']:12} {e['name']}")
PY
```
Expected: 57 lines, name and menu only. **No band information is printed, deliberately.**

- [ ] **Step 2: Get each dish's printed description from its archived extraction**

Run:
```bash
python3 - <<'PY'
import json, glob
names = {e['name'] for e in json.load(open('scripts/fixtures/unweighted-oracle.json'))}
seen = {}
for f in glob.glob('scripts/fixtures/caches/*.raw.json'):
    try: d = json.load(open(f))
    except Exception: continue
    items = d.get('items') if isinstance(d, dict) else None
    if not isinstance(items, list): continue
    for it in items:
        if isinstance(it, dict) and it.get('name') in names and it['name'] not in seen:
            seen[it['name']] = (it.get('description') or '').replace('\n', ' ')
for n in sorted(names):
    print(f"{n}\n    {seen.get(n, '(no description found)')}\n")
PY
```
Expected: 57 dishes with their printed descriptions.

- [ ] **Step 3: Write the terms file**

Create `scripts/fixtures/fndds-dish-terms.json` mapping every oracle dish name to a plain English search term. Rules, in priority order:

1. **Name the dish, not its ingredients.** `Salmón Roll` → `"sushi roll salmon"`, never `"salmon"`.
2. **Keep the dish's own form word.** `TACO BRASERO` → `"taco beef"`. `ORDEN DE TORTILLAS` → `"corn tortilla"`.
3. **Use the description only to disambiguate the form**, never to add ingredients FNDDS would not index.
4. **If you genuinely cannot name it in English, write `""`.** An empty string is a real, reportable finding — "we could not even form a query" — and is far more useful than a guess. Do not leave a dish out of the file.

Shape:

```json
{
  "JAMÓN CON CHAMPIÑONES": "pizza ham mushroom",
  "Salmón Roll": "sushi roll salmon",
  "ORDEN DE TORTILLAS": "corn tortilla",
  "CHILE RELLENO": "chile relleno",
  "…": "…"
}
```

- [ ] **Step 4: Verify every oracle dish has an entry**

Run:
```bash
python3 - <<'PY'
import json
o = [e['name'] for e in json.load(open('scripts/fixtures/unweighted-oracle.json'))]
t = json.load(open('scripts/fixtures/fndds-dish-terms.json'))
missing = [n for n in o if n not in t]
blank = [n for n, v in t.items() if not v.strip()]
extra = [n for n in t if n not in o]
print('dishes:', len(o), '| terms:', len(t))
print('MISSING:', missing)
print('deliberately blank:', blank)
print('EXTRA (not in oracle):', extra)
PY
```
Expected: `MISSING: []` and `EXTRA: []`. Blanks are allowed and will be reported as uncoverable.

- [ ] **Step 5: Commit**

```bash
git add scripts/fixtures/fndds-dish-terms.json
git commit -m "eval 188: English search terms, written blind to the mass bands"
```

---

### Task 3: Run the probe over the 57 oracle dishes

**Files:**
- Modify: `scripts/probe-fndds-wholedish.ts` (append the runner below the functions from Task 1)

**Interfaces:**
- Consumes: `shortlist(term, n)`, `food(fdcId)`, `preferStandalone(recs)`, `loadCache()`, `saveCache()` from `./fndds-resolve.ts`; `classifyPortion` / `bestServingPortion` from Task 1; the oracle JSON.
- Produces: a printed report and `scripts/fixtures/fndds-wholedish-report.json`.

- [ ] **Step 1: Append the runner**

Add to the bottom of `scripts/probe-fndds-wholedish.ts`:

```ts
import {
  food,
  loadCache,
  preferStandalone,
  saveCache,
  shortlist,
} from "./fndds-resolve.ts";

interface OracleEntry {
  name: string;
  menu: string;
  mass_band_g: [number, number];
}

if (import.meta.main) {
  await loadCache();
  const oracle: OracleEntry[] = JSON.parse(
    await Deno.readTextFile("scripts/fixtures/unweighted-oracle.json"),
  );
  const terms: Record<string, string> = JSON.parse(
    await Deno.readTextFile("scripts/fixtures/fndds-dish-terms.json"),
  );

  const rows: Record<string, unknown>[] = [];
  for (const e of oracle) {
    const term = (terms[e.name] ?? "").trim();
    if (!term) {
      rows.push({ dish: e.name, term: null, outcome: "NO_TERM" });
      continue;
    }
    // Up to 5 candidates, standalone records preferred - constraint 4 in
    // fndds-resolve.ts: "as ingredient" records carry the worse portion table.
    const ids = await shortlist(term, 5);
    const recs = preferStandalone(
      (await Promise.all(ids.map((id) => food(id))))
        .filter((r): r is NonNullable<typeof r> => r !== null),
    );
    if (recs.length === 0) {
      rows.push({ dish: e.name, term, outcome: "NO_RECORD" });
      continue;
    }
    const head = recs[0];
    const serving = bestServingPortion(head.portions);
    const [lo, hi] = e.mass_band_g;
    rows.push({
      dish: e.name,
      term,
      fdcId: head.fdcId,
      record: head.desc,
      dataType: head.dataType,
      // EVERY published portion, not just the chosen one. The DISTRIBUTION of
      // portion kinds is the finding; a single number would hide it.
      portions: head.portions.map((p) => ({
        desc: p.desc,
        grams: p.grams,
        kind: classifyPortion(p.desc),
      })),
      serving_g: serving?.gramsPerUnit ?? null,
      serving_desc: serving?.desc ?? null,
      band: [lo, hi],
      outcome: !serving
        ? "VOLUME_ONLY"
        : serving.gramsPerUnit >= lo && serving.gramsPerUnit <= hi
        ? "IN_BAND"
        : serving.gramsPerUnit < lo
        ? "UNDER"
        : "OVER",
    });
    console.error(`  ${e.name} -> ${head.desc}`);
  }
  await saveCache();

  const tally: Record<string, number> = {};
  for (const r of rows) tally[String(r.outcome)] = (tally[String(r.outcome)] ?? 0) + 1;

  console.log("\n=== FNDDS WHOLE-DISH SANITY CHECK ===");
  console.log(`${oracle.length} oracle dishes\n`);
  console.log("A. COVERAGE — did we get a record at all?");
  console.log(`   no search term written : ${tally.NO_TERM ?? 0}`);
  console.log(`   no record found        : ${tally.NO_RECORD ?? 0}`);
  const withRec = oracle.length - (tally.NO_TERM ?? 0) - (tally.NO_RECORD ?? 0);
  console.log(`   record found           : ${withRec}`);

  console.log("\nB. UNITS — does it publish a SERVING, or only volume measures?");
  console.log(`   volume/piece only      : ${tally.VOLUME_ONLY ?? 0}`);
  const withServing = withRec - (tally.VOLUME_ONLY ?? 0);
  console.log(`   serving-level portion  : ${withServing}`);
  console.log("   🔑 If this line is small, the idea inherits eval 179's unit problem.");

  console.log("\nC. ACCURACY — of those, how many land in the ruled mass band?");
  console.log(`   IN BAND                : ${tally.IN_BAND ?? 0}`);
  console.log(`   under                  : ${tally.UNDER ?? 0}`);
  console.log(`   over                   : ${tally.OVER ?? 0}`);
  console.log(
    `\n   FNDDS in-band rate     : ${tally.IN_BAND ?? 0}/${withServing}` +
      ` of dishes it can size`,
  );
  console.log("   COMPARE: FORM_G is 48/57. Re-derive with sim-form-table.ts.");

  await Deno.writeTextFile(
    "scripts/fixtures/fndds-wholedish-report.json",
    JSON.stringify(rows, null, 2) + "\n",
  );
  console.log("\nwrote scripts/fixtures/fndds-wholedish-report.json");
}
```

- [ ] **Step 2: Type-check**

Run:
```bash
deno check scripts/probe-fndds-wholedish.ts
```
Expected: clean.

- [ ] **Step 3: Run it**

Run:
```bash
deno run --allow-read --allow-write --allow-net --allow-env \
  --env-file=.env.local scripts/probe-fndds-wholedish.ts
```
Expected: progress lines on stderr, then the A/B/C report.

⚠️ **The API 404s on roughly 41% of attempts even with the quota untouched** — it is flaky, not rate-limited (`fndds-resolve.ts` constraint 1). The resolver already retries. If the run dies outright, re-run it; the cache makes the second attempt much faster and cheaper.

- [ ] **Step 4: Re-derive the comparison number**

Run:
```bash
deno run --allow-read scripts/sim-form-table.ts
```
Expected: a line reading `form target lands INSIDE the ruled mass band: 48/57 (84%)`. **Use whatever this prints, not the number in this plan** — if the oracle moved, the plan's figure is stale.

- [ ] **Step 5: Commit**

```bash
git add scripts/probe-fndds-wholedish.ts scripts/fixtures/fndds-wholedish-report.json \
  scripts/fixtures/fndds-cache.json
git commit -m "eval 188: FNDDS whole-dish sanity check over the 57 oracle dishes"
```

---

### Task 4: Answer the question the oracle cannot — off-corpus coverage

The 57 oracle dishes are mostly the ones `FORM_G` was built from, so Task 3 measures the *on-corpus* case, where `FORM_G` already scores 82%. **The real prize is the 82 off-corpus dishes with no row at all.** Those have no ruled band, so only coverage (A) and units (B) can be measured — and that is exactly the number that decides whether this fixes the 33%.

**Files:**
- Modify: `scripts/probe-fndds-wholedish.ts` (add an `--offcorpus` mode)

- [ ] **Step 1: See which dishes have no row today**

Run:
```bash
deno run --allow-read scripts/sim-form-coverage-split.ts
```
Expected: the SEEN/UNSEEN table, `UNSEEN 122 candidates, 82 with no row (67%)`, and a sample of genuinely uncovered food. Note the sample names.

- [ ] **Step 2: Extend the probe with an off-corpus mode**

The runner in Task 3 keys off the oracle. Add a branch at the top of the `import.meta.main` block:

```ts
  const offCorpus = Deno.args.includes("--offcorpus");
```

and, when `offCorpus` is true, build the dish list from `sim-form-coverage-split.ts`'s own UNSEEN menus instead of the oracle, with `mass_band_g` set to `[0, 0]` so every outcome falls to `VOLUME_ONLY` or a band comparison that section C then suppresses. Print sections A and B only, and print this line in place of section C:

```ts
  console.log("\nC. ACCURACY — NOT MEASURABLE off-corpus: these dishes have no ruled band.");
  console.log("   Report coverage and units only. Do not invent a band to score against.");
```

Reuse the same search-term rule from Task 2: write terms blind, from name and description.

- [ ] **Step 3: Run it**

Run:
```bash
deno run --allow-read --allow-write --allow-net --allow-env \
  --env-file=.env.local scripts/probe-fndds-wholedish.ts --offcorpus
```
Expected: coverage and units for the uncovered dishes.

🔑 **This is the headline number of the whole plan.** `FORM_G` sizes 33% of these. If FNDDS gives a serving-level portion for materially more of them, the idea is worth building. If it does not, the answer is no and the phase saves a large amount of work.

- [ ] **Step 4: Commit**

```bash
git add scripts/probe-fndds-wholedish.ts scripts/fixtures/fndds-cache.json
git commit -m "eval 188: off-corpus coverage mode for the FNDDS check"
```

---

### Task 5: Write it up honestly, including the ways it could be wrong

**Files:**
- Modify: `docs/superpowers/extraction-iteration-ledger.md` (append `## Eval 188`)
- Modify: `docs/superpowers/START-HERE.md` (the FNDDS block — it currently says whole-dish lookup is **NEVER TESTED**; that line must change)

- [ ] **Step 1: Append the ledger entry**

Put the verdict in the heading itself, as every recent entry does. Include:

- The A / B / C numbers for the 57 oracle dishes.
- The A / B numbers for the off-corpus dishes, **labelled as the headline**.
- `FORM_G`'s 48/57 as re-derived in Task 3 Step 4, for comparison.
- How many dishes got `NO_TERM` — a lookup nobody can write a query for is a real limit.
- The **portion-kind distribution**: how often FNDDS publishes only "1 cup".

- [ ] **Step 2: State the four caveats, whatever the result**

These must appear in the entry. Each one is a way a good-looking number could still be wrong:

1. **Hand-written terms are a CEILING, not a shipping estimate.** In production a model must produce the term, and eval 180 ⑥ measured that **27% of shortlist heads come back as a prepared dish where a plain ingredient was asked for**. Automated retrieval will score below this probe. Say by how much you cannot know yet.
2. **`preferStandalone` picks the top candidate; nobody checked it is the right dish.** Recall@5 was measured at 89.6% for *ingredients* — never for whole dishes.
3. **A per-serving weight is still a US restaurant survey figure.** Eval 181 hit exactly this with pizza and Santiago's ruling was "USDA for the ratios, my level for the absolute." The same discount question applies here and is unresolved.
4. **This measures the lookup, not a pipeline.** No arm was run and no score moved. Do not report a `/684` figure.

- [ ] **Step 3: Correct the "NEVER TESTED" claim in `START-HERE.md`**

Find the table row reading `WHOLE-DISH lookup … ❌ NEVER TESTED` and replace `NEVER TESTED` with the eval-188 result. **Leave eval 179's DECOMPOSE row untouched** — it is a different shape and is still rejected.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/extraction-iteration-ledger.md docs/superpowers/START-HERE.md
git commit -m "docs: eval 188 — FNDDS whole-dish lookup, sanity check result"
```

- [ ] **Step 5: Report to Santiago**

Lead with B — whether FNDDS publishes servings or only cups — because that alone can kill the idea. Then off-corpus coverage against the 33%. Then the on-corpus accuracy against 84%. State the recommendation as one of exactly three: **build it**, **don't build it**, or **the probe could not tell, and here is the one thing that would**.

---

## Self-Review

**Spec coverage.** The three questions A/B/C each have a task producing a number: Task 3 covers all three on-corpus, Task 4 covers A and B off-corpus (and explicitly refuses to fake C), Task 5 records them with the caveats that stop a ceiling being read as a shipping estimate. The units question (B) — the one most likely to kill the idea and the one nobody has asked — is tested first, in Task 1, before any network call.

**Placeholders.** None. Every code block is complete and runnable. Task 4 Step 2 describes a branch rather than pasting the whole runner again; that is the one place an implementer must write code from a description, and it is a ~10-line branch over a function they just wrote in Task 3.

**Type consistency.** `Portion` is imported as `{ desc: string; grams: number }`, matching `fndds-resolve.ts:38-41`. `shortlist(term, n)` returns `Promise<number[]>`, `food(id)` returns `Promise<FnddsRecord | null>` — hence the null filter before `preferStandalone`, which takes and returns `FnddsRecord[]`. `bestServingPortion` returns `ServingPortion | null` and every caller checks for null.

**One thing I deliberately did not do.** I did not have the probe fall back to a "1 cup × assumed cups per serving" estimate when no serving portion exists. That fallback would manufacture coverage out of an assumption, and it is precisely the unbounded-multiple error eval 179 measured — the model said "4 slices serrano ham", FNDDS's slice is 60 g, and 240 g of ham went on a pizza. `VOLUME_ONLY` must stay a reported failure, not be quietly repaired.
