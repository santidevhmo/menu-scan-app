# Unweighted-Dish Oracle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give six dishes that print no weight a USDA-traceable macro **band**, and a runner that
scores today's pipeline against those bands out of 24 points — so a fix for the unweighted-mass
defect can be graded instead of guessed at.

**Architecture:** Band scoring is a new pure module beside the existing percentage scorer, never
inside it — `macro-score.ts` is the frozen single source of the 96-point weighted number and its
header forbids re-implementation. The bands live in their own fixture file, so the weighted oracle
is untouched and the two scores can never be averaged. The runner reuses the existing
`toMacroValues` converter and the existing enrichment call path, because this repo has already been
burned by two measurement paths disagreeing (lesson 28).

**Tech Stack:** Deno + TypeScript, USDA FoodData Central REST API, `USDA_FDC_API_KEY` from
gitignored `.env.local`.

**Source spec:** `docs/superpowers/specs/2026-08-11-unweighted-dish-oracle-design.md`

## Global Constraints

- **Santiago approves every oracle entry** — each FDC ID, edible grams, raw/cooked/prepared basis,
  and both band endpoints — before it is written. An agent may list candidates and may **never**
  select silently. (2026-08-07 oracle design, §Workflow.)
- **`scripts/fixtures/*` are ORACLE files.** Never edit one without an explicit ruling from
  Santiago. Never run `deno fmt` over a glob that can reach `scripts/fixtures/`. (AGENTS.md)
- **The unweighted score is reported separately from the 96-point weighted score and never merged
  into it.** (spec §2)
- **Never quote a single run as quality — report the RANGE across runs.** (AGENTS.md)
- **Every live model call needs separate cost approval and every raw response is archived,
  including passing ones.** (AGENTS.md) Live FDC calls are free and need no approval.
- **No production behaviour changes in this plan.** No edits to `supabase/functions/`, no deploys.
  Arms B and A run as probe scripts only. (spec §10)
- Macro bands are **derived** from the mass band times the reviewed composition — never chosen
  independently. (spec §5)
- Tests touch neither the network nor the API key. (spec §8)

---

### Task 1: Band scoring

**Files:**
- Create: `scripts/macro-band-score.ts`
- Test: `scripts/macro-band-score_test.ts`

**Interfaces:**
- Consumes: `MacroValues` and `FieldVerdict` from `scripts/macro-score.ts` (already exported;
  `MacroValues` is `{calories, protein_g, carb_g, fat_g}`, all `number`).
- Produces, for Tasks 2, 5 and 6:
  - `type MacroBand = readonly [low: number, high: number]`
  - `type MacroBands = Record<keyof MacroValues, MacroBand>`
  - `scoreItemAgainstBand(bands: MacroBands, model: MacroValues): { fields: FieldVerdict[]; pass: boolean }`

- [ ] **Step 1: Write the failing test**

Create `scripts/macro-band-score_test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { type MacroBands, scoreItemAgainstBand } from "./macro-band-score.ts";

// The Capricciosa's real band, from the 2026-08-11 spec.
const CAPRICCIOSA: MacroBands = {
  calories: [1250, 1490],
  protein_g: [50, 64],
  carb_g: [112, 140],
  fat_g: [63, 80],
};

Deno.test("a value inside its band passes", () => {
  const { fields, pass } = scoreItemAgainstBand(CAPRICCIOSA, {
    calories: 1380,
    protein_g: 57,
    carb_g: 126,
    fat_g: 72,
  });
  assertEquals(pass, true);
  assertEquals(fields.filter((f) => f.pass).length, 4);
});

Deno.test("the endpoints are INSIDE the band", () => {
  // A band is inclusive. An estimate that lands exactly on a published USDA
  // portion weight must not fail for landing on it.
  const low = scoreItemAgainstBand(CAPRICCIOSA, {
    calories: 1250,
    protein_g: 50,
    carb_g: 112,
    fat_g: 63,
  });
  const high = scoreItemAgainstBand(CAPRICCIOSA, {
    calories: 1490,
    protein_g: 64,
    carb_g: 140,
    fat_g: 80,
  });
  assertEquals(low.pass, true);
  assertEquals(high.pass, true);
});

Deno.test("one unit outside either endpoint fails that field only", () => {
  const { fields, pass } = scoreItemAgainstBand(CAPRICCIOSA, {
    calories: 1249,
    protein_g: 57,
    carb_g: 126,
    fat_g: 81,
  });
  assertEquals(pass, false);
  assertEquals(fields.find((f) => f.field === "calories")?.pass, false);
  assertEquals(fields.find((f) => f.field === "fat_g")?.pass, false);
  assertEquals(fields.find((f) => f.field === "protein_g")?.pass, true);
  assertEquals(fields.find((f) => f.field === "carb_g")?.pass, true);
});

Deno.test("what the app actually returned for the Capricciosa fails every field", () => {
  // 517 kcal / P26 C57 F21 - the defect that motivated this oracle. If any
  // widening of a band ever lets this pass, the band is wrong.
  const { fields, pass } = scoreItemAgainstBand(CAPRICCIOSA, {
    calories: 517,
    protein_g: 26,
    carb_g: 57,
    fat_g: 21,
  });
  assertEquals(pass, false);
  assertEquals(fields.filter((f) => f.pass).length, 0);
});

Deno.test("a broken answer is never forgiven", () => {
  // Same rule as the percentage scorer: a negative or non-finite number does
  // not describe food, so no band contains it.
  for (const bad of [-1, NaN, Infinity]) {
    const { fields } = scoreItemAgainstBand(CAPRICCIOSA, {
      calories: bad,
      protein_g: 57,
      carb_g: 126,
      fat_g: 72,
    });
    const calories = fields.find((f) => f.field === "calories")!;
    assertEquals(calories.pass, false, `${bad} must fail`);
    assertEquals(calories.band, "invalid");
  }
});

Deno.test("the reported oracle value is the band midpoint", () => {
  // FieldVerdict carries a single number. The midpoint is the only honest
  // one-number summary of a band, and deltaPct is measured against it.
  const { fields } = scoreItemAgainstBand(CAPRICCIOSA, {
    calories: 1370,
    protein_g: 57,
    carb_g: 126,
    fat_g: 72,
  });
  const calories = fields.find((f) => f.field === "calories")!;
  assertEquals(calories.oracle, 1370);
  assertEquals(calories.deltaPct, 0);
  assertEquals(calories.band, "1250-1490");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test --allow-read scripts/macro-band-score_test.ts`
Expected: FAIL — module `./macro-band-score.ts` not found.

- [ ] **Step 3: Write the implementation**

Create `scripts/macro-band-score.ts`:

```ts
// Pure band scoring for dishes that print NO weight. No I/O, no network.
//
// Why this is not in macro-score.ts: that module is the single source of the
// 96-point weighted number and its header forbids a second copy of that rule.
// This is a DIFFERENT rule for a DIFFERENT set of dishes. Where a weighted dish
// has an oracle value and a tolerance, an unweighted dish has a band, because
// nobody printed its mass and the USDA sources disagree by ~12%.
import type { FieldVerdict, MacroValues } from "./macro-score.ts";

export type MacroBand = readonly [low: number, high: number];
export type MacroBands = Record<keyof MacroValues, MacroBand>;

const FIELDS: (keyof MacroValues)[] = [
  "calories",
  "protein_g",
  "carb_g",
  "fat_g",
];

function scoreField(
  field: keyof MacroValues,
  [low, high]: MacroBand,
  modelValue: number,
): FieldVerdict {
  const midpoint = (low + high) / 2;

  // A negative or non-finite prediction is a broken answer, not a near miss.
  if (!Number.isFinite(modelValue) || modelValue < 0) {
    return {
      field,
      oracle: midpoint,
      model: modelValue,
      deltaPct: null,
      band: "invalid",
      pass: false,
      absolute: true,
    };
  }

  return {
    field,
    oracle: midpoint,
    model: modelValue,
    deltaPct: midpoint === 0 ? null : (modelValue - midpoint) / midpoint,
    band: `${low}-${high}`,
    // Inclusive: an estimate landing exactly on a published USDA portion
    // weight must not fail for landing on it.
    pass: modelValue >= low && modelValue <= high,
    absolute: false,
  };
}

/** Scores one unweighted dish. Passes only when all four fields are in band. */
export function scoreItemAgainstBand(
  bands: MacroBands,
  model: MacroValues,
): { fields: FieldVerdict[]; pass: boolean } {
  const fields = FIELDS.map((field) =>
    scoreField(field, bands[field], model[field])
  );
  return { fields, pass: fields.every((f) => f.pass) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `deno test --allow-read scripts/macro-band-score_test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/macro-band-score.ts scripts/macro-band-score_test.ts
git commit -m "feat(bench): band scoring for dishes that print no weight"
```

---

### Task 2: Band derivation and entry validation

Macro bands must be *derived* from the mass band, never typed by hand — that is what keeps them
Atwater-consistent and never wider than the mass uncertainty behind them.

**Files:**
- Create: `scripts/unweighted-oracle.ts`
- Test: `scripts/unweighted-oracle_test.ts`

**Interfaces:**
- Consumes from Task 1: `MacroBand`, `MacroBands`.
- Produces, for Tasks 4 and 5:
  - `type Composition = { protein_per_100g: number; carb_per_100g: number; fat_per_100g: number }`
  - `deriveBands(massBand: MacroBand, composition: Composition): MacroBands`
  - `type UnweightedEntry = { name: string; menu: string; unweighted: true; mass_band_g: MacroBand; band: MacroBands; assumed: string; source: string; retrieved_at: string }`
  - `validateEntry(entry: unknown): string[]` — returns a list of problems, empty when valid

- [ ] **Step 1: Write the failing test**

Create `scripts/unweighted-oracle_test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { deriveBands, validateEntry } from "./unweighted-oracle.ts";

// FDC 170715: pizza, meat and vegetable topping, regular crust.
const PIZZA = { protein_per_100g: 11.3, carb_per_100g: 25.1, fat_per_100g: 14.4 };

Deno.test("macro bands are the mass band times the composition", () => {
  const bands = deriveBands([470, 530], PIZZA);
  assertEquals(bands.protein_g, [53, 60]);
  assertEquals(bands.carb_g, [118, 133]);
  assertEquals(bands.fat_g, [68, 76]);
  // Calories by Atwater from the same endpoints, never from a separate source.
  assertEquals(bands.calories, [1293, 1459]);
});

Deno.test("a derived band is never meaningfully wider than its mass band", () => {
  // The whole point of deriving: uncertainty comes from the mass and nowhere
  // else, so no macro may claim more spread than the mass it came from.
  //
  // The 2% allowance is ROUNDING, not slack in the rule. Protein derives to
  // 53.11-59.89 and rounds to 53-60, whose ratio (1.1321) sits just above the
  // mass ratio (1.1277). Rounding to whole grams is what a human reads; the
  // rule is about the derivation, not the display.
  const massRatio = 530 / 470;
  const bands = deriveBands([470, 530], PIZZA);
  for (const [low, high] of Object.values(bands)) {
    if (low === 0) continue;
    assertEquals(
      high / low <= massRatio * 1.02,
      true,
      `band ${low}-${high} spreads wider than the mass band`,
    );
  }
});

Deno.test("a zero-composition field derives a zero band", () => {
  const bands = deriveBands([100, 200], {
    protein_per_100g: 0,
    carb_per_100g: 10,
    fat_per_100g: 0,
  });
  assertEquals(bands.protein_g, [0, 0]);
  assertEquals(bands.fat_g, [0, 0]);
});

const VALID = {
  name: "CAPRICCIOSA",
  menu: "bistro",
  unweighted: true,
  mass_band_g: [470, 530],
  band: deriveBands([470, 530], PIZZA),
  assumed: "28 cm stated on the menu; mass from FDC 173292 and 172047 scaled by area.",
  source: "USDA FoodData Central",
  retrieved_at: "2026-08-11",
};

Deno.test("a complete entry validates", () => {
  assertEquals(validateEntry(VALID), []);
});

Deno.test("a band whose low exceeds its high is rejected", () => {
  const problems = validateEntry({ ...VALID, mass_band_g: [530, 470] });
  assertEquals(problems.length > 0, true);
  assertEquals(problems.some((p) => p.includes("mass_band_g")), true);
});

Deno.test("non-positive endpoints are rejected", () => {
  assertEquals(validateEntry({ ...VALID, mass_band_g: [0, 530] }).length > 0, true);
  assertEquals(validateEntry({ ...VALID, mass_band_g: [-1, 530] }).length > 0, true);
});

Deno.test("an unweighted entry may not carry a printed weight", () => {
  // If a dish prints its weight it belongs in the 96-point weighted oracle,
  // where the mass is a fact rather than a band.
  const problems = validateEntry({ ...VALID, printed_total_g: 500 });
  assertEquals(problems.some((p) => p.includes("printed")), true);
});

Deno.test("a missing provenance field is rejected", () => {
  for (const key of ["assumed", "source", "retrieved_at", "menu", "name"]) {
    const entry = { ...VALID } as Record<string, unknown>;
    delete entry[key];
    assertEquals(
      validateEntry(entry).length > 0,
      true,
      `missing ${key} must be rejected`,
    );
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `deno test --allow-read scripts/unweighted-oracle_test.ts`
Expected: FAIL — module `./unweighted-oracle.ts` not found.

- [ ] **Step 3: Write the implementation**

Create `scripts/unweighted-oracle.ts`:

```ts
// The unweighted-dish oracle: dishes whose MASS nobody printed, so truth is a
// band rather than a number. Benchmark-only - never imported by the app, never
// called at runtime.
import type { MacroBand, MacroBands } from "./macro-band-score.ts";

export interface Composition {
  protein_per_100g: number;
  carb_per_100g: number;
  fat_per_100g: number;
}

export interface UnweightedEntry {
  name: string;
  menu: string;
  unweighted: true;
  mass_band_g: MacroBand;
  band: MacroBands;
  assumed: string;
  source: string;
  retrieved_at: string;
}

const round = (value: number) => Math.round(value);

/**
 * Macro bands come from the MASS band times the reviewed composition, never
 * from a second source. Uncertainty therefore has exactly one origin - how much
 * food is on the plate - and calories stay Atwater-consistent with the three
 * macros at both endpoints.
 */
export function deriveBands(
  [lowG, highG]: MacroBand,
  composition: Composition,
): MacroBands {
  const at = (grams: number) => {
    const protein = grams * composition.protein_per_100g / 100;
    const carb = grams * composition.carb_per_100g / 100;
    const fat = grams * composition.fat_per_100g / 100;
    return {
      protein,
      carb,
      fat,
      calories: 4 * protein + 4 * carb + 9 * fat,
    };
  };
  const low = at(lowG);
  const high = at(highG);
  return {
    calories: [round(low.calories), round(high.calories)],
    protein_g: [round(low.protein), round(high.protein)],
    carb_g: [round(low.carb), round(high.carb)],
    fat_g: [round(low.fat), round(high.fat)],
  };
}

const REQUIRED_TEXT = ["name", "menu", "assumed", "source", "retrieved_at"];

/** Returns every problem with an entry. An empty list means it is valid. */
export function validateEntry(entry: unknown): string[] {
  const problems: string[] = [];
  if (typeof entry !== "object" || entry === null) return ["entry is not an object"];
  const e = entry as Record<string, unknown>;

  for (const key of REQUIRED_TEXT) {
    if (typeof e[key] !== "string" || (e[key] as string).trim() === "") {
      problems.push(`${key} is missing`);
    }
  }
  if ("printed_total_g" in e && e.printed_total_g != null) {
    problems.push(
      "an unweighted entry carries printed_total_g - it belongs in the weighted oracle",
    );
  }

  const mass = e.mass_band_g;
  if (!Array.isArray(mass) || mass.length !== 2) {
    problems.push("mass_band_g must be a [low, high] pair");
  } else {
    const [low, high] = mass as number[];
    if (!(low > 0) || !(high > 0)) problems.push("mass_band_g endpoints must be positive");
    else if (low > high) problems.push("mass_band_g low exceeds high");
  }

  const band = e.band as Record<string, unknown> | undefined;
  for (const field of ["calories", "protein_g", "carb_g", "fat_g"]) {
    const pair = band?.[field];
    if (!Array.isArray(pair) || pair.length !== 2) {
      problems.push(`band.${field} must be a [low, high] pair`);
      continue;
    }
    const [low, high] = pair as number[];
    if (low < 0 || high < 0) problems.push(`band.${field} endpoints must not be negative`);
    else if (low > high) problems.push(`band.${field} low exceeds high`);
  }
  return problems;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `deno test --allow-read scripts/unweighted-oracle_test.ts`
Expected: PASS, 8 tests. If the derived numbers in Step 1 differ by a unit, fix the TEST to the
derived value only after checking the arithmetic by hand — never loosen `deriveBands` to match.

- [ ] **Step 5: Commit**

```bash
git add scripts/unweighted-oracle.ts scripts/unweighted-oracle_test.ts
git commit -m "feat(bench): derive unweighted macro bands from the mass band"
```

---

### Task 3: The FDC candidate lister

The human gate. This script **writes nothing** — it prints candidates for Santiago to rule on.

**Files:**
- Create: `scripts/unweighted-candidates.ts`

**Interfaces:**
- Consumes: `USDA_FDC_API_KEY` from `.env.local`.
- Produces: printed candidates only. No file writes, no oracle mutation.

- [ ] **Step 1: Write the script**

Create `scripts/unweighted-candidates.ts`:

```ts
// Lists USDA candidates for the six unweighted dishes so Santiago can rule on
// each. Writes NOTHING - selection is a human decision (2026-08-07 oracle
// design, Workflow step 2). Free: FDC calls cost nothing.
//
//   deno run --allow-net --allow-env --env-file=.env.local scripts/unweighted-candidates.ts
//   deno run ... scripts/unweighted-candidates.ts "pizza cheese"   # ad-hoc query

const key = Deno.env.get("USDA_FDC_API_KEY");
if (!key) throw new Error("USDA_FDC_API_KEY is required in .env.local");
const base = "https://api.nal.usda.gov/fdc/v1";

const NUTRIENTS: Record<number, string> = {
  1008: "kcal",
  1003: "protein",
  1005: "carb",
  1004: "fat",
};

/** The six dishes of the 2026-08-11 spec, with the queries that describe them. */
const DISHES: { dish: string; menu: string; queries: string[] }[] = [
  { dish: "CAPRICCIOSA (28 cm pizza)", menu: "bistro", queries: ["pizza meat and vegetable topping regular crust", "pizza cheese regular crust"] },
  { dish: "ENSALADA GRIEGA", menu: "bistro", queries: ["greek salad", "feta cheese", "cucumber raw", "olives ripe canned"] },
  { dish: "CARBONARA", menu: "bistro", queries: ["spaghetti cooked", "cream sauce", "bacon cooked", "parmesan cheese"] },
  { dish: "Salmon Roll", menu: "nikkori", queries: ["sushi roll", "rice white cooked", "salmon raw", "cream cheese"] },
  { dish: "Tiras de Pollo", menu: "andaluz", queries: ["chicken breast breaded fried strips", "potatoes french fried"] },
  { dish: "Coliflor Roka", menu: "andaluz", queries: ["cauliflower cooked roasted", "cauliflower raw"] },
];

async function search(query: string) {
  const res = await fetch(`${base}/foods/search?api_key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query,
      dataType: ["Foundation", "SR Legacy", "Survey (FNDDS)"],
      pageSize: 6,
    }),
  });
  if (!res.ok) throw new Error(`FDC ${res.status} for "${query}"`);
  const json = await res.json();
  return (json.foods ?? []) as {
    fdcId: number;
    description: string;
    dataType: string;
    foodNutrients: { nutrientId: number; value: number }[];
  }[];
}

/** Portion weights matter as much as composition: mass is what we are missing. */
async function portions(fdcId: number) {
  const res = await fetch(`${base}/food/${fdcId}?api_key=${key}`);
  if (!res.ok) return [];
  const food = await res.json();
  // deno-lint-ignore no-explicit-any
  return (food.foodPortions ?? []).map((p: any) =>
    `${p.amount ?? ""} ${p.measureUnit?.name ?? ""} ${p.modifier ?? p.portionDescription ?? ""} = ${p.gramWeight} g`
  );
}

const adHoc = Deno.args[0];
const targets = adHoc
  ? [{ dish: `ad-hoc: ${adHoc}`, menu: "-", queries: [adHoc] }]
  : DISHES;

for (const { dish, menu, queries } of targets) {
  console.log(`\n${"=".repeat(70)}\n${dish}  [${menu}]`);
  for (const query of queries) {
    console.log(`\n  query: "${query}"`);
    for (const food of await search(query)) {
      const macros: Record<string, number> = {};
      for (const n of food.foodNutrients ?? []) {
        const label = NUTRIENTS[n.nutrientId];
        if (label) macros[label] = n.value;
      }
      if (macros.kcal === undefined) continue;
      console.log(
        `    ${String(food.fdcId).padEnd(8)} ${food.dataType.padEnd(15)} ` +
          `${macros.kcal} kcal P${macros.protein} C${macros.carb} F${macros.fat} /100g` +
          `  ${food.description.slice(0, 60)}`,
      );
      for (const portion of await portions(food.fdcId)) {
        console.log(`        portion: ${portion}`);
      }
    }
  }
}

console.log(
  `\n${"=".repeat(70)}\nNothing was written. Santiago selects the FDC ID, the edible grams,\n` +
    `the raw/cooked/prepared basis, and both mass-band endpoints for each dish.`,
);
```

- [ ] **Step 2: Run it and check it prints candidates with portion weights**

Run: `deno run --allow-net --allow-env --env-file=.env.local scripts/unweighted-candidates.ts`
Expected: six blocks of candidates, each row carrying per-100 g macros, and portion lines showing
gram weights. Confirm no file was written: `git status --short` shows only the new script.

- [ ] **Step 3: Commit**

```bash
git add scripts/unweighted-candidates.ts
git commit -m "feat(bench): list USDA candidates for the six unweighted dishes"
```

- [ ] **Step 4: STOP — present the candidates to Santiago**

Present, per dish: the proposed FDC record, its per-100 g macros, the proposed mass band with the
derivation (portion weight, or area-scaled reference, or recipe sum), and the resulting macro bands
from `deriveBands`. **Do not proceed to Task 4 without a per-dish ruling.** This is the gate the
2026-08-07 design exists to enforce.

---

### Task 4: Write the approved oracle

Runs **only** after Task 3's gate. Six approvals, six entries.

**Files:**
- Create: `scripts/fixtures/unweighted-oracle.json`
- Create: `scripts/build-unweighted-oracle.ts`

**Interfaces:**
- Consumes from Task 2: `deriveBands`, `validateEntry`, `UnweightedEntry`.
- Produces for Task 5: `scripts/fixtures/unweighted-oracle.json`, an array of `UnweightedEntry`.

- [ ] **Step 1: Write the builder**

Create `scripts/build-unweighted-oracle.ts`. It holds the APPROVED recipes as data — one object per
dish, filled in from Santiago's rulings — fetches each FDC record once to freeze `per_100g`, derives
the bands, validates, and writes the file. The recipe list below is the shape; the values are filled
from the approval, and the `composition` of a multi-ingredient dish is the recipe-weighted average
its ingredients produce.

```ts
// Writes scripts/fixtures/unweighted-oracle.json from APPROVED recipes.
// Never run before Santiago has ruled on every dish (2026-08-07 oracle design).
//
//   deno run --allow-net --allow-env --allow-write --env-file=.env.local \
//     scripts/build-unweighted-oracle.ts
import { deriveBands, type UnweightedEntry, validateEntry } from "./unweighted-oracle.ts";
import type { MacroBand } from "./macro-band-score.ts";

interface ApprovedRecipe {
  name: string;
  menu: string;
  /** [low, high] grams for the whole dish, with its derivation in `assumed`. */
  mass_band_g: MacroBand;
  /** FDC IDs whose per-100 g composition, weighted by `grams`, describes the dish. */
  ingredients: { fdc_id: number; grams: number; basis: "raw" | "cooked" | "prepared" }[];
  assumed: string;
}

// APPROVED BY SANTIAGO — one entry per dish, filled from the Task 3 ruling.
const APPROVED: ApprovedRecipe[] = [];

if (APPROVED.length === 0) {
  throw new Error(
    "APPROVED is empty. Fill it from Santiago's per-dish ruling before running.",
  );
}

const key = Deno.env.get("USDA_FDC_API_KEY");
if (!key) throw new Error("USDA_FDC_API_KEY is required in .env.local");

const NUTRIENT: Record<string, number> = {
  protein_per_100g: 1003,
  carb_per_100g: 1005,
  fat_per_100g: 1004,
};

async function compositionOf(recipe: ApprovedRecipe) {
  const totals = { protein_per_100g: 0, carb_per_100g: 0, fat_per_100g: 0 };
  const totalGrams = recipe.ingredients.reduce((sum, i) => sum + i.grams, 0);
  if (totalGrams <= 0) throw new Error(`${recipe.name}: ingredient grams sum to 0`);

  for (const ingredient of recipe.ingredients) {
    const res = await fetch(
      `https://api.nal.usda.gov/fdc/v1/food/${ingredient.fdc_id}?api_key=${key}`,
    );
    if (!res.ok) throw new Error(`FDC ${res.status} for ${ingredient.fdc_id}`);
    const food = await res.json();
    for (const [field, id] of Object.entries(NUTRIENT)) {
      // deno-lint-ignore no-explicit-any
      const nutrient = (food.foodNutrients ?? []).find((n: any) =>
        (n.nutrient?.id ?? n.nutrientId) === id
      );
      const per100 = nutrient?.amount ?? nutrient?.value;
      if (per100 === undefined) {
        throw new Error(`${ingredient.fdc_id} is missing nutrient ${field}`);
      }
      // Contribution of this ingredient to the DISH's per-100 g composition.
      totals[field as keyof typeof totals] += per100 * ingredient.grams / totalGrams;
    }
  }
  return totals;
}

const entries: UnweightedEntry[] = [];
for (const recipe of APPROVED) {
  const composition = await compositionOf(recipe);
  const entry: UnweightedEntry = {
    name: recipe.name,
    menu: recipe.menu,
    unweighted: true,
    mass_band_g: recipe.mass_band_g,
    band: deriveBands(recipe.mass_band_g, composition),
    assumed: recipe.assumed,
    source: "USDA FoodData Central",
    retrieved_at: new Date().toISOString().slice(0, 10),
  };
  const problems = validateEntry(entry);
  if (problems.length > 0) {
    throw new Error(`${recipe.name}: ${problems.join("; ")}`);
  }
  entries.push(entry);
  console.log(
    `${recipe.name.padEnd(28)} ${entry.mass_band_g[0]}-${entry.mass_band_g[1]} g  ` +
      `${entry.band.calories[0]}-${entry.band.calories[1]} kcal`,
  );
}

await Deno.writeTextFile(
  "scripts/fixtures/unweighted-oracle.json",
  JSON.stringify(entries, null, 2) + "\n",
);
console.log(`\nwrote ${entries.length} entries`);
```

- [ ] **Step 2: Fill `APPROVED` from the ruling and run it**

Run: `deno run --allow-net --allow-env --allow-write --env-file=.env.local scripts/build-unweighted-oracle.ts`
Expected: six lines, one per dish, then `wrote 6 entries`.

- [ ] **Step 3: Read the written file and check it against the ruling**

Run: `deno run --allow-read scripts/build-unweighted-oracle.ts --help` is NOT a thing; instead open
`scripts/fixtures/unweighted-oracle.json` and confirm each `assumed` names its FDC records and its
mass derivation, and that each band matches what Santiago approved. Do **not** run `deno fmt` over
`scripts/fixtures/`.

- [ ] **Step 4: Commit**

```bash
git add scripts/fixtures/unweighted-oracle.json scripts/build-unweighted-oracle.ts
git commit -m "feat(bench): the six approved unweighted-dish bands"
```

---

### Task 5: The baseline runner and its 24-point score

**Files:**
- Create: `scripts/unweighted-measure.ts`

**Interfaces:**
- Consumes: `scoreItemAgainstBand` (Task 1), the oracle file (Task 4), `toMacroValues` from
  `scripts/macro-measure.ts` (already exported), and `callGptEnrich` from
  `supabase/functions/analyze-menu/enrich.ts` — the same call path the weighted runner uses.
- Produces: a printed 24-point score and an archived raw response per draw.

- [ ] **Step 1: Write the runner**

Create `scripts/unweighted-measure.ts`:

```ts
// Scores the deployed pipeline against the unweighted-dish bands, out of 24.
//
// This number is reported BESIDE the 96-point weighted score and never merged
// into it: averaging them would hide the very defect this oracle exists to
// expose (spec 2026-08-11, section 2).
//
// It reuses toMacroValues and the enrichment call path rather than
// re-implementing either - two measurement paths that disagree is a mistake
// this repo has already paid for (lesson 28).
//
//   deno run --allow-net --allow-env --allow-read --allow-write \
//     --env-file=.env.local scripts/unweighted-measure.ts [draws]
import { scoreItemAgainstBand } from "./macro-band-score.ts";
import { toMacroValues } from "./macro-measure.ts";
import { callGptEnrich } from "../supabase/functions/analyze-menu/enrich.ts";
import type { UnweightedEntry } from "./unweighted-oracle.ts";

const oracle: UnweightedEntry[] = JSON.parse(
  await Deno.readTextFile("scripts/fixtures/unweighted-oracle.json"),
);
const draws = Number(Deno.args[0] ?? 3);

// The dishes are sent exactly as the menu prints them - name, description,
// price, category - so the run measures the production pipeline and not a
// hand-tuned payload.
const menuItems: Record<string, { name: string; description: string; price: number | null; category: string }> =
  JSON.parse(await Deno.readTextFile("scripts/fixtures/unweighted-items.json"));

const apiKey = Deno.env.get("OPENAI_API_KEY");
if (!apiKey) throw new Error("OPENAI_API_KEY is required in .env.local");

const perDraw: number[] = [];
for (let draw = 0; draw < draws; draw++) {
  // callGptEnrich(items, apiKey, model?) - the same entry point the weighted
  // runner uses, so both scores come from one measurement path.
  const items = oracle.map((entry) => menuItems[entry.name]);
  const response = await callGptEnrich(items, apiKey);
  await Deno.writeTextFile(
    `scripts/fixtures/caches/unweighted-baseline-d${draw}.raw.json`,
    JSON.stringify(response, null, 2) + "\n",
  );

  let points = 0;
  console.log(`\n=== draw ${draw + 1} of ${draws}`);
  for (const entry of oracle) {
    // Pair BY NAME, never by position: one reordering and every score silently
    // lands on the wrong dish (lesson from macro-measure.ts).
    // deno-lint-ignore no-explicit-any
    const item = (response.items ?? []).find((i: any) => i.name === entry.name);
    if (!item) {
      console.log(`  ${entry.name.padEnd(28)} MISSING from the response`);
      continue;
    }
    const { fields, pass } = scoreItemAgainstBand(entry.band, toMacroValues(item));
    points += fields.filter((f) => f.pass).length;
    console.log(
      `  ${entry.name.padEnd(28)} ${pass ? "PASS" : "fail"}  ` +
        fields.map((f) => `${f.field}=${Math.round(f.model)}[${f.band}]${f.pass ? "" : "*"}`).join(" "),
    );
  }
  perDraw.push(points);
  console.log(`  draw score: ${points}/24`);
}

console.log(
  `\nUNWEIGHTED SCORE: ${Math.min(...perDraw)}-${Math.max(...perDraw)} / 24 across ${draws} draws.`,
);
console.log("Reported separately from the 96-point weighted score. Never averaged with it.");
```

- [ ] **Step 2: Create the item payload file**

`scripts/fixtures/unweighted-items.json` maps each oracle `name` to the item exactly as extraction
produced it. Take the four fields verbatim from the archived extraction for that menu — for the
Capricciosa that is `{"name": "CAPRICCIOSA", "description": "Jamón serrano, alcachofa, aceituna
negra y champiñón.", "price": 262, "category": "food"}`. Do not paraphrase a description: the
description is the model's only evidence.

- [ ] **Step 3: STOP — get cost approval, then run**

State the estimate (~$0.10 for three draws of six items) and wait. Then run:
`deno run --allow-net --allow-env --allow-read --allow-write --env-file=.env.local scripts/unweighted-measure.ts 3`
Expected: three draws, each printing six dishes and a score out of 24, then a RANGE.

- [ ] **Step 4: Commit the runner and the archived responses**

```bash
git add scripts/unweighted-measure.ts scripts/fixtures/unweighted-items.json scripts/fixtures/caches/unweighted-baseline-d*.raw.json
git commit -m "feat(bench): baseline unweighted score against the bands"
```

---

### Task 6: The B and A probe arms

Probes only. `supabase/functions/` is not touched and nothing is deployed.

**Files:**
- Create: `scripts/probe-unweighted-arms.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces: a per-arm score range for baseline, B and A.

**Why this task's code is written later, and is not a placeholder:** arm A sends the anchor prompt,
whose exact text lives on the parked `feat/unweighted-portion-anchor` branch, and arm B's payload
shape depends on what the baseline run shows. Writing that code now would be inventing a prompt
before reading the baseline. The arm DEFINITIONS below are fixed and are what the code must
implement.

- [ ] **Step 1: Write the probe**

Create `scripts/probe-unweighted-arms.ts`. It scores three arms over the same six dishes:

- **baseline** — the items exactly as Task 5 sends them.
- **B** — the same items with the menu-stated size appended to the description, which is what a
  size-capturing extraction would produce. For the Capricciosa the description gains ` (28 cm)`;
  the other five dishes have no printed size and are sent unchanged, which is the point: B can only
  move one dish.
- **A** — the six items sent with the anchor prompt, which asks for a `typical_total_g` for the
  whole dish. Weighted items are absent from this run entirely, which is exactly the property A
  claims: an item that prints a weight never sees this prompt and so cannot regress.

Each arm runs three draws, archives every raw response to
`scripts/fixtures/caches/unweighted-<arm>-d<n>.raw.json`, and scores with `scoreItemAgainstBand`.
Print one table: arm, score range out of 24, and which dishes changed verdict against baseline.

- [ ] **Step 2: STOP — get cost approval**

State the estimate (~$0.30 for all nine calls) and wait for explicit approval before running.

- [ ] **Step 3: Run and report**

Report the RANGE per arm, never a single draw, and name any dish whose verdict differs between
arms. A dish that passes in one draw and fails in another is a finding about variance, not a score.

- [ ] **Step 4: Commit and record**

```bash
git add scripts/probe-unweighted-arms.ts scripts/fixtures/caches/unweighted-*.raw.json
git commit -m "feat(bench): B and A measured against the unweighted bands"
```

Then append a ledger entry to `docs/superpowers/stage2-macro-benchmark.md` recording the baseline
range, each arm's range, the per-dish verdicts, and — explicitly — what the result does NOT license.
If neither arm clears the bands, say so plainly: that is the finding that the mass problem is not
solvable at the prompt layer, and it is more valuable than a marginal win.

---

## Verification checklist

| Check | Command | Expected |
|---|---|---|
| Band scoring | `deno test --allow-read scripts/macro-band-score_test.ts` | 6 passed |
| Derivation + validation | `deno test --allow-read scripts/unweighted-oracle_test.ts` | 8 passed |
| Nothing production changed | `git diff origin/main --stat -- supabase/ src/` | empty |
| Weighted score untouched | `deno test --allow-all scripts/macro-measure_test.ts` | passes as before |
| Oracle validates | every entry returns `[]` from `validateEntry` | no problems |
