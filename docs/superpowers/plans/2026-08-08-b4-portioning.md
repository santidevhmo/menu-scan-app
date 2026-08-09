# B4 Portioning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the model fitting gram numbers to a printed weight; have it state a conventional serving per ingredient and let code do the fitting.

**Architecture:** The model gains three fields — an item-level `printed_total_g` it reads off the menu, and per-ingredient `within_printed_weight` and `typical_serving_g`. A new pure function `resolveGrams` scales the servings tagged inside the printed weight to that weight and passes accompaniments through untouched. `sumIngredientMacros` prices the resolved grams exactly as it does today. Per-100 g composition is untouched, so iter-b4-001 reads as a clean A/B against iter-b13-001.

**Tech Stack:** Deno, TypeScript (strict), OpenAI `gpt-4o-2024-08-06` structured output with `strict: true` JSON schema, `deno test` with `https://deno.land/std@0.168.0/testing/asserts.ts`.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-08-b4-portioning-design.md`. Approved by Santiago 2026-08-08.
- **Branch:** `worktree-stage2-macro-benchmark`. Never commit this phase's work to `main`.
- **Never `git add` a directory.** Name every file explicitly on every `git add`.
- **Never run `deno fmt` over a glob that can include `scripts/fixtures/`.**
- **Never use bare `git stash` / `git stash pop`** — the stack is shared across worktrees.
- **Test suite command is `deno test --allow-all scripts/ supabase/`.** A bare `deno test` fails on a pre-existing unrelated `@/types/scan` path-alias error in `src/`.
- **Known-good baseline is `1 failed`, and that failure must be `scripts/tile-cut_test.ts` only.** It hardcodes a path outside the repo and cannot affect macros. Any *other* failure is yours.
- **No food, dish or cuisine name may appear in step 2 of `ENRICH_PROMPT`.** `enrich_test.ts` fails the build if one does. Step 1 is not covered by that guard but the same discipline applies — this prompt ships to every menu on earth.
- **Property order in `ENRICH_SCHEMA_OPENAI` is load-bearing.** Strict-mode output is emitted in schema order, which is the model's chain of thought. Do not reorder existing keys.
- **Strict mode only emits `required` fields.** Every new field must be listed in `required` or it will be silently absent at runtime.
- **Do not deploy.** Nothing in this phase has beaten the baseline and nothing ships. Task 6 runs the benchmark only.
- **Model pinning is fixed:** `gpt-4o-2024-08-06`, `temperature: 0`, `seed: 17`. Do not change any of them.

---

### Task 1: `resolveGrams` — the scaling rule, as a pure function

**Files:**
- Modify: `supabase/functions/analyze-menu/enrich.ts` (add exported function + extend the `EnrichedItem` interface)
- Test: `supabase/functions/analyze-menu/enrich_test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `resolveGrams(ingredients: EnrichedItem["ingredients"], printedTotalG?: number | null): number[]` — one gram figure per ingredient, in input order. Task 2 uses it inside `sumIngredientMacros`; Task 4 uses it in the portion scorer.

- [ ] **Step 1: Extend the ingredient type**

In `enrich.ts`, replace the `ingredients` member of `EnrichedItem` and add `printed_total_g`:

```ts
export interface EnrichedItem extends ExtractedItem {
  printed_total_g: number | null;
  ingredients: {
    name: string;
    category: IngredientCategory;
    within_printed_weight: boolean;
    typical_serving_g: number;
    protein_per_100g: number;
    carb_per_100g: number;
    fat_per_100g: number;
  }[];
  protein_g: number;
  carb_g: number;
  fat_g: number;
  estimated_calories: number;
  confidence: "high" | "medium" | "low";
  allergens: string[];
}
```

**This breaks compilation until Steps 2–3 below.** Deno type-checks a whole test file before running any filter, so the repo must be made to compile inside this same task or none of its tests can run. Exactly two places construct an ingredient literal — `fallbackEnriched` and `enrich_test.ts` — and both are fixed below. `index.ts` and `bench-macros.ts` only read the type and are unaffected here. `src/types/scan.ts` declares its own separate `EnrichedItem` for the client; it is unrelated and must not be touched.

- [ ] **Step 2: Fix `fallbackEnriched` so the module compiles**

In `enrich.ts`, add the new field to the fallback item:

```ts
    category: src.category ?? "other",
    printed_total_g: null,
    ingredients: [],
```

- [ ] **Step 3: Rename the fields in the existing test fixtures**

These are forced by the type change, and they are a pure rename — with no printed total passed, `resolveGrams` returns servings unchanged, so **every expected number below stays exactly as it is today.** That is the point: this task changes what the field means, not what the arithmetic does.

In `enrich_test.ts`, update the `enriched()` helper:

```ts
const enriched = (name: string): EnrichedItem => ({
  ...extracted(name),
  printed_total_g: null,
  ingredients: [{
    name: "x",
    category: "protein",
    within_printed_weight: true,
    typical_serving_g: 100,
    protein_per_100g: 31,
    carb_per_100g: 0,
    fat_per_100g: 3.6,
  }],
  protein_g: 10,
  carb_g: 5,
  fat_g: 3,
  estimated_calories: 100,
  confidence: "high",
  allergens: [],
});
```

And the two `sumIngredientMacros` tests that build ingredients literally — rename `grams` to `typical_serving_g` and add `within_printed_weight: true` to each entry, leaving every assertion untouched:

```ts
Deno.test("sumIngredientMacros prices composition at each ingredient's weight", () => {
  const got = sumIngredientMacros([
    // Per 100 g, so the 150 g second ingredient must contribute 1.5x its stated
    // numbers. Drop the scaling and protein comes out 34, not 35.
    { name: "a", category: "protein", within_printed_weight: true, typical_serving_g: 100, protein_per_100g: 31, carb_per_100g: 0, fat_per_100g: 3.6 },
    { name: "b", category: "carb", within_printed_weight: true, typical_serving_g: 150, protein_per_100g: 2.7, carb_per_100g: 28, fat_per_100g: 0.3 },
  ]);

  assertEquals(got.protein_g, 35); // 31 + 4.05
  assertEquals(got.carb_g, 42); // 0 + 42
  assertEquals(got.fat_g, 4); // 3.6 + 0.45
  // Atwater on the unrounded sums: 4*35.05 + 4*42 + 9*4.05
  assertEquals(got.estimated_calories, 345);
});

Deno.test("sumIngredientMacros rounds to whole grams and calories", () => {
  const got = sumIngredientMacros([
    { name: "a", category: "fat", within_printed_weight: true, typical_serving_g: 10, protein_per_100g: 12.4, carb_per_100g: 3.1, fat_per_100g: 24.6 },
    { name: "b", category: "veg", within_printed_weight: true, typical_serving_g: 10, protein_per_100g: 1.1, carb_per_100g: 2.4, fat_per_100g: 0.7 },
  ]);

  // 1.35 -> 1, 0.55 -> 1, 2.53 -> 3; calories from the UNROUNDED sums so the
  // total never drifts from what the parts actually add up to.
  assertEquals(got.protein_g, 1);
  assertEquals(got.carb_g, 1);
  assertEquals(got.fat_g, 3);
  assertEquals(got.estimated_calories, Math.round(4 * 1.35 + 4 * 0.55 + 9 * 2.53));
});
```

The third, `"sumIngredientMacros returns zeros for an empty ingredient list"`, needs no change.

The B12 test `"every ingredient carries per-100g composition, not an amount"` asserts `protein_g`/`carb_g`/`fat_g` are absent from the ingredient schema. It still passes — leave it exactly as it is.

- [ ] **Step 4: Write the failing tests**

Append to `enrich_test.ts`, and add `resolveGrams` to the import list at the top of the file:

```ts
Deno.test("resolveGrams fits the printed weight and leaves accompaniments alone (B4)", () => {
  // The Salmone case. Its menu prints 200g for the plate, but the baguette is
  // served alongside and sits OUTSIDE that weight - the oracle's total is 245 g.
  // Scaling every ingredient to 200 would pull the baguette inside and collapse
  // the dish, destroying a judgment the model already gets right.
  const got = resolveGrams(
    [
      { name: "plate a", category: "protein", within_printed_weight: true, typical_serving_g: 100, protein_per_100g: 0, carb_per_100g: 0, fat_per_100g: 0 },
      { name: "plate b", category: "veg", within_printed_weight: true, typical_serving_g: 150, protein_per_100g: 0, carb_per_100g: 0, fat_per_100g: 0 },
      { name: "side", category: "carb", within_printed_weight: false, typical_serving_g: 50, protein_per_100g: 0, carb_per_100g: 0, fat_per_100g: 0 },
    ],
    200,
  );

  // Inside sums to 250, printed is 200, so the scale is 0.8 - applied to the two
  // plate items only. The side keeps its stated serving.
  assertEquals(got, [80, 120, 50]);
  assertEquals(got[0] + got[1], 200);
});

Deno.test("resolveGrams passes servings through when no weight is printed (B4)", () => {
  const got = resolveGrams(
    [
      { name: "a", category: "protein", within_printed_weight: true, typical_serving_g: 140, protein_per_100g: 0, carb_per_100g: 0, fat_per_100g: 0 },
      { name: "b", category: "veg", within_printed_weight: true, typical_serving_g: 60, protein_per_100g: 0, carb_per_100g: 0, fat_per_100g: 0 },
    ],
    null,
  );

  assertEquals(got, [140, 60]);
});

Deno.test("resolveGrams does not divide by zero when nothing is inside (B4)", () => {
  // The retry path backfills dropped items with an empty ingredient list, and a
  // dish can legitimately be all-accompaniment. Either must not produce NaN.
  assertEquals(resolveGrams([], 200), []);
  assertEquals(
    resolveGrams(
      [{ name: "side", category: "carb", within_printed_weight: false, typical_serving_g: 45, protein_per_100g: 0, carb_per_100g: 0, fat_per_100g: 0 }],
      200,
    ),
    [45],
  );
});
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `deno test --allow-all supabase/functions/analyze-menu/enrich_test.ts --filter "resolveGrams"`
Expected: FAIL. Two reasons at once, both fixed by Step 6: `resolveGrams` is not exported yet, and `sumIngredientMacros` still reads `i.grams`, which Step 1 removed from the type. Deno type-checks the whole file before running any filter, so this surfaces as a compile error rather than an assertion failure — that is the expected red.

- [ ] **Step 6: Implement `resolveGrams`**

Add to `enrich.ts`, directly above `sumIngredientMacros`:

```ts
/**
 * Per-ingredient grams. The model states a conventional serving for each
 * ingredient; we fit the ones the menu's printed weight covers to that weight
 * and let accompaniments through untouched.
 *
 * B4: the model used to pick gram numbers that had to sum to the printed
 * weight - constrained arithmetic, and it solved it by rounding. Across five
 * archived runs every gram it emitted was a multiple of 5 and CESAR's
 * displacement sat at exactly 20.0% in all 15 draws, never once moving. Taking
 * the fitting away is the same move as B10 (we do the addition) and B12 (we do
 * the multiplication).
 */
export function resolveGrams(
  ingredients: EnrichedItem["ingredients"],
  printedTotalG?: number | null,
): number[] {
  const inside = ingredients.reduce(
    (sum, i) => i.within_printed_weight ? sum + (i.typical_serving_g ?? 0) : sum,
    0,
  );
  // No printed weight, or nothing tagged inside it, means there is nothing to
  // fit to and the model's own servings stand. Requiring inside > 0 is also what
  // keeps an empty ingredient list from producing NaN.
  const scale = printedTotalG && inside > 0 ? printedTotalG / inside : 1;

  return ingredients.map((i) =>
    (i.typical_serving_g ?? 0) * (i.within_printed_weight ? scale : 1)
  );
}
```

Then rewrite `sumIngredientMacros` to price the resolved grams. It must change in this task, not a later one: it currently reads `i.grams`, which no longer exists on the type, so the module will not compile until it does. Its new second parameter is optional and defaults to no scaling, so `enrichBatch` keeps compiling untouched — Task 2 wires the real value in.

```ts
export function sumIngredientMacros(
  ingredients: EnrichedItem["ingredients"],
  printedTotalG?: number | null,
): Pick<
  EnrichedItem,
  "protein_g" | "carb_g" | "fat_g" | "estimated_calories"
> {
  const grams = resolveGrams(ingredients, printedTotalG);
  let protein = 0, carb = 0, fat = 0;
  ingredients.forEach((i, idx) => {
    // B12: per-100 g composition x portion. The model states what the food IS;
    // the multiplication is ours. B4: and so is the portion.
    const share = grams[idx] / 100;
    protein += (i.protein_per_100g ?? 0) * share;
    carb += (i.carb_per_100g ?? 0) * share;
    fat += (i.fat_per_100g ?? 0) * share;
  });
  return {
    protein_g: Math.round(protein),
    carb_g: Math.round(carb),
    fat_g: Math.round(fat),
    // Atwater on the UNROUNDED sums, so calories never drift from the parts.
    estimated_calories: Math.round(4 * protein + 4 * carb + 9 * fat),
  };
}
```

Also add one test proving the printed weight actually reaches the macros, not just `resolveGrams`:

```ts
Deno.test("sumIngredientMacros prices the SCALED grams, not the raw servings (B4)", () => {
  // Servings sum to 250 inside a printed 200, so every inside ingredient is
  // priced at 0.8x what it stated. Without the scaling this returns 62.
  const got = sumIngredientMacros(
    [
      { name: "a", category: "protein", within_printed_weight: true, typical_serving_g: 100, protein_per_100g: 20, carb_per_100g: 0, fat_per_100g: 0 },
      { name: "b", category: "carb", within_printed_weight: true, typical_serving_g: 150, protein_per_100g: 28, carb_per_100g: 0, fat_per_100g: 0 },
    ],
    200,
  );

  // 80 g x 20/100 + 120 g x 28/100 = 16 + 33.6 = 49.6 -> 50
  assertEquals(got.protein_g, 50);
});
```

- [ ] **Step 7: Run the whole enrich test file to verify it passes**

Run: `deno test --allow-all supabase/functions/analyze-menu/enrich_test.ts`
Expected: PASS — the 3 new `resolveGrams` tests plus every pre-existing test, unchanged. The schema tests still pass because this task has not touched the schema; that lands in Task 2.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/analyze-menu/enrich.ts supabase/functions/analyze-menu/enrich_test.ts
git commit -m "feat: B4 resolveGrams - fit servings to the printed weight in code"
```

---

### Task 2: Wire the schema, prompt and summation

**Files:**
- Modify: `supabase/functions/analyze-menu/enrich.ts` (prompt step 1, `ENRICH_INGREDIENT_PROPS`, item schema, `enrichBatch`)
- Test: `supabase/functions/analyze-menu/enrich_test.ts`

**Interfaces:**
- Consumes: `sumIngredientMacros(ingredients, printedTotalG?)` from Task 1, already accepting the optional second argument.
- Produces: nothing new in code. It makes the three new fields — `printed_total_g`, `within_printed_weight`, `typical_serving_g` — actually reach the model, which every later task depends on.

- [ ] **Step 1: Rewrite step 1 of `ENRICH_PROMPT`**

Replace the whole `1. …` line. The old text ended `…prefer printed weights over guesses.`; the new text asks for the printed weight as a field instead of as a basis for guessing:

```
1. Give "printed_total_g": the weight printed on the menu for this item — e.g. (280gr), 200g — or null when the menu prints none. Then list the most likely ingredients. If the description names them, use them; otherwise infer from the name and category. Tag each ingredient: protein | carb | fat | veg | other. Set "within_printed_weight" to false for anything the menu presents as served alongside the item rather than as part of it, because a printed weight normally describes the item itself and not what accompanies it. Give "typical_serving_g": what a normal restaurant serving of that ingredient is when it appears in this role, whether as the centrepiece, as a sauce or dressing, or as a garnish. Give the conventional serving for the ingredient itself — these are rescaled to the printed weight afterwards, so they do not need to add up to anything.
```

Leave steps 2 and 3 and the trailing paragraph byte-for-byte unchanged.

- [ ] **Step 2: Update the ingredient schema properties**

In `ENRICH_INGREDIENT_PROPS`, replace the `grams` entry with the two new fields, keeping them in the same position so the chain-of-thought order is preserved:

```ts
const ENRICH_INGREDIENT_PROPS = {
  name: { type: "string" },
  category: {
    type: "string",
    enum: ["protein", "carb", "fat", "veg", "other"],
  },
  // B4: decided BEFORE the serving, so the model settles what the printed
  // weight covers before it sizes anything. Also the first time the
  // inside-or-outside judgment is recorded rather than inferred by adding up
  // grams afterwards - it is where PASTEL's whole portion error lives.
  within_printed_weight: { type: "boolean" },
  // B4: a conventional serving of this ingredient, NOT a number fitted to the
  // dish. resolveGrams does the fitting. Required, not optional: strict mode
  // only emits required fields.
  typical_serving_g: { type: "number" },
  // B12: composition per 100 g, NOT the amount in this serving - the amount is
  // grams x per100 / 100, done in sumIngredientMacros. iter-b11-001 measured
  // that an asked-for amount comes back as a round number anchored to the
  // ingredient's category tag (anything tagged carb got 20 or 30 g regardless
  // of food or weight), while composition is a property of the food the model
  // actually knows. Same move as B10, one level down: take away the arithmetic,
  // leave the knowledge.
  protein_per_100g: { type: "number" },
  carb_per_100g: { type: "number" },
  fat_per_100g: { type: "number" },
};
```

Then update the ingredient `required` array in `ENRICH_SCHEMA_OPENAI` — replace `"grams"` with the two new names in the same position:

```ts
required: [
  "name",
  "category",
  "within_printed_weight",
  "typical_serving_g",
  "protein_per_100g",
  "carb_per_100g",
  "fat_per_100g",
],
```

- [ ] **Step 3: Add `printed_total_g` to the item schema**

In `ENRICH_SCHEMA_OPENAI`, insert the property immediately **before** `ingredients`, and add it to the item's `required` array in the same position:

```ts
          category: {
            type: "string",
            enum: ["food", "side", "dessert", "drink", "other"],
          },
          // B4: before ingredients on purpose - the model commits to the dish's
          // printed weight before portioning anything into it. Asked for rather
          // than parsed in code: the three benchmark fixtures alone print
          // "200 g", "200g" and "300gr.", and this prompt ships worldwide.
          printed_total_g: { type: ["number", "null"] },
          ingredients: {
```

```ts
        required: [
          "name",
          "description",
          "price",
          "category",
          "printed_total_g",
          "ingredients",
          "protein_g",
          "carb_g",
          "fat_g",
          "estimated_calories",
          "confidence",
          "allergens",
        ],
```

- [ ] **Step 4: Write the failing tests**

In `enrich_test.ts`, update the two prompt assertions that reference wording being replaced, and add the new schema assertions.

Replace the body of the existing test `"enrich prompt still instructs the two-step ingredient-then-estimate method"`:

```ts
Deno.test("enrich prompt still instructs the two-step ingredient-then-estimate method", () => {
  assertEquals(ENRICH_PROMPT.includes("List the most likely ingredients"), true);
  // B4 replaced "prefer printed weights over guesses" - the printed weight is
  // now a field the model reports and code scales to, not a basis for its own
  // gram guesses.
  assertEquals(ENRICH_PROMPT.includes("printed_total_g"), true);
});
```

Replace the body of the existing test `"enrich prompt asks for per-ingredient grams and derived totals (B1)"`:

```ts
Deno.test("enrich prompt asks for per-ingredient servings and derived totals (B1, B4)", () => {
  // B4 replaced "edible weight in grams" with a conventional serving; the grams
  // are ours to derive. The B1 property being guarded is unchanged: the item's
  // totals must still be summed from the parts rather than guessed directly.
  assertEquals(ENRICH_PROMPT.includes("typical_serving_g"), true);
  assertEquals(
    ENRICH_PROMPT.includes("rather than estimating the totals directly"),
    true,
  );
});
```

Replace the body of the existing test `"every ingredient must carry a gram weight (B1)"`:

```ts
Deno.test("every ingredient must carry a serving and a scope tag (B1, B4)", () => {
  // Without a per-ingredient size the model records WHAT is in a dish and never
  // HOW MUCH, so its portion assumption is unrecoverable from its output.
  // baseline-002 showed every macro it emitted was a multiple of 5 across
  // 3 dishes x 3 draws - the signature of a guess made straight at the macro
  // level. B4 keeps that property and changes only what the size means.
  const schema = ENRICH_SCHEMA_OPENAI as {
    properties: {
      items: {
        items: {
          properties: {
            ingredients: {
              items: {
                properties: Record<string, unknown>;
                required: string[];
              };
            };
          };
        };
      };
    };
  };
  const ingredient = schema.properties.items.items.properties.ingredients.items;
  const keys = Object.keys(ingredient.properties);

  for (const field of ["within_printed_weight", "typical_serving_g"]) {
    assertEquals(keys.includes(field), true, `ingredients[] must declare ${field}`);
    // Strict mode only emits a field when it is required, so declaring it is not
    // enough - an optional field would be silently omitted on every call.
    assertEquals(
      ingredient.required.includes(field),
      true,
      `${field} must be required, or strict mode will omit it`,
    );
  }
  // The scope decision must come first: settle what the printed weight covers
  // before sizing anything into it.
  assertEquals(
    keys.indexOf("within_printed_weight") < keys.indexOf("typical_serving_g"),
    true,
    "within_printed_weight must precede typical_serving_g",
  );
  // A literal gram figure must not be askable - that is ours to derive, and
  // asking for it is exactly what produced five runs of frozen portions.
  assertEquals(
    keys.includes("grams"),
    false,
    "ingredients[] must not ask for grams - resolveGrams computes them",
  );
});
```

Append one new test:

```ts
Deno.test("the item commits to its printed weight before portioning (B4)", () => {
  const schema = ENRICH_SCHEMA_OPENAI as {
    properties: {
      items: { items: { properties: Record<string, unknown>; required: string[] } };
    };
  };
  const item = schema.properties.items.items;
  const keys = Object.keys(item.properties);

  assertEquals(item.required.includes("printed_total_g"), true);
  assertEquals(
    keys.indexOf("printed_total_g") < keys.indexOf("ingredients"),
    true,
    "printed_total_g must precede ingredients",
  );
  // Null is how "the menu prints no weight" is expressed; without it in the type
  // union strict mode forces the model to invent a number.
  assertEquals(
    (item.properties.printed_total_g as { type: string[] }).type,
    ["number", "null"],
  );
});
```

- [ ] **Step 5: Prove the new assertions actually bite**

Steps 1–3 are declarative edits to a prompt string and a schema object, so the tests written in Step 4 will already pass — there is no red phase to observe by ordering alone. Verify they are real guards instead of decoration:

Run: `deno test --allow-all supabase/functions/analyze-menu/enrich_test.ts`
Expected: PASS.

Now temporarily delete `"printed_total_g"` from the item `required` array in `ENRICH_SCHEMA_OPENAI` and re-run the same command.
Expected: FAIL on `"the item commits to its printed weight before portioning (B4)"`.

Then temporarily swap `within_printed_weight` and `typical_serving_g` in `ENRICH_INGREDIENT_PROPS` and re-run.
Expected: FAIL on `"every ingredient must carry a serving and a scope tag (B1, B4)"` with `within_printed_weight must precede typical_serving_g`.

**Restore both edits before continuing.** Do not use `git stash` to revert them — the stash stack is shared across worktrees. Retype the two lines.

- [ ] **Step 6: Pass the model's printed total into the summation**

`sumIngredientMacros` already accepts the argument as of Task 1; this is the call site that supplies it. In `enrichBatch`:

```ts
  return (parsed.items as EnrichedItem[]).map((item) => ({
    ...item,
    ...sumIngredientMacros(item.ingredients ?? [], item.printed_total_g),
  }));
```

- [ ] **Step 7: Run the tests to verify everything still passes**

Run: `deno test --allow-all supabase/functions/analyze-menu/enrich_test.ts`
Expected: PASS, all tests, no failures — including the food-name guard on step 2, which now also has to survive the new step-1 sentence.

- [ ] **Step 8: Commit**

```bash
git add supabase/functions/analyze-menu/enrich.ts supabase/functions/analyze-menu/enrich_test.ts
git commit -m "feat: B4 - model states a conventional serving, code fits it to the printed weight"
```

---

### Task 3: Keep the benchmark runner mirroring production

**Files:**
- Modify: `scripts/bench-macros.ts:60` (the `sumIngredientMacros` call inside `modelValues`)

**Interfaces:**
- Consumes: `sumIngredientMacros(ingredients, printedTotalG?)` from Task 2.
- Produces: nothing new.

**Why this task exists:** `modelValues` currently calls `sumIngredientMacros(item.ingredients ?? [])` with no printed total. Left alone it compiles fine and silently scores **unscaled** servings — the benchmark would grade numbers the app never produces. That is lesson 23, and it would invalidate the whole run.

- [ ] **Step 1: Pass the printed total through**

In `scripts/bench-macros.ts`, inside `modelValues`:

```ts
  // B4: the printed total is part of the real computation - without it the
  // servings are scored unscaled and the harness grades a number production
  // never emits (lesson 23 - the harness must run the real logic).
  const totals = sumIngredientMacros(item.ingredients ?? [], item.printed_total_g);
```

- [ ] **Step 2: Verify the file still type-checks**

Run: `deno check scripts/bench-macros.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/bench-macros.ts
git commit -m "fix: bench harness must scale servings exactly as production does"
```

---

### Task 4: Teach the portion scorer the new response shape

**Files:**
- Modify: `scripts/score-portions.ts`
- Test: `scripts/score-portions_test.ts`

**Interfaces:**
- Consumes: `resolveGrams(ingredients, printedTotalG?)` from Task 1.
- Produces: `modelGrams(item): { name: string; grams: number }[]`, exported so the test can call it.

`scripts/score-portions_test.ts` already imports `scoreDishPortions` from `./score-portions.ts` — add `modelGrams` to that existing import rather than writing a second import statement.

**Why this task exists:** `score-portions.ts` reads `.grams` straight off the archived response. After B4 there is no `.grams`, so **the run's primary gate could not be computed at all**. It must derive grams the same way production does, while still reading `.grams` on the five pre-B4 archived runs so their historical rows stay reproducible.

- [ ] **Step 1: Write the failing test**

Append to `scripts/score-portions_test.ts`:

```ts
Deno.test("modelGrams derives B4 grams and still reads pre-B4 runs", () => {
  // Post-B4: servings sum to 250 inside a printed 200, so the two plate items
  // scale by 0.8 and the accompaniment passes through.
  assertEquals(
    modelGrams({
      printed_total_g: 200,
      ingredients: [
        { name: "a", within_printed_weight: true, typical_serving_g: 100 },
        { name: "b", within_printed_weight: true, typical_serving_g: 150 },
        { name: "side", within_printed_weight: false, typical_serving_g: 50 },
      ],
    }),
    [{ name: "a", grams: 80 }, { name: "b", grams: 120 }, { name: "side", grams: 50 }],
  );

  // Pre-B4 archived runs carry a literal grams and no printed_total_g. They must
  // keep scoring exactly as before or the five historical rows stop being
  // comparable to the new one.
  assertEquals(
    modelGrams({
      ingredients: [{ name: "a", grams: 50 }, { name: "b", grams: 30 }],
    }),
    [{ name: "a", grams: 50 }, { name: "b", grams: 30 }],
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `deno test --allow-read scripts/score-portions_test.ts --filter "modelGrams"`
Expected: FAIL — `modelGrams` is not exported from `score-portions.ts`.

- [ ] **Step 3: Implement `modelGrams`**

Add the import at the top of `scripts/score-portions.ts`:

```ts
import { resolveGrams } from "../supabase/functions/analyze-menu/enrich.ts";
```

Add the function above `main`:

```ts
/**
 * The grams to score for one archived item.
 *
 * Runs before B4 archived a literal `grams` per ingredient. From B4 on the
 * response carries `typical_serving_g` and the grams are derived, so the metric
 * must score what the code actually produces - scoring raw servings would grade
 * a number the app never emits.
 */
export function modelGrams(
  item: {
    printed_total_g?: number | null;
    ingredients?: {
      name: string;
      grams?: number;
      typical_serving_g?: number;
      within_printed_weight?: boolean;
    }[];
  },
): { name: string; grams: number }[] {
  const ingredients = item.ingredients ?? [];
  const isPreB4 = ingredients.length > 0 &&
    ingredients[0].typical_serving_g === undefined;

  const grams = isPreB4
    ? ingredients.map((i) => i.grams ?? 0)
    // deno-lint-ignore no-explicit-any
    : resolveGrams(ingredients as any, item.printed_total_g);

  return ingredients.map((i, idx) => ({ name: i.name, grams: grams[idx] }));
}
```

- [ ] **Step 4: Use it in `main`**

Replace the `scoreDishPortions` call inside `main`:

```ts
        const score = scoreDishPortions(
          oracleIngredients,
          modelGrams(item),
          item.name,
        );
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `deno test --allow-read scripts/score-portions_test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Verify the five historical rows are unchanged**

Run: `deno run --allow-read scripts/score-portions.ts`
Expected: CESAR displacement **20.0%** on all three draws of all five runs, PASTEL **24.4%** on fourteen of fifteen — byte-identical to the table in the spec's §1. If any historical number moved, the legacy path is broken; stop and fix before running anything paid.

- [ ] **Step 7: Commit**

```bash
git add scripts/score-portions.ts scripts/score-portions_test.ts
git commit -m "feat: portion scorer derives grams from servings, keeps pre-B4 runs comparable"
```

---

### Task 5: Full-suite gate

**Files:** none modified.

- [ ] **Step 1: Run the whole suite**

Run: `deno test --allow-all scripts/ supabase/`
Expected: `N passed | 1 failed`, and the single failure MUST be `scripts/tile-cut_test.ts`. Before B4 the count was `309 passed | 1 failed`; B4 adds tests, so a higher pass count is correct. **Any other failing test is a real regression — fix it before spending money.**

- [ ] **Step 2: Confirm the request body the model will actually receive**

Run: `deno test --allow-all supabase/functions/analyze-menu/enrich_test.ts --filter "pinned Stage-2 model"`
Expected: PASS. This test intercepts `fetch` and asserts the serialized model is `gpt-4o-2024-08-06`; it also exercises the whole `enrichBatch` path against the new type, so a passing run means the schema serializes and the response parses.

- [ ] **Step 3: Push**

```bash
git push origin worktree-stage2-macro-benchmark
```

---

### Task 6: The paid run — iter-b4-001

**Files:**
- Creates: `scripts/fixtures/caches/macro-bench.iter-b4-001-d{0,1,2}.raw.json`

**Cost: ~$0.04, 3 draws. Santiago approved this run on 2026-08-08.**

- [ ] **Step 1: Run the benchmark**

The key lives in the gitignored `.env.local`. The repo's `.env` holds the literal placeholder `PENDING` — do not use it.

```bash
OPENAI_API_KEY=$(grep -m1 '^OPENAI_API_KEY' .env.local | cut -d= -f2-) \
  BENCH_DRAWS=3 BENCH_RUN_ID=iter-b4-001 \
  deno run --allow-net --allow-read --allow-write --allow-env scripts/bench-macros.ts
```

Note for anyone running this inside a worktree-isolated agent session: `. ./.env.local` and `set -a` forms are refused by the isolation guard. The inline `$(grep …)` above is the form that works.

Expected: a per-dish table of PASS/FAIL per field per draw, and three archived raw responses.

- [ ] **Step 2: Score the portions — this is the primary gate**

```bash
deno run --allow-read scripts/score-portions.ts iter-b4-001
```

Expected: displacement per dish per draw, plus the per-ingredient gram table (the single-run form prints it).

**The number that decides the run is CESAR's displacement.** It has been 20.0% in fifteen consecutive draws, so it has no measurable noise floor — any movement is signal.

- [ ] **Step 3: Check every prediction from the spec's §5**

| # | prediction | how to check |
|---|---|---|
| 1 | CESAR displacement leaves 20.0% | Step 2's output |
| 2 | Dressing rises from 20 g toward 30 g | the per-ingredient table |
| 3 | Composition untouched — corn 19, parmesan 35.8 / 3.2 / 25.8 | read `*_per_100g` from the archived raws |
| 4 | `printed_total_g` reads 200 / 200 / 300, none null; CESAR totals exactly 200 g | archived raws + Step 2's total column |
| 5 | Salmone keeps its baguette outside — total ≈245 g, not 200 g | Step 2's total column |
| 6 | PASTEL tags beans `within_printed_weight: true`, displacement barely moves | archived raws + Step 2 |

Record what each prediction did, including the ones that held. A prediction that fails is the run's finding, not its failure.

- [ ] **Step 4: Hand-audit the raw dumps**

A numeric pass is never a gate by itself. For each of the three draws confirm: exactly 3 items, names and printed order preserved, no invented or unprinted ingredients, and no ingredient whose three per-100 g values sum above 100.

- [ ] **Step 5: Write the run entry**

Add to `docs/superpowers/stage2-macro-benchmark.md`: one row in the **Runs** table and a full `### iter-b4-001` notes section under the existing run notes. Follow the shape of the `### iter-b13-001` entry immediately above it — change under test, numbered findings, the scorecard table with the new row appended, hand audit, archived-response paths, cost from the `usage` blocks, phase total, verdict.

Report the **range** across the three draws, never a single draw as quality.

- [ ] **Step 6: Update the four status docs**

All of these must agree, and the roadmap block is the only place phase status is written:

- `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md` — the `🎯 CURRENT PHASE` block: commit table, the measured-story table, the numbered findings, the next action, and the running phase total (currently `$0.177`).
- `docs/superpowers/stage2-macro-benchmark.md` — mark B4 done in the Backlog with what it proved.
- `docs/superpowers/START-HERE.md` — the one-line state and the phase spend.
- `docs/superpowers/plans/2026-08-07-stage2-macro-benchmark.md` — the commit table and the failed-field/draw progression.

- [ ] **Step 7: Commit and push**

```bash
git add docs/superpowers/stage2-macro-benchmark.md \
        docs/superpowers/START-HERE.md \
        docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md \
        docs/superpowers/plans/2026-08-07-stage2-macro-benchmark.md \
        scripts/fixtures/caches/macro-bench.iter-b4-001-d0.raw.json \
        scripts/fixtures/caches/macro-bench.iter-b4-001-d1.raw.json \
        scripts/fixtures/caches/macro-bench.iter-b4-001-d2.raw.json
git commit -m "test: record iter-b4-001"
git push origin worktree-stage2-macro-benchmark
```

- [ ] **Step 8: Report to Santiago**

Lead with tables and plain language. Gloss any jargon on first use. State what the result is NOT before asking him to authorise anything next. Do not deploy.
