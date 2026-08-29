# Multi-Goal Ranking Debug Handoff

## Current Branch

- Branch: `feat/multi-goal-zscore-sorting`
- Latest local work is committed.
- Do not push until the user approves after local Expo iOS simulator testing.
- Pre-existing unrelated dirty files exist in the worktree; leave them untouched.

## User-Reported Problem

The duplicate React key warning was fixed and the first rerun looked correct. A later rerun returned a ranking that felt worse.

User asked:

> If I run the same menu analysis multiple times, will it return different results? Or is it supposed to return the same result?

Fixture available for local testing:

`/Users/santiagoaguirre/Downloads/MenuJSON.md`

It contains processed ranking JSON, raw response JSON, and pre-processed Stage 1 extraction content.

## Implemented Changes So Far

- Added `src/lib/zScoreSort.ts`
  - `computeZScores(values)`
  - `squashZScore(z)`
  - `scoreAndSort(items, goals)`
- Added standalone Node check:
  - `src/lib/__tests__/zScoreSort.test.ts`
- Changed `sortItemsByGoals` in `src/lib/analyzeMenu.ts` from first-goal sorting to multi-goal z-score sorting.
- Added `ScoredItem` in `src/types/scan.ts`.
- Added validation logging in `src/app/results.tsx`.
- Fixed duplicate key warning by carrying `sourceIndex` through sorting and using it for:
  - `FlatList.keyExtractor`
  - portion state lookup

## Verification Already Run

These passed after the key fix:

```bash
node src/lib/__tests__/zScoreSort.test.ts
pnpm tsc --noEmit
pnpm exec eslint src/ --ext .ts,.tsx
```

The Node test reported `25 passed, 0 failed`.

## Duplicate Key Root Cause Already Fixed

Root cause:

- `scoreAndSort` clones item objects.
- `results.tsx` built `idOf` from original `result.items`.
- `idOf.get(sortedItem)` returned `undefined`.
- Every row key became `String(undefined)`, causing duplicate key `.$undefined`.

Fix:

- Add `sourceIndex` before sorting.
- Use `item.sourceIndex` for keys and portion ids.

## Ranking Debug Evidence

Selected goals from fixture:

```json
[
  "Highest in protein",
  "High carb",
  "Low fat",
  "Low calorie"
]
```

Local test parsed the processed ranking JSON from `/Users/santiagoaguirre/Downloads/MenuJSON.md`, reconstructed items from logged macro values, and ran the current sorter.

Result:

```json
{
  "total": 45,
  "mismatches": 0
}
```

Conclusion:

- For the same enriched item macro JSON and same selected goals, the client-side ranking is deterministic.
- The processed ranking log was exactly reproduced locally.
- The “bad” ranking is not caused by random client-side sorting.

## Current Product Issue

The current z-score scorer weights all selected goals equally.

For selected goals:

1. Highest in protein
2. High carb
3. Low fat
4. Low calorie

An item with very low fat and calories can rank high even if protein is poor.

Concrete example from fixture:

- `CEVICHE VEGANO`
- Protein: `2g`
- Fat: `0.5g`
- Calories: `70`
- Current rank: `#2`

It ranks high because low fat and low calories overpower the first goal, `Highest in protein`.

## Model Determinism Findings

App flow in `src/app/review.tsx`:

```ts
const result = await extractMenu(photos, "gpt-vision");
enrichMenu(result.items, "gpt-4o")
```

Edge Function findings in `supabase/functions/analyze-menu/index.ts`:

- GPT-4o enrichment uses:

```ts
temperature: 0,
seed: ENRICH_SEED
```

- Stage 1 extraction does **not** pass temperature or seed:

```ts
const text = await callOpenAIChat("gpt-4o", content, EXTRACT_SCHEMA);
```

- Gemini enrichment path also lacks sampling controls in `generationConfig`, but the current app uses `gpt-4o` enrichment.

Implication:

- Re-running full analysis can return different results because OCR/extraction may vary.
- If extraction changes, enrichment and final ranking can change.
- Even if extraction is stable, model outputs are not guaranteed perfectly identical, but current GPT enrichment is configured to be as stable as this code currently makes it.

## Last Answer Sent To User

> Yes, full menu analysis can return different results across runs.
>
> What I confirmed:
> - Same enriched `items` JSON + same selected goals = same ranking every time.
> - I ran your processed JSON through the local sorter: `mismatches: 0`.
> - Running “Analyze” again calls Stage 1 OCR and Stage 2 enrichment again. Those model outputs can vary, especially Stage 1 extraction, which currently does not pass `temperature: 0` or `seed`.
>
> Root cause of the “not great” ranking:
> - This is not a random client-side sorting bug.
> - The current z-score sorter gives every selected goal equal weight.
> - With goals: `Highest in protein`, `High carb`, `Low fat`, `Low calorie`, an item with very low calories/fat can rank high even with terrible protein.
> - Example from your JSON: `CEVICHE VEGANO` has only `2g` protein but ranks #2 because low fat and low calories overpower the protein goal.
>
> So we have two issues:
> 1. Full scans can vary because AI extraction/enrichment can vary.
> 2. Ranking quality is off because selected goal order is not treated as priority.
>
> Shortest fix path:
> - Make Stage 1 extraction pass `{ temperature: 0, seed: ENRICH_SEED }`.
> - Then decide ranking behavior: equal goals, or ordered priority. If “Highest in protein” is first, we probably need priority weighting, but the simple `4,3,2,1` test over-favored high-calorie pork dishes, so I would not blindly ship that without choosing the intended product rule.

## Brainstorming Direction For Next LLM

Do not jump straight to code. First decide the product rule for conflicting goals.

Possible solution directions:

1. Stabilize extraction:
   - Pass `temperature: 0` and fixed seed to Stage 1 extraction if OpenAI accepts it for this model/API path.
   - Keep this change tiny.

2. Ranking priority:
   - Current equal weighting ignores goal order.
   - Simple linear weights like `4,3,2,1` were tested and over-favored high-protein/high-carb/high-calorie pork dishes.
   - Need a better rule before implementation.

3. Possible ranking rules to evaluate against the fixture:
   - Primary goal gate: first goal dominates, secondary goals break near-ties.
   - Weighted z-score with softer weights, e.g. `1.0, 0.75, 0.5, 0.25`.
   - Penalize extreme violations of lower-priority “low calorie” or “low fat” goals without letting them dominate first goal.
   - Show separate per-goal scores to explain ranking instead of hiding tradeoffs.
   - Require first goal to be above median unless no item qualifies, then rank by combined score.

4. Use the fixture to compare top 10 outputs for each candidate rule before editing production code.

Keep Ponytail mode in mind:

- No new dependencies.
- Prefer one small script/check over a test framework.
- Keep the final ranking rule simple enough to explain to a user.
