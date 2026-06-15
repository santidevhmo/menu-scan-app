export interface GoalPair {
  group: string;
  high: string;
  low: string;
}

export const GOAL_PAIRS: GoalPair[] = [
  { group: "Protein", high: "Highest in protein", low: "Low protein" },
  { group: "Carbs", high: "High carb", low: "Low carb" },
  { group: "Fat", high: "High fat", low: "Low fat" },
  { group: "Calorie", high: "High calorie", low: "Low calorie" },
];
