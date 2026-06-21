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
  check(
    "all-same returns zeros",
    computeZScores([5, 5, 5]).every((z) => z === 0),
  );
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
  {
    name: "Chicken",
    protein_g: 45,
    carb_g: 0,
    fat_g: 8,
    estimated_calories: 250,
  },
  {
    name: "Pasta",
    protein_g: 15,
    carb_g: 60,
    fat_g: 6,
    estimated_calories: 400,
  },
];

console.log("\nscoreAndSort - single goal (maximize protein)");
{
  const result = scoreAndSort(items, [
    { name: "Highest in protein", field: "protein_g", direction: 1 },
  ]);

  check("returns 3 items", result.length === 3);
  check("Chicken ranks first", result[0].name === "Chicken");
  check("Salad ranks last", result[2].name === "Salad");
  check(
    "alignment_score is a number",
    typeof result[0].alignment_score === "number",
  );
  check(
    "goal_scores keyed by goal name",
    "Highest in protein" in result[0].goal_scores,
  );
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
  check(
    "each item has both goal scores",
    Object.keys(result[0].goal_scores).length === 2,
  );
  check(
    "alignment_score differs between items",
    result[0].alignment_score !== result[1].alignment_score,
  );
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
  check(
    "alignment_score is 0 for all",
    result.every((item) => item.alignment_score === 0),
  );
  check(
    "goal_scores empty for all",
    result.every((item) => Object.keys(item.goal_scores).length === 0),
  );
}

console.log("\nscoreAndSort - empty items");
{
  const result = scoreAndSort(
    [],
    [{ name: "Highest in protein", field: "protein_g", direction: 1 }],
  );

  check("returns empty array", result.length === 0);
}

console.log("\nscoreAndSort - clamp caps single-goal dominance");

{
  const clampItems = [
    {
      name: "Balanced",
      protein_g: 35,
      carb_g: 35,
      fat_g: 12,
      estimated_calories: 440,
    },
    {
      name: "Outlier",
      protein_g: 0,
      carb_g: 0,
      fat_g: 3,
      estimated_calories: 140,
    },
    {
      name: "HeavyA",
      protein_g: 55,
      carb_g: 55,
      fat_g: 34,
      estimated_calories: 780,
    },
    {
      name: "HeavyB",
      protein_g: 50,
      carb_g: 48,
      fat_g: 31,
      estimated_calories: 720,
    },
    {
      name: "HeavyC",
      protein_g: 48,
      carb_g: 50,
      fat_g: 30,
      estimated_calories: 700,
    },
    {
      name: "Mid",
      protein_g: 22,
      carb_g: 24,
      fat_g: 14,
      estimated_calories: 480,
    },
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
    "goal_scores keep raw (unclamped) z beyond cap",
    Math.abs(
      result.find((item) => item.name === "Outlier")!.goal_scores[
        "Low calorie"
      ],
    ) > 1.5,
  );
  const outlier = result.find((item) => item.name === "Outlier")!;
  const rawAverage =
    Object.values(outlier.goal_scores).reduce((sum, score) => sum + score, 0) /
    Object.keys(outlier.goal_scores).length;
  check(
    "alignment_score uses clamped goal scores",
    Math.abs(outlier.alignment_score - rawAverage) > 0.05,
  );
}

console.log("\nscoreAndSort - leaders past the cap keep their order");

{
  // Many low-protein items pull the mean down so both top items exceed the old
  // hard cap (z > 1.5). A hard clamp ties them at the cap and original array
  // order wins; the soft clamp must keep the higher-protein item ahead.
  const proteins = [
    60, 70, 50, 50, 50, 50, 50, 50, 50, 50, 35, 40, 30, 10, 30, 45, 40, 35, 2,
    25, 20, 15, 18, 12, 8, 22, 28, 15, 10, 5, 33, 38,
  ];
  const plateauItems = proteins.map((protein_g, index) => ({
    name: `item${index}`,
    protein_g,
    carb_g: 0,
    fat_g: 0,
    estimated_calories: 0,
  }));

  const result = scoreAndSort(plateauItems, [
    { name: "Highest in protein", field: "protein_g", direction: 1 },
  ]);

  const rank70 = result.findIndex((item) => item.protein_g === 70);
  const rank60 = result.findIndex((item) => item.protein_g === 60);

  check("highest protein (70) ranks first", rank70 === 0);
  check("60g protein ranks below 70g protein", rank70 < rank60);
  check(
    "tied leaders no longer share an identical score",
    result[0].alignment_score !== result[1].alignment_score,
  );
}

console.log(`\n${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
