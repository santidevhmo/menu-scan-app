import { Pressable, Text, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { colors } from "@/constants/theme";
import type { EnrichedItem } from "@/types/scan";
import { bucketDots } from "@/lib/analyzeMenu";
import type { MacroField } from "@/data/goals";

export interface MacroMaxes {
  protein_g: number;
  carb_g: number;
  fat_g: number;
  estimated_calories: number;
}

interface MenuItemRowProps {
  item: EnrichedItem;
  rank: number;
  maxValues: MacroMaxes;
  highlight: Set<MacroField>;
  portion: number;
  onPortionChange: (portion: number) => void;
}

const MACROS: { field: MacroField; label: string; unit: string }[] = [
  { field: "protein_g", label: "Protein", unit: "g" },
  { field: "carb_g", label: "Carbs", unit: "g" },
  { field: "fat_g", label: "Fat", unit: "g" },
  { field: "estimated_calories", label: "Cal", unit: "" },
];

/** Displays one ranked menu item with price, dot-badges, and allergen warnings. */
export function MenuItemRow({
  item,
  rank,
  maxValues,
  highlight,
  portion,
  onPortionChange,
}: MenuItemRowProps) {
  return (
    <View className="rounded-card bg-card border border-border p-4 mb-3">
      <View className="flex-row items-start justify-between">
        <View className="flex-row items-center flex-1 mr-3">
          <Text className="font-sans text-caption text-muted-foreground mr-2">
            #{rank}
          </Text>
          <Text
            className="font-display text-body text-foreground flex-1"
            numberOfLines={2}
          >
            {item.name}
          </Text>
        </View>
        {item.price != null && (
          <Text className="font-sans text-body text-foreground">
            ${item.price.toFixed(2)}
          </Text>
        )}
      </View>

      <View className="flex-row mt-2">
        <View className="rounded-chip bg-muted px-2 py-0.5">
          <Text className="font-sans text-caption text-muted-foreground capitalize">
            {item.category}
          </Text>
        </View>
      </View>

      {item.description !== "" && (
        <Text
          className="font-sans text-subtle text-muted-foreground mt-2"
          numberOfLines={2}
        >
          {item.description}
        </Text>
      )}

      <View className="flex-row mt-3 justify-between">
        {MACROS.map((macro) => (
          <MacroBadge
            key={macro.field}
            label={macro.label}
            value={item[macro.field] * portion}
            unit={macro.unit}
            filled={bucketDots(item[macro.field], maxValues[macro.field])}
            highlight={highlight.has(macro.field)}
          />
        ))}
      </View>

      <View className="flex-row items-center justify-center mt-3 gap-4">
        <Pressable
          onPress={() => onPortionChange(Math.max(0.5, portion - 0.5))}
          disabled={portion <= 0.5}
          hitSlop={8}
          className={`w-9 h-9 items-center justify-center rounded-full border ${
            portion <= 0.5 ? "border-border opacity-40" : "border-border"
          }`}
          accessibilityRole="button"
          accessibilityLabel="Decrease portion"
          accessibilityState={{ disabled: portion <= 0.5 }}
        >
          <Minus size={16} color={colors.foreground} strokeWidth={2} />
        </Pressable>

        <Text className="font-sans text-body text-foreground w-12 text-center">
          {portion}x
        </Text>

        <Pressable
          onPress={() => onPortionChange(portion + 0.5)}
          hitSlop={8}
          className="w-9 h-9 items-center justify-center rounded-full border border-border"
          accessibilityRole="button"
          accessibilityLabel="Increase portion"
        >
          <Plus size={16} color={colors.foreground} strokeWidth={2} />
        </Pressable>
      </View>

      {item.allergens.length > 0 && (
        <Text className="font-sans text-caption text-danger mt-2">
          Allergens: {item.allergens.join(", ")}
        </Text>
      )}
    </View>
  );
}

/** One macro badge: four dots relative to the menu's max, plus the value. */
function MacroBadge({
  label,
  value,
  unit,
  filled,
  highlight,
}: {
  label: string;
  value: number;
  unit: string;
  filled: number;
  highlight: boolean;
}) {
  const dotColor = highlight ? "text-foreground" : "text-muted-foreground";

  return (
    <View className="items-center">
      <Text className={`font-sans text-caption ${dotColor}`}>
        {"●".repeat(filled)}
        {"○".repeat(4 - filled)}
      </Text>
      <Text
        className={`font-sans text-subtle mt-1 ${
          highlight ? "text-foreground font-semibold" : "text-muted-foreground"
        }`}
      >
        {Math.round(value)}
        {unit}
      </Text>
      <Text className="font-sans text-caption text-muted-foreground">
        {label}
      </Text>
    </View>
  );
}
