import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GOAL_PAIRS } from "@/data/goals";

interface GoalsState {
  selectedGoals: string[];
  setGoals: (goals: string[]) => void;
  toggleGoal: (goal: string) => void;
}

function withoutOpposite(goals: string[], goal: string) {
  const pair = GOAL_PAIRS.find((p) => p.high === goal || p.low === goal);
  if (!pair) return goals;

  const opposite = pair.high === goal ? pair.low : pair.high;
  return goals.filter((g) => g !== opposite);
}

function normalizeGoals(goals: string[]) {
  return goals.reduce<string[]>((selected, goal) => {
    if (selected.includes(goal)) return selected;
    return [...withoutOpposite(selected, goal), goal];
  }, []);
}

/** Stores the user's selected nutrition goals in AsyncStorage. */
export const useGoalsStore = create<GoalsState>()(
  persist(
    (set) => ({
      selectedGoals: [],
      setGoals: (goals) => set({ selectedGoals: normalizeGoals(goals) }),
      toggleGoal: (goal) =>
        set((state) => ({
          selectedGoals: state.selectedGoals.includes(goal)
            ? state.selectedGoals.filter((g) => g !== goal)
            : [...withoutOpposite(state.selectedGoals, goal), goal],
        })),
    }),
    {
      name: "goals-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
