import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { colors } from "@/constants/theme";
import { allergenLabel } from "@/data/allergens";
import type { EnrichedItem } from "@/types/scan";
import type { MacroField } from "@/data/goals";
import { portionLabel, portionStep } from "@/lib/portions";
import { PortionEditor } from "./PortionEditor";

interface MenuItemRowProps {
  item: EnrichedItem;
  rank: number;
  highlight: Set<MacroField>;
  portion: number;
  piecesPerOrder: number;
  onPortionEdit: (portion: number, piecesPerOrder: number) => void;
  selectedAllergens: string[];
}

const MACROS: { field: MacroField; label: string; unit: string }[] = [
  { field: "protein_g", label: "Protein", unit: "g" },
  { field: "carb_g", label: "Carbs", unit: "g" },
  { field: "fat_g", label: "Fat", unit: "g" },
  { field: "estimated_calories", label: "Cal", unit: "" },
];

/** Displays one ranked menu item with price, macros, and allergen warnings. */
export function MenuItemRow({
  item,
  rank,
  highlight,
  portion,
  piecesPerOrder,
  onPortionEdit,
  selectedAllergens,
}: MenuItemRowProps) {
  const matchingAllergens = item.allergens.filter((allergen) =>
    selectedAllergens.includes(allergen),
  );
  // An item the model could not decompose has no ingredients, and macros summed
  // from no ingredients are 0 - which reads as a confident "0 calories" and sorts
  // to the TOP of a low-calorie ranking. A dash says "we don't know"; a zero
  // says something false and appealing. Found by the 2026-08-09 generalisation
  // probe on evocative names ("El Capricho del Chef"), which are common on
  // exactly the menus this app targets.
  const unknownMacros = (item.ingredients?.length ?? 0) === 0;
  const [editing, setEditing] = useState(false);
  const step = portionStep(piecesPerOrder);

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
            value={unknownMacros ? null : item[macro.field] * portion}
            unit={macro.unit}
            highlight={highlight.has(macro.field)}
          />
        ))}
      </View>

      <View className="flex-row items-center justify-end mt-3 gap-2">
        <Pressable
          onPress={() =>
            onPortionEdit(Math.max(step, portion - step), piecesPerOrder)
          }
          disabled={portion <= step}
          hitSlop={8}
          className={`w-7 h-7 items-center justify-center rounded-full border border-border ${
            portion <= step ? "opacity-40" : ""
          }`}
          accessibilityRole="button"
          accessibilityLabel="Decrease portion"
          accessibilityState={{ disabled: portion <= step }}
        >
          <Minus size={14} color={colors.mutedForeground} strokeWidth={2} />
        </Pressable>

        {/* The value must LOOK tappable - it is the only way anyone discovers
            they can correct a wrong piece count. */}
        <Pressable
          onPress={() => setEditing(true)}
          hitSlop={8}
          className="min-w-16 px-2 py-0.5 rounded-chip bg-card"
          accessibilityRole="button"
          accessibilityLabel={`Edit portion, currently ${portionLabel(
            portion,
            piecesPerOrder,
          )}`}
        >
          <Text className="font-sans text-caption text-foreground text-center">
            {portionLabel(portion, piecesPerOrder)}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => onPortionEdit(portion + step, piecesPerOrder)}
          hitSlop={8}
          className="w-7 h-7 items-center justify-center rounded-full border border-border"
          accessibilityRole="button"
          accessibilityLabel="Increase portion"
        >
          <Plus size={14} color={colors.mutedForeground} strokeWidth={2} />
        </Pressable>
      </View>

      {/* Mounted only while open, so its draft always starts from this row. */}
      {editing && (
        <PortionEditor
          name={item.name}
          portion={portion}
          piecesPerOrder={piecesPerOrder}
          caloriesPerOrder={unknownMacros ? null : item.estimated_calories}
          onClose={() => setEditing(false)}
          onSubmit={(nextPortion, nextPieces) => {
            onPortionEdit(nextPortion, nextPieces);
            setEditing(false);
          }}
        />
      )}

      {matchingAllergens.length > 0 && (
        <Text className="font-sans text-caption text-danger mt-2">
          Allergens: {matchingAllergens.map(allergenLabel).join(", ")}
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
  /** null when the value is unknown - rendered as a dash, never as 0. */
  value: number | null;
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
        {value === null ? "—" : `${Math.round(value)}${unit}`}
      </Text>
      <Text className="font-sans text-caption text-muted-foreground">
        {label}
      </Text>
    </View>
  );
}
