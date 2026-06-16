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

> **Superseded (2026-06-14):** Tasks 2.5–2.7 below keep the original "estimate macros then sort" framing. They are superseded by **Stage 2 Design Refinement — Ordinal Macro Scoring** (after Task 2.7) and by **Phase 4**. Preserved for history; build from the refinement.

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

## Stage 2 Design Refinement — Ordinal Macro Scoring (2026-06-14)

> Supersedes the "estimate macros then sort" framing of Tasks 2.5–2.7. **Rationale:** NutriBench (arXiv 2407.12843, ICLR 2025) shows quantitative macro estimation from meal text peaks at ~67% (GPT-4o + Chain-of-Thought), even beating nutritionists — i.e. it is inherently noisy. The app's product is a **ranking**, not a nutrition label, so we estimate a coarse **ordinal "load" per macro** instead of grams: a more reliable signal, an honest UX, and a benchmark we can actually judge. USDA FDC stays a future upgrade reachable via the `ingredients[]` seam (no rework).

**Enrichment output, per item** — produced in one call over the whole `ExtractedItem[]` so estimates stay mutually consistent; enrichment is **goal-agnostic**:

```ts
interface EnrichedItem extends ExtractedItem {
  ingredients: { name: string; category: "protein" | "carb" | "fat" | "veg" | "other" }[];
  protein_g: number;
  carb_g: number;
  fat_g: number;
  estimated_calories: number;
  confidence: "high" | "medium" | "low";
  allergens: string[]; // inferred from ingredients; drives the mandatory allergen disclaimer (AGENTS.md)
}
```

- `ingredients` is the Chain-of-Thought reasoning substrate: listing ingredients with their macro category (e.g. `{ name: "salmon fillet", category: "protein" }`) before producing gram estimates makes the reasoning auditable — a wrong gram value is catchable if the listed ingredients don't support it. Also the USDA-FDC-ready seam: later each ingredient can be looked up instead of LLM-estimated.
- `protein_g / carb_g / fat_g / estimated_calories` are gram/kcal estimates per typical single restaurant serving. Shown to the user as-is — no disclaimer needed because the dot badges are menu-relative (see below), making the comparative nature self-evident.
- `confidence` is `"low"` when the item name and description are evocative/promotional rather than ingredient-based (e.g. *"Best burger in town!"*) and the model has little to go on.

**Prompt = Chain-of-Thought, no sorting.** The model lists ingredients → estimates grams → returns confidence. It does **not** sort (code does):

```
You estimate the nutrition profile of restaurant menu items. For each item, work step by step:
1. List the most likely ingredients. If the description names them, use them; otherwise infer from the name and category.
   Tag each ingredient: protein | carb | fat | veg | other.
2. From those ingredients and the likely preparation (e.g. grilled vs fried), estimate per typical single restaurant serving:
   protein_g, carb_g, fat_g, estimated_calories.
3. Set "confidence" to "low" only when the name and description are evocative or promotional rather than descriptive,
   leaving you with little ingredient information to go on.
Do NOT sort the items. Return one object per item.
```

**Sort + display split.** `sortItemsByGoals()` orders by the active goal's gram field (desc for "high"/"highest", asc for "low") with a deterministic tiebreak (estimated_calories, then name). The UI shows a **4-level dot badge** per macro — bucketed **relative to this menu's max**, not to restaurant food in general. Compute at render time:

```ts
const maxProtein = Math.max(...items.map(i => i.protein_g));
// repeat for carb_g, fat_g, estimated_calories
// bucket: 0–25% → ●○○○, 25–50% → ●●○○, 50–75% → ●●●○, 75–100% → ●●●●
```

Each badge shows the gram value alongside the dots (e.g. `●●●○ 38g`). This means at a high-protein restaurant every item competes against the others on this menu, not against some external baseline.

### Task 2.5′: Edge Function — enrichment stage (grams)

- [ ] **Step 1** `stage: "enrich"` accepts `{ items: ExtractedItem[], provider }` (no `goals` — enrichment is goal-agnostic) and returns the `EnrichedItem[]` shape above using the CoT prompt.
- [ ] **Step 2** Route to **`gpt-4o`** and **`gemini-2.5-flash`** only (drop Pro/Mistral unless reopened). Deploy. Commit: `feat: add gram-based enrichment stage`

### Task 2.6′: Benchmark harness (dev-only route)

- [ ] **Step 1** Add a dev-only route (e.g. `app/enrich-bench.tsx`) that runs both models on one **cached** `ExtractedItem[]` and shows them side by side. Do **not** reintroduce benchmark tabs into the user `results.tsx`.
- [ ] **Step 2** Per model, show: the ingredient/category list, the four macro badges per item, latency, and cost.

### Task 2.7′: Judging + decision gate

- [ ] **Step 1** Nutrition has no on-menu ground truth. Judge on: (a) ingredient/category correctness — checkable against the menu text (e.g. does "Grilled Salmon" list a carb-heavy ingredient? if so, wrong); (b) gram plausibility per item (does a grilled chicken breast show ~35g protein? does a pasta dish show ~60g carbs?); (c) ranking agreement between the two models per goal, eyeballing disagreements; (d) latency; (e) cost.
- [x] **Step 2** Record the winner: **Stage-2 winner: `gpt-4o`**. Then proceed to Phase 4.
- [ ] **Step 3** (Carry-over) Retire the obsolete `MenuItem` / `ModelProvider` types + dead Phase-1 routes — executed in Phase 4 Task 4.6.

## Phase 2 Verification

1. **TypeScript**: `npx tsc --noEmit` — zero errors.
2. **Lint**: `npx eslint src/ --ext .ts,.tsx` — zero errors.
3. **Stage 1 E2E**: pick Mochomos photos → 3 extraction tabs populate → scorecard filled → winner recorded.
4. **Stage 2 E2E**: frozen items → enrichment tabs populate with nutrition + goal sort → winner recorded.
5. **Error handling**: invalid key per provider → clean per-tab error message.

---

# Phase 3: Nutritional Goal Selection (complete)

> **Status:** Complete 2026-06-14 (shipped in PR #4). This phase ships preset multi-select goal selection during OCR. Free-text custom goals, feedback logging, and goal priority drag-reorder stay out of scope. Stage 2 enrichment and final nutrition sorting are taken up by the **Stage 2 Design Refinement** and **Phase 4** below.

**AGENTS.md inconsistency to resolve:** AGENTS.md lists free-text custom goal input and custom-filter feedback logging as core MVP. This phase intentionally ships presets only because feedback/analytics infrastructure is not integrated yet. Track free-text as its own fast-follow phase or update AGENTS.md to mark it as fast-follow.

## Phase 3 Context

`AGENTS.md` lists "Nutritional goal selection — multi-select from preset options" as a core MVP feature, but no screen currently sets `selectedGoals`. `src/store/goals.store.ts` is scaffolded (`selectedGoals: string[]`, `setGoals`, AsyncStorage-persisted) yet imported by nothing.

The results screen (`src/app/results.tsx`) already has a 3-phase stepped flow: phase 0 "Menu OCR", phase 1 "Nutrition", and phase 2 "Results". OCR is kicked off in `review.tsx` and runs in the background while the user sits on phase 0's spinner.

This phase turns that wait time into useful input: goal selection becomes phase 0's content while OCR continues in the background. "Continue" is gated on both OCR completion and at least one selected goal.

## Phase 3 File Map

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `src/data/goals.ts` | Create | Typed preset goal pairs |
| `src/store/goals.store.ts` | Modify | Add `toggleGoal` action |
| `src/components/results/GoalSelector.tsx` | Create | Two-column High/Low multi-select grid |
| `src/components/results/PhaseIndicator.tsx` | Modify | Rename phase 0 from "Menu OCR" to "Goals" |
| `src/app/results.tsx` | Modify | Replace OCR spinner phase with goals phase, OCR status, raw toggle, and gated navigation |

## Task 3.1: Preset goal data

**Files:** Create `src/data/goals.ts`

- [x] **Step 1** Create `GoalPair` and `GOAL_PAIRS` for Protein, Carbs, Fat, and Calorie high/low pairs.
- [x] **Step 2** Type-check: `pnpm tsc --noEmit` → no errors.
- [x] **Step 3** Commit: `feat: add preset nutritional goal pairs`

## Task 3.2: `toggleGoal` store action

**Files:** Modify `src/store/goals.store.ts`

- [x] **Step 1** Add `toggleGoal(goal)` to the store, using add/remove-by-value semantics.
- [x] **Step 2** Type-check: `pnpm tsc --noEmit` → no errors.
- [x] **Step 3** Commit: `feat: add toggleGoal action to goals store`

## Task 3.3: `GoalSelector` component

**Files:** Create `src/components/results/GoalSelector.tsx`

- [x] **Step 1** Render `GOAL_PAIRS` as four rows, each with High and Low option cards.
- [x] **Step 2** Use the OptionCard styling from `DESIGN.MD`: selected `bg-foreground text-background`; unselected `bg-card border border-border`.
- [x] **Step 3** Type-check: `pnpm tsc --noEmit` → no errors.
- [x] **Step 4** Commit: `feat: add GoalSelector multi-select grid`

## Task 3.4: Wire goals into results phase flow

**Files:** Modify `src/components/results/PhaseIndicator.tsx`, `src/app/results.tsx`

- [x] **Step 1** Rename phase 0 from "Menu OCR" to "Goals".
- [x] **Step 2** Replace the blocking `OcrPhase` with `GoalsPhase` and compact `OcrStatus`.
- [x] **Step 3** Keep raw OCR output behind a "Show raw" / "Hide raw" toggle.
- [x] **Step 4** Gate phase navigation and the Continue button on OCR done + at least one selected goal.
- [x] **Step 5** Type-check and lint: `pnpm tsc --noEmit` and `pnpm exec eslint src/ --ext .ts,.tsx` → no errors.
- [x] **Step 6** Commit: `feat: wire nutritional goal selection into results phase 0`

## Phase 3 Verification

1. **Type/lint:** `pnpm tsc --noEmit` and `pnpm exec eslint src/ --ext .ts,.tsx` → zero errors.
2. **Concurrent flow:** Scan/pick photos → Review → "Analyze Menu"; phase 0 shows the goal grid immediately with a compact "Reading menu with GPT-4o..." status line.
3. **Gating:** Continue and phase navigation stay disabled until OCR is done and at least one goal is selected.
4. **Multi-select:** Tapping each goal toggles selected/unselected styling. Selecting both High and Low in one pair is allowed.
5. **Raw toggle:** With OCR done, "Show raw" expands the monospace OCR dump; "Hide raw" collapses it.
6. **Persistence:** Selected goals survive reload through the existing AsyncStorage-persisted goals store.
7. **Continue:** OCR done + at least one goal advances to the Nutrition placeholder phase.

---

# Phase 4: Activate Nutritional Analysis — Ranked Results (planned 2026-06-14)

> Wires the Stage-2 enrichment winner into the live user flow, replacing the `PlaceholderPhase` in `src/app/results.tsx`. This closes the end-to-end loop: scan → goals → ranked results. Enrichment is **goal-agnostic**, so it runs in the background right after extraction completes (before the user finishes picking goals); goals are applied only at sort time.

## Phase 4 File Map

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `src/store/analysis.store.ts` | Modify | Add `enrichment` / `enrichmentLoading` (mirror the extraction pattern) |
| `src/types/scan.ts` | Modify | Finalize `EnrichedItem` (ordinal shape) + `EnrichmentResult` |
| `src/lib/analyzeMenu.ts` | Modify | `enrichMenu()`; point `GOALS_SORT_MAP` at `scores.*`; retype `sortItemsByGoals` |
| `src/app/review.tsx` | Modify | Chain `enrichMenu` after `extractMenu` (background) |
| `src/components/results/MenuItemRow.tsx` | Modify | Four macro dot-badges, selected-goal highlight |
| `src/app/results.tsx` | Modify | Replace `PlaceholderPhase` with the ranked list |

## Task 4.1: Enrichment state

- [ ] **Step 1** Add `enrichment: EnrichmentResult | null`, `enrichmentLoading: boolean`, their setters, and clear-on-reset to `analysis.store.ts`, mirroring the extraction pattern.

## Task 4.2: Enrichment client + chaining

- [ ] **Step 1** Add `enrichMenu(items, provider)` to `analyzeMenu.ts` (sends `stage: "enrich"` with the cached `ExtractedItem[]`).
- [ ] **Step 2** In `review.tsx`, after `extractMenu` resolves, set `enrichmentLoading` and call `enrichMenu` in the background.

## Task 4.3: Finalize types + sorting

- [ ] **Step 1** Set `EnrichedItem` to the gram shape (`ingredients[]`, `protein_g`, `carb_g`, `fat_g`, `estimated_calories`, `confidence`, `allergens`). Add `EnrichmentResult` mirroring `ExtractionResult`.
- [ ] **Step 2** Point each `GOALS_SORT_MAP` entry at the matching gram field (`protein_g`, `carb_g`, `fat_g`, `estimated_calories`; desc for high/highest, asc for low); add the `estimated_calories`-then-name tiebreak. Retype `sortItemsByGoals` to `EnrichedItem`.

## Task 4.4: Macro badges in `MenuItemRow`

- [ ] **Step 1** Replace the raw grams `NutritionStat` grid with four macro **dot-badges** (protein/carb/fat/calorie). Each badge shows dots + the gram/kcal value (e.g. `●●●○ 38g`). Dots are bucketed **relative to the menu's max** for that macro — pass `maxValues: { protein_g, carb_g, fat_g, estimated_calories }` as a prop (computed once in the parent before rendering the list).
- [ ] **Step 2** Highlight badges whose `GoalPair.group` is in `selectedGoals` (accent color); mute the rest (grey). Use the `GOAL_PAIRS` group→macro mapping.
- [ ] **Step 3** Keep the allergen line; render the **mandatory** allergen disclaimer card whenever any item in the result has allergens (per AGENTS.md — non-negotiable).

## Task 4.5: Ranked results phase

- [ ] **Step 1** Replace `PlaceholderPhase` (phase 1) with a `FlatList` of `MenuItemRow`, sorted by `sortItemsByGoals(enrichment.items, selectedGoals)`, numbered #1..#n. Compute `maxValues` from all items before rendering.
- [ ] **Step 2** Handle loading (enrichment running), empty, and error states.
- [ ] **Step 3** Loading states must show a spinner + descriptive text at each stage. The sequence is:

  | Stage | Text |
  |-------|------|
  | Extraction running (phase 0) | `"Extracting menu data via OCR…"` — already in Phase 3; update copy if needed |
  | Enrichment running (phase 1) | `"Enriching menu items…"` |
  | Enrichment done, sorting | Instant (client-side) — no loader needed |

  If item counts are available at the time the enrichment result lands (they will be — `items.length` is known), append them to the enrichment text: `"Enriching 24 menu items…"`. Percentages/progress bars are not feasible since both Edge Function calls return in one shot (no streaming); item count is the best concrete detail available.

## Task 4.5b: Low-confidence menu handling

When a menu uses evocative or promotional language ("Best burger in town!", "A taste of Italy") instead of ingredient-based descriptions, most or all items will have `confidence: "low"`. In this case the ranked list is still shown — don't hide it — but a prominent notice is surfaced.

**Trigger condition:** `>= 75%` of enriched items have `confidence: "low"`.

**Notice UI:** A card shown above the ranked list (not a modal, not blocking navigation):

> **Descriptions on this menu are light on details.**
> Nutritional estimates are rough — the menu doesn't list ingredients, so we had to guess. For confident choices, your best bet is to ask your waiter.

The notice should be dismissible per session (disappears on tap, doesn't come back until the next scan).

- [ ] **Step 1** Add a `lowConfidenceNotice: boolean` derived value in the results screen: `items.filter(i => i.confidence === "low").length / items.length >= 0.75`.
- [ ] **Step 2** Render the notice card above the `FlatList` when `lowConfidenceNotice` is true. Dismissible via local `useState` — no store needed.
- [ ] **Step 3** Type-check + lint. Commit: `feat: add low-confidence menu notice`

## Task 4.6: Cleanup

- [ ] **Step 1** Retire the obsolete `MenuItem` / `ModelProvider` types and dead Phase-1 provider routes (the deferred Task 2.7 Step 3).

## Phase 4 Verification

1. **Type/lint:** `pnpm tsc --noEmit` and `pnpm exec eslint src/ --ext .ts,.tsx` → zero errors.
2. **E2E:** scan → pick goals → phase 1 shows a #1..#n ranked list; each row shows four macro dot-badges with gram values and the selected goal(s) accented.
3. **Menu-relative badges:** the item with the highest protein on the menu always shows ●●●●; the lowest always shows ●○○○ (or close). No item should show 4 dots on all macros unless it genuinely dominates on all four.
4. **Allergens:** the mandatory allergen disclaimer card appears whenever any enriched item has allergens.
5. **Low-confidence notice:** on a menu with evocative/promotional descriptions (≥75% low confidence), the notice card appears above the list and dismisses on tap.
6. **Background timing:** enrichment runs after extraction without blocking goal selection.

---

# Phase 5: Per-Item Portion Adjustment (Serving-Size Multiplier) (planned 2026-06-15)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Code style:** Use the `ponytail` skill for code writing — laziest solution that works, fewest files, no speculative abstraction.

**Goal:** Let the user adjust how much of each ranked item they'll actually eat via a per-item multiplier stepper (¼×–3×), rescaling that item's macros/calories and dot-badges live, with list re-ranking deferred behind a "tap to update ranking" bar.

**Architecture:** Enrichment already returns 1×-serving macros; Phase 5 adds a model-estimated default serving (`serving_qty` + `serving_unit`) so the 1× baseline is a *realistic one-person portion*. A pure client util scales macros by a discrete multiplier and reformats the serving label — no new API calls. `MenuItemRow` gains the stepper and shows scaled grams/label/dots live against the currently-applied menu maxima. `results.tsx` holds the per-item multiplier map and only re-sorts + recomputes badge maxima when the user taps the deferred re-rank bar, so the row being edited never jumps.

**Tech Stack:** React Native, TypeScript (strict, no `any`), NativeWind, Supabase Edge Function (Deno), Gemini/OpenAI REST.

**Dependency:** Builds directly on **Phase 4** — requires the gram-shape `EnrichedItem` (`protein_g`, `carb_g`, `fat_g`, `estimated_calories`, `confidence`, `allergens`, `ingredients`), the dot-badge `MenuItemRow`, the ranked `FlatList` in `results.tsx` phase 1, and `GOALS_SORT_MAP` pointing at the gram fields. **Do not start Phase 5 until Phase 4 is merged.**

## Phase 5 Design (approved 2026-06-15)

- **Uniform multiplier** (Option A, chosen over food-aware modes): every item uses one stepper. Stops: `¼ · ½ · ¾ · 1× · 1½ · 2× · 3×`, default `1×`, floor `¼`, cap `3×`. `3×` covers "4+ slices" since a 2-slice default × 2 = 4 slices.
- **No user math:** the displayed serving label rescales with the multiplier (`2 slices` → `4 slices` at 2×; `6 oz fillet` → `3 oz fillet` at ½×). All four macros scale linearly and round to integers.
- **Live vs deferred:** stepping `+`/`−` updates the edited row's grams + label + that row's dots **instantly** (against the currently-applied maxima) and the row does **not** move. A bottom bar — *"Portions changed — tap to update ranking"* — appears **only when** the pending multipliers would change sort order; tapping it re-sorts and recomputes all menu-relative badge maxima at once.
- **Ephemeral:** multipliers reset on a new scan (local component state, no persistence, no store).
- **Low-confidence items** (the `0/0/0/0` ones) have no serving and render **no stepper**.

## Phase 5 File Map

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `src/types/scan.ts` | Modify | Add `serving_qty`, `serving_unit` to `EnrichedItem` |
| `supabase/functions/analyze-menu/index.ts` | Modify | Enrich prompt: realistic one-person serving + emit `serving_qty`/`serving_unit`; add both to enrich schemas |
| `src/lib/portion.ts` | Create | Pure scaling util: stops, `stepMultiplier`, `scaleMacros`, `formatQty`, `formatMultiplier`, `scaledSortValue` |
| `src/lib/portion.test.ts` | Create | One assert-based self-check for the scaling/formatting math |
| `src/components/results/MenuItemRow.tsx` | Modify | Render stepper + scaled label/macros; dots from scaled values vs `maxValues` prop |
| `src/app/results.tsx` | Modify | Per-item multiplier state, deferred re-rank bar, apply → re-sort + recompute maxima |

## Task 5.1: Add serving fields to `EnrichedItem`

**Files:** Modify `src/types/scan.ts`

- [ ] **Step 1: Extend the interface.** Add the two serving fields to the Phase-4 gram-shape `EnrichedItem` (do not change the existing macro/confidence/allergen fields):

```ts
export interface EnrichedItem extends ExtractedItem {
  ingredients: EnrichedIngredient[];
  protein_g: number;
  carb_g: number;
  fat_g: number;
  estimated_calories: number;
  confidence: "high" | "medium" | "low";
  allergens: string[];
  serving_qty: number;       // default units one adult eats in one sitting, e.g. 2, 6, 1
  serving_unit: string;      // e.g. "slices", "oz fillet", "burger", "bowl"
}
```

- [ ] **Step 2: Type-check.** Run: `pnpm tsc --noEmit` → no errors.
- [ ] **Step 3: Commit.** `git add src/types/scan.ts && git commit -m "feat: add serving_qty/serving_unit to EnrichedItem"`

## Task 5.2: Edge Function — emit realistic serving + serving fields

**Files:** Modify `supabase/functions/analyze-menu/index.ts`

- [ ] **Step 1: Update the enrich prompt.** In `ENRICH_PROMPT` (added in Task 2.5′), change the gram-estimation step to anchor on a realistic one-person portion and require the serving fields. Replace step 2 and add the serving instruction:

```ts
const ENRICH_PROMPT = `You estimate the nutrition profile of restaurant menu items. For each item, work step by step:
1. List the most likely ingredients. If the description names them, use them; otherwise infer from the name and category. Tag each ingredient: protein | carb | fat | veg | other.
2. Decide the portion ONE adult typically eats in a single sitting (e.g. 2-3 slices of a shareable pizza, not the whole pie; one fillet; one bowl). Express it as "serving_qty" (a number) and "serving_unit" (a short plural noun like "slices", "oz fillet", "burger", "bowl", "glass"). Then estimate, FOR THAT portion: protein_g, carb_g, fat_g, estimated_calories.
3. Set "confidence" to "low" only when the name and description are evocative or promotional rather than descriptive, leaving you with little ingredient information to go on. For low-confidence items, set serving_qty to 0 and serving_unit to "".
List "allergens" you can infer from the ingredients (e.g. dairy, nuts, gluten, shellfish, egg, soy). Preserve each item's name, description, price, and category exactly as given. Do NOT sort the items. Return one object per input item, in the same order.`;
```

- [ ] **Step 2: Add the serving fields to both enrich schemas.** In `ENRICH_SCHEMA_GEMINI` and `ENRICH_SCHEMA_OPENAI`, add to each item's `properties` and `required` list:

```ts
      serving_qty: { type: "number" },
      serving_unit: { type: "string" },
```

(In `ENRICH_SCHEMA_GEMINI` add to `required`; in `ENRICH_SCHEMA_OPENAI` add to `required` — `additionalProperties:false` already enforced.)

- [ ] **Step 3: Deploy.** Run: `supabase functions deploy analyze-menu` → deploy succeeds.
- [ ] **Step 4: Smoke-test.** Re-run the Task 2.5′ curl for both providers; verify each item now returns numeric `serving_qty` + string `serving_unit`, and that a promotional item returns `serving_qty: 0`, `serving_unit: ""`.
- [ ] **Step 5: Commit.** `git add supabase/functions/analyze-menu/index.ts && git commit -m "feat: enrichment emits realistic serving_qty/serving_unit"`

## Task 5.3: Portion scaling util (with self-check)

**Files:** Create `src/lib/portion.ts`, `src/lib/portion.test.ts`

- [ ] **Step 1: Write the util.**

```ts
import type { EnrichedItem } from "@/types/scan";

export const MULTIPLIER_STOPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3] as const;
export type Multiplier = (typeof MULTIPLIER_STOPS)[number];

const FRACTIONS: Record<number, string> = { 0.25: "¼", 0.5: "½", 0.75: "¾" };

/** Moves to the next/previous discrete stop, clamped to the ends. */
export function stepMultiplier(current: number, dir: 1 | -1): Multiplier {
  const i = MULTIPLIER_STOPS.indexOf(current as Multiplier);
  const idx = i === -1 ? MULTIPLIER_STOPS.indexOf(1) : i;
  const next = Math.min(Math.max(idx + dir, 0), MULTIPLIER_STOPS.length - 1);
  return MULTIPLIER_STOPS[next];
}

/** Formats a quantity with ¼/½/¾ fractions, e.g. 1.5 -> "1½", 3 -> "3". */
export function formatQty(qty: number): string {
  const whole = Math.floor(qty + 1e-9);
  const frac = Math.round((qty - whole) * 100) / 100;
  const fracStr = FRACTIONS[frac];
  if (fracStr) return whole > 0 ? `${whole}${fracStr}` : fracStr;
  return `${whole}`;
}

/** "1×", "½×", "1½×". */
export function formatMultiplier(m: number): string {
  return FRACTIONS[m] ? `${FRACTIONS[m]}×` : `${formatQty(m)}×`;
}

export interface ScaledMacros {
  protein_g: number;
  carb_g: number;
  fat_g: number;
  estimated_calories: number;
}

/** Scales the four macro fields by the multiplier, rounded to integers. */
export function scaleMacros(item: EnrichedItem, m: number): ScaledMacros {
  return {
    protein_g: Math.round(item.protein_g * m),
    carb_g: Math.round(item.carb_g * m),
    fat_g: Math.round(item.fat_g * m),
    estimated_calories: Math.round(item.estimated_calories * m),
  };
}

/** Scaled value of one macro field — used as the live sort key. */
export function scaledSortValue(
  item: EnrichedItem,
  m: number,
  field: keyof ScaledMacros,
): number {
  return item[field] * m;
}
```

> ponytail: stops are multiples of 0.25 so `serving_qty * m` and macro scaling stay on clean quarter steps — the `1e-9` / `round(…*100)/100` guards float noise. No generic rational-number lib needed.

- [ ] **Step 2: Write the self-check.**

```ts
import { formatQty, formatMultiplier, scaleMacros, stepMultiplier } from "./portion";
import type { EnrichedItem } from "@/types/scan";

const base = {
  name: "Pizza", description: "", price: 16, category: "main",
  ingredients: [], protein_g: 25, carb_g: 110, fat_g: 25, estimated_calories: 950,
  confidence: "high", allergens: [], serving_qty: 2, serving_unit: "slices",
} as EnrichedItem;

test("scaleMacros doubles at 2x", () => {
  expect(scaleMacros(base, 2).estimated_calories).toBe(1900);
  expect(scaleMacros(base, 0.5).carb_g).toBe(55);
});

test("formatQty renders fractions", () => {
  expect(formatQty(base.serving_qty * 2)).toBe("4");   // 4 slices
  expect(formatQty(6 * 0.5)).toBe("3");                 // 3 oz
  expect(formatQty(1 * 0.5)).toBe("½");                 // ½ bowl
  expect(formatQty(2 * 0.75)).toBe("1½");
});

test("stepMultiplier clamps at the ends", () => {
  expect(stepMultiplier(0.25, -1)).toBe(0.25);
  expect(stepMultiplier(3, 1)).toBe(3);
  expect(stepMultiplier(1, 1)).toBe(1.5);
  expect(formatMultiplier(0.5)).toBe("½×");
});
```

- [ ] **Step 3: Run the check.** Run: `pnpm test src/lib/portion.test.ts` (or `pnpm exec jest src/lib/portion.test.ts` if no `test` script) → PASS. If no test runner is configured, convert the three blocks into a `if (import.meta.main)`-style `console.assert` demo and run with `pnpm exec tsx src/lib/portion.test.ts`.
- [ ] **Step 4: Type-check.** `pnpm tsc --noEmit` → no errors.
- [ ] **Step 5: Commit.** `git add src/lib/portion.ts src/lib/portion.test.ts && git commit -m "feat: add portion scaling util"`

## Task 5.4: Portion stepper in `MenuItemRow`

**Files:** Modify `src/components/results/MenuItemRow.tsx`

- [ ] **Step 1: Extend props.** Add the multiplier + handler to `MenuItemRowProps` (alongside the Phase-4 `item`, `rank`, `maxValues`, `selectedGoals` props):

```tsx
interface MenuItemRowProps {
  item: EnrichedItem;
  rank: number;
  maxValues: { protein_g: number; carb_g: number; fat_g: number; estimated_calories: number };
  selectedGoals: string[];
  multiplier: number;
  onStep: (dir: 1 | -1) => void;
}
```

- [ ] **Step 2: Compute scaled values and feed the badges.** Inside the component, derive scaled macros once and use them for both the numeric display and the dot-bucket math (the Phase-4 badge helper buckets `value / maxValues[field]`):

```tsx
import { scaleMacros, formatQty, formatMultiplier } from "@/lib/portion";
// ...
const scaled = scaleMacros(item, multiplier);
const hasServing = item.serving_qty > 0;
```

Replace the four badge values (Phase 4 passed `item.protein_g` etc.) with `scaled.protein_g`, `scaled.carb_g`, `scaled.fat_g`, `scaled.estimated_calories`. Buckets still divide by `maxValues[field]` (applied maxima, passed from the parent).

- [ ] **Step 3: Render the stepper** (only when `hasServing`), below the badges. NativeWind; `Pressable` pressed state via inline style is allowed per the Style Exception List:

```tsx
{hasServing && (
  <View className="flex-row items-center justify-between mt-3">
    <Text className="font-sans text-caption text-muted-foreground">
      ≈ {formatQty(item.serving_qty * multiplier)} {item.serving_unit}
    </Text>
    <View className="flex-row items-center">
      <Pressable
        onPress={() => onStep(-1)}
        hitSlop={8}
        className="w-8 h-8 items-center justify-center rounded-full bg-card border border-border"
        accessibilityRole="button"
        accessibilityLabel="Decrease portion"
      >
        <Text className="font-sans text-body text-foreground">−</Text>
      </Pressable>
      <Text className="font-sans text-body text-foreground w-12 text-center">
        {formatMultiplier(multiplier)}
      </Text>
      <Pressable
        onPress={() => onStep(1)}
        hitSlop={8}
        className="w-8 h-8 items-center justify-center rounded-full bg-card border border-border"
        accessibilityRole="button"
        accessibilityLabel="Increase portion"
      >
        <Text className="font-sans text-body text-foreground">+</Text>
      </Pressable>
    </View>
  </View>
)}
```

- [ ] **Step 4: Type-check + lint.** `pnpm tsc --noEmit && pnpm exec eslint src/components/results/MenuItemRow.tsx --ext .ts,.tsx` → no errors.
- [ ] **Step 5: Commit.** `git add src/components/results/MenuItemRow.tsx && git commit -m "feat: add portion stepper + scaled macros to MenuItemRow"`

## Task 5.5: Multiplier state + deferred re-rank in `results.tsx`

**Files:** Modify `src/app/results.tsx`

- [ ] **Step 1: Hold per-item multipliers + applied snapshot.** In the ranked-results phase (Phase-4 phase 1), key by item index (items are stable within one enrichment result). `multipliers` is the live edit state; `applied` is the snapshot the current sort + maxima reflect:

```tsx
import { stepMultiplier, scaleMacros, scaledSortValue } from "@/lib/portion";
import { GOALS_SORT_MAP } from "@/lib/analyzeMenu";
// ...
const [multipliers, setMultipliers] = useState<Record<number, number>>({});
const [applied, setApplied] = useState<Record<number, number>>({});
const mult = (i: number) => multipliers[i] ?? 1;
const appliedMult = (i: number) => applied[i] ?? 1;
```

> `GOALS_SORT_MAP` is module-private in `analyzeMenu.ts` today. Add `export` to its declaration (`export const GOALS_SORT_MAP = …`) so this import resolves — a one-word change, no behavior impact.

- [ ] **Step 2: Sort + maxima from the applied snapshot.** Build the displayed order and badge maxima from `applied` (NOT live `multipliers`), so live edits don't reshuffle:

```tsx
const goal = selectedGoals[0];
const sortCfg = goal ? GOALS_SORT_MAP[goal] : undefined;

const ordered = useMemo(() => {
  const withIdx = enrichment.items.map((item, i) => ({ item, i }));
  if (!sortCfg) return withIdx;
  const field = sortCfg.field as "protein_g" | "carb_g" | "fat_g" | "estimated_calories";
  return [...withIdx].sort((a, b) => {
    const av = scaledSortValue(a.item, appliedMult(a.i), field);
    const bv = scaledSortValue(b.item, appliedMult(b.i), field);
    return sortCfg.order === "desc" ? bv - av : av - bv;
  });
}, [enrichment.items, applied, sortCfg]);

const maxValues = useMemo(() => {
  const scaled = enrichment.items.map((item, i) => scaleMacros(item, appliedMult(i)));
  return {
    protein_g: Math.max(1, ...scaled.map((s) => s.protein_g)),
    carb_g: Math.max(1, ...scaled.map((s) => s.carb_g)),
    fat_g: Math.max(1, ...scaled.map((s) => s.fat_g)),
    estimated_calories: Math.max(1, ...scaled.map((s) => s.estimated_calories)),
  };
}, [enrichment.items, applied]);
```

> ponytail: `Math.max(1, …)` avoids divide-by-zero in the Phase-4 badge buckets when every item is low-confidence (all-zero macros).

- [ ] **Step 3: Step handler + "order changed" detection.** Stepping updates live state; compare the would-be order under `multipliers` against the displayed `ordered` to decide whether to show the bar:

```tsx
const onStep = (i: number) => (dir: 1 | -1) =>
  setMultipliers((m) => ({ ...m, [i]: stepMultiplier(m[i] ?? 1, dir) }));

const pendingOrder = useMemo(() => {
  if (!sortCfg) return ordered.map((o) => o.i);
  const field = sortCfg.field as "protein_g" | "carb_g" | "fat_g" | "estimated_calories";
  return enrichment.items
    .map((item, i) => ({ i, v: scaledSortValue(item, mult(i), field) }))
    .sort((a, b) => (sortCfg.order === "desc" ? b.v - a.v : a.v - b.v))
    .map((o) => o.i);
}, [enrichment.items, multipliers, sortCfg]);

const orderChanged =
  pendingOrder.length === ordered.length &&
  pendingOrder.some((idx, k) => idx !== ordered[k].i);
```

- [ ] **Step 4: Render rows from `ordered` + the deferred bar.** Pass live `mult(i)` to each row (so the edited row updates live) but keep `maxValues` from `applied`:

```tsx
<FlatList
  data={ordered}
  keyExtractor={({ i }) => `${i}`}
  contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 80 }}
  renderItem={({ item: { item, i }, index }) => (
    <MenuItemRow
      item={item}
      rank={index + 1}
      maxValues={maxValues}
      selectedGoals={selectedGoals}
      multiplier={mult(i)}
      onStep={onStep(i)}
    />
  )}
/>
{orderChanged && (
  <Pressable
    onPress={() => setApplied({ ...multipliers })}
    className="absolute bottom-4 left-6 right-6 rounded-full bg-foreground py-4 items-center"
    accessibilityRole="button"
    accessibilityLabel="Update ranking with new portions"
  >
    <Text className="font-sans text-button text-background">
      Portions changed — tap to update ranking
    </Text>
  </Pressable>
)}
```

- [ ] **Step 5: Reset on new scan.** Where the screen clears prior results (the existing `clear()`/new-scan path), also `setMultipliers({})` and `setApplied({})` so portions don't leak across scans.
- [ ] **Step 6: Type-check + lint.** `pnpm tsc --noEmit && pnpm exec eslint src/ --ext .ts,.tsx` → no errors.
- [ ] **Step 7: Commit.** `git add src/app/results.tsx && git commit -m "feat: per-item portion multipliers with deferred re-rank"`

## Phase 5 Verification

1. **Type/lint/unit:** `pnpm tsc --noEmit`, `pnpm exec eslint src/ --ext .ts,.tsx`, and the `portion` self-check all pass.
2. **Realistic baseline:** enrichment returns `serving_qty`/`serving_unit` per item; a shareable pizza defaults to ~2–3 slices (not a whole pie); promotional/low-confidence items return `serving_qty: 0` and show **no** stepper.
3. **Live row update:** stepping `+`/`−` on a row updates its grams, kcal, serving label (`2 slices` → `4 slices` at 2×), and that row's dot-badges immediately, and the row does **not** move.
4. **Deferred re-rank:** the bottom bar appears only when pending portions change the sort order; tapping it re-sorts and recomputes all menu-relative badge maxima in one update; if the order wouldn't change, no bar appears.
5. **Bounds:** stepper clamps at `¼×` and `3×`; `1×` is the default for untouched items.
6. **Ephemeral:** starting a new scan resets all multipliers to `1×`.
