export interface GoalPair {
  group: string;
  high: string;
  low: string;
}

export type MacroField =
  | "protein_g"
  | "carb_g"
  | "fat_g"
  | "estimated_calories";

export const GOAL_PAIRS: GoalPair[] = [
  { group: "Protein", high: "Highest in protein", low: "Low protein" },
  { group: "Carbs", high: "High carb", low: "Low carb" },
  { group: "Fat", high: "High fat", low: "Low fat" },
  { group: "Calorie", high: "High calorie", low: "Low calorie" },
];

export const GROUP_TO_MACRO: Record<string, MacroField> = {
  Protein: "protein_g",
  Carbs: "carb_g",
  Fat: "fat_g",
  Calorie: "estimated_calories",
};
