# Unweighted-Dish Portion Anchor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a dish whose menu prints no weight a size of its own, so its macros stop being an accident of how many ingredients the model happened to list.

**Architecture:** The model gains one field, `typical_total_g` — what one order of this dish customarily weighs. A single exported helper, `portionTarget(item)`, decides what the ingredient list is fitted to: the printed weight if there is one, else the customary weight if it is plausible, else nothing. Every caller of `resolveGrams`/`sumIngredientMacros` — production **and both measurement tools** — goes through that helper, guarded by a test that fails the build if one drifts back to passing `printed_total_g` raw. Separately, `serving_pieces` stops being nullable so the model must classify every dish, and the stepper renders a bare piece count.

**Tech Stack:** Deno (edge function + scripts), TypeScript, React Native/Expo (results UI), OpenAI structured outputs (strict JSON schema).

**Spec:** `docs/superpowers/specs/2026-08-11-unweighted-dish-portion-anchor-design.md`

## Global Constraints

- **The anchor fires only when `printed_total_g` is null.** Any dish with a printed weight must be byte-for-byte unchanged — all 8 benchmark fixtures included.
- **No food, dish or cuisine name may enter the nutrition step of `ENRICH_PROMPT`.** `enrich_test.ts` fails the build if one appears. This is measured harm (B11), not style.
- **Plausibility band: 20–2000 g.** Wide on purpose — it exists to survive `5` or `50000`, not to express an opinion about portions. Mark it `ponytail:` with its ceiling.
- **Archived runs must keep re-scoring identically.** They predate `typical_total_g`, so `portionTarget` must return the printed weight (or nothing) for them, with no era flag.
- **Property order in `ENRICH_SCHEMA_OPENAI` is load-bearing** — strict mode emits fields in schema order. `typical_total_g` goes immediately after `printed_total_g`, before `name_implied_components`.
- **No paid model run happens in this plan.** Implementation is $0. Runs need Santiago's approval with a dollar estimate first.
- Suite command: `deno test --allow-all scripts/ supabase/ src/`. A clean run is **337 passed | 1 failed**, where the only failure is `scripts/tile-cut_test.ts` (ruled unimportant, cannot touch macros). Any other failure is yours.
- Format before every commit: `deno fmt` on files touched.

---

### Task 1: The anchor field and `portionTarget()`

**Files:**
- Modify: `supabase/functions/analyze-menu/enrich.ts` (interface ~L11-49, prompt L54-59, schema L100-172, `enrichBatch` map L282-291, `fallbackEnriched` L436-453)
- Test: `supabase/functions/analyze-menu/enrich_test.ts`

**Interfaces:**
- Consumes: existing `resolveGrams(ingredients, printedTotalG?)`, `sumIngredientMacros(ingredients, printedTotalG?)` — signatures unchanged, second parameter is now "the target", whatever chose it.
- Produces: `export function portionTarget(item: { printed_total_g?: number | null; typical_total_g?: number | null }): number | null` — used by Task 2 in both measurement tools.

- [ ] **Step 1: Write the failing tests**

Append to `supabase/functions/analyze-menu/enrich_test.ts`:

```ts
Deno.test("portionTarget prefers the printed weight over the customary one", () => {
  assertEquals(
    portionTarget({ printed_total_g: 200, typical_total_g: 350 }),
    200,
  );
});

Deno.test("portionTarget falls back to the customary weight when none is printed", () => {
  assertEquals(portionTarget({ printed_total_g: null, typical_total_g: 350 }), 350);
});

Deno.test("portionTarget rejects an implausible customary weight", () => {
  // The band exists to survive a model returning 5 or 50000, not to have an
  // opinion about portions. Rejection means today's behaviour: no fitting.
  for (const bad of [0, -100, 19, 2001, NaN, Infinity]) {
    assertEquals(
      portionTarget({ printed_total_g: null, typical_total_g: bad }),
      null,
      `typical_total_g=${bad} must not anchor anything`,
    );
  }
  // A printed weight is the menu's own claim and is NOT band-checked.
  assertEquals(portionTarget({ printed_total_g: 5, typical_total_g: null }), 5);
});

Deno.test("portionTarget returns null for an archived item that predates the field", () => {
  assertEquals(portionTarget({ printed_total_g: null }), null);
  assertEquals(portionTarget({}), null);
});

Deno.test("the anchor fits ingredients when the menu prints no weight", () => {
  const ingredients = [
    {
      name: "sushi rice",
      category: "carb" as const,
      within_printed_weight: true,
      typical_serving_g: 150,
      protein_per_100g: 2,
      carb_per_100g: 28,
      fat_per_100g: 0,
    },
    {
      name: "avocado",
      category: "fat" as const,
      within_printed_weight: true,
      typical_serving_g: 50,
      protein_per_100g: 2,
      carb_per_100g: 9,
      fat_per_100g: 15,
    },
  ];
  // 200 g of servings fitted to a 300 g order: every ingredient scales by 1.5.
  assertEquals(
    resolveGrams(ingredients, portionTarget({ printed_total_g: null, typical_total_g: 300 })),
    [225, 75],
  );
});

Deno.test("the anchor changes nothing for a dish whose menu prints a weight", () => {
  const ingredients = [
    {
      name: "salmon",
      category: "protein" as const,
      within_printed_weight: true,
      typical_serving_g: 100,
      protein_per_100g: 20,
      carb_per_100g: 0,
      fat_per_100g: 13,
    },
  ];
  const printedOnly = resolveGrams(ingredients, portionTarget({ printed_total_g: 200 }));
  const withAnchor = resolveGrams(
    ingredients,
    portionTarget({ printed_total_g: 200, typical_total_g: 900 }),
  );
  assertEquals(printedOnly, withAnchor);
  assertEquals(printedOnly, [200]);
});

Deno.test("the item commits to its customary weight before portioning", () => {
  // Same argument as B4's printed_total_g: the size is settled BEFORE the
  // ingredient list, so the answer constrains the list instead of rationalising
  // one already written. Strict mode emits fields in schema order.
  const props = Object.keys(
    (ENRICH_SCHEMA_OPENAI.properties.items.items as {
      properties: Record<string, unknown>;
    }).properties,
  );
  assertEquals(
    props.indexOf("typical_total_g") === props.indexOf("printed_total_g") + 1,
    true,
    "typical_total_g must sit immediately after printed_total_g",
  );
  assertEquals(
    props.indexOf("typical_total_g") < props.indexOf("ingredients"),
    true,
    "the dish's size must be settled before its ingredients",
  );
});
```

Add `portionTarget` to the file's existing import from `./enrich.ts`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `deno test --allow-all supabase/functions/analyze-menu/enrich_test.ts`
Expected: FAIL — `portionTarget` is not exported.

- [ ] **Step 3: Implement**

In `enrich.ts`, add to the `EnrichedItem` interface right after `printed_total_g`:

```ts
  /**
   * What one order of this dish customarily weighs, for a menu that prints
   * nothing. Without it a dish has no size of its own: every ingredient enters
   * at its full standalone reference serving and simply ADDS, so plate mass
   * tracks the length of the ingredient list. Measured on 48 real sushi items
   * (2026-08-11): r = 0.74, about +32 g per extra ingredient, which made the
   * goal ranking partly a ranking of menu-copy verbosity.
   */
  typical_total_g: number | null;
```

Add the helper next to `resolveGrams`:

```ts
/** Widest weights a single restaurant order can plausibly be. */
// ponytail: a band, not a model - it catches 5 and 50000, nothing subtler.
// If measurement shows the band doing real work, that is a finding to chase,
// not a number to tune.
const MIN_PLAUSIBLE_ORDER_G = 20;
const MAX_PLAUSIBLE_ORDER_G = 2000;

/**
 * The weight the ingredient list is fitted to.
 *
 * THE ONLY PLACE THIS CHOICE IS MADE. resolveGrams has three callers -
 * production, `scripts/score-portions.ts` and `scripts/macro-measure.ts` - and
 * the last is the single measurement path. If one of them keeps passing
 * `printed_total_g` raw, the benchmark scores a pipeline production does not
 * run, which is lesson 28 exactly. `enrich_test.ts` fails the build if that
 * happens.
 *
 * A printed weight is the menu's own claim and is used as given. A customary
 * weight is the model's, so it must be plausible first. An archived item has
 * neither field and is unaffected, which is why re-scoring history needs no era
 * flag.
 */
export function portionTarget(
  item: { printed_total_g?: number | null; typical_total_g?: number | null },
): number | null {
  if (item.printed_total_g) return item.printed_total_g;
  const typical = item.typical_total_g;
  if (
    typeof typical !== "number" || !Number.isFinite(typical) ||
    typical < MIN_PLAUSIBLE_ORDER_G || typical > MAX_PLAUSIBLE_ORDER_G
  ) {
    return null;
  }
  return typical;
}
```

In the schema, insert immediately after the `printed_total_g` property:

```ts
          // The anchor for a menu that prints nothing. Immediately after
          // printed_total_g and before the ingredient list, for B4's reason:
          // the dish's size is settled before anything is portioned into it.
          typical_total_g: { type: ["number", "null"] },
```

and add `"typical_total_g"` to the item `required` array, immediately after `"printed_total_g"`.

In `ENRICH_PROMPT`, extend step 1's first sentence — insert after `...or null when the menu prints none.`:

```
Then give "typical_total_g": when the menu prints no weight, the total weight in grams of one order of this item as a restaurant customarily serves it, judged from the form the item is and the way that form is ordinarily plated and sold; give null when the menu does print one. State it as a property of the order itself, before you list anything, because it is what the parts will have to fit inside.
```

In `enrichBatch`'s return map, replace `item.printed_total_g` with `portionTarget(item)`:

```ts
    ...sumIngredientMacros(item.ingredients ?? [], portionTarget(item)),
```

In `fallbackEnriched`, add `typical_total_g: null,` immediately after `printed_total_g: null,`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `deno test --allow-all supabase/functions/analyze-menu/enrich_test.ts`
Expected: PASS, including every pre-existing test in the file.

- [ ] **Step 5: Commit**

```bash
deno fmt supabase/functions/analyze-menu/enrich.ts supabase/functions/analyze-menu/enrich_test.ts
git add supabase/functions/analyze-menu/enrich.ts supabase/functions/analyze-menu/enrich_test.ts
git commit -m "feat(enrich): a dish with no printed weight gets a size of its own"
```

---

### Task 2: One target for every caller, guarded

**Files:**
- Modify: `scripts/macro-measure.ts:113-116`
- Modify: `scripts/score-portions.ts:109-112`
- Modify: `scripts/probe-unweighted-portions.ts` (`plateGrams`)
- Test: `supabase/functions/analyze-menu/enrich_test.ts`

**Interfaces:**
- Consumes: `portionTarget` from Task 1.
- Produces: nothing new — this task removes a class of drift.

- [ ] **Step 1: Write the failing guard test**

Append to `supabase/functions/analyze-menu/enrich_test.ts`:

```ts
Deno.test("no source file fits grams to a raw printed weight", async () => {
  // resolveGrams has three callers, and two of them are measurement tools. If
  // one passes item.printed_total_g directly it silently keeps the pre-anchor
  // behaviour, and the benchmark then scores a pipeline production does not
  // run - the lesson-28 class, which has already cost this project a paid run.
  const offenders: string[] = [];
  for (const dir of ["scripts", "supabase/functions/analyze-menu"]) {
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
      if (entry.name.endsWith("_test.ts")) continue;
      const path = `${dir}/${entry.name}`;
      const text = await Deno.readTextFile(path);
      if (
        /(?:resolveGrams|sumIngredientMacros)\s*\([^)]*?\.printed_total_g/s.test(text)
      ) {
        offenders.push(path);
      }
    }
  }
  assertEquals(
    offenders,
    [],
    `these files must pass portionTarget(item) instead: ${offenders.join(", ")}`,
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `deno test --allow-all supabase/functions/analyze-menu/enrich_test.ts --filter "raw printed weight"`
Expected: FAIL, naming `scripts/macro-measure.ts`, `scripts/score-portions.ts` and `scripts/probe-unweighted-portions.ts`.

- [ ] **Step 3: Rewire the three call sites**

`scripts/macro-measure.ts` — add `portionTarget` to the existing import from `enrich.ts`, then:

```ts
    const totals = sumIngredientMacros(
      archivedIngredients(ingredients),
      portionTarget(item),
    );
```

`scripts/score-portions.ts` — add `portionTarget` to its import, then:

```ts
  const grams = resolveGrams(
    archivedIngredients(ingredients),
    portionTarget(item),
  );
```

`scripts/probe-unweighted-portions.ts` — in `plateGrams`:

```ts
  const grams = resolveGrams(item.ingredients ?? [], portionTarget(item));
```

- [ ] **Step 4: Run the guard and the whole macro suite**

Run: `deno test --allow-all scripts/ supabase/`
Expected: PASS, except the known `scripts/tile-cut_test.ts` failure. Archived-run scores must not move — confirm with:

Run: `deno run --allow-read scripts/rescore-history.ts`
Expected: identical figures to before this task (archived items carry no `typical_total_g`, so `portionTarget` returns exactly what `printed_total_g` did).

- [ ] **Step 5: Commit**

```bash
deno fmt scripts/macro-measure.ts scripts/score-portions.ts scripts/probe-unweighted-portions.ts supabase/functions/analyze-menu/enrich_test.ts
git add scripts/macro-measure.ts scripts/score-portions.ts scripts/probe-unweighted-portions.ts supabase/functions/analyze-menu/enrich_test.ts
git commit -m "fix(measure): one portion target for production and both scorers"
```

---

### Task 3: `serving_pieces` must be answered

**Files:**
- Modify: `supabase/functions/analyze-menu/enrich.ts` (interface, prompt step 3, schema)
- Test: `supabase/functions/analyze-menu/enrich_test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `serving_pieces` reaching the client as a number ≥ 1 rather than usually `null`. `portionSteps` (Task 4) already treats `1` as "not a piece dish".

- [ ] **Step 1: Write the failing tests**

```ts
Deno.test("serving_pieces cannot be declined (B22 lesson: force the field, not the wording)", () => {
  // Asking for a conventional count when the menu prints none FAILED TWICE on
  // two wordings, and the 2026-08-11 diagnostic agreed: 2 of 48 items answered.
  // Prompt wording is 0 for 4 in this phase; schema force is 4 for 6. So the
  // model no longer has a null to hide in - "1" is the answer for a dish eaten
  // as a single plate.
  const item = (ENRICH_SCHEMA_OPENAI.properties.items.items as {
    properties: Record<string, { type: unknown }>;
    required: string[];
  });
  assertEquals(item.properties.serving_pieces.type, "number");
  assertEquals(item.required.includes("serving_pieces"), true);
});

Deno.test("the piece step defines 1 and still prefers a printed count", () => {
  // Without "1 = a single plate" a forced field has nowhere to put a steak.
  assertEquals(ENRICH_PROMPT.includes("single plate"), true);
  assertEquals(ENRICH_PROMPT.includes("the count the menu states"), true);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `deno test --allow-all supabase/functions/analyze-menu/enrich_test.ts --filter "serving_pieces cannot"`
Expected: FAIL — type is `["number","null"]`.

- [ ] **Step 3: Implement**

Schema: `serving_pieces: { type: "number" },` (already in `required`; leave it there).

Interface: keep `serving_pieces?: number | null` — archived responses and `fallbackEnriched` still carry null, and the client already guards every shape.

`fallbackEnriched`: **leave `serving_pieces: null` alone.** `portionSteps` treats `null` and `1` identically (both fall back to the half-item stepper), so changing it would be churn with no behaviour behind it — and `null` is the honest value for an item the model dropped entirely.

Prompt step 3 becomes:

```
3. Give "serving_pieces": how many separate pieces this item is served as. Use the count the menu states if it states one. Otherwise give the number of pieces this form is conventionally served as where it is sold, and give 1 when the item is eaten as a single plate rather than as a number of pieces.
```

- [ ] **Step 4: Run to verify they pass**

Run: `deno test --allow-all supabase/functions/analyze-menu/enrich_test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
deno fmt supabase/functions/analyze-menu/enrich.ts supabase/functions/analyze-menu/enrich_test.ts
git add supabase/functions/analyze-menu/enrich.ts supabase/functions/analyze-menu/enrich_test.ts
git commit -m "feat(enrich): serving_pieces is required, so the model must classify the dish"
```

---

### Task 4: The stepper shows a piece count, with no ceiling

**Files:**
- Modify: `src/lib/portions.ts:31-43`
- Test: `src/lib/portions_test.ts`

**Interfaces:**
- Consumes: `serving_pieces` from Task 3.
- Produces: no signature change. `portionSteps(pieces)` still returns `{ step, label }`; only `label` changes.

- [ ] **Step 1: Rewrite the piece-label expectations**

In `src/lib/portions_test.ts`, replace the piece-form assertions (Santiago, 2026-08-11: a plain counter, no ceiling, opening at the full order):

```ts
Deno.test("an item served in pieces steps by one piece", () => {
  const { step, label } = portionSteps(8);

  assertEquals(step, 1 / 8);
  // Santiago, 2026-08-11: the stepper reads as a plain piece count - "3", not
  // "3/8" - and opens at the whole order, so a pizza starts at 8.
  assertEquals(label(3 / 8), "3");
  assertEquals(label(1 / 8), "1");
  assertEquals(label(1), "8");
});

Deno.test("piece labels survive floating-point accumulation", () => {
  // 1/3 + 1/3 + 1/3 is not exactly 1, and a diner must never see "2.9999".
  const { step, label } = portionSteps(3);
  const third = step;
  assertEquals(label(third + third), "2");
  assertEquals(label(third + third + third), "3");
});

Deno.test("the counter has no ceiling", () => {
  // The + button never stops. Two whole pizzas is sixteen slices, and under a
  // plain counter "16" is the right answer rather than the "16/8" CodeRabbit
  // caught in 2026-08-09's fraction form.
  const { label } = portionSteps(8);
  assertEquals(label(2), "16");
  assertEquals(label(3), "24");
});

Deno.test("the real counts a menu states are handled", () => {
  // Observed on the archived menus: "(3 piezas)", "3 pzas", "orden de dos",
  // "Alitas 6 PZ", plus the conventional counts for pizza and nigiri.
  assertEquals(portionSteps(2).label(1 / 2), "1");
  assertEquals(portionSteps(3).label(2 / 3), "2");
  assertEquals(portionSteps(6).label(2 / 6), "2");
  assertEquals(portionSteps(12).label(5 / 12), "5");
});
```

Leave the two fallback tests ("anything not served in pieces keeps the half-item stepper", "implausible piece counts fall back rather than produce nonsense") **exactly as they are** — a dish with no count, or a count of 1, still steps in halves and reads `x1` / `1/2`.

- [ ] **Step 2: Run to verify they fail**

Run: `deno test --allow-all src/lib/portions_test.ts`
Expected: FAIL — currently returns `"3/8"`, `"all"`, `"x2"`.

- [ ] **Step 3: Implement**

Replace the piece branch of `portionSteps`:

```ts
  return {
    step: 1 / servingPieces,
    // A plain count of pieces, with no ceiling (Santiago, 2026-08-11): the
    // stepper opens at the whole order - a 10-piece roll reads "10" - and the
    // diner walks it down to what they ate or up past a whole order. Rounded
    // because 1/3 + 1/3 + 1/3 is not exactly 1 in floating point, and nobody
    // should ever see "2.9999".
    label: (portion) => `${Math.round(portion * servingPieces)}`,
  };
```

- [ ] **Step 4: Run to verify they pass**

Run: `deno test --allow-all src/lib/portions_test.ts`
Expected: PASS, all six tests.

- [ ] **Step 5: Commit**

```bash
deno fmt src/lib/portions.ts src/lib/portions_test.ts
git add src/lib/portions.ts src/lib/portions_test.ts
git commit -m "feat(portions): the stepper is a plain piece counter with no ceiling"
```

---

### Task 5: Whole-suite verification and the handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-08-11-unweighted-dish-portion-anchor-design.md` (status line only)

- [ ] **Step 1: Run the whole suite**

Run: `deno test --allow-all scripts/ supabase/ src/`
Expected: the known-clean result — every test passing except `scripts/tile-cut_test.ts`. Record the actual counts; do not describe it as clean without them.

- [ ] **Step 2: Confirm history did not move**

Run: `deno run --allow-read scripts/rescore-history.ts`
Expected: byte-identical figures to `main`. If any archived run's score moved, STOP — `portionTarget` is not neutral on archived data and the guard in Task 2 missed it.

- [ ] **Step 3: Confirm the deployed path still serializes**

Run: `deno check supabase/functions/analyze-menu/index.ts scripts/probe-unweighted-portions.ts`
Expected: no errors.

- [ ] **Step 4: Mark the spec implemented and commit**

Change the spec's status line to `implemented 2026-08-11, unmeasured — no paid run has been made`.

```bash
git add docs/superpowers/specs/2026-08-11-unweighted-dish-portion-anchor-design.md
git commit -m "docs: the portion anchor is implemented and awaiting its first measured run"
git push
```

- [ ] **Step 5: STOP and ask Santiago before spending anything**

Present the **five** tests from spec §5 with their dollar estimates (~$1.00 total) and **wait**. Every paid run in this project needs his approval, and a numeric pass is never a gate on its own — each raw dump is hand-audited against the menu photo.

Carry the two abandon thresholds into that conversation, because they decide the next iteration rather than tune this one: **anchor MAPE > 35%** (the published general-LLM ceiling) means the direct ask adds nothing and the fallback is a small FNDDS-derived dish-type table; **ingredient-count correlation still > 0.4** means the model's own mass estimate is contaminated by the enumeration.

---

## Out of scope for this plan

- Any paid benchmark run (§5 of the spec) — approval required first.
- The dessert collapse (five cakes at exactly 130 g; two returning identical macros; the black-box guard blind across a translation). Logged in the benchmark ledger, deliberately not fixed here.
- Deploying. Production runs v29 and nothing here reaches it until Santiago says so.
