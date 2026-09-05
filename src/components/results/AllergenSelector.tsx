import { Pressable, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { ALLERGENS } from "@/data/allergens";
import { colors } from "@/constants/theme";

interface AllergenSelectorProps {
  selected: string[];
  onToggle: (allergen: string) => void;
}

/** Wrapping chip grid; independent multi-select. Measured off `3 · Goals`. */
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
            className={`flex-row items-center gap-1.5 shrink-0 py-[7px] px-[13px] rounded-full ${
              isSelected ? "bg-foreground" : "border border-border"
            }`}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={allergen.label}
          >
            {isSelected ? (
              <Check size={11} strokeWidth={2} color={colors.background} />
            ) : null}
            <Text
              className={`text-sm leading-[18px] font-medium ${
                isSelected ? "text-background" : "text-muted-foreground"
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
