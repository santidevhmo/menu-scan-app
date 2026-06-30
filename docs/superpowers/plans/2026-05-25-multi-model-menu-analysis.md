# Multi-Model Menu Analysis MVP

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send real menu photos to 4 AI models (Gemini 1.5, Gemini 2.0, Mistral OCR, GPT-4o) and display structured menu item results side-by-side in tabs for comparison.

**Architecture:** A single Supabase Edge Function receives base64 photos + goals + provider name, calls the appropriate AI API with a shared JSON schema, and returns parsed menu items. The client fires 4 parallel requests (one per model) and renders results in a tabbed interface as each model responds. All models are asked to return the same JSON structure via their respective structured output enforcement.

**Tech Stack:** Expo, React Native, TypeScript, NativeWind, Zustand, Supabase Edge Functions (Deno), Gemini REST API, OpenAI REST API, Mistral REST API

**Current status (2026-06-29):** **MVP PIVOT → Launch Focus.** Phases 1–6 ✓ **SHIPPED TO PRODUCTION** (core OCR + macro sorting). Phase 7 (allergen selection) **DEFERRED POST-LAUNCH** — feature complete but commented out to focus on MVP. **New Development Roadmap:** Phase 10 (menu item options/variants) → Phase 11 (OCR gram misread recovery) → Phase 8 (category filtering) → Phase 9 (performance). Phase 7.5 (Mistral OCR evaluation) deferred. **Branch Strategy:** New branch reverts to commit before allergen work, builds phases 10/11/8/9 from stable base. **Final Validation:** Test with last 3 menus from Test Menu Backlog before release.

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

## MVP Release Strategy (2026-06-29 Pivot)

**Objective:** Launch MVP with core features (OCR menu reading + nutritional macro sorting) before expanding to secondary features.

**Branch Strategy:** 
- Create new feature branch from commit `adcfbd7` (last commit before allergen work)
- This provides a stable, allergen-free base for phases 10/11/8/9
- Allergen feature (PR #13) remains on `feat/allergen-selection` for post-launch re-integration

**MVP Scope (Launch):**
- ✓ Phase 1–6: Menu OCR extraction + Stage 2 enrichment (GPT-4o)
- ✓ Z-score based multi-goal sorting (soft-clamped tanh)
- ✓ Nutritional macro display (protein/carbs/fat)
- ✗ Phase 7 (allergen selection) — commented out, deferred

**Post-Launch Scope (Roadmap):**
- Phase 7 (allergen selection) — re-enable, expand testing
- Phase 7.5 (Mistral OCR) — model comparison
- Phases 8, 9 — category filtering, performance

**Testing Plan Before Release:**
- Validate all 3 phases work end-to-end
- Test with **last 3 menus from Test Menu Backlog**
- Verify sorting logic under edge cases
- Confirm no regressions from phases 1–6

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

# Phase 4: Activate Nutritional Analysis — Ranked Results (implemented 2026-06-14)

> Wires the Stage-2 enrichment winner into the live user flow, replacing the `PlaceholderPhase` in `src/app/results.tsx`. This closes the end-to-end loop: scan → goals → ranked results. Enrichment is **goal-agnostic**, so it runs in the background right after extraction completes (before the user finishes picking goals); goals are applied only at sort time.
>
> **Status:** ✓ **MERGED** (PR #6, 2026-06-16). All tasks completed. The checklist below is preserved as implementation history.

## Phase 4 File Map

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `src/store/analysis.store.ts` | Modify | Add `enrichment` / `enrichmentLoading` (mirror the extraction pattern) |
| `src/types/scan.ts` | Modify | Finalize `EnrichedItem` (ordinal shape) + `EnrichmentResult` |
| `src/lib/analyzeMenu.ts` | Modify | `enrichMenu()`; point `GOALS_SORT_MAP` at gram fields; retype `sortItemsByGoals` |
| `src/app/review.tsx` | Modify | Chain `enrichMenu` after `extractMenu` (background) |
| `src/components/results/MenuItemRow.tsx` | Modify | Four macro dot-badges, selected-goal highlight |
| `src/app/results.tsx` | Modify | Replace `PlaceholderPhase` with the ranked list |

## Task 4.1: Enrichment state

- [x] **Step 1** Add `enrichment: EnrichmentResult | null`, `enrichmentLoading: boolean`, their setters, and clear-on-reset to `analysis.store.ts`, mirroring the extraction pattern.

## Task 4.2: Enrichment client + chaining

- [x] **Step 1** Add `enrichMenu(items, provider)` to `analyzeMenu.ts` (sends `stage: "enrich"` with the cached `ExtractedItem[]`).
- [x] **Step 2** In `review.tsx`, after `extractMenu` resolves, set `enrichmentLoading` and call `enrichMenu` in the background.

## Task 4.3: Finalize types + sorting

- [x] **Step 1** Set `EnrichedItem` to the gram shape (`ingredients[]`, `protein_g`, `carb_g`, `fat_g`, `estimated_calories`, `confidence`, `allergens`). Add `EnrichmentResult` mirroring `ExtractionResult`.
- [x] **Step 2** Point each `GOALS_SORT_MAP` entry at the matching gram field (`protein_g`, `carb_g`, `fat_g`, `estimated_calories`; desc for high/highest, asc for low); add the `estimated_calories`-then-name tiebreak. Retype `sortItemsByGoals` to `EnrichedItem`.

## Task 4.4: Macro badges in `MenuItemRow`

- [x] **Step 1** Replace the raw grams `NutritionStat` grid with four macro **dot-badges** (protein/carb/fat/calorie). Each badge shows dots + the gram/kcal value (e.g. `●●●○ 38g`). Dots are bucketed **relative to the menu's max** for that macro — pass `maxValues: { protein_g, carb_g, fat_g, estimated_calories }` as a prop (computed once in the parent before rendering the list).
- [x] **Step 2** Highlight badges whose `GoalPair.group` is in `selectedGoals` (accent color); mute the rest (grey). Use the `GOAL_PAIRS` group→macro mapping.
- [x] **Step 3** Keep the per-item allergen line. The mandatory allergen disclaimer card belongs to the later allergen-filtering feature and must render when an allergen filter is active.

## Task 4.5: Ranked results phase

- [x] **Step 1** Replace `PlaceholderPhase` (phase 1) with a `FlatList` of `MenuItemRow`, sorted by `sortItemsByGoals(enrichment.items, selectedGoals)`, numbered #1..#n. Compute `maxValues` from all items before rendering.
- [x] **Step 2** Handle loading (enrichment running), empty, and error states.
- [x] **Step 3** Loading states must show a spinner + descriptive text at each stage. The sequence is:

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

- [x] **Step 1** Add a `lowConfidenceNotice: boolean` derived value in the results screen: `items.filter(i => i.confidence === "low").length / items.length >= 0.75`.
- [x] **Step 2** Render the notice card above the `FlatList` when `lowConfidenceNotice` is true. Dismissible via local `useState` — no store needed.
- [x] **Step 3** Type-check + lint. Commit: `feat: add low-confidence menu notice`

## Task 4.6: Cleanup

- [x] **Step 1** Retire the obsolete `MenuItem` / `ModelProvider` types and dead Phase-1 provider routes (the deferred Task 2.7 Step 3).

## Phase 4 Verification

1. **Type/lint:** `pnpm tsc --noEmit` and `pnpm exec eslint src/ --ext .ts,.tsx` → zero errors.
2. **E2E:** scan → pick goals → phase 1 shows a #1..#n ranked list; each row shows four macro dot-badges with gram values and the selected goal(s) accented.
3. **Menu-relative badges:** the item with the highest protein on the menu always shows ●●●●; the lowest always shows ●○○○ (or close). No item should show 4 dots on all macros unless it genuinely dominates on all four.
4. **Allergens:** per-item inferred allergens render inline. The mandatory allergen disclaimer card is reserved for active allergen filters.
5. **Low-confidence notice:** on a menu with evocative/promotional descriptions (≥75% low confidence), the notice card appears above the list and dismisses on tap.
6. **Background timing:** enrichment runs after extraction without blocking goal selection.

---

# Phase 5: Per-Item Portion Adjustment (implemented 2026-06-17)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **Code style:** Use the `ponytail` skill for code writing — laziest solution that works, fewest files, no speculative abstraction.

**Goal:** Each ranked result row gets a −/+ portion stepper; changing it scales that row's displayed gram/cal numbers and dot badges against the unchanged menu baseline maxes. Ranking and maxes stay frozen at the AI baseline.

**Architecture:** Portion multipliers are held in parent state (`ResultsPhase` in `src/app/results.tsx`), keyed by stable item identity, and passed down to each `MenuItemRow` as a controlled `portion` + `onPortionChange` pair. The row multiplies its displayed macro numbers by `portion` and recomputes only its own dot badges against the unchanged `maxValues`. The baseline sort/max pipeline still runs once on the un-scaled enriched items.

**Tech Stack:** Expo, React Native, TypeScript (strict), NativeWind, Zustand, Expo Router, Lucide icons.

**Dependency:** Builds directly on **Phase 4** — requires the gram-shape `EnrichedItem` (`protein_g`, `carb_g`, `fat_g`, `estimated_calories`, `confidence`, `allergens`, `ingredients`), the dot-badge `MenuItemRow`, and the ranked `FlatList` in `results.tsx` phase 1. No backend changes and no new libraries.

## Phase 5 Design (approved 2026-06-17)

> **Status:** ✓ **MERGED** (shipped with Phase 4 PR #6, 2026-06-16). All tasks completed.

1. **Control = −/+ stepper** (not preset pills). Starts at `1×`, step `±0.5×`, floor `0.5×` (cannot reach 0 or below), **no upper limit**.
2. **Stepper effect = row-local display scales; no re-sort.** Only the row's displayed gram/cal numbers and dot badges change. The list does **not** re-rank.
3. **Dot-badges update row-locally.** When a row's portion changes, that row's dots recompute from the scaled value against the unchanged baseline `maxValues`. Other rows and ranking do not change.
4. **State lives in the parent.** `FlatList` can unmount off-screen rows, so per-row local state would reset on long menus. `ResultsPhase` owns the multiplier map.

## Phase 5 File Map

| File | Action | Responsibility |
| ---- | ------ | -------------- |
| `src/components/results/MenuItemRow.tsx` | Modify | Add controlled `portion` + `onPortionChange` props; scale displayed macro numbers by `portion`; recompute row-local dots against baseline maxes; render the −/+ stepper. |
| `src/app/results.tsx` | Modify | Hold per-item portion state in `ResultsPhase`, keyed by stable item identity; pass `portion`/`onPortionChange` into each row. Baseline sort/maxes unchanged. |

No changes to `src/lib/analyzeMenu.ts`, `src/types/scan.ts`, `src/data/goals.ts`, or the Supabase Edge Function. The previous Phase 5 note about exporting `GOALS_SORT_MAP` is obsolete because Phase 5 does not re-sort.

## Task 5.1: Portion stepper + scaled numbers in `MenuItemRow`

**Files:** Modify `src/components/results/MenuItemRow.tsx`

- [x] **Step 1: Extend props.** Add controlled `portion` and `onPortionChange` props to `MenuItemRowProps`.

```tsx
interface MenuItemRowProps {
  item: EnrichedItem;
  rank: number;
  maxValues: MacroMaxes;
  highlight: Set<MacroField>;
  portion: number;
  onPortionChange: (portion: number) => void;
}
```

- [x] **Step 2: Scale the displayed macro number and row-local dots.** `MacroBadge.value` uses `item[macro.field] * portion`; `bucketDots` receives that scaled value with the unchanged baseline max.
- [x] **Step 3: Render the stepper below the badges.** NativeWind classes, Lucide `Minus`/`Plus`, accessibility labels, floor enforced at `0.5×`.

```tsx
<View className="flex-row items-center justify-center mt-3 gap-4">
  <Pressable
    onPress={() => onPortionChange(Math.max(0.5, portion - 0.5))}
    disabled={portion <= 0.5}
    hitSlop={8}
    accessibilityRole="button"
    accessibilityLabel="Decrease portion"
    accessibilityState={{ disabled: portion <= 0.5 }}
  >
    <Minus size={16} color={colors.foreground} strokeWidth={2} />
  </Pressable>

  <Text className="font-sans text-body text-foreground w-12 text-center">
    {portion}×
  </Text>

  <Pressable
    onPress={() => onPortionChange(portion + 0.5)}
    hitSlop={8}
    accessibilityRole="button"
    accessibilityLabel="Increase portion"
  >
    <Plus size={16} color={colors.foreground} strokeWidth={2} />
  </Pressable>
  </View>
```

- [x] **Step 4: Lint.** `pnpm exec eslint src/components/results/MenuItemRow.tsx --ext .ts,.tsx` → no errors. `pnpm tsc --noEmit` had the expected transient missing-prop error until Task 5.2 landed.
- [x] **Step 5: Commit.** `feat: add per-item portion stepper that scales macro numbers`

## Task 5.2: Parent-held portion state in `ResultsPhase`

**Files:** Modify `src/app/results.tsx`

- [x] **Step 1: Add portion state and a stable item-identity map in `ResultsPhase`.**

```tsx
const [portions, setPortions] = useState<Record<number, number>>({});

const maxValues = computeMaxes(result.items);
const highlight = selectedMacros(selectedGoals);
const sorted = sortItemsByGoals(result.items, selectedGoals);
const idOf = new Map(result.items.map((item, index) => [item, index]));
```

- [x] **Step 2: Pass portion props into each row and key the list stably.**

```tsx
<FlatList
  data={sorted}
  keyExtractor={(item) => String(idOf.get(item))}
  renderItem={({ item, index }) => {
    const id = idOf.get(item)!;

    return (
      <MenuItemRow
        item={item}
        rank={index + 1}
        maxValues={maxValues}
        highlight={highlight}
        portion={portions[id] ?? 1}
        onPortionChange={(portion) =>
          setPortions((prev) => ({ ...prev, [id]: portion }))
        }
      />
    );
  }}
/>
```

- [x] **Step 3: Type-check and lint.** `pnpm tsc --noEmit` and `pnpm exec eslint src/ --ext .ts,.tsx` → no errors.
- [x] **Step 4: Commit.** `feat: hold per-item portion state in results phase`

## Phase 5 Verification

1. **Type/lint:** `pnpm tsc --noEmit` and `pnpm exec eslint src/ --ext .ts,.tsx` → zero errors.
2. **Manual (simulator):** scan → pick a goal → Continue to the ranked results.
3. **Stepper:** each row shows a `−  1×  +` stepper under the macro badges.
4. **Scaling:** tapping `+` on a row scales that row's protein/carb/fat/cal numbers and dots by `1.5×`, `2×`, and so on with no upper bound; rank does not change.
5. **Bounds:** tapping `−` steps down by `0.5×`; the `−` button is disabled at `0.5×` and the value never reaches `0×`.
6. **Virtualization:** scrolling a long menu so the adjusted row goes off-screen, then back, retains its multiplier.
7. **Isolation:** adjusting one row leaves every other row's numbers, dots, and order unchanged.

## Phase 5 Follow-Up After Local Test (2026-06-17)

Local testing showed the first implementation works but the portion control is too prominent for rows that will rarely need it. Follow-up work:

- [x] **Stepper label formatting:** Show `x1` instead of `1×`; when below one, show `1/2` instead of `0.5`.
- [x] **Full descriptions:** Remove the result-row description truncation so the full menu item description is visible.
- [x] **Stepper UX brainstorm:** Rework the stepper affordance so portion editing stays available but does not dominate every main-plate row. Current menu testing suggests only about 1 item out of 6 needs portion adjustment; items like tacos or tostadas benefit, while most main plates do not.
- [x] **Row-local dot updates:** When a row's portion changes, update that row's dots immediately using the original menu baseline maxes. Do not re-sort the list and do not change other rows' dots or numbers.

Resolution: keep a compact always-visible stepper; row-local dot updates supersede Phase 5 design decision #3 ("dots frozen at baseline").

## Next Follow-Up: Inconsistent Result Counts

- [x] **Make analysis compare all menu items consistently:** Local testing showed repeated analysis of the same menu could return uneven result counts, such as 11 items on one run and 6 on another. Root cause was Stage 2 GPT-4o enrichment returning a valid-but-incomplete subset under output pressure. Shipped chunked GPT-4o enrichment (`ENRICH_BATCH_SIZE = 10`) with deterministic sampling, one retry, error fallback, and reassembly backfill so `N extracted === N enriched`. Live verification passed with 45 OCR-extracted items and 45 rendered results. Deployed `analyze-menu`; validated with `deno test --no-lock supabase/functions/analyze-menu/enrich_test.ts`, `deno check --no-lock supabase/functions/analyze-menu/index.ts`, and `pnpm exec tsc --noEmit`.

## Phase 6: Remove Macro Dot Indicators (2026-06-20)

**Status:** ✓ **MERGED** (Commit: `d145040 feat: remove menu-relative macro dot indicators`)

**Spec alignment:** `AGENTS.md` no longer requires menu-relative macro dot badges; Phase 6 is the agreed UI direction.

**Goal:** Drop the relative dot-bucketing UI for macros. Dots bucket each macro relative to the current menu's own max (`bucketDots` in `src/lib/analyzeMenu.ts`), so a 50g-protein item on a menu topped by a 100g item shows only 2/4 dots even though 50g is objectively high. "High/low" is individual to each user's nutritional goals, so a menu-relative visual misleads. Keep the raw number/unit/label and keep `highlight` (bold text when a macro matches the user's selected goal) — that's goal-relative by intent, not the menu-relative comparison being removed. No replacement visual.

### Task 6.1: Remove dots from `MacroBadge`

- [x] **Step 1:** In `src/components/results/MenuItemRow.tsx`, remove the dot `Text` (`{"●".repeat(filled)}{"○".repeat(4 - filled)}`) from `MacroBadge`, and remove its `filled` prop.
- [x] **Step 2:** Remove the `filled={bucketDots(...)}` call site in `MenuItemRow`'s `MACROS.map`.
- [x] **Step 3:** Remove `bucketDots` from `src/lib/analyzeMenu.ts` once nothing calls it.
- [x] **Step 4:** Remove `MacroMaxes` interface, the `maxValues` prop on `MenuItemRowProps`, and the `computeMaxes` call site + `maxValues` prop passed from `src/app/results.tsx`, once nothing else needs them.
- [x] **Step 5:** Type-check and lint. `pnpm tsc --noEmit` and `pnpm exec eslint src/ --ext .ts,.tsx` → no errors.
- [x] **Step 6:** Commit. `feat: remove menu-relative macro dot indicators`

## Phase 6 Verification

1. **Type/lint:** zero errors.
2. **Manual:** each macro badge shows only the number/unit and label — no `●○` dots.
3. **Highlight preserved:** the macro matching the user's selected goal still renders bold/dark text.
4. **Portion stepper unaffected:** adjusting a row's portion still scales its displayed numbers.

---

## Phase 6 Follow-Up: Nutritional Sorting Validation (2026-06-20)

**Status:** ✓ **MERGED** on `feat/multi-goal-zscore-sorting` through `885b3ea Fix goal ranking pre-merge checks`.

**Outcome:** Sorting validation revealed the single-goal sort was insufficient for multiple selected goals. The merged implementation now uses z-score normalization across selected macro goals, soft-clamps each per-goal z-score with `CLAMP_CAP = 1.5`, preserves raw per-goal `goal_scores` for debugging/display, and derives goal weights from the selected goal order.

**Merged commits:**

- `e052b81 feat: add z-score math helper node test`
- `d61fef4 feat: replace sortItemsByGoals z-score multi-goal scoring`
- `0a46236 feat: add sorting validation log (task 6.F1)`
- `00a9534 fix: pass temperature 0 seed Stage 1 extraction`
- `97b373c chore: log top-10 ranked items clamp-cap calibration`
- `937c332 feat: set clamp cap 1.5 simulator A/B`
- `eda9ad2 fix: soft-clamp z-scores so few-goal sorting keeps leader order`
- `885b3ea Fix goal ranking pre-merge checks`

**Pre-merge fixes included:**

- Reset per-result portion overrides when a new enrichment result arrives.
- Gate detailed ranking logs behind `__DEV__` so production builds do not log user goals, macros, allergens, or scores.
- Export and reuse `CLAMP_CAP` in tests instead of hard-coding the cap.
- Remove `.ts` extension from the z-score test import and drop the `@ts-expect-error`.
- Filter non-finite numeric values before z-score calculations and treat non-finite item fields as neutral.
- Make `sortItemsByGoals` generic so preserved fields such as `sourceIndex` remain typed.
- Add regression coverage for finite z-score handling, goal weights, and goal-order ranking changes.

**Validation:** `pnpm tsc --noEmit` and `pnpm lint` passed before merge. The repo still has no configured standalone test runner; raw Node cannot execute the extensionless TypeScript test imports, so the assert-style test files are type-checked and ready for a proper test runner.

## Phase 7: Allergen Selection (2026-06-20)

> **Status:** ✓ **FEATURE COMPLETE** (PR #13, 2026-06-21) but **DEFERRED POST-LAUNCH** as of 2026-06-29. Allergen selection feature is fully implemented but will be commented out in MVP release to focus on core OCR + macro sorting. Will be re-enabled and thoroughly tested in post-launch phase.

**Goal:** Let the user multi-select allergens they're allergic to, and use that selection to (a) hide matching menu items by default with a reveal option, (b) show the mandatory disclaimer card, and (c) gate the existing per-item red allergen line on selection. Brainstormed with the user; design decisions below.

**Design decisions (from brainstorming):**
- Allergen list: a broader curated list (~15 items), not just the FDA "big 9", not derived dynamically from scan data.
- Picker placement: same screen as nutritional goal selection, before/while scanning — persisted like goals.
- Filtering behavior: hide matching items by default, with a single global "Show anyway" reveal banner (not a hard filter with no escape, not per-item reveal rows).
- Picker UI: a wrapping chip grid (all ~15 chips visible, no scrolling list, no category grouping) — matches existing chip styling (`rounded-chip`) and Cal-AI-style minimalism.
- Per-item red "Allergens: ..." line: gated on selection, not just presence. Hidden entirely when `selectedAllergens.length === 0`; when ≥1 allergen is selected, shows the item's full allergen list (not filtered down to only the selected ones).
- Disclaimer card: renders whenever `selectedAllergens.length > 0` ("a filter is active"), regardless of whether anything is currently hidden — satisfies AGENTS.md's non-negotiable text: *"AI-estimated. Confirm allergens with restaurant staff before ordering."*

**Out of scope for this phase:** allergen-aware re-ranking/sorting (filtering/hiding only), persisting the "show anyway" reveal across app restarts (view-local state), editing allergens from the results screen (selection only happens pre-scan).

### File Map

- `src/data/allergens.ts` (new) — curated `ALLERGENS: string[]` list.
- `src/store/allergens.store.ts` (new) — Zustand + AsyncStorage store, same shape as `goals.store.ts`.
- `src/components/AllergenSelector.tsx` (new) — wrapping chip grid, multi-select.
- Goal-selection screen — render `AllergenSelector` alongside `GoalSelector`.
- `src/app/results.tsx` — filter hidden items, render reveal banner and disclaimer card.
- `src/components/results/MenuItemRow.tsx` — gate the per-item allergen line on `selectedAllergens.length > 0`.

### Task 7.1: Allergen data and store

- [ ] **Step 1:** Create `src/data/allergens.ts` exporting `ALLERGENS: string[]` (~15 items: Peanuts, Tree nuts, Dairy, Eggs, Shellfish, Fish, Soy, Wheat/Gluten, Sesame, Mustard, Celery, Sulfites, Lupin, Mollusks, Corn).
- [ ] **Step 2:** Create `src/store/allergens.store.ts` mirroring `goals.store.ts`: `selectedAllergens: string[]`, `setAllergens`, `toggleAllergen`, persisted as `"allergens-storage"`.

### Task 7.2: `AllergenSelector` component

- [ ] **Step 1:** Build `AllergenSelector` rendering `ALLERGENS` as a wrapping chip grid (`flex-row flex-wrap`), each chip toggling via `useAllergensStore().toggleAllergen`, selected chips visually filled/highlighted (reuse existing chip/pill class patterns).
- [ ] **Step 2:** Render `AllergenSelector` on the same screen as `GoalSelector` (goal-selection screen), positioned so it reads as a secondary/optional section relative to goals.

### Task 7.3: Results filtering and disclaimer

- [ ] **Step 1:** In `src/app/results.tsx`, compute `hiddenItems` = items whose `allergens` intersects `selectedAllergens`; compute the rendered list as all items minus hidden, unless a local "show anyway" toggle is on.
- [ ] **Step 2:** Render a banner above the `FlatList` when `hiddenItems.length > 0` and reveal is off: `"{n} items hidden due to allergens · Show anyway"`. Tapping sets the local reveal toggle true, re-including hidden items (e.g. with a dimmed/flagged style).
- [ ] **Step 3:** Render the mandatory disclaimer card when `selectedAllergens.length > 0`, with the exact AGENTS.md text. Always visible in that state — not dismissible.

### Task 7.4: Gate per-item allergen line

- [ ] **Step 1:** In `MenuItemRow.tsx`, change the per-item allergen line condition from `item.allergens.length > 0` to `item.allergens.length > 0 && selectedAllergens.length > 0` (pass `selectedAllergens` down as a prop or read from the store).

### Task 7.5: Verify

- [ ] **Step 1:** Type-check and lint. `pnpm tsc --noEmit` and `pnpm exec eslint src/ --ext .ts,.tsx` → no errors.
- [ ] **Step 2:** Commit. `feat: add allergen multi-select with results filtering and disclaimer`

## Phase 7 Verification

1. **Type/lint:** zero errors.
2. **Selection:** goal-selection screen shows a chip grid of ~15 allergens; tapping toggles selection and persists across app restart.
3. **No selection:** with zero allergens selected, no items are hidden, no disclaimer card, no per-item red allergen line on any item.
4. **With selection:** selecting an allergen present in some menu items hides those items from the results list; a "Show anyway" banner appears with the correct hidden count; tapping it reveals the hidden items.
5. **Disclaimer:** with ≥1 allergen selected, the disclaimer card is always visible on the results screen with the exact AGENTS.md text, regardless of whether any items are currently hidden.
6. **Per-item line:** with ≥1 allergen selected, items with `allergens.length > 0` show their full `Allergens: ...` line (not filtered to only selected allergens).

## Phase 7.5: Mistral OCR 4 Extraction Evaluation (2026-06-23)

> **Status:** NOT STARTED (designed 2026-06-23, awaiting development).

**Goal:** Benchmark `mistral-ocr-latest` (Mistral OCR 4) as a drop-in replacement for GPT-4o Vision in Stage 1 extraction. Evaluate quality and speed against the same test fixtures with no UI changes — decision gates a future model swap.

**Design decisions:**
- Evaluation only — no prod swap yet. Wire Mistral OCR 4 behind `provider: "mistral-ocr"` in the Edge Function (already stubbed as `ModelProvider`), run it in parallel with GPT-4o on the same fixtures, compare outputs.
- Use the identical `EXTRACT_SCHEMA` and prompt as GPT-4o — controlled comparison, not a tuned Mistral prompt.
- Metrics per fixture: (a) item count vs. ground truth, (b) option/choice arrays populated correctly, (c) gram value accuracy (key regression check for Phase 11), (d) p50 latency vs. GPT-4o.
- Mistral OCR API uses `mistral-ocr-latest` via the chat completions endpoint with base64 image input — same call shape as the existing Mistral stub.

### File Map

- `supabase/functions/analyze-menu/index.ts` — add `"mistral-ocr"` case to `callProvider`; set model to `"mistral-ocr-latest"`.
- No client changes — invoke directly via curl/script or the existing provider tab.

### Task 7.5.1: Wire Mistral OCR 4 provider

- [ ] **Step 1:** In `callProvider`, add case `"mistral-ocr"` using `MISTRAL_API_KEY`, model `"mistral-ocr-latest"`, same schema and prompt as `"gpt-vision"`.
- [ ] **Step 2:** Confirm Mistral OCR API accepts base64 image input; adapt if it requires a URL.

### Task 7.5.2: Run against fixture menus

- [ ] **Step 1:** Run extraction on the **Brasero (churrasquería)** fixture — confirm option/choice detection.
- [ ] **Step 2:** Run on **Palominos** — varied option structures.
- [ ] **Step 3:** Run on **Keburros Percherones** — general extraction quality.
- [ ] **Step 4:** Fill comparison table; note item count, options populated, gram misreads, latency.

### Task 7.5.3: Decision

- [ ] **Step 1:** If Mistral OCR 4 matches or beats GPT-4o on item count + option detection with ≤ 1.5× latency → open a Phase 12 to swap the production extraction model. Otherwise, keep GPT-4o and note findings.

### Comparison Table (fill during Task 7.5.2)

| Fixture | Model | Items | Options correct | Gram misreads | Latency |
|---------|-------|-------|----------------|---------------|---------|
| Brasero | gpt-4o | — | — | — | — |
| Brasero | mistral-ocr-latest | — | — | — | — |
| Palominos | gpt-4o | — | — | — | — |
| Palominos | mistral-ocr-latest | — | — | — | — |
| Keburros | gpt-4o | — | — | — | — |
| Keburros | mistral-ocr-latest | — | — | — | — |

### Phase 7.5 Verification

1. `callProvider("mistral-ocr", ...)` returns a valid `AnalysisResponse` with items.
2. Comparison table filled for all 3 fixtures.
3. Decision recorded in Task 7.5.3 with rationale.

---

## Phase 8: Category Filtering (2026-06-20)

> **Status:** NOT STARTED (designed 2026-06-20, awaiting development).

**Goal:** Let the user filter results by menu category (`MenuCategory`: `appetizer | main | side | dessert | drink | other`, already on every `EnrichedItem` and already shown as a per-item chip in `MenuItemRow`). Brainstormed with the user; design decisions below.

**Design decisions (from brainstorming):**
- Selection mode: single-select, not multi-select — one category active at a time (plus an "All" option), like a segmented control. Avoids a second multi-select control alongside the allergen chip grid.
- Placement: a horizontal scrollable tab bar above the `FlatList` on the results screen (e.g. `All · Appetizer · Main · Side · Dessert`).
- Behavior: filtering only — selecting a tab narrows the list to that category; existing goal-based ranking order is preserved within the filtered subset. No separate re-sort logic.
- Tab contents: dynamic, not fixed — only categories actually present in the current scan's `result.items` get a tab (plus "All"). A menu with no desserts shows no "Dessert" tab, avoiding empty-list dead ends.
- Interaction with allergen filtering (Phase 7): category filtering and allergen hiding compose — category narrows first, then allergen-hidden items within that category are still hidden/revealed per the Phase 7 banner.

### File Map

- `src/app/results.tsx` — derive present categories, hold selected-category local state, filter rendered list, render tab bar.
- `src/components/results/CategoryTabs.tsx` (new) — horizontal scrollable tab bar.

### Task 8.1: `CategoryTabs` component

- [ ] **Step 1:** Build `CategoryTabs` taking `categories: MenuCategory[]`, `selected: MenuCategory | "all"`, `onSelect`. Renders `"All"` plus one tab per category, in a horizontally scrollable row (`ScrollView horizontal`), selected tab visually distinct (reuse existing chip/pill styling).

### Task 8.2: Wire into results screen

- [ ] **Step 1:** In `src/app/results.tsx`, derive `presentCategories` = unique `category` values from `result.items`, in a stable order matching `MenuCategory`'s declared order.
- [ ] **Step 2:** Hold `selectedCategory` local state (default `"all"`). Render `CategoryTabs` above the `FlatList` when `presentCategories.length > 1` (no point showing tabs for a single-category menu).
- [ ] **Step 3:** Filter the list rendered to `FlatList` by `selectedCategory` before applying the existing allergen-hiding logic from Phase 7, preserving existing sort order.

### Task 8.3: Verify

- [ ] **Step 1:** Type-check and lint. `pnpm tsc --noEmit` and `pnpm exec eslint src/ --ext .ts,.tsx` → no errors.
- [ ] **Step 2:** Commit. `feat: add category filter tabs to results screen`

## Phase 8 Verification

1. **Type/lint:** zero errors.
2. **Tab contents:** tab bar shows "All" plus only the categories present in the current scan's results — no tabs for absent categories.
3. **Single menu category:** if every item shares one category, no tab bar renders at all.
4. **Filtering:** selecting a category tab shows only items of that category, in unchanged rank order; selecting "All" restores the full list.
5. **Composes with allergens:** with a category selected and an allergen filter active, hidden-item count and "Show anyway" banner reflect only the currently filtered category's items.

## Phase 9: Results List Rendering Performance (Deferred)

**Trigger:** During simulator testing of the ranked results list, Metro logged:

```text
VirtualizedList: You have a large list that is slow to update - make sure your renderItem function renders components that follow React performance best practices like PureComponent, shouldComponentUpdate, etc. {dt: 5874, prevDt: 718, contentLength: 9161}
```

**Goal:** Optimize large result-list updates without changing ranking behavior, allergen filtering, category filtering, or portion controls.

**Scope:** Deferred until ranking/clamp-cap work is complete. Do not mix this with sorting algorithm changes.

### File Map

- `src/app/results.tsx` — `FlatList`, `renderItem`, derived filtered/sorted data, portion state callbacks.
- `src/components/results/MenuItemRow.tsx` — row render cost, memoization boundary, portion controls.

### Task 9.1: Reproduce and measure

- [ ] **Step 1:** Reproduce warning with realistic scan result count in iOS simulator.
- [ ] **Step 2:** Note list size, selected goals, active filters, and whether the warning appears on first render, goal toggle, portion change, or category/allergen filter change.
- [ ] **Step 3:** Confirm whether `[rank top10]` calibration logging is still present; remove calibration logs before measuring production list render cost.

### Task 9.2: Smallest rendering fix

- [ ] **Step 1:** Inspect `ResultsPhase` for unstable props passed to every row (`renderItem`, `onPortionChange`, `highlight`, filtered data arrays).
- [ ] **Step 2:** Inspect `MenuItemRow` render cost and decide the smallest useful fix:
  - `React.memo(MenuItemRow)` if props can stay stable enough.
  - `useCallback` for row portion handler only if it reduces row churn.
  - `useMemo` for sorted/filtered visible data only where dependencies are clear.
- [ ] **Step 3:** Avoid new dependencies and avoid speculative list virtualization tuning until row churn is confirmed.

### Task 9.3: Verify

- [ ] **Step 1:** Run `pnpm tsc --noEmit`.
- [ ] **Step 2:** Run `pnpm exec eslint src/ --ext .ts,.tsx`.
- [ ] **Step 3:** Re-test simulator with the same large menu; confirm the warning is gone or materially improved.
- [ ] **Step 4:** Verify portion changes still update only the intended row and ranking/filtering behavior is unchanged.

## Phase 10: Selectable Item Options (variants & add-ons) (2026-06-22)

**Trigger:** Local test of a churrasquería menu. Sections printed as a header followed by indented choices, each with its own weight and price:

```text
RES
SIRLOIN (60gr) $135   PICAÑA (60gr) $140   CHICHARRÓN (80gr) $90
CERDO
BANDIOLA ADOBADA (60gr) $110   CHISTORRA (50gr) $100
```

**Root cause (confirmed in `supabase/functions/analyze-menu/index.ts`):** `EXTRACT_SCHEMA` (item = flat `{name, description, price, category}`) has no slot for selectable options. Stage 1 collapsed each block into one item — e.g. `name:"Res", price:null, description:"Sirloin (650gr) $135, Picaña (650gr) $140, Chicharrón (600gr) $90"`. Stage 2's "prefer printed weights" rule (`ENRICH_PROMPT` step 2) then read the three weights in that description and estimated a single ~650g plate → **P130 / F90 / 1600 cal**, which ranked #2 for "Highest protein". "Cerdo", "Pollo", "Atún" hit the same path (all `price:null`). These are dishes you choose *between*, not a composed plate.

**Goal:** Model selectable options as structured data, enrich each option's nutrition, and render them as selectable pills under the item that update the row's macros live.

> **Status:** NOT STARTED (designed 2026-06-22, awaiting development).

**Design decisions (default — confirm before building):**
- **Two option kinds, modeled separately.** `kind: "choice"` = mutually exclusive (pick one cut/size/protein); its macros *replace* the item's base macros. `kind: "addon"` = additive extra (guacamole, +cheese); its macros *sum* onto the base. Treating both as additive/multi-select would reproduce the 1600-cal bug.
- **Choice items have no standalone macros.** An item that is purely a list of choices (base `price:null`) ranks and displays by its **default option** (first listed). Selecting another choice pill swaps the row's macros; it does **not** re-sort the list — consistent with Phase 5 portion behavior (rows update, ranking is fixed post-enrichment).
- **Add-on items keep their own base macros**; selected add-ons add on top, multi-select.
- **Fix at the source, not by parsing descriptions.** Add an `options` field to the extraction schema so GPT-4o has somewhere to put the choices, rather than regex-splitting the flattened description after the fact.
- **Detection heuristic for options:** The safest signal that a description line contains selectable sub-items is a **price embedded in the description string** — if a sub-item carries its own `$XX` price tag inside the description, it is almost certainly a selectable choice or add-on. Weight alone (`60gr`) is a weaker signal because single-item descriptions routinely include serving weights without implying a choice. Guard: do not confuse the item's own top-level `price` field with a sub-option price — an option price only counts when it appears *inside the description string*. Rule of thumb: description contains `$XX` → emit as options. Description has weight but no embedded price → single item, just annotated weight.
- **Out of scope:** the secondary OCR weight misreads (`60gr`→`650gr`). Tracked in Phase 11.

### File Map

- `supabase/functions/analyze-menu/index.ts` — `EXTRACT_PROMPT` + `EXTRACT_SCHEMA` (add `options`); `ENRICH_PROMPT` + enrichment schemas + `enrichBatch` flow (enrich each option).
- `supabase/functions/analyze-menu/enrich.ts` — `ExtractedItem` / `EnrichedItem` types; `chunk` / `reassembleEnriched` (carry options through).
- `src/app/results.tsx` — pass selected-option state into rows; default-option macros feed ranking input.
- `src/components/results/MenuItemRow.tsx` — render option pills (single-select for `choice`, multi-select for `addon`), live macro recompute.
- `src/store/` — per-item selected-option state (local component state is likely enough; only add a store if it must persist).

### Task 10.1: Extraction — capture options

- [ ] **Step 1:** Add `options` to `EXTRACT_SCHEMA`: array of `{ name: string, price: number|null, kind: "choice"|"addon" }`, defaulting to `[]`.
- [ ] **Step 2:** Update `EXTRACT_PROMPT`: when a heading is followed by sub-choices that each carry their own price/weight (cuts, sizes, proteins to pick), emit ONE item with `kind:"choice"` options — not multiple items, not a flattened description. When the text lists extras/add-ons ("agrega …", "+$X"), emit `kind:"addon"` options. Keep printed weights inside each option's `name` so Stage 2 can read them.
- [ ] **Step 3:** Verify on the churrasquería fixture: "Res" returns one item with three `choice` options, not a comma-joined description.

### Task 10.2: Enrichment — per-option macros

- [ ] **Step 1:** Decide the lazy path: flatten options into the enrichment input as pseudo-items (`name: "Res — Sirloin (60gr)"`) to reuse the existing batch machinery, then map macros back onto each option. (Alternative: add `options[].{protein_g,...}` to the enrich schema — heavier, only if flattening loses context.)
- [ ] **Step 2:** Ensure `reassembleEnriched` keeps options attached and one enriched record per option; choice items derive base macros from the default option.
- [ ] **Step 3:** Verify "Res" no longer produces a 1600-cal blob; each cut has plausible single-serving macros.

### Task 10.3: Client — selectable pills with live macros

- [ ] **Step 1:** Extend client `EnrichedItem` type with `options`.
- [ ] **Step 2:** In `MenuItemRow`, render options as pills below the row: `choice` = single-select (default = first), `addon` = multi-select. Show each option's macro contribution.
- [ ] **Step 3:** Recompute the row's displayed macros from current selection (choice replaces base; add-ons sum) without re-sorting the list.
- [ ] **Step 4:** Feed default-option macros into the ranking input so choice items rank sensibly (not as a null/blob item).

### Task 10.4: Verify

- [ ] **Step 1:** `pnpm tsc --noEmit` and `pnpm exec eslint src/ --ext .ts,.tsx` → no errors.
- [ ] **Step 2:** Re-scan the churrasquería menu: "Res"/"Cerdo"/"Pollo"/"Atún" each render as one item with selectable cut pills; no phantom combined plate in the ranking.
- [ ] **Step 3:** Selecting a different cut updates that row's macros live; the list order does not jump.
- [ ] **Step 4:** An add-on item (if present) shows multi-select extras that add to the base macros.
- [ ] **Step 5:** A normal single-option item (no options) renders exactly as before — no empty pill row.
- [ ] **Step 6:** Test with the **Brasero menu** (same venue as the churrasquería fixture) and the **Palominos menu** (https://grupopalominos.com/menu-rio-sonora-hermosillo/) — two menus with varied option structures to confirm no false-positive option detection on plain items.

---

## Phase 11: OCR Gram Misread Recovery (2026-06-22)

> **Status:** NOT STARTED (designed 2026-06-22, awaiting development).

**Trigger:** During Phase 10 investigation, Stage 1 extracted `60gr` weights from the physical menu but descriptions arrived as `650gr` — e.g. `"Sirloin (650gr) $135"` when the menu printed `"Sirloin (60gr) $135"`. Stage 2's CoT rule "prefer printed weights" anchored on the wrong value, producing a phantom ~1600-cal plate ranked #2.

**Root cause:** OCR/vision model transcription error. Two-digit weights (`60gr`, `80gr`) are misread as three-digit values (`650gr`, `600gr`) when the menu image is small, low-contrast, or the font is condensed.

**Goal:** Detect implausible gram values and give the user a correction path before the enriched macros are locked in.

**Design decisions (confirm before building):**
- **Threshold for "abnormal":** a per-item gram total that exceeds a loose single-serving ceiling (e.g. > 400–500g). Tune with real menus; the goal is to catch `650gr` misreads without flagging a `300g` baby-back rib.
- **User prompt, not silent correction.** When an item's enriched weight looks implausible, show a small inline badge ("This item shows 650g — does that look right?") with a tap-to-edit input. Do not auto-correct; the right value may itself be non-obvious.
- **Correction scope: weight field only.** Re-run Stage 2 CoT for that one item with the corrected weight substituted — do not re-extract the whole menu. Keeps latency low.
- **Out of scope:** non-gram OCR misreads (prices, names); model-level OCR accuracy improvements.

### File Map

- `supabase/functions/analyze-menu/index.ts` — `ENRICH_SCHEMA_*`: add a `serving_g` numeric field so Stage 2 surfaces the raw gram value it used; the client needs it for the plausibility check.
- `src/components/results/MenuItemRow.tsx` — render the "does this weight look right?" inline prompt when `serving_g` exceeds the threshold.
- `src/app/results.tsx` — handle correction event, re-trigger single-item enrichment with corrected weight.

### Task 11.1: Surface gram value from enrichment

- [ ] **Step 1:** Add `serving_g: number | null` to `ENRICH_SCHEMA_OPENAI` and `ENRICH_SCHEMA_GEMINI`; instruct Stage 2 to populate it with the gram value it used for macro estimation.
- [ ] **Step 2:** Propagate `serving_g` through `EnrichedItem` type in `enrich.ts`.

### Task 11.2: Flag and prompt on client

- [ ] **Step 1:** Define `IMPLAUSIBLE_SERVING_G = 500` (constant, easy to tune).
- [ ] **Step 2:** In `MenuItemRow`, when `item.serving_g > IMPLAUSIBLE_SERVING_G`, render a small inline badge with the flagged value and a tap-to-correct input.
- [ ] **Step 3:** On correction submit, re-call the enrichment edge function for that single item with the corrected gram value injected; update the row macros in place without re-sorting.

### Task 11.3: Verify

- [ ] **Step 1:** Re-scan the churrasquería menu (Phase 10 fixture); confirm `650g` items are flagged.
- [ ] **Step 2:** Confirm normal items (`300g` ribs, `180g` salad) are **not** flagged — no false positives.
- [ ] **Step 3:** Correct a flagged item; verify macros update and ranking order is not disturbed.

---

## Test Menu Backlog

Menus to scan during development for regression/feature testing. Add here whenever a new venue is noted.

| Menu | Notes |
|------|-------|
| Churrasquería (Brasero) | Phase 10 fixture — options/choices bug |
| Palominos (https://grupopalominos.com/menu-rio-sonora-hermosillo/) | Phase 10 — varied option structures |
| **Keburros Percherones** | Flagged for testing; no specific phase yet — scan when convenient |
