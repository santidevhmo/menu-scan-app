import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface AllergensState {
  selectedAllergens: string[];
  setAllergens: (allergens: string[]) => void;
  toggleAllergen: (allergen: string) => void;
}

/** Stores user's selected allergens in AsyncStorage. */
export const useAllergensStore = create<AllergensState>()(
  persist(
    (set) => ({
      selectedAllergens: [],
      setAllergens: (allergens) => set({ selectedAllergens: allergens }),
      toggleAllergen: (allergen) =>
        set((state) => ({
          selectedAllergens: state.selectedAllergens.includes(allergen)
            ? state.selectedAllergens.filter((a) => a !== allergen)
            : [...state.selectedAllergens, allergen],
        })),
    }),
    {
      name: "allergens-storage",
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
