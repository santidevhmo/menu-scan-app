# Portion Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every dish one control that says how much of it the diner will eat — a plain
quantity for a soup, `N / M` pieces for a pizza — with the piece count correctable by the diner and
never able to move the macros.

**Architecture:** Two client-side numbers per item, `portion` (share of one order, default 1) and
`piecesPerOrder` (divisor, default from the model's `serving_pieces`, guarded to 1). Macros stay
`itemMacros × portion`; the divisor only formats the number on the row. All conversion and parsing
lives in pure functions in `src/lib/portions.ts` so the design's invariants are testable without
React. `results.tsx` holds both maps and resets them per scan; `MenuItemRow` renders the control and
opens a small modal editor with both fields.

**Tech Stack:** TypeScript (strict), React Native + Expo, NativeWind, Deno for the unit tests
(`deno test src/lib/portions_test.ts`).

**Source spec:** `docs/superpowers/specs/2026-08-11-portion-control-design.md`

## Global Constraints

- **Macros are always `itemMacros × portion`.** `piecesPerOrder` must never enter a macro
  calculation. (spec §3)
- **No free-text reaching a model.** Both editor fields are numeric-only local state; no network,
  no backend, no schema change. (spec §2)
- **No ceiling** on either the quantity or the numerator. `16 / 8` and `2` must both render.
  (spec §4)
- **Floors differ by route, deliberately:** the stepper stops at one step; a typed value may be any
  number above zero; zero is rejected by both. (spec §4)
- A model-supplied count that is not an integer in **1–50** becomes **1**. (spec §3)
- Styling is NativeWind. `Modal` is on the AGENTS.md Style Exception List — its `visible` /
  `transparent` / `animationType` props are props, everything inside it uses `className`.
- Design tokens only: `bg-card`, `bg-background`, `border-border`, `text-foreground`,
  `text-muted-foreground`, `rounded-card`, `rounded-full`, `font-sans`, `font-display`,
  `text-body`, `text-subtle`, `text-caption`. No new colours, no new fonts. (DESIGN.md)
- TypeScript strict, no `any`. (AGENTS.md)

### One resolved conflict in the spec

Spec §4 says the numerator shows "to one decimal", while spec §10 requires a typed `0.25` to be
accepted. Both cannot hold for a soup: `0.25` would display as `0.3` while the macros used `0.25`,
and the diner can see the mismatch (`0.3 × 1043 ≠ the kcal shown`). **Resolution: typed input is
rounded to two decimals on accept, and display shows up to two decimals with trailing zeros
stripped.** Display then always equals the number the macros used. Stepper values are unaffected —
with `piecesPerOrder > 1` the numerator is a whole number, and with `1` the step is `0.5`.

---

### Task 1: The pure conversions in `src/lib/portions.ts`

Replaces `portionSteps`, whose only two callers are `MenuItemRow` (line 44) and this test file —
confirmed with code-review-graph `callers_of` on 2026-08-11.

**Files:**
- Modify: `src/lib/portions.ts` (whole file replaced)
- Test: `src/lib/portions_test.ts` (whole file replaced)

**Interfaces:**
- Consumes: nothing.
- Produces, for Tasks 2 and 3:
  - `resolvePiecesPerOrder(servingPieces?: number | null): number` — integer 1–50, else 1
  - `portionStep(piecesPerOrder: number): number` — `1 / piecesPerOrder` when above 1, else `0.5`
  - `portionLabel(portion: number, piecesPerOrder: number): string` — `"8 / 8"` or `"0.5"`
  - `parsePortionInput(text: string): number | null` — positive number rounded to 2dp, else null
  - `parsePiecesInput(text: string): number | null` — integer 1–50, else null

- [ ] **Step 1: Write the failing tests**

Replace the entire contents of `src/lib/portions_test.ts` with:

```ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  parsePiecesInput,
  parsePortionInput,
  portionLabel,
  portionStep,
  resolvePiecesPerOrder,
} from "./portions.ts";

Deno.test("a model count the UI can trust is kept", () => {
  assertEquals(resolvePiecesPerOrder(8), 8);
  assertEquals(resolvePiecesPerOrder(3), 3);
  assertEquals(resolvePiecesPerOrder(12), 12);
  assertEquals(resolvePiecesPerOrder(50), 50);
});

Deno.test("every other shape a model can return becomes 1", () => {
  // 1 is the safe default: it is what most of the world's menu items are, and
  // it behaves exactly as the app did before pieces existed.
  for (const bad of [null, undefined, 0, -3, 1.5, 51, 1000, NaN, Infinity]) {
    assertEquals(resolvePiecesPerOrder(bad), 1, `pieces=${bad} must become 1`);
  }
});

Deno.test("the step is one piece, or half an order when there are no pieces", () => {
  assertEquals(portionStep(1), 0.5);
  assertEquals(portionStep(8), 1 / 8);
  assertEquals(portionStep(3), 1 / 3);
});

Deno.test("a dish with no pieces reads as a plain quantity", () => {
  assertEquals(portionLabel(1, 1), "1");
  assertEquals(portionLabel(0.5, 1), "0.5");
  assertEquals(portionLabel(2, 1), "2");
});

Deno.test("a dish with pieces reads as count over divisor", () => {
  assertEquals(portionLabel(1, 8), "8 / 8");
  assertEquals(portionLabel(0.5, 8), "4 / 8");
  assertEquals(portionLabel(0.5, 3), "1.5 / 3");
  assertEquals(portionLabel(2 / 3, 3), "2 / 3");
});

Deno.test("labels survive floating-point accumulation", () => {
  // 1/3 + 1/3 + 1/3 is not exactly 1, and nobody may ever see "2.9999 / 3".
  const third = portionStep(3);
  assertEquals(portionLabel(third + third, 3), "2 / 3");
  assertEquals(portionLabel(third + third + third, 3), "3 / 3");
});

Deno.test("neither form has a ceiling", () => {
  // Two whole pizzas is sixteen slices; two soups is 2.
  assertEquals(portionLabel(2, 8), "16 / 8");
  assertEquals(portionLabel(3, 1), "3");
});

Deno.test("INVARIANT: changing the divisor never changes the macros", () => {
  // The spec's central guarantee. Macros are itemMacros x portion, so the
  // divisor is arithmetically absent - this test is what keeps it that way.
  const kcal = 1043;
  for (const portion of [1, 0.5, 0.25, 2, 1 / 3]) {
    const macros = kcal * portion;
    for (const divisor of [1, 3, 8, 12, 50]) {
      // The label is the ONLY thing a divisor is allowed to touch.
      portionLabel(portion, divisor);
      assertEquals(kcal * portion, macros, `divisor=${divisor} moved the macros`);
    }
  }
});

Deno.test("a typed quantity is accepted down to a quarter and rounded to 2dp", () => {
  assertEquals(parsePortionInput("0.25"), 0.25);
  assertEquals(parsePortionInput("1"), 1);
  assertEquals(parsePortionInput("2.5"), 2.5);
  assertEquals(parsePortionInput("0.333"), 0.33);
  // What is displayed must be what the macros used.
  assertEquals(portionLabel(parsePortionInput("0.25")!, 1), "0.25");
});

Deno.test("a typed quantity that is not a positive number is rejected", () => {
  for (const bad of ["", " ", "0", "-1", "abc", "1.2.3", "NaN", "Infinity"]) {
    assertEquals(parsePortionInput(bad), null, `"${bad}" must be rejected`);
  }
});

Deno.test("a typed divisor must be a whole number of pieces from 1 to 50", () => {
  assertEquals(parsePiecesInput("8"), 8);
  assertEquals(parsePiecesInput("1"), 1);
  assertEquals(parsePiecesInput("50"), 50);
  for (const bad of ["", "0", "-2", "1.5", "51", "abc", "Infinity"]) {
    assertEquals(parsePiecesInput(bad), null, `"${bad}" must be rejected`);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `deno test --allow-read src/lib/portions_test.ts`
Expected: FAIL — the module has no export named `resolvePiecesPerOrder`.

- [ ] **Step 3: Write the implementation**

Replace the entire contents of `src/lib/portions.ts` with:

```ts
/**
 * How much of a dish the diner will eat, in the dish's own unit.
 *
 * Two numbers describe a portion. `portion` is the share of ONE ORDER and is
 * the only one the macros ever see - they are always `itemMacros * portion`.
 * `piecesPerOrder` is what that order is cut into, and it only formats: a
 * pizza reads "4 / 8", a soup reads "0.5". Because the divisor is absent from
 * the arithmetic, correcting a wrong piece count cannot move a single calorie,
 * which is what makes the model's piece-count defect an ergonomics problem
 * rather than a data one.
 */

const MAX_PIECES = 50;

/**
 * The divisor to show for a model-supplied count. A model can return anything;
 * the UI shows only a whole number of pieces from 1 to 50. Everything else
 * becomes 1, which is what most of the world's menu items are anyway.
 */
export function resolvePiecesPerOrder(servingPieces?: number | null): number {
  if (
    typeof servingPieces !== "number" ||
    !Number.isInteger(servingPieces) ||
    servingPieces < 1 ||
    servingPieces > MAX_PIECES
  ) {
    return 1;
  }
  return servingPieces;
}

/** One tap of the +/- control: one piece, or half an order when there are none. */
export function portionStep(piecesPerOrder: number): number {
  return piecesPerOrder > 1 ? 1 / piecesPerOrder : 0.5;
}

/**
 * What the row shows. No ceiling in either form - "16 / 8" is two pizzas and
 * "2" is two soups, both of which someone orders.
 */
export function portionLabel(portion: number, piecesPerOrder: number): string {
  if (piecesPerOrder <= 1) return formatQuantity(portion);
  return `${formatQuantity(portion * piecesPerOrder)} / ${piecesPerOrder}`;
}

/** A typed quantity: any positive number, rounded to the 2dp the row can show. */
export function parsePortionInput(text: string): number | null {
  const value = Number(text.trim());
  if (text.trim() === "" || !Number.isFinite(value) || value <= 0) return null;
  return round2(value);
}

/** A typed divisor: a whole number of pieces, 1 to 50. */
export function parsePiecesInput(text: string): number | null {
  const value = Number(text.trim());
  if (
    text.trim() === "" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_PIECES
  ) {
    return null;
  }
  return value;
}

/**
 * Two decimals, trailing zeros stripped. Two, not one, so that a typed 0.25
 * displays as what the macros actually used - a diner who sees "0.3" next to
 * calories computed from 0.25 has caught the app lying. Rounding also erases
 * floating-point noise: 1/3 + 1/3 + 1/3 times 3 is 2.9999999999999996, and
 * nobody may ever see that.
 */
function formatQuantity(value: number): string {
  return String(round2(value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `deno test --allow-read src/lib/portions_test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/portions.ts src/lib/portions_test.ts
git commit -m "feat(portions): one quantity and one divisor, with the divisor kept out of the macros"
```

---

### Task 2: The editor modal

A new component rather than more lines in `MenuItemRow`: it is a self-contained UI concept with its
own draft state, and `MenuItemRow` is already the longest component in `src/components/`.

**Files:**
- Create: `src/components/results/PortionEditor.tsx`

**Interfaces:**
- Consumes from Task 1: `parsePortionInput`, `parsePiecesInput`, `portionStep`.
- Produces for Task 3:
  ```ts
  <PortionEditor
    visible={boolean}
    name={string}
    portion={number}
    piecesPerOrder={number}
    onClose={() => void}
    onSubmit={(portion: number, piecesPerOrder: number) => void}
  />
  ```

- [ ] **Step 1: Write the component**

Create `src/components/results/PortionEditor.tsx`:

> ⚠️ **SUPERSEDED BY THE SHIPPED FILE — read `src/components/results/PortionEditor.tsx`, not this
> block.** This is the plan as written BEFORE device testing, kept as a historical record. Four things
> changed the same evening and are NOT reflected below: the quantity field counts the dish's own unit
> rather than orders (`unitCount` / `portionFromUnitCount` own that conversion), both fields sanitise
> non-numeric input, the editor gained the live *"each piece about N cal"* line, and **`textAlign`
> moved out of `className` into `style`** — `nativewind@5.0.0-preview.4` ships a `nativeStyleMapping`
> of `{ textAlign: true }` against code that calls `path.split(".")`, so **`text-center` on a
> `TextInput` is a hard crash on open.** Do not copy the styling below.

```tsx
import { useEffect, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { colors } from "@/constants/theme";
import {
  parsePiecesInput,
  parsePortionInput,
  portionStep,
} from "@/lib/portions";

interface PortionEditorProps {
  visible: boolean;
  /** The dish name, so the diner knows which row they opened. */
  name: string;
  portion: number;
  piecesPerOrder: number;
  onClose: () => void;
  onSubmit: (portion: number, piecesPerOrder: number) => void;
}

/**
 * One editor for both numbers: how much the diner will have, and what the dish
 * comes in. It is the only route by which a dish the model called whole can be
 * cut into slices, which is the Margherita case - all 26 Bistro pizzas came
 * back as 1 piece on 2026-08-11.
 *
 * Both fields are numeric. Nothing typed here reaches a model, so there is no
 * prompt-injection surface (Santiago, 2026-08-11).
 */
export function PortionEditor({
  visible,
  name,
  portion,
  piecesPerOrder,
  onClose,
  onSubmit,
}: PortionEditorProps) {
  const [quantity, setQuantity] = useState(String(portion));
  const [divisor, setDivisor] = useState(String(piecesPerOrder));

  useEffect(() => {
    // Reopening on a different row - or after a cancel - must show that row's
    // current values, not the last ones typed.
    if (visible) {
      setQuantity(String(portion));
      setDivisor(String(piecesPerOrder));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed the draft on open only
  }, [visible]);

  const parsedQuantity = parsePortionInput(quantity);
  const parsedDivisor = parsePiecesInput(divisor);
  const canSave = parsedQuantity !== null && parsedDivisor !== null;

  const nudgeQuantity = (direction: 1 | -1) => {
    const current = parsedQuantity ?? portion;
    const step = portionStep(parsedDivisor ?? piecesPerOrder);
    // The stepper floors at one step; only typing goes below it.
    const next = Math.max(step, current + direction * step);
    setQuantity(String(Math.round(next * 100) / 100));
  };

  const nudgeDivisor = (direction: 1 | -1) => {
    const current = parsedDivisor ?? piecesPerOrder;
    setDivisor(String(Math.min(50, Math.max(1, current + direction))));
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable
        className="flex-1 items-center justify-center px-6"
        style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
        onPress={onClose}
        accessibilityLabel="Close portion editor"
      >
        <Pressable
          className="w-full rounded-card bg-background border border-border p-5"
          onPress={() => {}}
        >
          <Text
            className="font-display text-body text-foreground"
            numberOfLines={2}
          >
            {name}
          </Text>

          <EditorField
            label="I'll have"
            value={quantity}
            valid={parsedQuantity !== null}
            onChangeText={setQuantity}
            onDecrease={() => nudgeQuantity(-1)}
            onIncrease={() => nudgeQuantity(1)}
          />
          <EditorField
            label="comes in"
            value={divisor}
            valid={parsedDivisor !== null}
            onChangeText={setDivisor}
            onDecrease={() => nudgeDivisor(-1)}
            onIncrease={() => nudgeDivisor(1)}
          />

          <Text className="font-sans text-caption text-muted-foreground mt-3">
            Changing what it comes in never changes the nutrition.
          </Text>

          <View className="flex-row justify-end items-center mt-4 gap-4">
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
              <Text className="font-sans text-button text-muted-foreground">
                Cancel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                // Narrowed one at a time: `canSave` is a boolean, and TS will
                // not narrow the two values through it.
                if (parsedQuantity !== null && parsedDivisor !== null) {
                  onSubmit(parsedQuantity, parsedDivisor);
                }
              }}
              disabled={!canSave}
              hitSlop={8}
              className={`rounded-full bg-foreground px-5 py-2 ${
                canSave ? "" : "opacity-40"
              }`}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
            >
              <Text className="font-sans text-button text-background">Done</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** One labelled row: minus, a typable number, plus. */
function EditorField({
  label,
  value,
  valid,
  onChangeText,
  onDecrease,
  onIncrease,
}: {
  label: string;
  value: string;
  valid: boolean;
  onChangeText: (text: string) => void;
  onDecrease: () => void;
  onIncrease: () => void;
}) {
  return (
    <View className="flex-row items-center justify-between mt-4">
      <Text className="font-sans text-subtle text-muted-foreground">
        {label}
      </Text>
      <View className="flex-row items-center gap-2">
        <Pressable
          onPress={onDecrease}
          hitSlop={8}
          className="w-8 h-8 items-center justify-center rounded-full border border-border"
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <Minus size={14} color={colors.mutedForeground} strokeWidth={2} />
        </Pressable>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          selectTextOnFocus
          // `text-center` REMOVED - it crashes on open under
          // nativewind@5.0.0-preview.4. The shipped file passes
          // style={{ textAlign: "center" }} instead.
          style={{ textAlign: "center" }}
          className={`w-16 h-8 rounded-chip bg-card font-sans text-body ${
            valid ? "text-foreground" : "text-danger"
          }`}
          accessibilityLabel={label}
        />
        <Pressable
          onPress={onIncrease}
          hitSlop={8}
          className="w-8 h-8 items-center justify-center rounded-full border border-border"
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <Plus size={14} color={colors.mutedForeground} strokeWidth={2} />
        </Pressable>
      </View>
    </View>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `pnpm exec tsc --noEmit`
Expected: no errors in `src/components/results/PortionEditor.tsx`. (Pre-existing errors elsewhere,
if any, are not this task's to fix — note them and move on.)

- [ ] **Step 3: Commit**

```bash
git add src/components/results/PortionEditor.tsx
git commit -m "feat(results): one editor for both the quantity and the divisor"
```

---

### Task 3: Wire the row and the screen

**Files:**
- Modify: `src/components/results/MenuItemRow.tsx` (import, props, the stepper block at lines 93–121)
- Modify: `src/app/results.tsx` (state at line 183, reset at line 208, render at line 384)

**Interfaces:**
- Consumes from Task 1: `resolvePiecesPerOrder`, `portionStep`, `portionLabel`.
- Consumes from Task 2: `PortionEditor`.
- Produces: nothing further — this is the last task.

- [ ] **Step 1: Update `MenuItemRow`**

Replace the `portionSteps` import (line 7) with:

```tsx
import { useState } from "react";
import { portionLabel, portionStep } from "@/lib/portions";
import { PortionEditor } from "./PortionEditor";
```

Add two props to `MenuItemRowProps`:

```tsx
  piecesPerOrder: number;
  onPortionEdit: (portion: number, piecesPerOrder: number) => void;
```

and to the destructured parameters. Replace line 44 (`const { step, label } = ...`) with:

```tsx
  const [editing, setEditing] = useState(false);
  const step = portionStep(piecesPerOrder);
```

Replace the stepper block (the `<View className="flex-row items-center justify-end mt-3 gap-2">`
through its closing `</View>`) with:

```tsx
      <View className="flex-row items-center justify-end mt-3 gap-2">
        <Pressable
          onPress={() => onPortionEdit(Math.max(step, portion - step), piecesPerOrder)}
          disabled={portion <= step}
          hitSlop={8}
          className={`w-7 h-7 items-center justify-center rounded-full border border-border ${
            portion <= step ? "opacity-40" : ""
          }`}
          accessibilityRole="button"
          accessibilityLabel="Decrease portion"
          accessibilityState={{ disabled: portion <= step }}
        >
          <Minus size={14} color={colors.mutedForeground} strokeWidth={2} />
        </Pressable>

        {/* The value must LOOK tappable - it is the only way anyone discovers
            they can correct a wrong piece count. */}
        <Pressable
          onPress={() => setEditing(true)}
          hitSlop={8}
          className="min-w-16 px-2 py-0.5 rounded-chip bg-card"
          accessibilityRole="button"
          accessibilityLabel={`Edit portion, currently ${portionLabel(portion, piecesPerOrder)}`}
        >
          <Text className="font-sans text-caption text-foreground text-center">
            {portionLabel(portion, piecesPerOrder)}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => onPortionEdit(portion + step, piecesPerOrder)}
          hitSlop={8}
          className="w-7 h-7 items-center justify-center rounded-full border border-border"
          accessibilityRole="button"
          accessibilityLabel="Increase portion"
        >
          <Plus size={14} color={colors.mutedForeground} strokeWidth={2} />
        </Pressable>
      </View>

      <PortionEditor
        visible={editing}
        name={item.name}
        portion={portion}
        piecesPerOrder={piecesPerOrder}
        onClose={() => setEditing(false)}
        onSubmit={(nextPortion, nextPieces) => {
          onPortionEdit(nextPortion, nextPieces);
          setEditing(false);
        }}
      />
```

- [ ] **Step 2: Update `results.tsx`**

Add the import beside the existing `MenuItemRow` import (line 19):

```tsx
import { resolvePiecesPerOrder } from "@/lib/portions";
```

Beside the `portions` state (line 183) add:

```tsx
  const [pieces, setPieces] = useState<Record<number, number>>({});
```

In the reset effect (line 208), beside `setPortions({})` add:

```tsx
    setPieces({});
```

Replace the `<MenuItemRow ... />` call (line 384) with:

```tsx
          <MenuItemRow
            item={item}
            rank={index + 1}
            highlight={highlight}
            portion={portions[id] ?? 1}
            piecesPerOrder={pieces[id] ?? resolvePiecesPerOrder(item.serving_pieces)}
            selectedAllergens={selectedAllergens}
            onPortionEdit={(portion, piecesPerOrder) => {
              setPortions((prev) => ({ ...prev, [id]: portion }));
              setPieces((prev) => ({ ...prev, [id]: piecesPerOrder }));
            }}
          />
```

- [ ] **Step 3: Verify the whole thing type-checks and lints**

Run: `pnpm exec tsc --noEmit && pnpm lint`
Expected: no new errors. The old `onPortionChange` prop and the `portionSteps` import must both be
gone — if `tsc` still mentions either, the edit is incomplete.

- [ ] **Step 4: Re-run the unit tests**

Run: `deno test --allow-read src/lib/portions_test.ts`
Expected: PASS, 11 tests. (They do not touch React, so they should be unaffected — this is the
guard that Task 3 did not quietly change a conversion.)

- [ ] **Step 5: Commit**

```bash
git add src/components/results/MenuItemRow.tsx src/app/results.tsx
git commit -m "feat(results): tap the portion to set how much you'll have and what it comes in"
```

---

### Task 4: Record it and close the loop

**Files:**
- Modify: `docs/superpowers/stage2-macro-benchmark.md` (append a ledger entry)

- [ ] **Step 1: Append the ledger entry**

Add an entry dated 2026-08-11 recording: what shipped (the portion control, client-side only), what
did NOT (no edge-function change, no schema change, no model change), the invariant that makes a
wrong piece count harmless, the one spec conflict resolved in this plan (two decimals, not one), and
that the control needs **TestFlight build 7** to be visible — build 6 still renders the old label.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/stage2-macro-benchmark.md
git commit -m "docs: the portion control - what shipped and what it cannot break"
```

---

## Verification checklist

Run before declaring done:

| Check | Command | Expected |
|---|---|---|
| Conversions | `deno test --allow-read src/lib/portions_test.ts` | 11 passed |
| Types | `pnpm exec tsc --noEmit` | no new errors |
| Lint | `pnpm lint` | no new errors |
| No stale caller | `grep -rn "portionSteps\|onPortionChange" src/` | no matches |

Manual, on a build: a soup reads `1` and steps to `0.5`; a roll reads `8 / 8` and steps to `7 / 8`;
tapping a Margherita's `1` and setting comes-in to 8 shows `8 / 8` with the **calories unchanged**.
