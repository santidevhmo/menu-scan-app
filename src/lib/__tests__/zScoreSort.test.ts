// @ts-expect-error Node 25 runs the .ts file directly; app tsc does not enable TS extension imports.
import { computeZScores, scoreAndSort, squashZScore } from "../zScoreSort.ts";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean): void {
  if (condition) {
    console.log(`✓ ${label}`);
    passed++;
    return;
  }

  console.error(`✗ ${label}`);
  failed++;
}

console.log("\ncomputeZScores");
{
  const zs = computeZScores([10, 20, 30]);
  const sum = zs.reduce((total, value) => total + value, 0);

  check("mean of z-scores is 0", Math.abs(sum) < 1e-9);
  check("below-mean value is negative", zs[0] < 0);
  check("above-mean value is positive", zs[2] > 0);
  check("empty array returns empty", computeZScores([]).length === 0);
  check("all-same returns zeros", computeZScores([5, 5, 5]).every((z) => z === 0));
}

console.log("\nsquashZScore");
{
  check("z=0 returns 0.5", Math.abs(squashZScore(0) - 0.5) < 1e-9);
  check("positive z is above 0.5", squashZScore(2) > 0.5);
  check("negative z is below 0.5", squashZScore(-2) < 0.5);
  check("large positive z stays at most 1", squashZScore(100) <= 1);
  check("large negative z stays at least 0", squashZScore(-100) >= 0);
}

const items = [
  { name: "Salad", protein_g: 5, carb_g: 10, fat_g: 2, estimated_calories: 80 },
  { name: "Chicken", protein_g: 45, carb_g: 0, fat_g: 8, estimated_calories: 250 },
  { name: "Pasta", protein_g: 15, carb_g: 60, fat_g: 6, estimated_calories: 400 },
];

console.log("\nscoreAndSort - single goal (maximize protein)");
{
  const result = scoreAndSort(items, [
    { name: "Highest in protein", field: "protein_g", direction: 1 },
  ]);

  check("returns 3 items", result.length === 3);
  check("Chicken ranks first", result[0].name === "Chicken");
  check("Salad ranks last", result[2].name === "Salad");
  check("alignment_score is a number", typeof result[0].alignment_score === "number");
  check("goal_scores keyed by goal name", "Highest in protein" in result[0].goal_scores);
}

console.log("\nscoreAndSort - single goal (minimize calories)");
{
  const result = scoreAndSort(items, [
    { name: "Low calorie", field: "estimated_calories", direction: -1 },
  ]);

  check("Salad ranks first", result[0].name === "Salad");
  check("Pasta ranks last", result[2].name === "Pasta");
}

console.log("\nscoreAndSort - conflicting goals");
{
  const result = scoreAndSort(items, [
    { name: "Highest in protein", field: "protein_g", direction: 1 },
    { name: "Low calorie", field: "estimated_calories", direction: -1 },
  ]);

  check("returns 3 items", result.length === 3);
  check("each item has both goal scores", Object.keys(result[0].goal_scores).length === 2);
  check("alignment_score differs between items", result[0].alignment_score !== result[1].alignment_score);
  check(
    "Chicken outranks Pasta",
    result.findIndex((item) => item.name === "Chicken") <
      result.findIndex((item) => item.name === "Pasta"),
  );
}

console.log("\nscoreAndSort - no goals");
{
  const result = scoreAndSort(items, []);

  check("returns all items", result.length === 3);
  check("alignment_score is 0 for all", result.every((item) => item.alignment_score === 0));
  check("goal_scores empty for all", result.every((item) => Object.keys(item.goal_scores).length === 0));
}

console.log("\nscoreAndSort - empty items");
{
  const result = scoreAndSort([], [
    { name: "Highest in protein", field: "protein_g", direction: 1 },
  ]);

  check("returns empty array", result.length === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
