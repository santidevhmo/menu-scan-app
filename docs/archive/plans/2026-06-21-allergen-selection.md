# Allergen Selection (Phase 7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Relationship to the whole-app plan:** This is the executable detail for **Phase 7** of `docs/superpowers/plans/2026-05-25-multi-model-menu-analysis.md`. That file keeps the one-paragraph phase outline; this file holds the full code. Don't duplicate this back into the main plan.

**Goal:** Let the user multi-select allergens before scanning, then on the results screen (a) hide menu items containing any selected allergen behind a "Show anyway" reveal banner, (b) show a mandatory non-dismissible disclaimer card whenever any allergen is selected, and (c) gate the existing per-item red allergen line on selection.

**Architecture:** A new `allergens.store.ts` (Zustand + AsyncStorage) mirrors the existing `goals.store.ts` exactly, minus the high/low mutual-exclusion logic. An `AllergenSelector` chip grid renders inside the existing `GoalsPhase` (phase 0 of `results.tsx`) below `GoalSelector` — no new navigation phase. Filtering, the reveal banner, and the disclaimer card all live in `ResultsPhase` (phase 1), computed from `selectedAllergens` against each item's existing `allergens: string[]`. No backend changes, no new dependencies.

**Tech Stack:** Expo, React Native, TypeScript (strict), NativeWind, Zustand, AsyncStorage, Expo Router.

## Global Constraints

- **Mandatory allergen disclaimer (AGENTS.md, non-negotiable):** when any allergen filter is active, a prominent card must always be visible on results with the exact text: *"AI-estimated. Confirm allergens with restaurant staff before ordering."* It cannot be removed, hidden, or made dismissible.
- **Styling:** NativeWind classes only; reuse existing theme tokens (`rounded-card`, `rounded-chip`, `bg-foreground`, `bg-card`, `border-border`, `text-foreground`, `text-background`, `text-danger`, `text-muted-foreground`). Do not introduce new Tailwind tokens (`border-danger` is **not** configured — use `text-danger` for prominence).
- **TypeScript:** strict, no `any`.
- **Package manager:** pnpm.
- **No new libraries.**

## Design decisions (locked, from brainstorming)

- Allergen list: a broader curated list (~15 items), not just the FDA "big 9", not derived dynamically from scan data.
- Picker placement: same screen as nutritional goal selection (`GoalsPhase`), as a secondary/optional section below goals — persisted like goals.
- Filtering behavior: hide matching items by default, with a single global "Show anyway" reveal banner (not a hard filter, not per-item reveal rows).
- Picker UI: a wrapping chip grid (all ~15 chips visible, no scrolling list, no category grouping), `rounded-chip` styling, Cal-AI-style minimalism.
- Per-item red "Allergens: ..." line: gated on selection, not just presence. Hidden entirely when `selectedAllergens.length === 0`; when ≥1 is selected, shows the item's **full** allergen list (not filtered to only selected ones).
- Disclaimer card: renders whenever `selectedAllergens.length > 0`, regardless of whether anything is currently hidden.

**Out of scope:** allergen-aware re-ranking/sorting (filter/hide only), persisting the "show anyway" reveal across app restarts (view-local state), editing allergens from the results screen.

## File Map

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `src/data/allergens.ts` | Create | Curated `ALLERGENS: string[]` |
| `src/store/allergens.store.ts` | Create | Zustand + AsyncStorage store (mirror of `goals.store.ts`) |
| `src/components/results/AllergenSelector.tsx` | Create | Wrapping chip grid, multi-select |
| `src/app/results.tsx` | Modify | Render selector in `GoalsPhase`; filter + banner + disclaimer in `ResultsPhase`; thread `selectedAllergens` |
| `src/components/results/MenuItemRow.tsx` | Modify | Gate per-item allergen line on `showAllergens` |

**Note on testing:** No client-side unit tests, matching Phases 3–6 (the repo has no configured client test runner — see the main plan's Phase 6 Follow-Up). The filter is a one-line array intersection; verification is `tsc` + `eslint` + the simulator checks below.

**Interfaces produced (consumed by later tasks):**
- `ALLERGENS: string[]` from `@/data/allergens`
- `useAllergensStore` from `@/store/allergens.store` → `{ selectedAllergens: string[]; setAllergens(a: string[]): void; toggleAllergen(a: string): void }`
- `AllergenSelector` from `@/components/results/AllergenSelector` → props `{ selected: string[]; onToggle: (a: string) => void }`

---

## Task 7.1: Allergen data and store

**Files:**
- Create: `src/data/allergens.ts`
- Create: `src/store/allergens.store.ts`

- [ ] **Step 1: Create the allergen list.** `src/data/allergens.ts`:

```ts
/** Curated allergen list for the pre-scan picker. Broader than the FDA "big 9". */
export const ALLERGENS: string[] = [
  "Peanuts",
  "Tree nuts",
  "Dairy",
  "Eggs",
  "Shellfish",
  "Fish",
  "Soy",
  "Wheat/Gluten",
  "Sesame",
  "Mustard",
  "Celery",
  "Sulfites",
  "Lupin",
  "Mollusks",
  "Corn",
];
```

- [ ] **Step 2: Create the store.** `src/store/allergens.store.ts` mirrors `goals.store.ts` (lines 1–45) but drops the high/low mutual-exclusion helpers — allergens are independent multi-select:

```ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface AllergensState {
  selectedAllergens: string[];
  setAllergens: (allergens: string[]) => void;
  toggleAllergen: (allergen: string) => void;
}

/** Stores the user's selected allergens in AsyncStorage. */
export const useAllergensStore = create<AllergensState>()(
  persist(
    (set) => ({
      selectedAllergens: [],
      setAllergens: (allergens) => set({ selectedAllergens: allergens }),
      toggleAllergen: (allergen) =>
        set((state) => ({
          selectedAllergens: state.selectedAllergens.includes(allergen)
            ? state.selectedAllergens.filter((a) => a !== allergen)
            : [...state.selectedAllergens, allergen],
        })),
    }),
    {
      name: "allergens-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
```

- [ ] **Step 3: Type-check.** `pnpm tsc --noEmit` → no errors.
- [ ] **Step 4: Commit.** `feat: add allergen data and persisted store`

---

## Task 7.2: `AllergenSelector` component + wire into goal screen

**Files:**
- Create: `src/components/results/AllergenSelector.tsx`
- Modify: `src/app/results.tsx` (`GoalsPhase`, `ResultsScreen`)

- [ ] **Step 1: Build the component.** `src/components/results/AllergenSelector.tsx` mirrors `GoalSelector.tsx` but uses a wrapping `rounded-chip` grid with no mutual exclusion:

```tsx
import { Pressable, Text, View } from "react-native";
import { ALLERGENS } from "@/data/allergens";

interface AllergenSelectorProps {
  selected: string[];
  onToggle: (allergen: string) => void;
}

/** Wrapping chip grid; independent multi-select. */
export function AllergenSelector({ selected, onToggle }: AllergenSelectorProps) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {ALLERGENS.map((allergen) => {
        const isSelected = selected.includes(allergen);

        return (
          <Pressable
            key={allergen}
            onPress={() => onToggle(allergen)}
            className={`rounded-chip px-3 py-2 ${
              isSelected ? "bg-foreground" : "bg-card border border-border"
            }`}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={allergen}
          >
            <Text
              className={`font-sans text-caption ${
                isSelected ? "text-background" : "text-foreground"
              }`}
            >
              {allergen}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 2: Add imports** to `src/app/results.tsx` (after the existing `goals.store` / `GoalSelector` imports, lines 15–16):

```tsx
import { useAllergensStore } from "@/store/allergens.store";
import { AllergenSelector } from "@/components/results/AllergenSelector";
```

- [ ] **Step 3: Extend `GoalsPhase` props and render the selector.** Add the two props to `GoalsPhase`'s signature (lines 100–112):

```tsx
function GoalsPhase({
  loading,
  result,
  selectedGoals,
  onToggleGoal,
  selectedAllergens,
  onToggleAllergen,
  onContinue,
}: {
  loading: boolean;
  result: ExtractionResult | null;
  selectedGoals: string[];
  onToggleGoal: (goal: string) => void;
  selectedAllergens: string[];
  onToggleAllergen: (allergen: string) => void;
  onContinue: () => void;
}) {
```

Then, immediately after `<GoalSelector selected={selectedGoals} onToggle={onToggleGoal} />` (line 126), inside the same `ScrollView`, add the allergen section:

```tsx
        <Text className="font-display text-h2 text-foreground mt-6 mb-2">
          Allergens
        </Text>
        <Text className="font-sans text-subtle text-muted-foreground mb-3">
          Optional. We&apos;ll hide menu items containing anything you select.
        </Text>
        <AllergenSelector
          selected={selectedAllergens}
          onToggle={onToggleAllergen}
        />
```

- [ ] **Step 4: Read the store in `ResultsScreen` and pass it down.** After the `toggleGoal` line (line 315) add:

```tsx
  const selectedAllergens = useAllergensStore((state) => state.selectedAllergens);
  const toggleAllergen = useAllergensStore((state) => state.toggleAllergen);
```

Add the two props to the `<GoalsPhase ... />` render (lines 356–362):

```tsx
            selectedAllergens={selectedAllergens}
            onToggleAllergen={toggleAllergen}
```

- [ ] **Step 5: Type-check and lint.** `pnpm tsc --noEmit && pnpm exec eslint src/ --ext .ts,.tsx` → no errors.
- [ ] **Step 6: Commit.** `feat: add AllergenSelector to goal-selection screen`

---

## Task 7.3: Results filtering, reveal banner, and disclaimer

**Files:**
- Modify: `src/app/results.tsx` (`ResultsPhase`, `ResultsScreen`)

- [ ] **Step 1: Pass `selectedAllergens` into `ResultsPhase`.** Extend its props (lines 154–162):

```tsx
function ResultsPhase({
  loading,
  result,
  selectedGoals,
  selectedAllergens,
}: {
  loading: boolean;
  result: EnrichmentResult | null;
  selectedGoals: string[];
  selectedAllergens: string[];
}) {
```

And in `ResultsScreen`'s `<ResultsPhase ... />` (lines 364–370) add:

```tsx
            selectedAllergens={selectedAllergens}
```

- [ ] **Step 2: Add reveal state and reset it per scan.** Add next to the existing `noticeDismissed` / `portions` state (line 163):

```tsx
  const [revealHidden, setRevealHidden] = useState(false);
```

Add `setRevealHidden(false);` to the existing reset effect (lines 173–176):

```tsx
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset stale per-result UI state for a new scan result
    setPortions({});
    setRevealHidden(false);
  }, [result]);
```

- [ ] **Step 3: Derive hidden / visible lists.** Next to `highlight` / `lowConfidence` (after line 265, before the `return`):

```tsx
  const hasAllergenFilter = selectedAllergens.length > 0;
  const matchesAllergen = (item: ScoredResultItem) =>
    item.allergens.some((a) => selectedAllergens.includes(a));
  const hidden = hasAllergenFilter ? sorted.filter(matchesAllergen) : [];
  const visible =
    hasAllergenFilter && !revealHidden
      ? sorted.filter((item) => !matchesAllergen(item))
      : sorted;
```

- [ ] **Step 4: Render disclaimer + banner in the list header, and show `visible`.** Change `data={sorted}` (line 269) to `data={visible}`, and replace the existing `ListHeaderComponent` (lines 272–290) with a fragment stacking the mandatory disclaimer, the reveal banner, then the existing low-confidence notice:

```tsx
      ListHeaderComponent={
        <>
          {hasAllergenFilter && (
            <View className="rounded-card border border-border bg-card p-4 mb-3">
              <Text className="font-sans text-body text-danger">
                AI-estimated. Confirm allergens with restaurant staff before
                ordering.
              </Text>
            </View>
          )}
          {hidden.length > 0 && (
            <Pressable
              onPress={() => setRevealHidden((v) => !v)}
              className="rounded-card border border-border bg-card p-4 mb-3"
              accessibilityRole="button"
              accessibilityLabel={
                revealHidden
                  ? "Hide allergen items"
                  : "Show hidden allergen items"
              }
            >
              <Text className="font-sans text-body text-foreground">
                {revealHidden
                  ? `Showing ${hidden.length} hidden ${hidden.length === 1 ? "item" : "items"} · Hide`
                  : `${hidden.length} ${hidden.length === 1 ? "item" : "items"} hidden due to allergens · Show anyway`}
              </Text>
            </Pressable>
          )}
          {lowConfidence && !noticeDismissed ? (
            <Pressable
              onPress={() => setNoticeDismissed(true)}
              className="rounded-card border border-border bg-card p-4 mb-3"
              accessibilityRole="button"
              accessibilityLabel="Dismiss low-confidence notice"
            >
              <Text className="font-sans text-body text-foreground">
                Descriptions on this menu are light on details.
              </Text>
              <Text className="font-sans text-subtle text-muted-foreground mt-1">
                Nutritional estimates are rough because the menu does not list
                ingredients. For confident choices, ask your waiter. Tap to
                dismiss.
              </Text>
            </Pressable>
          ) : null}
        </>
      }
```

> The disclaimer is a plain non-dismissible `View` — the low-confidence notice's dismiss `Pressable` pattern is deliberately NOT reused; it must stay visible whenever a filter is active (AGENTS.md). `text-danger` provides prominence; `border-danger` is intentionally avoided (not a configured token). When every item is hidden and not revealed, `visible` is empty and the FlatList renders the header only — the banner still lets the user reveal.

- [ ] **Step 5: Type-check and lint.** `pnpm tsc --noEmit && pnpm exec eslint src/ --ext .ts,.tsx` → no errors.
- [ ] **Step 6: Commit.** `feat: hide allergen items with reveal banner and disclaimer`

---

## Task 7.4: Gate the per-item allergen line

**Files:**
- Modify: `src/components/results/MenuItemRow.tsx`
- Modify: `src/app/results.tsx` (`ResultsPhase` `renderItem`)

- [ ] **Step 1: Add a `showAllergens` prop** to `MenuItemRowProps` (`showAllergens: boolean;`) and to the component's destructured params.

- [ ] **Step 2: Gate the allergen line.** Change the existing block (around lines 112–116) from:

```tsx
{item.allergens.length > 0 && (
  <Text className="font-sans text-caption text-danger mt-2">
    Allergens: {item.allergens.join(", ")}
  </Text>
)}
```

to:

```tsx
{showAllergens && item.allergens.length > 0 && (
  <Text className="font-sans text-caption text-danger mt-2">
    Allergens: {item.allergens.join(", ")}
  </Text>
)}
```

- [ ] **Step 3: Pass the prop** in `ResultsPhase`'s `renderItem` `<MenuItemRow ... />` (lines 295–303):

```tsx
            showAllergens={hasAllergenFilter}
```

- [ ] **Step 4: Type-check and lint.** `pnpm tsc --noEmit && pnpm exec eslint src/ --ext .ts,.tsx` → no errors.
- [ ] **Step 5: Commit.** `feat: gate per-item allergen line on allergen selection`

---

## Verification

1. **Type/lint:** `pnpm tsc --noEmit` and `pnpm exec eslint src/ --ext .ts,.tsx` → zero errors.
2. **Selection persists:** goal-selection screen shows a chip grid of ~15 allergens below the goals; tapping toggles selection; relaunch the app → selection survives (AsyncStorage `"allergens-storage"`).
3. **No selection:** with zero allergens selected — no items hidden, no disclaimer card, no per-item red allergen line on any item.
4. **Hiding + reveal:** select an allergen present in some items → those items disappear from results; banner reads `"{n} items hidden due to allergens · Show anyway"` with the correct count; tap → hidden items reappear and banner flips to `"Showing {n} hidden items · Hide"`; tap again → re-hides.
5. **Disclaimer:** with ≥1 allergen selected, the card *"AI-estimated. Confirm allergens with restaurant staff before ordering."* is always visible on results and cannot be dismissed, regardless of whether anything is currently hidden.
6. **Per-item line:** with ≥1 allergen selected, items with `allergens.length > 0` show their full `Allergens: ...` line (not filtered to only the selected ones).
7. **All hidden edge case:** select allergens matching every item → list body empty, disclaimer + "Show anyway" banner still visible; revealing brings items back.
8. **Ranking unchanged:** within the visible set, the goal-based order is identical to pre-filter order (filtering removes rows, never reorders).

## Execution notes

- Branch off fresh `main` (Phase 6 Follow-Up / PR #12 already merged): `git checkout -b feat/allergen-selection`.
- No Edge Function or dependency changes — purely client.
