# Multi-Goal Z-Score Nutritional Sorting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken `sortItemsByGoals` function (which silently ignores every goal after `goals[0]`) with z-score normalization that combines all selected macro goals into a single `alignment_score`, then add console logging so ranked output can be validated manually.

**Architecture:** Extract pure z-score math into a side-effect-free `src/lib/zScoreSort.ts` (no path-alias imports, testable with bare `node`). `sortItemsByGoals` in `analyzeMenu.ts` calls into it. `ScoredItem` (extending `EnrichedItem` with `alignment_score` and `goal_scores`) is defined in `src/types/scan.ts` and returned by the rewritten function. A `useEffect` in `results.tsx` logs the sorted output once per results set.

**Tech Stack:** TypeScript (Node v25.9.0 native type-stripping for test runner), React Native / Expo, existing `GOALS_SORT_MAP` and `EnrichedItem` types.

## Global Constraints

- Package manager: `pnpm` only. No `npm install` or `yarn`.
- No new npm dependencies.
- TypeScript strict mode; no `any`.
- `pnpm tsc --noEmit` must pass with zero errors after every task.
- `pnpm exec eslint src/ --ext .ts,.tsx` must pass with zero errors after every task.
- Test runner: none installed. Use `node` directly — Node v25.9.0 strips TypeScript types natively. Relative imports in `.ts` files **must** include the `.ts` extension (e.g. `import { x } from "../zScoreSort.ts"`).
- Path alias `@/*` → `./src/*` works only inside the Metro/tsc bundler. Test scripts that `node` runs directly **cannot** use `@/` imports — use relative paths only.
- No comments explaining what code does. A single short comment is allowed only when the WHY is non-obvious.
- NativeWind for all styling; no `StyleSheet` unless in the Style Exception List.

---

## File Map

| Action | Path | Purpose |
|--------|------|---------|
| **Create** | `src/lib/zScoreSort.ts` | Pure z-score math: `computeZScores`, `squashZScore`, `scoreAndSort`. Zero external imports → directly testable with `node`. |
| **Create** | `src/lib/__tests__/zScoreSort.test.ts` | Standalone Node test script. Imports from `../zScoreSort.ts` with `.ts` extension. |
| **Modify** | `src/types/scan.ts` | Add `ScoredItem` interface (extends `EnrichedItem`). |
| **Modify** | `src/lib/analyzeMenu.ts` | Rewrite `sortItemsByGoals` to use `scoreAndSort`; update return type to `ScoredItem[]`. |
| **Modify** | `src/app/results.tsx` | Add `useEffect` that logs sorted results with scores (Task 6.F1). |

---

## Task 1: Pure z-score math helper + Node test

**Files:**
- Create: `src/lib/zScoreSort.ts`
- Create: `src/lib/__tests__/zScoreSort.test.ts`

**Interfaces:**
- Produces:
  - `computeZScores(values: number[]): number[]`
  - `squashZScore(z: number): number`
  - `scoreAndSort<T extends Record<string, unknown>>(items: T[], goals: GoalVector[]): Array<T & { alignment_score: number; goal_scores: Record<string, number> }>`
  - `interface GoalVector { name: string; field: string; direction: 1 | -1; }`

- [ ] **Step 1: Create `src/lib/zScoreSort.ts`**

```typescript
export interface GoalVector {
  name: string;
  field: string;
  direction: 1 | -1; // 1 = maximize, -1 = minimize
}

export function computeZScores(values: number[]): number[] {
  const n = values.length;
  if (n === 0) return [];
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  const stddev = Math.sqrt(variance);
  if (stddev === 0) return values.map(() => 0);
  return values.map((v) => (v - mean) / stddev);
}

// ponytail: sigmoid squash — cosmetic only, sort order is already correct before this
export function squashZScore(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export function scoreAndSort<T extends Record<string, unknown>>(
  items: T[],
  goals: GoalVector[],
): Array<T & { alignment_score: number; goal_scores: Record<string, number> }> {
  if (items.length === 0) return [];

  if (goals.length === 0) {
    return items.map((item) => ({ ...item, alignment_score: 0, goal_scores: {} }));
  }

  const perGoalZ: Record<string, number[]> = {};
  for (const goal of goals) {
    const raw = items.map((item) => (item[goal.field] as number) ?? 0);
    const zs = computeZScores(raw);
    perGoalZ[goal.name] = zs.map((z) => z * goal.direction);
  }

  const scored = items.map((item, i) => {
    const goal_scores: Record<string, number> = {};
    let total = 0;
    for (const goal of goals) {
      const z = perGoalZ[goal.name][i];
      goal_scores[goal.name] = z;
      total += z;
    }
    return { ...item, alignment_score: total / goals.length, goal_scores };
  });

  return scored.sort((a, b) => b.alignment_score - a.alignment_score);
}
```

- [ ] **Step 2: Create `src/lib/__tests__/zScoreSort.test.ts`**

Make the `__tests__` directory first: `mkdir -p src/lib/__tests__`

```typescript
import { computeZScores, squashZScore, scoreAndSort } from "../zScoreSort.ts";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

// computeZScores
console.log("\ncomputeZScores");
{
  const zs = computeZScores([10, 20, 30]);
  const sum = zs.reduce((s, v) => s + v, 0);
  check("mean of z-scores is 0", Math.abs(sum) < 1e-9);
  check("below-mean value is negative", zs[0] < 0);
  check("above-mean value is positive", zs[2] > 0);
  check("empty array → empty", computeZScores([]).length === 0);
  check("all-same → all zeros", computeZScores([5, 5, 5]).every((z) => z === 0));
}

// squashZScore
console.log("\nsquashZScore");
{
  check("z=0 → 0.5", Math.abs(squashZScore(0) - 0.5) < 1e-9);
  check("positive z > 0.5", squashZScore(2) > 0.5);
  check("negative z < 0.5", squashZScore(-2) < 0.5);
  check("large positive z stays ≤ 1", squashZScore(100) <= 1);
  check("large negative z stays ≥ 0", squashZScore(-100) >= 0);
}

const items = [
  { name: "Salad",   protein_g: 5,  carb_g: 10, fat_g: 2, estimated_calories: 80  },
  { name: "Chicken", protein_g: 45, carb_g: 0,  fat_g: 8, estimated_calories: 250 },
  { name: "Pasta",   protein_g: 15, carb_g: 60, fat_g: 6, estimated_calories: 400 },
];

// scoreAndSort — single goal, maximize protein
console.log("\nscoreAndSort — single goal (maximize protein)");
{
  const goals = [{ name: "Highest in protein", field: "protein_g", direction: 1 as const }];
  const result = scoreAndSort(items, goals);
  check("Chicken ranks first", result[0].name === "Chicken");
  check("Salad ranks last", result[2].name === "Salad");
  check("alignment_score is a number", typeof result[0].alignment_score === "number");
  check("goal_scores keyed by goal name", "Highest in protein" in result[0].goal_scores);
  check("returns all 3 items", result.length === 3);
}

// scoreAndSort — single goal, minimize calories
console.log("\nscoreAndSort — single goal (minimize calories)");
{
  const goals = [{ name: "Low calorie", field: "estimated_calories", direction: -1 as const }];
  const result = scoreAndSort(items, goals);
  check("Salad ranks first (lowest calories)", result[0].name === "Salad");
  check("Pasta ranks last (highest calories)", result[2].name === "Pasta");
}

// scoreAndSort — two goals, high protein + low calorie
console.log("\nscoreAndSort — conflicting goals (high protein + low calorie)");
{
  const goals = [
    { name: "Highest in protein", field: "protein_g", direction: 1 as const },
    { name: "Low calorie", field: "estimated_calories", direction: -1 as const },
  ];
  const result = scoreAndSort(items, goals);
  check("returns 3 items", result.length === 3);
  check("each item has both goal scores", Object.keys(result[0].goal_scores).length === 2);
  check("alignment_score differs between items", result[0].alignment_score !== result[1].alignment_score);
  // Chicken: high protein (+z), high calories (-z) → moderate positive
  // Salad: low protein (-z), low calories (+z) → moderate negative
  // Pasta: mid protein (-z), high calories (-z) → most negative
  check("Chicken outranks Pasta", result.findIndex((r) => r.name === "Chicken") < result.findIndex((r) => r.name === "Pasta"));
}

// scoreAndSort — no goals
console.log("\nscoreAndSort — no goals");
{
  const result = scoreAndSort(items, []);
  check("returns all items", result.length === 3);
  check("alignment_score is 0 for all", result.every((r) => r.alignment_score === 0));
  check("goal_scores is empty for all", result.every((r) => Object.keys(r.goal_scores).length === 0));
}

// scoreAndSort — empty items
console.log("\nscoreAndSort — empty items");
{
  const result = scoreAndSort([], [{ name: "Highest in protein", field: "protein_g", direction: 1 as const }]);
  check("returns empty array", result.length === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 3: Run the test and verify it fails (function not yet implemented)**

```bash
node src/lib/__tests__/zScoreSort.test.ts
```

Expected: error like `SyntaxError` or `Cannot find module` — `zScoreSort.ts` doesn't exist yet.

- [ ] **Step 4: Verify the test passes after Step 1 (zScoreSort.ts is already written)**

```bash
node src/lib/__tests__/zScoreSort.test.ts
```

Expected output (all checks pass):
```
computeZScores
  ✓ mean of z-scores is 0
  ✓ below-mean value is negative
  ✓ above-mean value is positive
  ✓ empty array → empty
  ✓ all-same → all zeros

squashZScore
  ✓ z=0 → 0.5
  ✓ positive z > 0.5
  ✓ negative z < 0.5
  ✓ large positive z stays ≤ 1
  ✓ large negative z stays ≥ 0

scoreAndSort — single goal (maximize protein)
  ✓ Chicken ranks first
  ✓ Salad ranks last
  ✓ alignment_score is a number
  ✓ goal_scores keyed by goal name
  ✓ returns all 3 items

scoreAndSort — single goal (minimize calories)
  ✓ Salad ranks first (lowest calories)
  ✓ Pasta ranks last (highest calories)

scoreAndSort — conflicting goals (high protein + low calorie)
  ✓ returns 3 items
  ✓ each item has both goal scores
  ✓ alignment_score differs between items
  ✓ Chicken outranks Pasta

scoreAndSort — no goals
  ✓ returns all items
  ✓ alignment_score is 0 for all
  ✓ goal_scores is empty for all

scoreAndSort — empty items
  ✓ returns empty array

25 passed, 0 failed
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/zScoreSort.ts src/lib/__tests__/zScoreSort.test.ts
git commit -m "feat: add z-score math helper with node test"
```

---

## Task 2: Rewrite `sortItemsByGoals` with multi-goal z-score scoring

**Files:**
- Modify: `src/types/scan.ts`
- Modify: `src/lib/analyzeMenu.ts:9-18` (imports) and `src/lib/analyzeMenu.ts:119-137` (function body)

**Interfaces:**
- Consumes: `scoreAndSort`, `GoalVector` from `src/lib/zScoreSort.ts` (Task 1)
- Produces: `ScoredItem` (exported from `src/types/scan.ts`); `sortItemsByGoals` now returns `ScoredItem[]`

**Context — what `analyzeMenu.ts` looks like today:**

```typescript
// lines 20-35: GOALS_SORT_MAP (maps goal name → {field, order})
const GOALS_SORT_MAP: Record<
  string,
  { field: "protein_g" | "carb_g" | "fat_g" | "estimated_calories"; order: "asc" | "desc" }
> = {
  "Highest in protein": { field: "protein_g", order: "desc" },
  "Low protein":        { field: "protein_g", order: "asc" },
  "Low calorie":        { field: "estimated_calories", order: "asc" },
  "High calorie":       { field: "estimated_calories", order: "desc" },
  "High carb":          { field: "carb_g", order: "desc" },
  "Low carb":           { field: "carb_g", order: "asc" },
  "High fat":           { field: "fat_g", order: "desc" },
  "Low fat":            { field: "fat_g", order: "asc" },
};

// lines 119-137: current broken implementation
export function sortItemsByGoals(
  items: EnrichedItem[],
  goals: string[],
): EnrichedItem[] {
  const goal = goals[0];              // BUG: ignores goals[1..n]
  const cfg = goal ? GOALS_SORT_MAP[goal] : undefined;
  if (!cfg) return items;
  return [...items].sort((a, b) => {
    const diff =
      cfg.order === "desc"
        ? b[cfg.field] - a[cfg.field]
        : a[cfg.field] - b[cfg.field];
    if (diff !== 0) return diff;
    if (b.estimated_calories !== a.estimated_calories) {
      return b.estimated_calories - a.estimated_calories;
    }
    return a.name.localeCompare(b.name);
  });
}
```

**Context — current imports at top of `analyzeMenu.ts`:**

```typescript
import { GOAL_PAIRS, GROUP_TO_MACRO, type MacroField } from "@/data/goals";
import type {
  ScanPhoto,
  ExtractionProvider,
  ExtractionResult,
  EnrichmentProvider,
  EnrichmentResult,
  ExtractedItem,
  EnrichedItem,
} from "@/types/scan";
```

- [ ] **Step 1: Add `ScoredItem` to `src/types/scan.ts`**

Open `src/types/scan.ts`. The file currently exports `EnrichedItem`. Add `ScoredItem` after the `EnrichedItem` interface:

```typescript
export interface ScoredItem extends EnrichedItem {
  alignment_score: number;
  goal_scores: Record<string, number>;
}
```

The file already contains `EnrichedItem`. Add the above block immediately after the closing `}` of `EnrichedItem`.

- [ ] **Step 2: Update imports in `src/lib/analyzeMenu.ts`**

Add `ScoredItem` to the type import block and add the `zScoreSort` import. The existing import block (lines 9-18) becomes:

```typescript
import { scoreAndSort, type GoalVector } from "./zScoreSort";
import { GOAL_PAIRS, GROUP_TO_MACRO, type MacroField } from "@/data/goals";
import type {
  ScanPhoto,
  ExtractionProvider,
  ExtractionResult,
  EnrichmentProvider,
  EnrichmentResult,
  ExtractedItem,
  EnrichedItem,
  ScoredItem,
} from "@/types/scan";
```

- [ ] **Step 3: Rewrite `sortItemsByGoals` in `src/lib/analyzeMenu.ts`**

Replace the entire function (lines 118-137, including the JSDoc comment) with:

```typescript
/** Sorts menu items by all selected goals using z-score normalization. */
export function sortItemsByGoals(
  items: EnrichedItem[],
  goals: string[],
): ScoredItem[] {
  const vectors: GoalVector[] = goals.flatMap((g) => {
    const cfg = GOALS_SORT_MAP[g];
    if (!cfg) return [];
    return [{ name: g, field: cfg.field, direction: cfg.order === "desc" ? 1 : -1 }];
  });
  return scoreAndSort(items, vectors) as ScoredItem[];
}
```

- [ ] **Step 4: Type-check**

```bash
pnpm tsc --noEmit
```

Expected: 0 errors. If you see "Property 'alignment_score' does not exist on type 'EnrichedItem'", the `ScoredItem` interface was not exported correctly — re-check Step 1.

If you see "has no exported member 'ScoredItem'" in `results.tsx`, that is expected and will be fixed in Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/types/scan.ts src/lib/analyzeMenu.ts
git commit -m "feat: replace sortItemsByGoals with z-score multi-goal scoring"
```

---

## Task 3: Add 6.F1 sorting validation log to `results.tsx`

**Files:**
- Modify: `src/app/results.tsx`

**Interfaces:**
- Consumes: `ScoredItem` from `src/types/scan.ts` (Task 2); `sortItemsByGoals` now returns `ScoredItem[]` (Task 2); `squashZScore` from `src/lib/zScoreSort.ts` (Task 1)

**Context — relevant section of `results.tsx` today:**

```typescript
// line 1
import { useState } from "react";
// line 19
import { selectedMacros, sortItemsByGoals } from "@/lib/analyzeMenu";
import type { EnrichmentResult, ExtractionResult } from "@/types/scan";

// ResultsPhase component, lines 200-201:
const highlight = selectedMacros(selectedGoals);
const sorted = sortItemsByGoals(result.items, selectedGoals);
```

`ResultsPhase` is a function component — it currently only uses `useState`. There are no `useEffect` calls in this file.

- [ ] **Step 1: Add `useEffect` and `squashZScore` to the imports**

The first line of `results.tsx` is:
```typescript
import { useState } from "react";
```

Change it to:
```typescript
import { useEffect, useState } from "react";
```

Add `squashZScore` to the analyzeMenu import line:
```typescript
import { selectedMacros, sortItemsByGoals } from "@/lib/analyzeMenu";
```
becomes:
```typescript
import { selectedMacros, sortItemsByGoals } from "@/lib/analyzeMenu";
import { squashZScore } from "@/lib/zScoreSort";
```

Add `ScoredItem` to the type import:
```typescript
import type { EnrichmentResult, ExtractionResult } from "@/types/scan";
```
becomes:
```typescript
import type { EnrichmentResult, ExtractionResult, ScoredItem } from "@/types/scan";
```

- [ ] **Step 2: Update `sorted` type annotation in `ResultsPhase` and add `useEffect`**

Inside `ResultsPhase`, find the block that starts at line 200:
```typescript
const highlight = selectedMacros(selectedGoals);
const sorted = sortItemsByGoals(result.items, selectedGoals);
```

Replace it with:
```typescript
const highlight = selectedMacros(selectedGoals);
const sorted: ScoredItem[] = sortItemsByGoals(result.items, selectedGoals);

useEffect(() => {
  console.log(
    JSON.stringify(
      {
        selected_goals: selectedGoals,
        total_items: sorted.length,
        items: sorted.map((item, i) => ({
          rank: i + 1,
          name: item.name,
          macros: {
            protein_g: item.protein_g,
            carb_g: item.carb_g,
            fat_g: item.fat_g,
            estimated_calories: item.estimated_calories,
          },
          alignment_score: item.alignment_score,
          display_score: squashZScore(item.alignment_score),
          goal_scores: item.goal_scores,
          allergens: item.allergens,
        })),
      },
      null,
      2,
    ),
  );
}, [sorted]);
```

- [ ] **Step 3: Type-check and lint**

```bash
pnpm tsc --noEmit
pnpm exec eslint src/ --ext .ts,.tsx
```

Expected: 0 errors, 0 warnings. Common issues:
- If ESLint complains about `sorted` in the `useEffect` dependency array being an array (unstable reference), add `// eslint-disable-next-line react-hooks/exhaustive-deps` on the line above `}, [sorted]);` — but only if the lint rule actually fires. Do not add it pre-emptively.

- [ ] **Step 4: Manual smoke test**

Start the Expo dev server:
```bash
pnpm start
```

Open the app in a simulator or via Expo Go. Scan a menu (or use a previously enriched result). Select 1–4 goals and tap Continue. Open the Metro console (terminal running `pnpm start`).

Verify the console prints a JSON block like:
```json
{
  "selected_goals": ["Highest in protein", "Low calorie"],
  "total_items": 12,
  "items": [
    {
      "rank": 1,
      "name": "Grilled Chicken",
      "macros": { "protein_g": 42, "carb_g": 2, "fat_g": 6, "estimated_calories": 230 },
      "alignment_score": 1.23,
      "display_score": 0.77,
      "goal_scores": { "Highest in protein": 1.67, "Low calorie": 0.79 },
      "allergens": []
    },
    ...
  ]
}
```

Check:
- Items with `alignment_score` higher appear at lower `rank` numbers (rank 1 = highest score).
- `display_score` is always between 0 and 1.
- `goal_scores` has one key per selected goal.
- Selecting a single goal gives a ranking identical to the old single-field sort (highest protein goal → highest protein item ranks first).

- [ ] **Step 5: Commit**

```bash
git add src/app/results.tsx
git commit -m "feat: add sorting validation log (task 6.F1)"
```

---

## Self-Review

**Spec coverage:**
- ✓ Replace `sortItemsByGoals` to handle all selected goals → Task 2
- ✓ Z-score normalization (not min-max) → `computeZScores` in Task 1
- ✓ "Low" goals flip direction (negate z-score) → `direction: -1` in `GoalVector`
- ✓ `alignment_score` per item → `ScoredItem.alignment_score`
- ✓ Cosmetic 0-1 squash for display → `squashZScore(alignment_score)` in Task 3 log
- ✓ Standalone Node test → Task 1 Step 2
- ✓ Task 6.F1 logging: `alignment_score`, `goal_scores`, `selected_goals`, macros, allergens → Task 3
- ✓ `useEffect([sorted])` trigger → Task 3 Step 2
- ✓ Type-check after each task → Steps in Tasks 2 and 3

**Placeholder scan:** None found.

**Type consistency:**
- `GoalVector` defined in Task 1, consumed in Task 2 ✓
- `ScoredItem` defined in Task 2 (scan.ts), consumed in Task 3 (results.tsx) ✓
- `squashZScore` defined in Task 1, consumed in Task 3 ✓
- `scoreAndSort` returns `Array<T & { alignment_score; goal_scores }>`, cast to `ScoredItem[]` in Task 2 ✓
- `sortItemsByGoals` signature changes from `→ EnrichedItem[]` to `→ ScoredItem[]`; the one caller in `results.tsx` is updated in Task 3 ✓
