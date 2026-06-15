import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface GoalsState {
  selectedGoals: string[];
  setGoals: (goals: string[]) => void;
  toggleGoal: (goal: string) => void;
}

/** Stores the user's selected nutrition goals in AsyncStorage. */
export const useGoalsStore = create<GoalsState>()(
  persist(
    (set) => ({
      selectedGoals: [],
      setGoals: (goals) => set({ selectedGoals: goals }),
      toggleGoal: (goal) =>
        set((state) => ({
          selectedGoals: state.selectedGoals.includes(goal)
            ? state.selectedGoals.filter((g) => g !== goal)
            : [...state.selectedGoals, goal],
        })),
    }),
    {
      name: "goals-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
