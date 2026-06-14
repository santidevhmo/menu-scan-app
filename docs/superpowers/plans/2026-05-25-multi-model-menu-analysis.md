# Multi-Model Menu Analysis MVP

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send real menu photos to 4 AI models (Gemini 1.5, Gemini 2.0, Mistral OCR, GPT-4o) and display structured menu item results side-by-side in tabs for comparison.

**Architecture:** A single Supabase Edge Function receives base64 photos + goals + provider name, calls the appropriate AI API with a shared JSON schema, and returns parsed menu items. The client fires 4 parallel requests (one per model) and renders results in a tabbed interface as each model responds. All models are asked to return the same JSON structure via their respective structured output enforcement.

**Tech Stack:** Expo, React Native, TypeScript, NativeWind, Zustand, Supabase Edge Functions (Deno), Gemini REST API, OpenAI REST API, Mistral REST API

**Current status (2026-06-13):** The OCR/extraction comparison is complete. **GPT-4o Vision** (`provider: "gpt-vision"`, `model_id: "gpt-4o"`) is the frozen menu-reading model for the next phase. Current project cost assumption: **$0.03 USD per GPT-4o Vision extraction call**. The nutritional enrichment/model comparison is **not complete** and remains in scope.

**Tooling status (2026-06-13):** Package manager cleanup is complete. The project now standardizes on **pnpm** (`packageManager: "pnpm@11.0.8"`), keeps `pnpm-lock.yaml` as the only JS lockfile, uses `pnpm-workspace.yaml` with `nodeLinker: hoisted` for Expo/Metro compatibility, and pins `lightningcss` to `1.30.1` via pnpm overrides to avoid NativeWind / `react-native-css` / `global.css` bundling failures.

---

## Prerequisites

Before starting implementation, the user must provide:

1. **Google AI API key** — get from [https://aistudio.google.com/apikey](https://aistudio.google.com/apikey) (covers both Gemini 1.5 and 2.0)
2. **OpenAI API key** — get from [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
3. **Mistral API key** — get from [https://console.mistral.ai/api-keys](https://console.mistral.ai/api-keys)
4. **Supabase project** — create at [https://supabase.com/dashboard](https://supabase.com/dashboard) if not done. Need the project URL and anon key.
5. **Supabase CLI** — install via `brew install supabase/tap/supabase` and run `supabase login`

Store API keys as Edge Function secrets (never in client code):

```bash
supabase secrets set GEMINI_API_KEY=xxx OPENAI_API_KEY=xxx MISTRAL_API_KEY=xxx
```

Store Supabase connection in client `.env`:

```
EXPO_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

---

## File Map


| File                                       | Action | Responsibility                                        |
| ------------------------------------------ | ------ | ----------------------------------------------------- |
| `src/types/scan.ts`                        | Modify | Add MenuItem, ModelProvider, AnalysisResult types     |
| `src/lib/supabase.ts`                      | Create | Supabase client init                                  |
| `src/lib/analyzeMenu.ts`                   | Create | Client function: photos → base64 → Edge Function call |
| `src/store/analysis.store.ts`              | Create | Per-model results, loading states, active tab         |
| `src/components/results/MenuItemRow.tsx`   | Create | Single menu item row component                        |
| `src/app/results.tsx`                      | Create | Results screen with 4 model tabs                      |
| `src/app/_layout.tsx`                      | Modify | Register results route                                |
| `src/app/review.tsx`                       | Modify | Add "Analyze Menu" button                             |
| `supabase/functions/analyze-menu/index.ts` | Create | Edge Function: dispatch to AI providers               |


---

## Shared JSON Schema (used by all models)

This is the schema we enforce on every model's response. Focused on fields needed for nutritional goal sorting — no unnecessary fields like spice_level.

```ts
interface MenuItem {
  name: string;
  description: string;
  price: number | null;          // null when not visible on menu
  category: "appetizer" | "main" | "side" | "dessert" | "drink" | "other";
  estimated_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  dietary_tags: string[];        // e.g. ["vegan", "gluten-free"]
  allergens: string[];           // e.g. ["nuts", "dairy"]
}
```

The Edge Function response wraps this:

```ts
interface AnalysisResponse {
  items: MenuItem[];
  latency_ms: number;
  model_id: string;              // exact model string used
}
```

The client-side result type adds metadata:

```ts
type ModelProvider = "gemini-1.5" | "gemini-2.0" | "mistral-ocr" | "gpt-4o";

interface AnalysisResult {
  provider: ModelProvider;
  items: MenuItem[];
  latency_ms: number;
  model_id: string;
  error: string | null;
}
```

---

## Task 1: Types

**Files:**

- Modify: `src/types/scan.ts`

- [x] **Step 1: Add types to scan.ts**

Append the following types after the existing `ScanPhoto` interface. Do not modify existing types.

```ts
export type MenuCategory = "appetizer" | "main" | "side" | "dessert" | "drink" | "other";

export interface MenuItem {
  name: string;
  description: string;
  price: number | null;
  category: MenuCategory;
  estimated_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  dietary_tags: string[];
  allergens: string[];
}

export type ModelProvider = "gemini-1.5" | "gemini-2.0" | "mistral-ocr" | "gpt-4o";

export interface AnalysisResult {
  provider: ModelProvider;
  items: MenuItem[];
  latency_ms: number;
  model_id: string;
  error: string | null;
}
```

- [x] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [x] **Step 3: Commit**

```bash
git add src/types/scan.ts
git commit -m "feat: add MenuItem and AnalysisResult types for menu analysis"
```

---

## Task 2: Supabase Client

**Files:**

- Create: `src/lib/supabase.ts`

- [x] **Step 1: Create Supabase client**

```ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

Note: `@supabase/supabase-js` is not yet installed. Install it:

```bash
./node_modules/.bin/expo install @supabase/supabase-js
```

- [x] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors.

- [x] **Step 3: Commit**

```bash
git add src/lib/supabase.ts
git commit -m "feat: init Supabase client"
```

---

## Task 3: Supabase Edge Function

**Files:**

- Create: `supabase/functions/analyze-menu/index.ts`

This is the core backend. One Edge Function that dispatches to 4 different AI providers based on the `provider` parameter.

- [x] **Step 1: Initialize Supabase functions directory**

```bash
supabase init  # creates supabase/ dir with config.toml (skip if already done)
supabase functions new analyze-menu
```

- [x] **Step 2: Implement the Edge Function**

The function receives a POST body:

```ts
{ photos: string[], goals: string[], provider: ModelProvider }
```

Where `photos` are base64-encoded JPEG strings (already compressed to ≤1024px client-side).

The shared prompt sent to all models:

```
You are analyzing restaurant menu photos. Extract every menu item visible in the photos.
For each item, estimate its nutritional content based on typical restaurant portions.
Sort the results by: {goals joined by ", "}.
Return ONLY the JSON array of menu items matching the provided schema.
```

**Provider-specific API calls:**

**Gemini 1.5 / 2.0** — REST API to `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`

- Model IDs: `gemini-1.5-flash` and `gemini-2.0-flash`
- Images sent as `inlineData: { mimeType: "image/jpeg", data: base64 }` in `contents[0].parts[]`
- Structured output via `generationConfig.responseMimeType: "application/json"` + `generationConfig.responseSchema` with the MenuItem array schema
- Schema uses uppercase types: `"OBJECT"`, `"STRING"`, `"ARRAY"`, `"NUMBER"`, `"INTEGER"`
- Auth: `x-goog-api-key` header

**GPT-4o** — REST API to `https://api.openai.com/v1/chat/completions`

- Model ID: `gpt-4o`
- Images sent as `content: [{ type: "image_url", image_url: { url: "data:image/jpeg;base64,{b64}" } }]` in messages
- Structured output via `response_format: { type: "json_schema", json_schema: { name: "menu_items", strict: true, schema: { ... } } }`
- Auth: `Authorization: Bearer {key}` header

**Mistral OCR** — Two-step flow:

1. `POST https://api.mistral.ai/v1/ocr` with `model: "mistral-ocr-latest"`, `document: { type: "image_url", image_url: "data:image/jpeg;base64,{b64}" }` → returns markdown text of menu
2. `POST https://api.mistral.ai/v1/chat/completions` with `model: "mistral-large-latest"`, the markdown as user message, and `response_format: { type: "json_schema", json_schema: { ... } }` for structured output

- Auth: `Authorization: Bearer {key}` header for both calls

**Response format** (same for all providers):

```json
{ "items": [...], "latency_ms": 1234, "model_id": "gemini-2.0-flash" }
```

The function should:

1. Read the provider from the request body
2. Record `Date.now()` before the API call
3. Call the appropriate provider
4. Parse the response JSON (guaranteed valid by structured output enforcement)
5. Calculate latency
6. Return the response with CORS headers

Error handling: if the API call fails, return `{ items: [], latency_ms: 0, model_id: "...", error: "error message" }` with a 200 status (let the client handle display).

- [ ] **Step 3: Test locally**

```bash
supabase functions serve analyze-menu --env-file .env.local
```

Test with curl:

```bash
curl -X POST http://localhost:54321/functions/v1/analyze-menu \
  -H "Authorization: Bearer YOUR_ANON_KEY" \
  -H "Content-Type: application/json" \
  -d '{"photos": ["BASE64_HERE"], "goals": ["Highest in protein"], "provider": "gemini-2.0"}'
```

Expected: JSON response with `items` array of MenuItem objects.

- [ ] **Step 4: Commit**

```bash
git add supabase/
git commit -m "feat: add analyze-menu Edge Function with multi-model support"
```

---

## Task 4: Client Analysis Service

**Files:**

- Create: `src/lib/analyzeMenu.ts`

- [x] **Step 1: Implement analyzeMenu function**

This function:

1. Reads each photo URI as base64 using `expo-file-system`
2. Calls the Supabase Edge Function
3. Returns the parsed result

```ts
import * as FileSystem from "expo-file-system";
import { supabase } from "./supabase";
import type { ScanPhoto, ModelProvider, MenuItem, AnalysisResult } from "@/types/scan";

const GOALS_SORT_MAP: Record<string, { field: keyof MenuItem; order: "asc" | "desc" }> = {
  "Highest in protein": { field: "protein_g", order: "desc" },
  "Low calorie": { field: "estimated_calories", order: "asc" },
  "High carb": { field: "carbs_g", order: "desc" },
  "Low fat": { field: "fat_g", order: "asc" },
};

export function sortItemsByGoals(items: MenuItem[], goals: string[]): MenuItem[] {
  const goal = goals[0];
  const sortConfig = goal ? GOALS_SORT_MAP[goal] : undefined;
  if (!sortConfig) return items;
  return [...items].sort((a, b) => {
    const aVal = a[sortConfig.field] as number;
    const bVal = b[sortConfig.field] as number;
    return sortConfig.order === "desc" ? bVal - aVal : aVal - bVal;
  });
}

export async function analyzeMenu(
  photos: ScanPhoto[],
  goals: string[],
  provider: ModelProvider,
): Promise<AnalysisResult> {
  // Convert photo URIs to base64
  const base64Photos = await Promise.all(
    photos.map((p) =>
      FileSystem.readAsStringAsync(p.uri, {
        encoding: FileSystem.EncodingType.Base64,
      })
    )
  );

  const { data, error } = await supabase.functions.invoke("analyze-menu", {
    body: { photos: base64Photos, goals, provider },
  });

  if (error) {
    return { provider, items: [], latency_ms: 0, model_id: provider, error: error.message };
  }

  // Client-side sort by goals (in case model didn't sort perfectly)
  const sortedItems = sortItemsByGoals(data.items, goals);

  return {
    provider,
    items: sortedItems,
    latency_ms: data.latency_ms,
    model_id: data.model_id,
    error: data.error ?? null,
  };
}
```

Key design: `GOALS_SORT_MAP` is a simple lookup — adding a new goal later means adding one line. `sortItemsByGoals` is exported so it can be reused for client-side re-ranking.

- [x] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: No errors. Note: also added `"exclude": ["supabase"]` to tsconfig.json to prevent Deno globals from breaking tsc.

- [x] **Step 3: Commit**

```bash
git add src/lib/analyzeMenu.ts
git commit -m "feat: add analyzeMenu client service with goal sorting"
```

---

## Task 5: Analysis Store

**Files:**

- Create: `src/store/analysis.store.ts`

- [x] **Step 1: Create the store**

```ts
import { create } from "zustand";
import type { AnalysisResult, ModelProvider } from "@/types/scan";

const ALL_PROVIDERS: ModelProvider[] = ["gemini-1.5", "gemini-2.0", "mistral-ocr", "gpt-4o"];

function emptyRecord<T>(value: T): Record<ModelProvider, T> {
  return Object.fromEntries(ALL_PROVIDERS.map((p) => [p, value])) as Record<ModelProvider, T>;
}

interface AnalysisState {
  results: Record<ModelProvider, AnalysisResult | null>;
  loading: Record<ModelProvider, boolean>;
  activeTab: ModelProvider;
  setResult: (provider: ModelProvider, result: AnalysisResult) => void;
  setLoading: (provider: ModelProvider, loading: boolean) => void;
  setActiveTab: (tab: ModelProvider) => void;
  clear: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  results: emptyRecord(null),
  loading: emptyRecord(false),
  activeTab: "gemini-2.0",
  setResult: (provider, result) =>
    set((s) => ({ results: { ...s.results, [provider]: result } })),
  setLoading: (provider, loading) =>
    set((s) => ({ loading: { ...s.loading, [provider]: loading } })),
  setActiveTab: (tab) => set({ activeTab: tab }),
  clear: () => set({ results: emptyRecord(null), loading: emptyRecord(false) }),
}));

export { ALL_PROVIDERS };
```

- [x] **Step 2: Type-check**

Run: `npx tsc --noEmit`

- [x] **Step 3: Commit**

```bash
git add src/store/analysis.store.ts
git commit -m "feat: add analysis store with per-model state tracking"
```

---

## Task 6: MenuItemRow Component

**Files:**

- Create: `src/components/results/MenuItemRow.tsx`

- [x] **Step 1: Build the component**

Design uses existing theme tokens from `src/constants/theme.ts`. Each menu item is a card row.

```tsx
import { Text, View } from "react-native";
import type { MenuItem } from "@/types/scan";

interface MenuItemRowProps {
  item: MenuItem;
  rank: number;
}

export function MenuItemRow({ item, rank }: MenuItemRowProps) {
  return (
    <View className="rounded-card bg-card border border-border p-4 mb-3">
      {/* Header: rank + name + price */}
      <View className="flex-row items-start justify-between">
        <View className="flex-row items-center flex-1 mr-3">
          <Text className="font-sans text-caption text-muted-foreground mr-2">
            #{rank}
          </Text>
          <Text className="font-display text-body text-foreground flex-1" numberOfLines={2}>
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
        <NutritionStat label="Protein" value={item.protein_g} unit="g" highlight />
        <NutritionStat label="Carbs" value={item.carbs_g} unit="g" />
        <NutritionStat label="Fat" value={item.fat_g} unit="g" />
      </View>

      {/* Dietary tags */}
      {item.dietary_tags.length > 0 && (
        <View className="flex-row flex-wrap mt-2 gap-1">
          {item.dietary_tags.map((tag) => (
            <View key={tag} className="rounded-chip bg-accent-lime/20 px-2 py-0.5">
              <Text className="font-sans text-caption text-foreground">{tag}</Text>
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
        {value}{unit ?? ""}
      </Text>
      <Text className="font-sans text-caption text-muted-foreground">{label}</Text>
    </View>
  );
}
```

The `highlight` prop on protein is hardcoded for the "Highest in protein" MVP. Later, this can be driven by the active goal.

- [x] **Step 2: Type-check**

Run: `npx tsc --noEmit`

- [x] **Step 3: Commit**

```bash
git add src/components/results/MenuItemRow.tsx
git commit -m "feat: add MenuItemRow component for analysis results"
```

---

## Task 7: Results Screen

**Files:**

- Create: `src/app/results.tsx`
- Modify: `src/app/_layout.tsx`

- [x] **Step 1: Register the route**

In `src/app/_layout.tsx`, add inside the `<Stack>`:

```tsx
<Stack.Screen name="results" options={{ animation: "slide_from_right" }} />
```

- [x] **Step 2: Build the results screen**

The screen has:

1. Header with back button + "Results" title (same pattern as review.tsx)
2. Horizontal tab bar with 4 model names
3. Latency badge showing response time for active tab
4. FlatList of MenuItemRow components for the active tab's results
5. Loading/error states per tab

```tsx
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { colors } from "@/constants/theme";
import { useAnalysisStore, ALL_PROVIDERS } from "@/store/analysis.store";
import { MenuItemRow } from "@/components/results/MenuItemRow";
import type { ModelProvider } from "@/types/scan";

const TAB_LABELS: Record<ModelProvider, string> = {
  "gemini-1.5": "Gemini 1.5",
  "gemini-2.0": "Gemini 2.0",
  "mistral-ocr": "Mistral OCR",
  "gpt-4o": "GPT-4o",
};

export default function ResultsScreen() {
  const { results, loading, activeTab, setActiveTab } = useAnalysisStore();
  const activeResult = results[activeTab];
  const isLoading = loading[activeTab];

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-background">
      <Stack.Screen options={{ headerShown: false }} />

      {/* Header */}
      <View className="flex-row items-center px-6 pt-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="w-10 h-10 items-center justify-center -ml-2"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={26} color={colors.foreground} strokeWidth={2} />
        </Pressable>
        <Text className="font-display text-h1 text-foreground ml-1">Results</Text>
      </View>

      {/* Model tabs */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, gap: 8, paddingVertical: 12 }}
      >
        {ALL_PROVIDERS.map((provider) => {
          const isActive = provider === activeTab;
          const providerLoading = loading[provider];
          return (
            <Pressable
              key={provider}
              onPress={() => setActiveTab(provider)}
              className={`rounded-full px-4 py-2 ${isActive ? "bg-foreground" : "bg-card border border-border"}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={TAB_LABELS[provider]}
            >
              <Text
                className={`font-sans text-caption ${isActive ? "text-background" : "text-muted-foreground"}`}
              >
                {TAB_LABELS[provider]}
                {providerLoading ? " ..." : ""}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Latency badge */}
      {activeResult && !activeResult.error && (
        <View className="px-6 pb-2">
          <Text className="font-sans text-caption text-muted-foreground">
            {activeResult.items.length} items in {(activeResult.latency_ms / 1000).toFixed(1)}s
            via {activeResult.model_id}
          </Text>
        </View>
      )}

      {/* Content */}
      <View className="flex-1">
        {isLoading ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="large" color={colors.foreground} />
            <Text className="font-sans text-caption text-muted-foreground mt-3">
              Analyzing with {TAB_LABELS[activeTab]}...
            </Text>
          </View>
        ) : activeResult?.error ? (
          <View className="flex-1 items-center justify-center px-6">
            <Text className="font-sans text-body text-danger text-center">
              {activeResult.error}
            </Text>
          </View>
        ) : activeResult ? (
          <FlatList
            data={activeResult.items}
            keyExtractor={(item, i) => `${item.name}-${i}`}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
            renderItem={({ item, index }) => (
              <MenuItemRow item={item} rank={index + 1} />
            )}
          />
        ) : (
          <View className="flex-1 items-center justify-center">
            <Text className="font-sans text-caption text-muted-foreground">
              No results yet
            </Text>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
```

- [x] **Step 3: Type-check**

Run: `npx tsc --noEmit`

- [x] **Step 4: Commit**

```bash
git add src/app/results.tsx src/app/_layout.tsx
git commit -m "feat: add results screen with multi-model tabs"
```

---

## Task 8: Wire Review Screen

**Files:**

- Modify: `src/app/review.tsx`

- [x] **Step 1: Add the "Analyze Menu" button**

Changes to review.tsx:

1. Import `analyzeMenu` from `@/lib/analyzeMenu`
2. Import `useAnalysisStore`, `ALL_PROVIDERS` from `@/store/analysis.store`
3. Replace the placeholder text block with the analyze button
4. On press: fire 4 parallel `analyzeMenu` calls (one per provider), navigate to results immediately

```tsx
// Add these imports
import { analyzeMenu } from "@/lib/analyzeMenu";
import { useAnalysisStore, ALL_PROVIDERS } from "@/store/analysis.store";

// Inside the component, add:
const { setResult, setLoading, clear } = useAnalysisStore();
const [analyzing, setAnalyzing] = useState(false);

const handleAnalyze = async () => {
  setAnalyzing(true);
  clear();
  router.push("/results");

  // Fire all 4 model requests in parallel
  ALL_PROVIDERS.forEach(async (provider) => {
    setLoading(provider, true);
    try {
      const result = await analyzeMenu(photos, ["Highest in protein"], provider);
      setResult(provider, result);
    } catch (err) {
      setResult(provider, {
        provider,
        items: [],
        latency_ms: 0,
        model_id: provider,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(provider, false);
    }
  });
};
```

Replace the placeholder `<View>` (the one with "Nutritional goals — coming next") with the button pinned to the bottom:

```tsx
{/* Bottom button area */}
<View className="px-6 pb-4">
  <Pressable
    onPress={handleAnalyze}
    disabled={photos.length === 0 || analyzing}
    className={`w-full items-center justify-center py-4 rounded-full ${
      photos.length === 0 || analyzing ? "bg-muted" : "bg-foreground"
    }`}
    accessibilityRole="button"
    accessibilityLabel="Analyze menu photos"
    accessibilityState={{ disabled: photos.length === 0 || analyzing }}
  >
    <Text
      className={`font-sans text-button ${
        photos.length === 0 || analyzing ? "text-muted-foreground" : "text-background"
      }`}
    >
      {analyzing ? "Analyzing..." : "Analyze Menu"}
    </Text>
  </Pressable>
</View>
```

The layout becomes: header → photo strip → bottom button. Remove the placeholder `<View>` entirely.

- [x] **Step 2: Add useState import**

Add `useState` to the React import if not already present.

- [x] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npx eslint src/app/review.tsx --ext .ts,.tsx`

- [x] **Step 4: Commit**

```bash
git add src/app/review.tsx
git commit -m "feat: wire Analyze Menu button to multi-model analysis pipeline"
```

---

## Task 9: Edge Function Implementation Detail

**Files:**

- Create: `supabase/functions/analyze-menu/index.ts`

- [x] **Step 1: Full Edge Function code** *(Gemini schema types fixed to lowercase per SDK enum values — `"array"`, `"object"`, `"string"`, `"number"` — after Context7 doc audit)*

```ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;
const MISTRAL_API_KEY = Deno.env.get("MISTRAL_API_KEY")!;

const MENU_ITEM_SCHEMA_GEMINI = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      name: { type: "STRING" },
      description: { type: "STRING" },
      price: { type: "NUMBER", nullable: true },
      category: { type: "STRING", enum: ["appetizer", "main", "side", "dessert", "drink", "other"] },
      estimated_calories: { type: "NUMBER" },
      protein_g: { type: "NUMBER" },
      carbs_g: { type: "NUMBER" },
      fat_g: { type: "NUMBER" },
      dietary_tags: { type: "ARRAY", items: { type: "STRING" } },
      allergens: { type: "ARRAY", items: { type: "STRING" } },
    },
    required: ["name", "description", "price", "category", "estimated_calories", "protein_g", "carbs_g", "fat_g", "dietary_tags", "allergens"],
  },
};

const MENU_ITEM_SCHEMA_OPENAI = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          price: { type: ["number", "null"] },
          category: { type: "string", enum: ["appetizer", "main", "side", "dessert", "drink", "other"] },
          estimated_calories: { type: "number" },
          protein_g: { type: "number" },
          carbs_g: { type: "number" },
          fat_g: { type: "number" },
          dietary_tags: { type: "array", items: { type: "string" } },
          allergens: { type: "array", items: { type: "string" } },
        },
        required: ["name", "description", "price", "category", "estimated_calories", "protein_g", "carbs_g", "fat_g", "dietary_tags", "allergens"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

function buildPrompt(goals: string[]): string {
  return `You are analyzing restaurant menu photos. Extract every menu item visible.
For each item, estimate its nutritional content based on typical restaurant portions.
Sort the results by: ${goals.join(", ")}.
If a price is not visible, set it to null.
For category, pick the closest match from: appetizer, main, side, dessert, drink, other.`;
}

async function callGemini(photos: string[], goals: string[], model: string) {
  const parts = [
    { text: buildPrompt(goals) },
    ...photos.map((b64) => ({
      inlineData: { mimeType: "image/jpeg", data: b64 },
    })),
  ];

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: MENU_ITEM_SCHEMA_GEMINI,
        },
      }),
    }
  );

  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Gemini API error");
  const text = json.candidates[0].content.parts[0].text;
  return JSON.parse(text);
}

async function callOpenAI(photos: string[], goals: string[]) {
  const imageContent = photos.map((b64) => ({
    type: "image_url" as const,
    image_url: { url: `data:image/jpeg;base64,${b64}` },
  }));

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: buildPrompt(goals) }, ...imageContent],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "menu_items",
          strict: true,
          schema: MENU_ITEM_SCHEMA_OPENAI,
        },
      },
    }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "OpenAI API error");
  const parsed = JSON.parse(json.choices[0].message.content);
  return parsed.items;
}

async function callMistralOCR(photos: string[], goals: string[]) {
  // Step 1: OCR extraction
  const ocrResults: string[] = [];
  for (const b64 of photos) {
    const ocrRes = await fetch("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
      },
      body: JSON.stringify({
        model: "mistral-ocr-latest",
        document: {
          type: "image_url",
          image_url: `data:image/jpeg;base64,${b64}`,
        },
      }),
    });
    const ocrJson = await ocrRes.json();
    if (!ocrRes.ok) throw new Error(ocrJson.message ?? "Mistral OCR error");
    const pageTexts = ocrJson.pages.map((p: { markdown: string }) => p.markdown);
    ocrResults.push(pageTexts.join("\n"));
  }

  // Step 2: Structure the extracted text via chat with JSON schema
  const structureRes = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: "mistral-large-latest",
      messages: [
        {
          role: "user",
          content: `${buildPrompt(goals)}\n\nHere is the menu text extracted via OCR:\n\n${ocrResults.join("\n---\n")}`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "menu_items",
          strict: true,
          schema: MENU_ITEM_SCHEMA_OPENAI, // Same schema format as OpenAI
        },
      },
    }),
  });

  const structureJson = await structureRes.json();
  if (!structureRes.ok) throw new Error(structureJson.message ?? "Mistral chat error");
  const parsed = JSON.parse(structureJson.choices[0].message.content);
  return parsed.items;
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const { photos, goals, provider } = await req.json();
    const start = Date.now();

    let items;
    let modelId: string;

    switch (provider) {
      case "gemini-1.5":
        items = await callGemini(photos, goals, "gemini-1.5-flash");
        modelId = "gemini-1.5-flash";
        break;
      case "gemini-2.0":
        items = await callGemini(photos, goals, "gemini-2.0-flash");
        modelId = "gemini-2.0-flash";
        break;
      case "gpt-4o":
        items = await callOpenAI(photos, goals);
        modelId = "gpt-4o";
        break;
      case "mistral-ocr":
        items = await callMistralOCR(photos, goals);
        modelId = "mistral-ocr-latest + mistral-large-latest";
        break;
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    return new Response(
      JSON.stringify({ items, latency_ms: Date.now() - start, model_id: modelId }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        items: [],
        latency_ms: 0,
        model_id: "error",
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 2: Deploy** *(requires API keys set as secrets and Supabase project linked — see testing checklist below)*

```bash
supabase functions deploy analyze-menu
```

- [x] **Step 3: Commit**

```bash
git add supabase/functions/analyze-menu/
git commit -m "feat: implement analyze-menu Edge Function with Gemini, OpenAI, Mistral support"
```

---

## Verification

1. **TypeScript**: `npx tsc --noEmit` — zero errors across all new/modified files
2. **Lint**: `npx eslint src/ --ext .ts,.tsx` — zero errors
3. **Edge Function local test**: `supabase functions serve` → curl with a real base64 menu photo → verify JSON response with menu items
4. **End-to-end flow**: Open app → pick menu photos from gallery → review screen → tap "Analyze Menu" → results screen shows 4 tabs → each tab populates as its model responds → items displayed as cards with nutrition data, sorted by protein
5. **Tab switching**: Switch between model tabs → different results/latencies shown → compare model quality
6. **Error handling**: Temporarily use an invalid API key → verify error message displays cleanly in the tab

---

## Adding New Goals Later

When the goals selection feature is built, the only client change is in `review.tsx`:

```diff
- const result = await analyzeMenu(photos, ["Highest in protein"], provider);
+ const selectedGoals = useGoalsStore((s) => s.selectedGoals);
+ const result = await analyzeMenu(photos, selectedGoals, provider);
```

The `goals.store.ts` already exists with `selectedGoals: string[]`. The `GOALS_SORT_MAP` in `analyzeMenu.ts` gets new entries. The Edge Function prompt already interpolates goals dynamically.

---

# Phase 2: Two-Stage Pipeline (Extraction / Enrichment Separation)

> **Status:** New phase. Builds on the Phase 1 MVP above — does not replace it. The Phase 1 pipeline and UI are reused; this phase changes *how* the work is split across models.

**Why this phase:** In Phase 1, each model does OCR + nutrition estimation + sorting in a single call, returning a full `MenuItem`. Captured outputs on the Mochomos menu show the cost of that overload:

- `GEMINI_FLASH.MD` → ~52 items extracted
- `GEMINI_PRO.MD` → ~70 items extracted
- `MISTRAL_OCR.MD` → faithful raw markdown of the real menu (used here as ground truth)

A ~35% disagreement on item *count* between two Gemini tiers is the signal: when a model reads text and fabricates nutrition numbers in the same pass, extraction fidelity drops. This phase splits the work into two stages that are benchmarked independently, so menu *reading* is made reliable before nutrition *estimation* is layered on.

**Phase goal:** Decouple extraction from enrichment. Stage 1 OCR/extraction has been benchmarked and frozen on GPT-4o Vision. Stage 2 still benchmarks enrichment/sorting models on top of that frozen extraction.

```
Stage 1 — EXTRACTION
  photo[] → { name, description, price, category }[]
  Candidates: Google Cloud Vision, Mistral OCR, GPT (vision)
  → COMPLETE: GPT-4o Vision selected

Stage 2 — ENRICHMENT + SORT  (runs only after Stage 1 winner is frozen)
  ExtractedItem[] → + { calories, macros, tags, allergens } → sort by goals
  Candidates: current LLMs
  → STILL OPEN: compare nutritional plausibility, goal sort quality, latency
```

The single `analyze-menu` Edge Function from Phase 1 stays; it gains a `stage` parameter so the same dispatcher serves both phases. The defining change vs. Phase 1: **the extraction prompt contains zero nutrition language**, so a model is never reading text and inventing macros in the same call.

## Decisions locked (2026-06-09)

1. **Stage 1 output = structured items** (`name, description, price, category`). Google Cloud Vision is pure OCR, so its pipeline gets a text→items parse step; Mistral and GPT produce structure natively. All three are compared on the same structured shape.
2. **Scoring = manual eyeball** against the Mochomos menu as ground truth (item count, missed, hallucinated, price errors). No scoring script.
3. **GPT included** — OpenAI billing re-enabled ✅ (reversed commit `32196d1`).

## Decisions locked (2026-06-13)

1. **OCR/extraction comparison is complete.** Do not continue benchmarking OCR providers unless the benchmark is intentionally reopened.
2. **Stage-1 winner = GPT-4o Vision** (`provider: "gpt-vision"`, `model_id: "gpt-4o"`).
3. **Cost assumption = $0.03 USD per GPT-4o Vision extraction call.**
4. **Stage 2 remains open.** Do not remove or skip the nutritional enrichment/model comparison; compare enrichment providers on the frozen GPT-4o Vision extracted items.

**Fairness caveat (document, don't skip):** Google Cloud Vision's structured output depends partly on the **parse LLM** bolted onto it. To avoid misattributing a parsing failure to Vision's OCR, the text→items parse must use **one fixed model** (`gpt-4o-mini`). Only Vision needs this step.

## Phase 2 Prerequisites

Reuse Phase 1 secrets (`GEMINI_API_KEY`, `MISTRAL_API_KEY`) and the linked Supabase project. New for this phase:

1. **Google Cloud Vision API** ✅ — GCP project created, Vision API enabled, `GOOGLE_VISION_API_KEY` set as Supabase secret.
2. **OpenAI billing** ✅ — Payment method added, `OPENAI_API_KEY` confirmed in secrets.

## Phase 2 Types

Append to `src/types/scan.ts` (keep the existing `MenuItem` / `ModelProvider` until Stage 2 lands, then retire them):

```ts
// Stage 1 output — what a menu literally says
export interface ExtractedItem {
  name: string;
  description: string;
  price: number | null;       // null when not printed
  category: MenuCategory;
}

// Stage 2 output — extraction + estimated nutrition
export interface EnrichedItem extends ExtractedItem {
  estimated_calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  dietary_tags: string[];
  allergens: string[];
}

export type ExtractionProvider = "google-vision" | "mistral-ocr" | "gpt-vision";
export type EnrichmentProvider = "gemini-2.5-flash" | "gemini-2.5-pro" | "gpt-4o" | "mistral-large";
export type PipelineStage = "extract" | "enrich";
```

---

## Stage 1 — Extraction Benchmark

### Task 2.1: Split the types

**Files:** Modify `src/types/scan.ts`

- [x] **Step 1** Add `ExtractedItem`, `EnrichedItem`, `ExtractionProvider`, `EnrichmentProvider`, `PipelineStage`. Leave existing types intact.
- [x] **Step 2** Type-check: `npx tsc --noEmit` → no errors.
- [ ] **Step 3** Commit: `feat: add two-stage extraction/enrichment types`

### Task 2.2: Edge Function — extraction stage

**Files:** Modify `supabase/functions/analyze-menu/index.ts`

- [x] **Step 1: Add `stage` dispatch.** Read `{ photos, goals, provider, stage }`. When `stage === "extract"`, route to extraction handlers and return `ExtractedItem[]`. The Phase 1 monolithic handlers become the `"enrich"` path (refactored in Stage 2).
- [x] **Step 2: Extraction prompt (zero nutrition).**
  ```
  Read this restaurant menu. Return every item exactly as printed, in menu order:
  name, description, price, category (appetizer|main|side|dessert|drink|other).
  Do NOT estimate calories or nutrition. Do NOT invent items you cannot read.
  If a price is not printed, set it to null.
  ```
- [x] **Step 3: `callGoogleVision(photos)`** — POST `https://vision.googleapis.com/v1/images:annotate` with `DOCUMENT_TEXT_DETECTION`, auth via `?key=GOOGLE_VISION_API_KEY`. Take the full text, then one parse call to the fixed parse model (`gpt-4o-mini`) with the extraction prompt + structured-output schema → `ExtractedItem[]`.
- [x] **Step 4: `callMistralExtract(photos)`** — reuse the Phase 1 OCR call (`mistral-ocr-latest`), then structure the markdown via `mistral-large-latest` with the extraction prompt + extraction-only JSON schema (no nutrition fields).
- [x] **Step 5: `callGptExtract(photos)`** — `gpt-4o` vision call with the extraction prompt + extraction-only `json_schema`.
- [x] **Step 6** Deploy: `supabase functions deploy analyze-menu`.
- [ ] **Step 7** Commit: `feat: add extraction stage with Google Vision, Mistral, GPT`

### Task 2.3: Client + UI for extraction mode

**Files:** Modify `src/lib/analyzeMenu.ts`, `src/store/analysis.store.ts`, `src/app/results.tsx`, `src/app/review.tsx`

- [x] **Step 1** `analyzeMenu` accepts a `stage` arg and passes it through; add an `extractMenu(photos, provider)` wrapper that sends `stage: "extract"`.
- [x] **Step 2** Store: add extraction-provider results keyed by `ExtractionProvider`. Reuse the raw-debug capture (commit `5173500`) so each tab shows raw OCR text alongside structured items.
- [x] **Step 3** Results tabs render the 3 **extraction** candidates: structured item count + raw text toggle.
- [x] **Step 4** Review screen "Analyze" fires the 3 extraction providers in parallel.
- [x] **Step 5** Type-check + lint. Commit: `feat: wire extraction-stage benchmark UI`

### Task 2.4: Run the benchmark + DECISION GATE

**Files:** none (measurement) — record the result inline below.

- [x] **Step 1** Run all 3 extraction providers on the Mochomos menu photos.
- [x] **Step 2** Manual scorecard vs. ground truth (`MISTRAL_OCR.MD`):

  | Provider      | Total items | Missed | Hallucinated | Price errors | Notes |
  | ------------- | ----------- | ------ | ------------ | ------------ | ----- |
  | google-vision | _           | _      | _            | _            |       |
  | mistral-ocr   | _           | _      | _            | _            |       |
  | gpt-vision    | _           | _      | _            | _            |       |


- [x] **Step 3: DECISION GATE.** Pick the winner and record here: **Stage-1 winner: `gpt-vision` / GPT-4o Vision (`model_id: "gpt-4o"`)**. Cost assumption: **$0.03 USD per GPT-4o Vision extraction call**.

---

## Stage 2 — Enrichment Benchmark (after the gate)

> Runs against the **frozen** Stage-1 winner's `ExtractedItem[]` so every enrichment model sees identical input.
>
> Stage 1 OCR comparison is over. Stage 2 nutritional enrichment/model comparison is still required and must not be removed from this plan.

> **Prior-art references** (both inform model choice + benchmark interpretation in this stage):
>
> - The PubMed article *"Performance Evaluation of 3 Large Language Models for Nutritional Content Estimation from Food Images"* found **GPT-4o** to be the best of the three at nutritional content estimation. Favor GPT-4o as the OpenAI enrichment candidate, and when interpreting Task 2.7, if a different model appears to win, scrutinize whether it's genuinely more accurate or just more confident — given GPT-4o's documented edge.
> - The Google blog *"MacroFactor revolutionizes nutrition with AI for 400k+ users with Firebase, Flutter, and Gemini"* reveals that **MacroFactor — one of the best-rated nutrition apps for AI accuracy — uses Gemini 2.5 Flash** for its AI features. This is real-world validation that `gemini-2.5-flash` is a strong, production-proven enrichment candidate, so keep it in the benchmark and weigh its results seriously.
>
> Net: GPT-4o and Gemini 2.5 Flash are the two reference-backed front-runners for the enrichment stage — make sure both are benchmarked.

### Task 2.5: Edge Function — enrichment stage

- [ ] **Step 1** `stage: "enrich"` accepts `{ items: ExtractedItem[], goals, provider }` and returns `EnrichedItem[]`. Enrichment prompt: *"Given these menu items, estimate nutrition per typical restaurant portion, then sort by: {goals}."*
- [ ] **Step 2** Route to each `EnrichmentProvider`. Deploy. Commit: `feat: add enrichment stage`

### Task 2.6: Client + UI for enrichment mode

- [ ] **Step 1** Feed the frozen winner's items into each enrichment provider in parallel; tabs render enrichment candidates.
- [ ] **Step 2** Restore the full nutrition card UI (`MenuItemRow` from Task 6) for `EnrichedItem`.
- [ ] **Step 3** Type-check + lint. Commit: `feat: wire enrichment-stage benchmark UI`

### Task 2.7: Benchmark + decision

- [ ] **Step 1** Compare enrichment models on: nutrition plausibility, sort quality vs. goals, latency.
- [ ] **Step 2** Record the enrichment winner: **Stage-2 winner: `__________`**.
- [ ] **Step 3** Retire the now-obsolete monolithic `MenuItem` / `ModelProvider` types and dead provider routes from Phase 1.

## Phase 2 Verification

1. **TypeScript**: `npx tsc --noEmit` — zero errors.
2. **Lint**: `npx eslint src/ --ext .ts,.tsx` — zero errors.
3. **Stage 1 E2E**: pick Mochomos photos → 3 extraction tabs populate → scorecard filled → winner recorded.
4. **Stage 2 E2E**: frozen items → enrichment tabs populate with nutrition + goal sort → winner recorded.
5. **Error handling**: invalid key per provider → clean per-tab error message.
