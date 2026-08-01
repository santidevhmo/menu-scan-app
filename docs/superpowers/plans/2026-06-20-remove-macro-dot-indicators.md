# Remove Macro Dot Indicators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Code style:** Use the `ponytail` skill — laziest solution that works, fewest files, no speculative abstraction. This is a deletion task: remove code, add nothing.

**Goal:** Remove the menu-relative four-dot macro badge UI (`●●●○`) from ranked results, leaving each macro badge showing only its rounded value+unit and its label.

**Architecture:** The dots bucket each macro relative to the current menu's own max (`bucketDots`), so a 50g-protein item on a menu topped by a 100g item shows only 2/4 dots even though 50g is objectively high. "High/low" is individual to a user's goals, so a menu-relative visual misleads. We delete the dot rendering and the entire menu-max plumbing that fed it (`bucketDots`, `MacroMaxes`, `computeMaxes`, the `maxValues` prop). We keep `highlight` (bold text when a macro matches a selected goal — goal-relative by intent) and the portion stepper untouched. No replacement visual.

**Tech Stack:** Expo, React Native, TypeScript (strict), NativeWind, Expo Router, Lucide icons.

**Corresponds to:** Phase 6 of `docs/superpowers/plans/2026-05-25-multi-model-menu-analysis.md`. This file is the exact, zero-context execution version of that phase's Task 6.1. Do **not** rewrite the master plan; tick its Phase 6 boxes when done.

## Global Constraints

- TypeScript strict mode; no `any`.
- Use **pnpm**. Type-check with `pnpm tsc --noEmit`; lint with `pnpm exec eslint src/ --ext .ts,.tsx`.
- Surgical changes only. Every removed line must trace to deleting the dot UI or cleaning up an orphan it created. Do not touch the portion stepper, the allergen line, `highlight`, or sorting.
- Keep the `colors` import in `MenuItemRow.tsx` — the stepper's `Minus`/`Plus` icons still use `colors.mutedForeground`.

---

## File Map

| File | Action | What changes |
| ---- | ------ | ------------ |
| `src/components/results/MenuItemRow.tsx` | Modify | Drop the dot `Text` and `filled` prop from `MacroBadge`; drop the `bucketDots` call, `MacroMaxes` interface, and `maxValues` prop. |
| `src/lib/analyzeMenu.ts` | Modify | Delete the now-unused `bucketDots` export. |
| `src/app/results.tsx` | Modify | Delete `computeMaxes`, the `maxValues` local + prop, the `MacroMaxes` import, and the orphaned `EnrichedItem` import. |

This is one cohesive, independently-testable deliverable, so it is a single task. Edit in the order below (leaf component → its helper → parent) so each file's removed symbol has no remaining caller by the time you delete it.

---

## Task 1: Remove the macro dot indicators

**Files:**
- Modify: `src/components/results/MenuItemRow.tsx`
- Modify: `src/lib/analyzeMenu.ts`
- Modify: `src/app/results.tsx`

**Interfaces:**
- Consumes: `EnrichedItem` (`@/types/scan`), `MacroField` (`@/data/goals`), `selectedMacros` / `sortItemsByGoals` (`@/lib/analyzeMenu`) — all unchanged by this task.
- Produces: `MenuItemRow` with props `{ item, rank, highlight, portion, onPortionChange }` (the `maxValues` prop is removed). `bucketDots`, `MacroMaxes`, and `computeMaxes` cease to exist.

---

- [ ] **Step 1: Trim `MenuItemRow` imports and props.**

In `src/components/results/MenuItemRow.tsx`, replace the top block (the imports through the end of `interface MenuItemRowProps`) — delete the `bucketDots` import and the `MacroMaxes` interface, and drop `maxValues` from the props:

```tsx
import { Pressable, Text, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { colors } from "@/constants/theme";
import type { EnrichedItem } from "@/types/scan";
import type { MacroField } from "@/data/goals";

interface MenuItemRowProps {
  item: EnrichedItem;
  rank: number;
  highlight: Set<MacroField>;
  portion: number;
  onPortionChange: (portion: number) => void;
}
```

- [ ] **Step 2: Drop `maxValues` from the destructure.**

In the same file, change the `MenuItemRow` parameter destructure from:

```tsx
export function MenuItemRow({
  item,
  rank,
  maxValues,
  highlight,
  portion,
  onPortionChange,
}: MenuItemRowProps) {
```

to:

```tsx
export function MenuItemRow({
  item,
  rank,
  highlight,
  portion,
  onPortionChange,
}: MenuItemRowProps) {
```

- [ ] **Step 3: Remove the `bucketDots` call in the badge map.**

In the same file, change the `MACROS.map` block from:

```tsx
        {MACROS.map((macro) => (
          <MacroBadge
            key={macro.field}
            label={macro.label}
            value={item[macro.field] * portion}
            unit={macro.unit}
            filled={bucketDots(
              item[macro.field] * portion,
              maxValues[macro.field],
            )}
            highlight={highlight.has(macro.field)}
          />
        ))}
```

to:

```tsx
        {MACROS.map((macro) => (
          <MacroBadge
            key={macro.field}
            label={macro.label}
            value={item[macro.field] * portion}
            unit={macro.unit}
            highlight={highlight.has(macro.field)}
          />
        ))}
```

- [ ] **Step 4: Strip the dots out of `MacroBadge`.**

In the same file, replace the entire `MacroBadge` function (it currently renders a dots `Text` and a value `Text` with `mt-1` spacing) with this version — `filled` prop gone, dots gone, `dotColor` gone, and the value's now-orphaned `mt-1` removed since it is the top element:

```tsx
/** One macro badge: the rounded value with unit, and its label. */
function MacroBadge({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: number;
  unit: string;
  highlight: boolean;
}) {
  return (
    <View className="items-center">
      <Text
        className={`font-sans text-subtle ${
          highlight ? "text-foreground font-semibold" : "text-muted-foreground"
        }`}
      >
        {Math.round(value)}
        {unit}
      </Text>
      <Text className="font-sans text-caption text-muted-foreground">
        {label}
      </Text>
    </View>
  );
}
```

- [ ] **Step 5: Delete `bucketDots` from `analyzeMenu.ts`.**

In `src/lib/analyzeMenu.ts`, delete the entire `bucketDots` function (its doc comment plus the function — the block beginning `/** Buckets a macro value into 1-4 filled dots, relative to the menu's max. */` and ending at its closing brace):

```tsx
/** Buckets a macro value into 1-4 filled dots, relative to the menu's max. */
export function bucketDots(value: number, max: number): number {
  if (max <= 0) return 1;
  const ratio = value / max;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}
```

Leave `sortItemsByGoals`, `selectedMacros`, `extractMenu`, and `enrichMenu` untouched.

- [ ] **Step 6: Fix the `results.tsx` import of `MenuItemRow`.**

In `src/app/results.tsx`, change:

```tsx
import { MenuItemRow, type MacroMaxes } from "@/components/results/MenuItemRow";
```

to:

```tsx
import { MenuItemRow } from "@/components/results/MenuItemRow";
```

- [ ] **Step 7: Remove the orphaned `EnrichedItem` type import.**

In `src/app/results.tsx`, the type import block currently reads:

```tsx
import type {
  EnrichedItem,
  EnrichmentResult,
  ExtractionResult,
} from "@/types/scan";
```

After Step 8 removes `computeMaxes`, `EnrichedItem` is unused in this file. Change it to:

```tsx
import type { EnrichmentResult, ExtractionResult } from "@/types/scan";
```

- [ ] **Step 8: Delete `computeMaxes`.**

In `src/app/results.tsx`, delete the entire `computeMaxes` function (doc comment included):

```tsx
/** Computes the menu-relative max for each macro across all items. */
function computeMaxes(items: EnrichedItem[]): MacroMaxes {
  return {
    protein_g: Math.max(0, ...items.map((item) => item.protein_g)),
    carb_g: Math.max(0, ...items.map((item) => item.carb_g)),
    fat_g: Math.max(0, ...items.map((item) => item.fat_g)),
    estimated_calories: Math.max(
      0,
      ...items.map((item) => item.estimated_calories),
    ),
  };
}
```

- [ ] **Step 9: Remove the `maxValues` local and prop in `ResultsPhase`.**

In `src/app/results.tsx`, inside `ResultsPhase`, delete this line:

```tsx
  const maxValues = computeMaxes(result.items);
```

(Leave the `highlight`, `sorted`, `idOf`, and `lowConfidence` lines that follow it.)

Then in the `renderItem` for the `FlatList`, change the `MenuItemRow` usage from:

```tsx
          <MenuItemRow
            item={item}
            rank={index + 1}
            maxValues={maxValues}
            highlight={highlight}
            portion={portions[id] ?? 1}
            onPortionChange={(portion) =>
              setPortions((prev) => ({ ...prev, [id]: portion }))
            }
          />
```

to:

```tsx
          <MenuItemRow
            item={item}
            rank={index + 1}
            highlight={highlight}
            portion={portions[id] ?? 1}
            onPortionChange={(portion) =>
              setPortions((prev) => ({ ...prev, [id]: portion }))
            }
          />
```

- [ ] **Step 10: Type-check and lint.**

Run:

```bash
pnpm tsc --noEmit && pnpm exec eslint src/ --ext .ts,.tsx
```

Expected: zero errors. (A non-zero result here most likely means a leftover reference to `bucketDots`, `MacroMaxes`, `maxValues`, `computeMaxes`, or the `EnrichedItem` import — grep `src/` for each to confirm it's gone.)

- [ ] **Step 11: Commit.**

```bash
git add src/components/results/MenuItemRow.tsx src/lib/analyzeMenu.ts src/app/results.tsx
git commit -m "feat: remove menu-relative macro dot indicators"
```

---

## Verification

1. **Type/lint:** `pnpm tsc --noEmit` and `pnpm exec eslint src/ --ext .ts,.tsx` → zero errors.
2. **Symbols gone:** `grep -rnE "bucketDots|MacroMaxes|computeMaxes|maxValues" src/` returns nothing.
3. **Manual (simulator):** scan → pick a goal → Continue to ranked results. Each macro badge shows only the rounded number + unit (e.g. `38g`) above its label — no `●○` dots anywhere.
4. **Highlight preserved:** the macro matching the selected goal still renders bold/dark text; the others stay muted grey.
5. **Portion stepper unaffected:** tapping `+`/`−` on a row still scales that row's displayed macro numbers, and the `−` button is still disabled at `1/2`.
6. **Allergen line unaffected:** items with allergens still show their red `Allergens: …` line.
