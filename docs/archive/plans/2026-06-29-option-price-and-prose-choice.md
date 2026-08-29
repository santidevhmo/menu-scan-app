# Option Price Recompute + Prose-Choice Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user selects a `choice` option pill, the menu item's displayed price swaps to that option's price (plus any selected add-on prices); and teach the extraction model to lift inline priced alternatives out of an item's description into selectable `options[]`.

**Architecture:** Two independent changes. (1) Client: a new pure helper `computeOptionPrice` in `src/lib/options.ts` mirrors the existing `computeOptionMacros`, and `MenuItemRow` renders its result instead of the static `item.price`. (2) Edge: a surgical rewrite of one sentence in `EXTRACT_PROMPT` so the model detects selectable alternatives by the **presence of a printed price beside a named alternative**, not by specific Spanish wording like "a elegir". No schema changes, no client type changes, no new dependencies.

**Tech Stack:** React Native + Expo, NativeWind, Zustand, TypeScript (strict). Supabase Edge Function on Deno. Client option helpers and edge functions are tested with `deno test`; screens/components are type-checked with `pnpm tsc --noEmit` and linted with ESLint.

## Global Constraints

- Package manager is **pnpm** only — never `npm install` / `npm run` / `yarn`.
- **Do NOT add any new dependency** for this work. (No installs needed at all.)
- **Do NOT introduce allergen code** on this branch — base `4d8c3c4` is pre-allergen.
- TypeScript strict mode, **no `any`**.
- Styling: NativeWind `className` only (this work touches no `StyleSheet`).
- Branch: `feat/selectable-options`. Work continues on it; do not create a new branch.
- `src/lib/options.test.ts` runs under **Deno**, not Jest, and is excluded from the tsc build — keep it that way.
- Edge prompt steering of a vision model is **probabilistic**: Task 2 has no automated test that can prove model compliance. Its acceptance is a manual re-scan. State results honestly; do not claim it works without a scan.

---

## File Map

- `src/lib/options.ts` — **Modify.** Add `computeOptionPrice(item, choiceIndex, addonIndices): number | null` next to the existing `computeOptionMacros`. Single responsibility: pure option math. No React, no I/O.
- `src/lib/options.test.ts` — **Modify.** Add Deno tests for `computeOptionPrice` covering: no options, null base, choice selected, choice with null price, add-on summation, null base with priced add-on.
- `src/components/results/MenuItemRow.tsx` — **Modify.** Import and call `computeOptionPrice`; render its result in the existing price `<Text>` (lines 59–63) instead of `item.price`.
- `supabase/functions/analyze-menu/index.ts` — **Modify.** Replace exactly one sentence (the layout-2 rule, currently line 26) inside `EXTRACT_PROMPT`. Nothing else in this file changes.

---

## Locked Design Decisions

**Price recompute (Option B):**
- Base price = the selected `choice` option's price; if no choice is selected or its price is `null`, fall back to `item.price`.
- Each selected `addon` with a non-null price adds onto the base (mirrors how `computeOptionMacros` sums add-on macros).
- If the resolved base is `null`, return `null` → the row renders no price (the existing `price != null` guard already handles this).
- **Price does NOT scale with `portion`.** `portion` is the user's personal macro multiplier ("I'll eat half"), not a menu quantity — macros scale with it, price does not.

**Extraction (prompt-only, price-as-signal):**
- The detection cue for an inline alternative is **a price printed beside a named alternative** — not any wording. Grams may or may not appear and are never required.
- Default option = the version named in the item title, at the item's own price. Each additionally-priced alternative becomes a `choice` option. Add-ons (`+ guacamole $30`, `add cheese`) remain `kind: "addon"` via the existing `+/add` cue.
- The lifted alternatives are removed from the description text.

---

## Task 1: Add `computeOptionPrice` helper (client, TDD)

**Files:**
- Modify: `src/lib/options.ts`
- Test: `src/lib/options.test.ts`

**Interfaces:**
- Consumes: `EnrichedItem` from `../types/scan.ts` (already imported in `options.ts`). Each option is an `EnrichedOption` with `price: number | null` and `kind: "choice" | "addon"`.
- Produces: `export function computeOptionPrice(item: EnrichedItem, choiceIndex: number | null, addonIndices: number[]): number | null` — consumed by `MenuItemRow` in Task 2.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/options.test.ts`. Add `computeOptionPrice` to the existing import on line 2, then add a priced-option helper and the test cases:

```ts
// add computeOptionPrice to the existing import:
// import { computeOptionMacros, computeOptionPrice, effectiveMacros } from "./options.ts";

const pricedOpt = (
  name: string,
  price: number | null,
  kind: "choice" | "addon",
) => ({ name, price, kind, protein_g: 0, carb_g: 0, fat_g: 0, estimated_calories: 0 });

Deno.test("computeOptionPrice returns item price when no options", () => {
  assertEquals(computeOptionPrice(base({ price: 165 }), null, []), 165);
});

Deno.test("computeOptionPrice returns null when item price null and no choice", () => {
  assertEquals(computeOptionPrice(base(), null, []), null);
});

Deno.test("computeOptionPrice uses the selected choice's price", () => {
  const item = base({
    price: 165,
    options: [pricedOpt("Sirloin", 165, "choice"), pricedOpt("Pollo", 150, "choice")],
  });
  assertEquals(computeOptionPrice(item, 1, []), 150);
});

Deno.test("computeOptionPrice falls back to item price when choice price is null", () => {
  const item = base({ price: 165, options: [pricedOpt("Sirloin", null, "choice")] });
  assertEquals(computeOptionPrice(item, 0, []), 165);
});

Deno.test("computeOptionPrice adds selected addon prices onto the base", () => {
  const item = base({ price: 100, options: [pricedOpt("Guacamole", 30, "addon")] });
  assertEquals(computeOptionPrice(item, null, [0]), 130);
});

Deno.test("computeOptionPrice returns null base even when an addon has a price", () => {
  const item = base({ price: null, options: [pricedOpt("Guacamole", 30, "addon")] });
  assertEquals(computeOptionPrice(item, null, [0]), null);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `deno test src/lib/options.test.ts`
Expected: FAIL — `computeOptionPrice is not a function` / not exported.

- [ ] **Step 3: Implement the helper**

Append to `src/lib/options.ts` (after `effectiveMacros`):

```ts
/**
 * Compute the displayed price for the current pill selection.
 * Base = selected choice's price, or item.price when no choice / null choice price.
 * Each selected addon with a price adds on. Returns null when the base is unknown.
 * Not portion-scaled: portion adjusts macros only, not menu price.
 */
export function computeOptionPrice(
  item: EnrichedItem,
  choiceIndex: number | null,
  addonIndices: number[],
): number | null {
  const choices = (item.options ?? []).filter((o) => o.kind === "choice");
  const addons = (item.options ?? []).filter((o) => o.kind === "addon");

  const chosen = choiceIndex !== null ? choices[choiceIndex] : undefined;
  let price = chosen && chosen.price !== null ? chosen.price : item.price;
  if (price === null) return null;

  for (const i of addonIndices) {
    const a = addons[i];
    if (a && a.price !== null) price += a.price;
  }
  return price;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `deno test src/lib/options.test.ts`
Expected: PASS — all existing tests plus the 6 new `computeOptionPrice` tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/options.ts src/lib/options.test.ts
git commit -m "feat: add computeOptionPrice helper for live price recompute"
```

---

## Task 2: Render computed price in MenuItemRow

**Files:**
- Modify: `src/components/results/MenuItemRow.tsx`

**Interfaces:**
- Consumes: `computeOptionPrice` from `@/lib/options` (Task 1). Existing local state `choiceIndex: number | null` and `addonIndices: number[]` already drive `computeOptionMacros`.
- Produces: nothing downstream — terminal UI change.

- [ ] **Step 1: Import the helper**

In `src/components/results/MenuItemRow.tsx`, update the import on line 5:

```ts
import { computeOptionMacros, computeOptionPrice } from "@/lib/options";
```

- [ ] **Step 2: Compute the price next to the macros**

After line 43 (`const macros = computeOptionMacros(item, choiceIndex, addonIndices);`) add:

```ts
  const price = computeOptionPrice(item, choiceIndex, addonIndices);
```

- [ ] **Step 3: Render the computed price instead of the static one**

Replace the price block (currently lines 59–63):

```tsx
        {item.price != null && (
          <Text className="font-sans text-body text-foreground">
            ${item.price.toFixed(2)}
          </Text>
        )}
```

with:

```tsx
        {price != null && (
          <Text className="font-sans text-body text-foreground">
            ${price.toFixed(2)}
          </Text>
        )}
```

- [ ] **Step 4: Type-check and lint**

Run: `pnpm tsc --noEmit`
Expected: PASS (no errors).

Run: `pnpm exec eslint src/ --ext .ts,.tsx`
Expected: PASS (no new errors).

- [ ] **Step 5: Manual UI check**

Run: `pnpm start`, open the app, and view any ranked item that has `choice` options (or temporarily hardcode one if no scan currently produces them). Confirm: selecting a different choice pill changes the price at the top of the row in real time; selecting an add-on increases it; the portion +/− buttons still change macros but NOT the price.

- [ ] **Step 6: Commit**

```bash
git add src/components/results/MenuItemRow.tsx
git commit -m "feat: swap row price to selected option price in MenuItemRow"
```

---

## Task 3: Price-signal extraction prompt (edge, prompt-only)

**Files:**
- Modify: `supabase/functions/analyze-menu/index.ts`

**Interfaces:**
- Consumes / Produces: no code interface change. `EXTRACT_SCHEMA` already supports `options[]`; `EnrichedOption` types are unchanged. This task only changes the natural-language instruction the vision model receives.

> **No automated test exists for this task.** A vision-model prompt cannot be unit-tested deterministically. Verification is `deno check` (compiles) plus a manual re-scan of the Brasero menu. Do not mark this done on compile alone.

- [ ] **Step 1: Replace the layout-2 sentence in `EXTRACT_PROMPT`**

In `supabase/functions/analyze-menu/index.ts`, find the layout-2 line inside `EXTRACT_PROMPT` (currently line 26), which begins `2. An item whose description lists alternatives, usually introduced by "a elegir"...`. Replace that entire line with:

```
2. An item whose name or description names one or more alternative versions, each shown with its own price (e.g. base "TACO LOIRO (sirloin) $165" whose description mentions "picaña $165" and "pollo $150"). The signal is an extra PRICE printed beside a named alternative — NOT any particular wording such as "a elegir". Keep ONE item: the default is the version named in the title at the item's own price, and each additionally-priced alternative becomes its own "options" entry. Then remove those alternatives from the description text. A weight in grams beside an alternative (e.g. "picaña 165g") may or may not appear and is NOT required — the price is the cue.
```

Leave layout-1 (the icon/bold-header block rule) and the `kind` classification sentence (currently line 27) unchanged — the `choice` vs `addon` split via the `+/add` cue still applies.

- [ ] **Step 2: Verify it compiles**

Run: `deno check supabase/functions/analyze-menu/index.ts`
Expected: PASS — `Check supabase/functions/analyze-menu/index.ts` with no errors.

- [ ] **Step 3: Run the edge tests (regression guard)**

Run: `deno test supabase/functions/analyze-menu/`
Expected: PASS — existing extraction/enrichment tests unaffected (prompt text is not asserted by tests).

- [ ] **Step 4: Manual re-scan verification**

Re-scan `Downloads/BraseroMenuTwo.png` in the app. Confirm in the Stage 1 extraction output and the results UI:
- `Taco Loiro` is ONE item whose description NO longer contains "picaña … pollo …" as text, and which now has `choice` options for picaña and pollo (sirloin is the default title version).
- The picaña/pollo pills are selectable, and selecting one updates macros and price (Tasks 1–2).
- `RES` / `CERDO` blocks remain single items with their cut options (no regression from layout-1).

If `Taco Loiro` still keeps the alternatives in description text after the re-scan, the prompt-only approach has not carried it — stop and report to the user before adding any post-extraction parser (explicitly out of scope per the locked decision to go prompt-only).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/analyze-menu/index.ts
git commit -m "feat(edge): detect inline priced alternatives by price, not wording"
```

---

## Final Static Gate

After all tasks, run the full gate and confirm green before opening a PR:

```bash
deno test src/lib/options.test.ts
deno test supabase/functions/analyze-menu/
pnpm tsc --noEmit
pnpm exec eslint src/ --ext .ts,.tsx
deno check supabase/functions/analyze-menu/index.ts
```

Expected: all pass. Then verify the manual re-scan (Task 3, Step 4) one final time and open the PR for the `feat/selectable-options` branch.

---

## Self-Review

- **Spec coverage:** Option B price recompute → Tasks 1–2. Prompt-only, price-as-signal extraction → Task 3. Both locked decisions covered.
- **Placeholder scan:** No TBD/TODO; every code step shows full code; the one un-testable step (Task 3) is flagged explicitly with its manual acceptance.
- **Type consistency:** `computeOptionPrice(item, choiceIndex, addonIndices): number | null` is defined in Task 1 and consumed with the same signature in Task 2. State variables `choiceIndex`/`addonIndices` already exist in `MenuItemRow`. `EnrichedOption.price` is `number | null` per `src/types/scan.ts`.
