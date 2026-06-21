export interface GoalVector {
  name: string;
  field: string;
  direction: 1 | -1;
}

export function computeZScores(values: number[]): number[] {
  const count = values.length;
  if (count === 0) return [];

  const mean = values.reduce((sum, value) => sum + value, 0) / count;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count;
  const stddev = Math.sqrt(variance);

  if (stddev === 0) return values.map(() => 0);

  return values.map((value) => (value - mean) / stddev);
}

// ponytail: cosmetic display squash; raw z-score still drives sorting.
export function squashZScore(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

export function scoreAndSort<T extends object>(
  items: T[],
  goals: GoalVector[],
): (T & { alignment_score: number; goal_scores: Record<string, number> })[] {
  if (items.length === 0) return [];

  if (goals.length === 0) {
    return items.map((item) => ({
      ...item,
      alignment_score: 0,
      goal_scores: {},
    }));
  }

  const perGoalZ = new Map<string, number[]>();

  for (const goal of goals) {
    const raw = items.map((item) => {
      const value = (item as Record<string, unknown>)[goal.field];
      return typeof value === "number" ? value : 0;
    });
    perGoalZ.set(
      goal.name,
      computeZScores(raw).map((z) => z * goal.direction),
    );
  }

  return items
    .map((item, index) => {
      const goal_scores: Record<string, number> = {};
      let total = 0;

      for (const goal of goals) {
        const z = perGoalZ.get(goal.name)?.[index] ?? 0;
        goal_scores[goal.name] = z;
        total += z;
      }

      return {
        ...item,
        alignment_score: total / goals.length,
        goal_scores,
      };
    })
    .sort((a, b) => b.alignment_score - a.alignment_score);
}
