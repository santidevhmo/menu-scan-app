import { sortItemsByGoals } from "../analyzeMenu";
import type { EnrichedItem } from "@/types/scan";

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

const items: EnrichedItem[] = [
  {
    name: "Protein",
    description: "",
    price: null,
    category: "main",
    ingredients: [],
    protein_g: 50,
    carb_g: 0,
    fat_g: 0,
    estimated_calories: 0,
    confidence: "high",
    allergens: [],
  },
  {
    name: "Carb",
    description: "",
    price: null,
    category: "main",
    ingredients: [],
    protein_g: 0,
    carb_g: 50,
    fat_g: 0,
    estimated_calories: 0,
    confidence: "high",
    allergens: [],
  },
];

console.log("\nsortItemsByGoals - goal order affects ranking");

{
  const proteinFirst = sortItemsByGoals(items, [
    "Highest in protein",
    "High carb",
  ]);
  const carbFirst = sortItemsByGoals(items, [
    "High carb",
    "Highest in protein",
  ]);

  check(
    "protein-first goals rank protein item first",
    proteinFirst[0].name === "Protein",
  );
  check("carb-first goals rank carb item first", carbFirst[0].name === "Carb");
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
