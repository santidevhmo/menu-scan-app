# GPT-4o-Only OCR + 3-Phase Scan Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **On execution start:** copy this plan to `docs/superpowers/plans/2026-06-13-gpt4o-ocr-phased-flow.md` (the canonical project location) and work from there.

**Goal:** Lock GPT-4o as the sole menu OCR/extraction model (remove the other OCR models), and restructure the post-scan experience into a 3-phase stepped flow (Menu OCR → Nutrition → Results) with a top phase indicator, gated navigation, and a loading state on the OCR phase. Then push the branch and open a PR.

**Architecture:** The Supabase Edge Function keeps two stages. Stage 1 (`stage: "extract"`) is narrowed to GPT-4o only. Stage 2 (enrichment) and ALL provider env vars / Gemini+Mistral *nutritional* code are **left untouched** — a separate plan will resume the enrichment-model comparison. On the client, the multi-provider tabbed results screen becomes a single stepped wizard: one route, local `phase` state, a `PhaseIndicator` header, and gated forward navigation. Phase 1 (OCR) is fully functional; Phases 2 & 3 are scaffolded placeholders that the next plan will wire to real enrichment + sorting.

**Tech Stack:** Expo Router, React Native, TypeScript (strict), NativeWind, Zustand, Supabase Edge Functions (Deno), lucide-react-native.

---

## Context

GPT-4o Vision was selected as the OCR/extraction model after the Stage 1 extraction benchmark (recorded in `AGENTS.md` and `docs/superpowers/plans/2026-06-11-stage1-extraction-benchmark.md`). The benchmark UI ran three OCR providers in parallel (Google Vision, Mistral OCR, GPT-4o) and showed them as tabs over a raw-JSON debug view. Now that GPT-4o is the decision, we remove the other **OCR** processings and present a real product flow instead of a benchmark.

**User constraints (confirmed):**
- Remove only the **non-GPT OCR/extraction** logic. **Do NOT** remove env vars or the Gemini/Mistral **nutritional (enrichment)** processing — those are needed for the next phase (a separate plan continues the enrichment-model comparison).
- Each phase (Menu OCR → Selecting nutritional info → Sorted Results) is a step with a visual indicator at the top showing the current phase.
- Navigation back/forward is allowed only to phases already executed (e.g. while OCR is running you cannot jump to nutritional selection).
- The OCR phase shows the same data it shows today (item count, latency, model id, JSON object) but uses the full screen — the current top model-option tabs have no fixed height and eat vertical space, leaving data crammed into the bottom half. Removing the multi-model tabs and replacing them with a compact fixed-height phase indicator fixes this.

**Out of scope for this PR (next plan):** real Stage 2 enrichment, sorting, MenuItemRow rendering. Phases 2 & 3 are placeholder screens this PR.

---

## File Structure

| File | Change | Responsibility |
|------|--------|----------------|
| `supabase/functions/analyze-menu/index.ts` | Modify | Remove `callGoogleVision`, `callMistralExtract`, and their extract-stage switch cases. Keep everything enrichment-related + all env vars. |
| `src/types/scan.ts` | Modify | Narrow `ExtractionProvider` to `"gpt-vision"`. |
| `src/store/analysis.store.ts` | Rewrite | Replace per-provider record/tabs with a single extraction result + loading flag. |
| `src/app/review.tsx` | Modify | Trigger a single GPT-4o extraction instead of looping all providers. |
| `src/components/results/PhaseIndicator.tsx` | Create | Compact, fixed-height 3-step indicator with gated tap navigation. |
| `src/app/results.tsx` | Rewrite | 3-phase stepped screen; OCR phase functional + full-height; phases 2/3 placeholders. |

**Reused (do not modify):** `src/lib/analyzeMenu.ts` (`extractMenu` already takes an `ExtractionProvider`), `src/constants/theme.ts` (`colors`), `global.css` tokens (`bg-success`, `bg-muted`, `text-danger`, opacity modifiers like `/40` all confirmed present).

---

### Task 1: Narrow the Edge Function OCR stage to GPT-4o only

**Files:**
- Modify: `supabase/functions/analyze-menu/index.ts`

Keep untouched: all four `Deno.env.get(...)` declarations (lines 3–6), `MENU_ITEM_SCHEMA_GEMINI`, `MENU_ITEM_SCHEMA_MISTRAL`, `buildPrompt`, `callGemini`, `callOpenAIChat`, `callGptExtract`, `callMistralOCR` (the **enrichment** Mistral path), and the entire enrichment `switch` (lines 401–430). We only strip the non-GPT **extraction** code.

- [ ] **Step 1: Delete `callGoogleVision`**

Remove the whole function `async function callGoogleVision(photos: string[]) { ... }` (lines 189–218).

- [ ] **Step 2: Delete `callMistralExtract`**

Remove the whole function `async function callMistralExtract(photos: string[]) { ... }` (lines 220–271). (Leave `callMistralOCR` at lines 293–348 — that is enrichment, not extraction.)

- [ ] **Step 3: Reduce the extract-stage switch to gpt-vision only**

In the `if (stage === "extract") { switch (provider) { ... } }` block, replace the switch (currently cases `google-vision`, `mistral-ocr`, `gpt-vision`, `default`) with:

```ts
    if (stage === "extract") {
      if (provider !== "gpt-vision") {
        throw new Error(`Unknown extraction provider: ${provider}`);
      }
      const result = await callGptExtract(photos);
      items = result.items;
      rawResponse = result.raw_response;
      modelId = "gpt-4o";

      return new Response(
        JSON.stringify({ items, raw_response: rawResponse, latency_ms: Date.now() - start, model_id: modelId }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }
```

- [ ] **Step 4: Type-check passes (no client TS covers Deno, so just sanity-read)**

The Edge Function is Deno; the repo `tsc` does not type-check `supabase/functions`. Visually confirm `callGoogleVision` and `callMistralExtract` are gone and no remaining code references them. Confirm `GEMINI_API_KEY`, `MISTRAL_API_KEY`, `GOOGLE_VISION_API_KEY`, `OPENAI_API_KEY` are all still declared.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/analyze-menu/index.ts
git commit -m "feat: restrict menu OCR extraction stage to GPT-4o only"
```

---

### Task 2: Narrow the `ExtractionProvider` type

**Files:**
- Modify: `src/types/scan.ts:67`

- [ ] **Step 1: Narrow the union**

Replace:

```ts
export type ExtractionProvider = "google-vision" | "mistral-ocr" | "gpt-vision";
```

with:

```ts
export type ExtractionProvider = "gpt-vision";
```

Leave `ModelProvider`, `EnrichmentProvider`, `MenuItem`, `EnrichedItem`, `AnalysisResult`, `PipelineStage`, and `ExtractionResult` unchanged — they belong to the enrichment phase.

- [ ] **Step 2: Type-check (will surface fallout in store/screens, fixed in later tasks)**

Run: `npx tsc --noEmit`
Expected: errors only in `src/store/analysis.store.ts`, `src/app/review.tsx`, `src/app/results.tsx` (the multi-provider users). These are resolved in Tasks 3–6. No commit yet — commit after Task 3 so the store compiles.

---

### Task 3: Rewrite the analysis store to a single extraction result

**Files:**
- Rewrite: `src/store/analysis.store.ts`

The tabbed multi-provider machinery (`ALL_PROVIDERS`, `emptyRecord`, per-provider `results`/`loading`, `activeTab`) is obsolete. Replace the whole file with:

```ts
import { create } from "zustand";
import type { ExtractionResult } from "@/types/scan";

interface AnalysisState {
  extraction: ExtractionResult | null;
  extractionLoading: boolean;
  setExtraction: (result: ExtractionResult) => void;
  setExtractionLoading: (loading: boolean) => void;
  clear: () => void;
}

export const useAnalysisStore = create<AnalysisState>((set) => ({
  extraction: null,
  extractionLoading: false,
  setExtraction: (extraction) => set({ extraction }),
  setExtractionLoading: (extractionLoading) => set({ extractionLoading }),
  clear: () => set({ extraction: null, extractionLoading: false }),
}));
```

- [ ] **Step 1: Replace the file contents** with the block above.

- [ ] **Step 2: Type-check** — store file should now be clean; remaining errors only in `review.tsx` and `results.tsx`.

Run: `npx tsc --noEmit`
Expected: errors only in `src/app/review.tsx` and `src/app/results.tsx`.

- [ ] **Step 3: Commit** (types + store together so the store compiles against the new type)

```bash
git add src/types/scan.ts src/store/analysis.store.ts
git commit -m "refactor: collapse analysis store to single GPT-4o extraction result"
```

---

### Task 4: Trigger a single GPT-4o extraction from the review screen

**Files:**
- Modify: `src/app/review.tsx`

- [ ] **Step 1: Update the store import (line 7)**

Replace:

```ts
import { useAnalysisStore, ALL_PROVIDERS } from "@/store/analysis.store";
```

with:

```ts
import { useAnalysisStore } from "@/store/analysis.store";
```

- [ ] **Step 2: Update the store destructure (line 15)**

Replace:

```ts
  const { setResult, setLoading, clear } = useAnalysisStore();
```

with:

```ts
  const { setExtraction, setExtractionLoading, clear } = useAnalysisStore();
```

- [ ] **Step 3: Replace the multi-provider loop in `handleAnalyze` (lines 18–40)**

Replace the whole `handleAnalyze` function with:

```ts
  const handleAnalyze = async () => {
    setAnalyzing(true);
    clear();
    setExtractionLoading(true);
    router.push("/results");

    try {
      const result = await extractMenu(photos, "gpt-vision");
      setExtraction(result);
    } catch (err) {
      setExtraction({
        provider: "gpt-vision",
        items: [],
        latency_ms: 0,
        model_id: "gpt-vision",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setExtractionLoading(false);
      setAnalyzing(false);
    }
  };
```

(The rest of the file — JSX, `analyzing` state, button — is unchanged.)

- [ ] **Step 4: Type-check** — `review.tsx` should now be clean.

Run: `npx tsc --noEmit`
Expected: errors only in `src/app/results.tsx` (rewritten next).

---

### Task 5: Create the `PhaseIndicator` component

**Files:**
- Create: `src/components/results/PhaseIndicator.tsx`

A compact, **fixed-height** horizontal 3-step indicator. Each step is a numbered/checked dot + label. Active = filled foreground; completed = green check; locked = dimmed via inline opacity and non-pressable. This replaces the tall, unbounded model-tabs ScrollView, freeing vertical space for the data.

- [ ] **Step 1: Write the component**

```tsx
import { Pressable, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { colors } from "@/constants/theme";

const PHASES = ["Menu OCR", "Nutrition", "Results"];

interface PhaseIndicatorProps {
  current: number;
  canNavigate: (target: number) => boolean;
  onSelect: (target: number) => void;
}

export function PhaseIndicator({
  current,
  canNavigate,
  onSelect,
}: PhaseIndicatorProps) {
  return (
    <View className="flex-row items-center px-6 py-3">
      {PHASES.map((label, i) => {
        const isActive = i === current;
        const isDone = i < current;
        const enabled = canNavigate(i);
        return (
          <View key={label} className="flex-row items-center flex-1">
            <Pressable
              onPress={() => onSelect(i)}
              disabled={!enabled}
              hitSlop={8}
              style={{ opacity: enabled ? 1 : 0.4 }}
              className="flex-row items-center"
              accessibilityRole="button"
              accessibilityState={{ selected: isActive, disabled: !enabled }}
              accessibilityLabel={`Phase ${i + 1}: ${label}`}
            >
              <View
                className={`w-6 h-6 rounded-full items-center justify-center ${
                  isActive ? "bg-foreground" : isDone ? "bg-success" : "bg-muted"
                }`}
              >
                {isDone ? (
                  <Check size={14} color={colors.background} strokeWidth={3} />
                ) : (
                  <Text
                    className={`font-sans text-caption ${
                      isActive ? "text-background" : "text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                  </Text>
                )}
              </View>
              <Text
                numberOfLines={1}
                className={`font-sans text-caption ml-2 ${
                  isActive ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {label}
              </Text>
            </Pressable>
            {i < PHASES.length - 1 && (
              <View className="h-px flex-1 mx-2 bg-border" />
            )}
          </View>
        );
      })}
    </View>
  );
}
```

- [ ] **Step 2: Type-check** the new file compiles.

Run: `npx tsc --noEmit`
Expected: errors only in `src/app/results.tsx` (rewritten next).

---

### Task 6: Rewrite the results screen as a 3-phase stepped flow

**Files:**
- Rewrite: `src/app/results.tsx`

Phase 0 (OCR) is functional and now uses `flex-1` for the data area (fixing the cramped-bottom-half bug). Phases 1 & 2 are gated placeholders. Navigation rule: phase 0 always reachable; phase 1 reachable once OCR finished without error; phase 2 stays locked until enrichment exists (next plan).

- [ ] **Step 1: Replace the entire file** with:

```tsx
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { colors } from "@/constants/theme";
import { useAnalysisStore } from "@/store/analysis.store";
import { PhaseIndicator } from "@/components/results/PhaseIndicator";
import type { ExtractionResult } from "@/types/scan";

function tryPrettyPrint(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function OcrPhase({
  loading,
  result,
}: {
  loading: boolean;
  result: ExtractionResult | null;
}) {
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color={colors.foreground} />
        <Text className="font-sans text-caption text-muted-foreground mt-3">
          Reading menu with GPT-4o...
        </Text>
      </View>
    );
  }
  if (result?.error) {
    return (
      <View className="flex-1 items-center justify-center px-6">
        <Text className="font-sans text-body text-danger text-center">
          {result.error}
        </Text>
      </View>
    );
  }
  if (!result) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="font-sans text-caption text-muted-foreground">
          No results yet
        </Text>
      </View>
    );
  }
  return (
    <View className="flex-1">
      <View className="px-6 pb-2">
        <Text className="font-sans text-caption text-muted-foreground">
          {result.items.length} items in{" "}
          {(result.latency_ms / 1000).toFixed(1)}s via {result.model_id}
        </Text>
      </View>
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingBottom: 40 }}
      >
        <Text
          selectable
          style={{ fontFamily: "monospace" }}
          className="text-xs text-foreground"
        >
          {result.raw_response
            ? tryPrettyPrint(result.raw_response)
            : JSON.stringify(result.items, null, 2)}
        </Text>
      </ScrollView>
    </View>
  );
}

function PlaceholderPhase({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <View className="flex-1 items-center justify-center px-10">
      <Text className="font-display text-h2 text-foreground text-center">
        {title}
      </Text>
      <Text className="font-sans text-subtle text-muted-foreground text-center mt-2">
        {subtitle}
      </Text>
    </View>
  );
}

export default function ResultsScreen() {
  const { extraction, extractionLoading } = useAnalysisStore();
  const [phase, setPhase] = useState(0);

  const ocrDone = !!extraction && !extraction.error;

  const canNavigate = (target: number) => {
    if (target === 0) return true;
    if (target === 1) return ocrDone;
    return false; // phase 2 unlocks once enrichment exists (next plan)
  };

  const goTo = (target: number) => {
    if (canNavigate(target)) setPhase(target);
  };

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

      {/* Phase indicator */}
      <PhaseIndicator current={phase} canNavigate={canNavigate} onSelect={goTo} />

      {/* Body */}
      <View className="flex-1">
        {phase === 0 && (
          <OcrPhase loading={extractionLoading} result={extraction} />
        )}
        {phase === 1 && (
          <PlaceholderPhase
            title="Selecting nutritional info"
            subtitle="Coming next: GPT-4o estimates calories and macros for each item."
          />
        )}
        {phase === 2 && (
          <PlaceholderPhase
            title="Sorted results"
            subtitle="Coming next: items ranked by your nutritional goals."
          />
        )}
      </View>
    </SafeAreaView>
  );
}
```

- [ ] **Step 2: Full type-check passes**

Run: `npx tsc --noEmit`
Expected: clean (exit 0).

- [ ] **Step 3: Lint passes**

Run: `npm run lint`
Expected: no errors. (Fix any unused-import warnings the rewrite introduced.)

- [ ] **Step 4: Commit**

```bash
git add src/app/review.tsx src/app/results.tsx src/components/results/PhaseIndicator.tsx
git commit -m "feat: 3-phase stepped scan flow with phase indicator and gated nav"
```

---

### Task 7: Deploy the Edge Function and verify end-to-end

**Files:** none (verification task)

- [ ] **Step 1: Deploy the updated Edge Function**

Run: `supabase functions deploy analyze-menu`
Expected: "Deployed Function analyze-menu". (If it prompts for project linking, the secrets/env vars are already configured server-side — do not change them.)

- [ ] **Step 2: Manual E2E in the app**

Run: `npm start` and open the app.
1. Scan/select a menu photo → Review → tap **Analyze Menu**.
2. Verify the **Results** screen shows the phase indicator with **Menu OCR** active, a spinner, and "Reading menu with GPT-4o...".
3. While loading, confirm the **Nutrition** and **Results** steps are dimmed and **not tappable**.
4. When OCR finishes, confirm: the data line ("N items in X.Xs via gpt-4o") and the pretty-printed JSON fill the full screen height (no cramped bottom-half).
5. Confirm the **Nutrition** step is now tappable and shows its placeholder; confirm **Results** step stays locked.
6. Confirm you can navigate back from Nutrition → Menu OCR.
7. Force an error (e.g. airplane mode) and confirm the OCR phase shows the red error text and Nutrition stays locked.

---

### Task 8: Wrap up the Stage 1 plan, then finish the branch via the skill (push + PR to main)

**Files:**
- Modify: `docs/superpowers/plans/2026-06-11-stage1-extraction-benchmark.md` (mark complete)

- [ ] **Step 1: Mark the Stage 1 extraction benchmark plan as complete**

At the top of `docs/superpowers/plans/2026-06-11-stage1-extraction-benchmark.md`, add a short status note recording the outcome:

```markdown
> **STATUS: COMPLETE (2026-06-13).** GPT-4o Vision selected as the sole OCR/extraction model. Other OCR providers (Google Vision, Mistral OCR) removed from the extraction stage. Product flow rebuilt as a 3-phase stepped experience (Menu OCR → Nutrition → Results). Stage 2 enrichment-model comparison continues in a separate plan.
```

- [ ] **Step 2: Commit the doc update**

```bash
git add docs/superpowers/plans/2026-06-11-stage1-extraction-benchmark.md
git commit -m "docs: mark Stage 1 extraction benchmark complete (GPT-4o selected)"
```

- [ ] **Step 3: Confirm `.env` is NOT staged at any point**

Run: `git status --porcelain | grep -E '(^A|^M).*\.env$' || echo "ok: .env not staged"`
Expected: `ok: .env not staged`. (`.env` holds secrets and must stay untracked.)

- [ ] **Step 4: Invoke the `finishing-a-development-branch` skill**

Invoke the **`superpowers:finishing-a-development-branch`** skill (announce: "I'm using the finishing-a-development-branch skill to complete this work.") and follow it:

1. **Verify tests** — this project has no test suite; the gate is `npx tsc --noEmit` (exit 0) and `npm run lint` (no errors), already green from Task 6. State this in place of "tests pass."
2. **Detect environment** — normal repo (`GIT_DIR == GIT_COMMON`), no worktree cleanup.
3. **Base branch** — `main`.
4. **Present options**, then **choose Option 2 (Push and create a Pull Request)** — the goal is to land the OCR extraction work in `main` so the next phase can proceed. (Do NOT pick merge-locally or discard.)

- [ ] **Step 5: Execute Option 2 — push branch + open PR to main**

Per the skill's Option 2 (worktree is preserved; do not clean up):

```bash
git push -u origin feat/stage1-extraction-benchmark

gh pr create --base main --head feat/stage1-extraction-benchmark \
  --title "feat: GPT-4o-only OCR + 3-phase scan flow" \
  --body "$(cat <<'EOF'
## Summary
- Lock GPT-4o Vision as the sole menu OCR/extraction model; remove Google Vision and Mistral OCR from the extraction stage (Stage 1 benchmark outcome).
- Rebuild the post-scan screen into a 3-phase stepped flow (Menu OCR → Nutrition → Results) with a compact top phase indicator and gated forward navigation.
- Fix the OCR screen layout so the data/JSON uses the full screen height (removed the unbounded model-tabs row).
- Add a loading state on the OCR phase while GPT-4o is processing.

## Preserved for the next plan
- All provider env vars and the Gemini/Mistral **nutritional enrichment** code remain in place. Phases 2 & 3 are scaffolded placeholders; the enrichment-model comparison continues in a separate plan.

## Test Plan
- [x] `npx tsc --noEmit` clean
- [x] `npm run lint` clean
- [x] Edge Function `analyze-menu` redeployed
- [ ] Manual E2E: scan → OCR loads with spinner, gated steps, full-height JSON, error path

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: branch pushed; PR URL printed (base `main`). This lands the OCR extraction stage in `main` so the next phase (Stage 2 enrichment) can proceed on a fresh branch.

---

## Verification (full)

1. `npx tsc --noEmit` → exit 0.
2. `npm run lint` → no errors.
3. `supabase functions deploy analyze-menu` → deployed.
4. Manual E2E per Task 7, Step 2 (loading state, gated navigation, full-height OCR data, error path).
5. `git push` + `gh pr create` succeed; PR URL returned; `.env` absent from the diff.

## Notes / Self-review

- **Spec coverage:** OCR→GPT-4o-only (Tasks 1–4) ✓; remove only non-GPT OCR, keep env vars + enrichment (Task 1 explicit) ✓; 3 phases as steps with top indicator (Tasks 5–6) ✓; gated back/forward nav (Task 6 `canNavigate`) ✓; loading state on OCR (Task 6 `OcrPhase`) ✓; same data shown, full-height (Task 6) ✓; top-options height bug fixed by replacing tabs with fixed-height indicator ✓; push + PR as final steps (Task 8) ✓.
- **Type consistency:** `setExtraction`/`setExtractionLoading`/`extraction`/`extractionLoading` names match across store (Task 3), review (Task 4), and results (Task 6). `ExtractionProvider` is `"gpt-vision"` everywhere after Task 2.
- **Preserved deliberately:** `ModelProvider`, `EnrichmentProvider`, `MenuItem`, `EnrichedItem`, `analyzeMenu`, `callGemini`, `callMistralOCR`, `MENU_ITEM_SCHEMA_*`, `MenuItemRow`, all env vars — these are next-phase enrichment assets, not dead code to remove now.
