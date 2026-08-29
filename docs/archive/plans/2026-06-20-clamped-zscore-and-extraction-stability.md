# Clamped Z-Score Ranking + Extraction Stability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make multi-goal ranking reward all-around balance instead of letting an item that is extreme on one goal but bad on another rank high, and make Stage 1 menu extraction reproducible across re-scans.

**Architecture:** The fix is a single new idea — clamp each per-goal z-score to ±`CLAMP_CAP` before averaging, so a great score on one goal cannot paper over a bad score on another. Clamping is monotonic within a goal, so single-goal rankings are unchanged. Separately, Stage 1 extraction gains `temperature: 0` + a fixed `seed` (the enrichment stage already has these), making full re-scans deterministic. A live simulator A/B compares `CLAMP_CAP` at 1.0 vs 1.5 so the user picks the cap from real output.

**Tech Stack:** TypeScript (Expo / React Native), Zustand, a pure z-score helper module with a standalone Node test, a Deno Supabase Edge Function calling OpenAI.

## Global Constraints

- Package manager is **pnpm**. Never `npm install`/`npm run`. Expo SDK packages: `./node_modules/.bin/expo <cmd>` (no `expo` npm script exists). No new dependencies in this plan.
- TypeScript strict mode, no `any`. Keep types simple.
- Surgical changes only — touch only the files named in each task; do not refactor adjacent code.
- The standalone z-score test runs with `node src/lib/__tests__/zScoreSort.test.ts` (Node executes the `.ts` directly; app `tsc` does not enable TS-extension imports).
- Mark deliberate simplifications / tunable knobs with a `ponytail:` comment.

---

### Task 1: Clamp per-goal z-scores in `scoreAndSort`

Adds a cap so no single goal's z-score dominates the average. Display values (`goal_scores`) keep the **raw** (unclamped) z; only the summed `alignment_score` uses clamped values.

**Files:**
- Modify: `src/lib/zScoreSort.ts:26-71` (the `scoreAndSort` function and a new module-level helper)
- Test: `src/lib/__tests__/zScoreSort.test.ts` (add one new test block before the summary)

**Interfaces:**
- Consumes: existing `computeZScores(values: number[]): number[]`, `GoalVector { name; field; direction: 1 | -1 }`.
- Produces: `scoreAndSort<T>(items: T[], goals: GoalVector[])` — unchanged signature and return type `(T & { alignment_score: number; goal_scores: Record<string, number> })[]`. Behavior change only: `alignment_score` now averages clamped z-scores. New module-level `CLAMP_CAP = 1` constant and `clampZ(z: number): number` helper (not exported).

- [ ] **Step 1: Write the failing test**

Add this block to `src/lib/__tests__/zScoreSort.test.ts` immediately **before** the final `console.log(\`\n${passed} passed, ${failed} failed\`);` line:

```ts
console.log("\nscoreAndSort - clamp caps single-goal dominance");
{
  const clampItems = [
    { name: "Balanced", protein_g: 30, carb_g: 30, fat_g: 12, estimated_calories: 440 },
    { name: "Outlier", protein_g: 18, carb_g: 20, fat_g: 3, estimated_calories: 140 },
    { name: "HeavyA", protein_g: 55, carb_g: 55, fat_g: 34, estimated_calories: 780 },
    { name: "HeavyB", protein_g: 50, carb_g: 48, fat_g: 31, estimated_calories: 720 },
    { name: "HeavyC", protein_g: 48, carb_g: 50, fat_g: 30, estimated_calories: 700 },
    { name: "Mid", protein_g: 22, carb_g: 24, fat_g: 14, estimated_calories: 480 },
  ];

  const result = scoreAndSort(clampItems, [
    { name: "Highest in protein", field: "protein_g", direction: 1 },
    { name: "High carb", field: "carb_g", direction: 1 },
    { name: "Low fat", field: "fat_g", direction: -1 },
    { name: "Low calorie", field: "estimated_calories", direction: -1 },
  ]);

  check("balanced item ranks first", result[0].name === "Balanced");
  check(
    "extreme outlier does not rank first",
    result.findIndex((item) => item.name === "Outlier") > 0,
  );
  check(
    "goal_scores keep raw (unclamped) z beyond the cap",
    Math.abs(
      result.find((item) => item.name === "HeavyA")!.goal_scores[
        "Highest in protein"
      ],
    ) > 1,
  );
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node src/lib/__tests__/zScoreSort.test.ts`
Expected: FAIL — `✗ balanced item ranks first` and `✗ extreme outlier does not rank first` (the unclamped sum ranks `Outlier` #1 because its extreme low fat + low calorie z-scores outweigh its weak protein/carb). The final line shows at least 2 failed and exit code 1.

- [ ] **Step 3: Write the minimal implementation**

In `src/lib/zScoreSort.ts`, add the constant and helper right after the existing `squashZScore` function (after line 24, before `export function scoreAndSort`):

```ts
// ponytail: cap each goal's z-score so one extreme goal can't outweigh being
// bad on another — rewards all-around balance. ±1.0 default; tune if rankings
// feel off (see plan: live ±1.0 vs ±1.5 A/B).
const CLAMP_CAP = 1;

function clampZ(z: number): number {
  return Math.max(-CLAMP_CAP, Math.min(CLAMP_CAP, z));
}
```

Then, inside `scoreAndSort`, change the per-goal accumulation loop. Replace this exact block:

```ts
      for (const goal of goals) {
        const z = perGoalZ.get(goal.name)?.[index] ?? 0;
        goal_scores[goal.name] = z;
        total += z;
      }
```

with:

```ts
      for (const goal of goals) {
        const z = perGoalZ.get(goal.name)?.[index] ?? 0;
        goal_scores[goal.name] = z; // raw z for honest per-goal display
        total += clampZ(z); // clamped: no single goal dominates the average
      }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node src/lib/__tests__/zScoreSort.test.ts`
Expected: PASS — all prior checks still pass (single-goal order is unchanged because `clampZ` is monotonic within a goal) and the 3 new clamp checks pass. Final line reports `0 failed`, exit code 0.

- [ ] **Step 5: Type-check and lint**

Run: `pnpm tsc --noEmit`
Expected: no output, exit 0.

Run: `pnpm exec eslint src/ --ext .ts,.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/zScoreSort.ts src/lib/__tests__/zScoreSort.test.ts
git commit -m "feat: clamp per-goal z-scores so balance beats single-goal extremes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Stabilize Stage 1 extraction sampling

Stage 1 (`callGptExtract`) currently calls the model with no `temperature`/`seed`, so re-scanning the same photos can return different items, which then changes enrichment and ranking. The enrichment stage already passes `{ temperature: 0, seed: ENRICH_SEED }`; apply the same to extraction.

**Files:**
- Modify: `supabase/functions/analyze-menu/index.ts:171` (the `callGptExtract` call to `callOpenAIChat`)

**Interfaces:**
- Consumes: existing `callOpenAIChat(model, content, schema, options?: { temperature?: number; seed?: number })` (already supports the options) and the existing module constant `ENRICH_SEED = 17`.
- Produces: no signature changes. `callGptExtract` now requests deterministic sampling.

This task has no unit test: it is a Deno edge function calling an external paid API, and determinism is verified by observation during Task 3's re-runs (same photos → same extracted items). Keep the change to one line.

- [ ] **Step 1: Add temperature + seed to the extraction call**

In `supabase/functions/analyze-menu/index.ts`, inside `callGptExtract`, replace this exact line:

```ts
  const text = await callOpenAIChat("gpt-4o", content, EXTRACT_SCHEMA);
```

with:

```ts
  // Stage 1 stability: same photos -> same extraction (matches enrichment).
  const text = await callOpenAIChat("gpt-4o", content, EXTRACT_SCHEMA, {
    temperature: 0,
    seed: ENRICH_SEED,
  });
```

(Reusing `ENRICH_SEED` keeps the diff minimal; it is a shared run-to-run stability seed, not enrichment-specific.)

- [ ] **Step 2: Deploy the edge function**

Run: `supabase functions deploy analyze-menu`
Expected: deploy succeeds and prints the deployed function URL/version. If the Supabase CLI is not linked, run `supabase link` first (ask the user for the project ref if unknown). Do not proceed to live testing until the deploy succeeds, or extraction will still use the old behavior.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/analyze-menu/index.ts
git commit -m "fix: pass temperature 0 + seed to Stage 1 extraction for reproducible scans

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Live A/B of clamp cap (±1.0 vs ±1.5) in the simulator

Interactive calibration. Add a compact top-10 console log, run the app at `CLAMP_CAP = 1`, have the user trigger an analysis and read the top 10, then change the cap to `1.5`, have the user re-trigger, and compare. The user picks the final cap.

**Files:**
- Modify: `src/app/results.tsx:173-200` (add a compact top-10 log inside the existing `ResultsPhase` `useEffect`)
- Modify: `src/lib/zScoreSort.ts` (`CLAMP_CAP` value — toggled during the test, set to the chosen value at the end)

**Interfaces:**
- Consumes: the existing `sorted: ScoredResultItem[]` array in `ResultsPhase` and `CLAMP_CAP` from Task 1.
- Produces: a readable `[rank top10]` console block in Metro logs; a finalized `CLAMP_CAP` value.

- [ ] **Step 1: Add a compact top-10 log**

In `src/app/results.tsx`, inside `ResultsPhase`'s `useEffect` (the one starting at line 173), **after** the existing `console.log(JSON.stringify(... null, 2))` call and before the effect's closing `}, [result, selectedGoals, sorted]);`, add:

```tsx
    console.log(
      "[rank top10]\n" +
        sorted
          .slice(0, 10)
          .map(
            (item, index) =>
              `${String(index + 1).padStart(2)}. ${item.name}  ` +
              `P${item.protein_g} C${item.carb_g} F${item.fat_g} ` +
              `cal${item.estimated_calories}  score=${item.alignment_score.toFixed(2)}`,
          )
          .join("\n"),
    );
```

- [ ] **Step 2: Type-check, lint, commit the log**

Run: `pnpm tsc --noEmit` (expect exit 0).
Run: `pnpm exec eslint src/ --ext .ts,.tsx` (expect no errors).

```bash
git add src/app/results.tsx
git commit -m "chore: log top-10 ranked items for clamp-cap calibration

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 3: Confirm cap is 1.0 and launch the simulator**

Verify `CLAMP_CAP = 1` in `src/lib/zScoreSort.ts` (it is, from Task 1).

Run: `./node_modules/.bin/expo start --ios`
Expected: Metro bundler starts and the iOS simulator opens the app. Keep this terminal visible — the `[rank top10]` block prints here.

- [ ] **Step 4: Capture the ±1.0 top 10 (user action)**

Ask the user to: pick the same set of goals they used in the fixture (e.g. Highest in protein, High carb, Low fat, Low calorie), scan/analyze a menu, and reach the results list. Read the `[rank top10]` block from the Metro console and record it as the **cap=1.0** result.

Also note the extracted item list: if the user re-runs the *same* photos a second time, the items should now be identical (Task 2). Flag any difference — that would mean the edge deploy didn't take.

- [ ] **Step 5: Switch the cap to 1.5**

In `src/lib/zScoreSort.ts`, change:

```ts
const CLAMP_CAP = 1;
```

to:

```ts
const CLAMP_CAP = 1.5;
```

Save. Fast Refresh reloads the bundle. The results list re-ranks client-side from the cached items (no re-scan needed); if it doesn't visibly update, ask the user to toggle one goal off and back on to force `sortItemsByGoals` to recompute.

- [ ] **Step 6: Capture the ±1.5 top 10 (user action)**

Ask the user to re-trigger ranking (toggle a goal or re-open results) and read the new `[rank top10]` block. Record it as the **cap=1.5** result. Present cap=1.0 vs cap=1.5 top-10 side by side and ask the user which list better matches "balanced across all selected goals" (the `TOSTADAS ATÚN`-style result they confirmed they want).

- [ ] **Step 7: Set the chosen cap and commit**

Set `CLAMP_CAP` in `src/lib/zScoreSort.ts` to the user's choice (`1` or `1.5`).

Run: `node src/lib/__tests__/zScoreSort.test.ts` — expect `0 failed` (the Task 1 assertions hold for both 1.0 and 1.5: under both caps `Balanced` ranks first and the raw `goal_scores` still exceed the cap).
Run: `pnpm tsc --noEmit` (exit 0).

```bash
git add src/lib/zScoreSort.ts
git commit -m "feat: set clamp cap to <CHOSEN VALUE> after simulator A/B

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

Stop the simulator (Ctrl-C in the Metro terminal). Do **not** push — per the handoff, the user pushes after local testing approval.

---

## Notes / Out of Scope

- Goal-priority weighting (treating goal order as importance) was evaluated against the fixture and **rejected**: every priority tilt crowned high-protein/high-fat pork dishes, the opposite of the desired balance. The clamp approach is the chosen rule.
- AI-prompt sorting was rejected: non-deterministic, breaks client-side re-rank, risks item loss, no explainable score.
- `squashZScore` (display-only) is untouched; `display_score` in the results log still uses it.
