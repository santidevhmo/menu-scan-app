import { Pressable, Text, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { colors } from "@/constants/theme";
import type { EnrichedItem } from "@/types/scan";
import type { MacroField } from "@/data/goals";

interface MenuItemRowProps {
  item: EnrichedItem;
  rank: number;
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

/** Formats a portion multiplier: "1/2" below one, otherwise "x1", "x1.5", "x2". */
function formatPortion(portion: number): string {
  return portion < 1 ? "1/2" : `x${portion}`;
}

/** Displays one ranked menu item with price, macros, and allergen warnings. */
export function MenuItemRow({
  item,
  rank,
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
        <Text className="font-sans text-subtle text-muted-foreground mt-2">
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
            highlight={highlight.has(macro.field)}
          />
        ))}
      </View>

      <View className="flex-row items-center justify-end mt-3 gap-2">
        <Pressable
          onPress={() => onPortionChange(Math.max(0.5, portion - 0.5))}
          disabled={portion <= 0.5}
          hitSlop={8}
          className={`w-7 h-7 items-center justify-center rounded-full border border-border ${
            portion <= 0.5 ? "opacity-40" : ""
          }`}
          accessibilityRole="button"
          accessibilityLabel="Decrease portion"
          accessibilityState={{ disabled: portion <= 0.5 }}
        >
          <Minus size={14} color={colors.mutedForeground} strokeWidth={2} />
        </Pressable>

        <Text className="font-sans text-caption text-muted-foreground w-9 text-center">
          {formatPortion(portion)}
        </Text>

        <Pressable
          onPress={() => onPortionChange(portion + 0.5)}
          hitSlop={8}
          className="w-7 h-7 items-center justify-center rounded-full border border-border"
          accessibilityRole="button"
          accessibilityLabel="Increase portion"
        >
          <Plus size={14} color={colors.mutedForeground} strokeWidth={2} />
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

/** One macro badge: rounded value and unit, plus label. */
function MacroBadge({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: number;
  unit: string;
  highlight: boolean;
}) {
  return (
    <View className="items-center">
      <Text
        className={`font-sans text-subtle ${
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
