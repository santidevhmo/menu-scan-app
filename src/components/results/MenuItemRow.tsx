import { Text, View } from "react-native";
import type { MenuItem } from "@/types/scan";

interface MenuItemRowProps {
  item: MenuItem;
  rank: number;
}

/** Displays one ranked menu item with price, description, nutrition, and warnings. */
export function MenuItemRow({ item, rank }: MenuItemRowProps) {
  return (
    <View className="rounded-card bg-card border border-border p-4 mb-3">
      {/* Header: rank + name + price */}
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

      {/* Category badge */}
      <View className="flex-row mt-2">
        <View className="rounded-chip bg-muted px-2 py-0.5">
          <Text className="font-sans text-caption text-muted-foreground capitalize">
            {item.category}
          </Text>
        </View>
      </View>

      {/* Description */}
      {item.description !== "" && (
        <Text
          className="font-sans text-subtle text-muted-foreground mt-2"
          numberOfLines={2}
        >
          {item.description}
        </Text>
      )}

      {/* Nutrition grid */}
      <View className="flex-row mt-3 justify-between">
        <NutritionStat label="Cal" value={item.estimated_calories} />
        <NutritionStat
          label="Protein"
          value={item.protein_g}
          unit="g"
          highlight
        />
        <NutritionStat label="Carbs" value={item.carbs_g} unit="g" />
        <NutritionStat label="Fat" value={item.fat_g} unit="g" />
      </View>

      {/* Dietary tags */}
      {item.dietary_tags.length > 0 && (
        <View className="flex-row flex-wrap mt-2 gap-1">
          {item.dietary_tags.map((tag) => (
            <View
              key={tag}
              className="rounded-chip bg-accent-lime/20 px-2 py-0.5"
            >
              <Text className="font-sans text-caption text-foreground">
                {tag}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Allergens */}
      {item.allergens.length > 0 && (
        <Text className="font-sans text-caption text-danger mt-2">
          Allergens: {item.allergens.join(", ")}
        </Text>
      )}
    </View>
  );
}

/** Displays one compact nutrition value inside a menu item row. */
function NutritionStat({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: number;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <View className="items-center">
      <Text
        className={`font-sans text-body ${highlight ? "text-foreground font-semibold" : "text-muted-foreground"}`}
      >
        {value}
        {unit ?? ""}
      </Text>
      <Text className="font-sans text-caption text-muted-foreground">
        {label}
      </Text>
    </View>
  );
}
