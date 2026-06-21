import { Pressable, Text, View } from "react-native";

import { ALLERGENS } from "@/data/allergens";

interface AllergenSelectorProps {
  selected: string[];
  onToggle: (allergen: string) => void;
}

/** Wrapping chip grid; independent multi-select. */
export function AllergenSelector({
  selected,
  onToggle,
}: AllergenSelectorProps) {
  return (
    <View className="flex-row flex-wrap gap-2">
      {ALLERGENS.map((allergen) => {
        const isSelected = selected.includes(allergen.value);

        return (
          <Pressable
            key={allergen.value}
            onPress={() => onToggle(allergen.value)}
            className={`rounded-chip px-3 py-2 ${
              isSelected ? "bg-foreground" : "bg-card border border-border"
            }`}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={allergen.label}
          >
            <Text
              className={`font-sans text-caption ${
                isSelected ? "text-background" : "text-foreground"
              }`}
            >
              {allergen.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
