import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { enrichMenu } from "@/lib/analyzeMenu";
import type {
  EnrichedItem,
  EnrichmentProvider,
  EnrichmentResult,
  ExtractedItem,
} from "@/types/scan";

// ponytail: inline dev fixture - single-use, repeatable input. No separate data file.
const FIXTURE: ExtractedItem[] = [
  {
    name: "Grilled Salmon Fillet",
    description: "Atlantic salmon, lemon butter, steamed broccoli, quinoa",
    price: 24,
    category: "main",
  },
  {
    name: "Crispy Buttermilk Fried Chicken",
    description: "Hand-breaded chicken thigh, mashed potatoes, country gravy",
    price: 18,
    category: "main",
  },
  {
    name: "Caesar Salad",
    description: "Romaine, parmesan, croutons, anchovy dressing",
    price: 12,
    category: "appetizer",
  },
  {
    name: "Margherita Pizza",
    description: "San Marzano tomato, fresh mozzarella, basil, 12-inch",
    price: 16,
    category: "main",
  },
  {
    name: "Spaghetti Carbonara",
    description: "Guanciale, egg yolk, pecorino, black pepper",
    price: 19,
    category: "main",
  },
  {
    name: "Garden Veggie Bowl",
    description: "Chickpeas, roasted sweet potato, kale, tahini",
    price: 14,
    category: "main",
  },
  {
    name: "Cheeseburger Deluxe",
    description: "Beef patty, cheddar, lettuce, tomato, brioche bun, fries",
    price: 15,
    category: "main",
  },
  { name: "House Fries", description: "", price: 6, category: "side" },
  {
    name: "Chocolate Lava Cake",
    description: "Warm molten center, vanilla bean ice cream",
    price: 9,
    category: "dessert",
  },
  {
    name: "The Legendary Feast",
    description: "Best plate in town - a taste you'll never forget!",
    price: 29,
    category: "main",
  },
  {
    name: "Grandma's Secret Special",
    description: "Made with love, just like the old days",
    price: 22,
    category: "main",
  },
  { name: "Fresh Lemonade", description: "", price: 4, category: "drink" },
];

const PROVIDERS: EnrichmentProvider[] = ["gpt-4o", "gemini-2.5-flash"];
// ponytail: static est. cost label. Real cost is judged from provider dashboards.
const EST_COST: Record<EnrichmentProvider, string> = {
  "gemini-2.5-flash": "~$0.001",
  "gemini-2.5-pro": "n/a",
  "gpt-4o": "~$0.01-0.02",
  "mistral-large": "n/a",
};

export default function EnrichBench() {
  const [results, setResults] = useState<
    Partial<Record<EnrichmentProvider, EnrichmentResult>>
  >({});
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    setResults({});
    await Promise.all(
      PROVIDERS.map(async (provider) => {
        const result = await enrichMenu(FIXTURE, provider);
        setResults((prev) => ({ ...prev, [provider]: result }));
      }),
    );
    setRunning(false);
  };

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        className="flex-1 bg-background"
        contentContainerStyle={{ padding: 24 }}
      >
        <Text className="font-display text-h1 text-foreground mb-3">
          Enrichment Bench
        </Text>
        <Pressable
          onPress={run}
          disabled={running}
          className={`rounded-full py-3 items-center mb-5 ${
            running ? "bg-muted" : "bg-foreground"
          }`}
        >
          <Text
            className={`font-sans text-button ${
              running ? "text-muted-foreground" : "text-background"
            }`}
          >
            {running
              ? "Running..."
              : `Run ${FIXTURE.length} items x ${PROVIDERS.length} models`}
          </Text>
        </Pressable>
        {PROVIDERS.map((provider) => (
          <ProviderPanel
            key={provider}
            provider={provider}
            result={results[provider] ?? null}
            running={running}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function ProviderPanel({
  provider,
  result,
  running,
}: {
  provider: EnrichmentProvider;
  result: EnrichmentResult | null;
  running: boolean;
}) {
  return (
    <View className="mb-6">
      <View className="flex-row justify-between items-baseline mb-2">
        <Text className="font-display text-h2 text-foreground">{provider}</Text>
        <Text className="font-sans text-caption text-muted-foreground">
          est. {EST_COST[provider]}
        </Text>
      </View>
      {result && !result.error && (
        <Text className="font-sans text-caption text-muted-foreground mb-2">
          {result.items.length} items | {(result.latency_ms / 1000).toFixed(1)}s
          | {result.model_id}
        </Text>
      )}
      {running && !result ? (
        <ActivityIndicator />
      ) : result?.error ? (
        <Text className="font-sans text-body text-danger">{result.error}</Text>
      ) : result ? (
        result.items.map((item, index) => (
          <ItemRow key={`${item.name}-${index}`} item={item} />
        ))
      ) : (
        <Text className="font-sans text-caption text-muted-foreground">
          Not run yet
        </Text>
      )}
    </View>
  );
}

function ItemRow({ item }: { item: EnrichedItem }) {
  return (
    <View className="rounded-card bg-card border border-border p-3 mb-2">
      <View className="flex-row justify-between">
        <Text
          className="font-sans text-body text-foreground flex-1 mr-2"
          numberOfLines={1}
        >
          {item.name}
        </Text>
        <Text className="font-sans text-caption text-muted-foreground">
          {item.confidence}
        </Text>
      </View>
      <Text className="font-sans text-caption text-muted-foreground mt-1">
        P {item.protein_g}g | C {item.carb_g}g | F {item.fat_g}g |{" "}
        {item.estimated_calories} kcal
      </Text>
      <Text className="font-sans text-caption text-muted-foreground mt-1">
        {item.ingredients
          .map((ingredient) => `${ingredient.name} (${ingredient.category})`)
          .join(", ")}
      </Text>
      {item.allergens.length > 0 && (
        <Text className="font-sans text-caption text-danger mt-1">
          Allergens: {item.allergens.join(", ")}
        </Text>
      )}
    </View>
  );
}
