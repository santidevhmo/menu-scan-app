import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface GoalsState {
  selectedGoals: string[];
  setGoals: (goals: string[]) => void;
}

export const useGoalsStore = create<GoalsState>()(
  persist(
    (set) => ({
      selectedGoals: [],
      setGoals: (goals) => set({ selectedGoals: goals }),
    }),
    {
      name: "goals-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
