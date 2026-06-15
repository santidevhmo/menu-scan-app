export interface GoalPair {
  group: string;
  high: string;
  low: string;
}

export const GOAL_PAIRS: GoalPair[] = [
  { group: "Protein", high: "High Protein", low: "Low Protein" },
  { group: "Carbs", high: "High Carbs", low: "Low Carbs" },
  { group: "Fat", high: "High Fat", low: "Low Fat" },
  { group: "Calorie", high: "High Calorie", low: "Low Calorie" },
];
