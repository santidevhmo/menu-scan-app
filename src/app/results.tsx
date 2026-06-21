import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { colors } from "@/constants/theme";
import { useAnalysisStore } from "@/store/analysis.store";
import { useGoalsStore } from "@/store/goals.store";
import { useAllergensStore } from "@/store/allergens.store";
import { AllergenSelector } from "@/components/results/AllergenSelector";
import { GoalSelector } from "@/components/results/GoalSelector";
import { MenuItemRow } from "@/components/results/MenuItemRow";
import { PhaseIndicator } from "@/components/results/PhaseIndicator";
import { selectedMacros, sortItemsByGoals } from "@/lib/analyzeMenu";
import { squashZScore } from "@/lib/zScoreSort";
import type {
  EnrichmentResult,
  ExtractionResult,
  ScoredItem,
} from "@/types/scan";

type ScoredResultItem = ScoredItem & { sourceIndex: number };

/** Pretty-prints JSON strings while leaving non-JSON OCR text unchanged. */
function tryPrettyPrint(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

/** Shows OCR progress and keeps raw output behind a debug toggle. */
function OcrStatus({
  loading,
  result,
}: {
  loading: boolean;
  result: ExtractionResult | null;
}) {
  const [showRaw, setShowRaw] = useState(false);

  if (loading) {
    return (
      <View className="flex-row items-center">
        <ActivityIndicator size="small" color={colors.foreground} />
        <Text className="font-sans text-caption text-muted-foreground ml-2">
          Reading menu with GPT-4o...
        </Text>
      </View>
    );
  }

  if (result?.error) {
    return (
      <Text className="font-sans text-subtle text-danger">{result.error}</Text>
    );
  }

  if (!result) return null;

  return (
    <View>
      <View className="flex-row items-center justify-between">
        <Text className="font-sans text-caption text-muted-foreground">
          {`Menu read ✓ · ${result.items.length} items in ${(result.latency_ms / 1000).toFixed(1)}s`}
        </Text>
        <Pressable
          onPress={() => setShowRaw((value) => !value)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Toggle raw OCR output"
        >
          <Text className="font-sans text-caption text-muted-foreground underline">
            {showRaw ? "Hide raw" : "Show raw"}
          </Text>
        </Pressable>
      </View>
      {showRaw && (
        <Text
          selectable
          style={{ fontFamily: "monospace" }}
          className="text-xs text-foreground mt-2"
        >
          {result.raw_response
            ? tryPrettyPrint(result.raw_response)
            : JSON.stringify(result.items, null, 2)}
        </Text>
      )}
    </View>
  );
}

/** Renders goal selection while OCR continues in the background. */
function GoalsPhase({
  loading,
  result,
  selectedGoals,
  onToggleGoal,
  selectedAllergens,
  onToggleAllergen,
  onContinue,
}: {
  loading: boolean;
  result: ExtractionResult | null;
  selectedGoals: string[];
  onToggleGoal: (goal: string) => void;
  selectedAllergens: string[];
  onToggleAllergen: (allergen: string) => void;
  onContinue: () => void;
}) {
  const ocrDone = !!result && !result.error;
  const canContinue = ocrDone && selectedGoals.length > 0;

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 24, paddingBottom: 24 }}
      >
        <OcrStatus loading={loading} result={result} />
        <Text className="font-display text-h2 text-foreground mt-6 mb-3">
          Your goals
        </Text>
        <GoalSelector selected={selectedGoals} onToggle={onToggleGoal} />
        <Text className="font-display text-h2 text-foreground mt-6 mb-2">
          Allergens
        </Text>
        <Text className="font-sans text-subtle text-muted-foreground mb-3">
          Optional. We&apos;ll hide menu items containing anything you select.
        </Text>
        <AllergenSelector
          selected={selectedAllergens}
          onToggle={onToggleAllergen}
        />
      </ScrollView>

      <View className="px-6 pb-4">
        <Pressable
          onPress={onContinue}
          disabled={!canContinue}
          className={`w-full items-center justify-center py-4 rounded-full ${
            canContinue ? "bg-foreground" : "bg-muted"
          }`}
          accessibilityRole="button"
          accessibilityLabel="Continue to results"
          accessibilityState={{ disabled: !canContinue }}
        >
          <Text
            className={`font-sans text-button ${
              canContinue ? "text-background" : "text-muted-foreground"
            }`}
          >
            {loading ? "Reading menu..." : "Continue"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Phase 1: the goal-ranked list of enriched menu items. */
function ResultsPhase({
  loading,
  result,
  selectedGoals,
  selectedAllergens,
}: {
  loading: boolean;
  result: EnrichmentResult | null;
  selectedGoals: string[];
  selectedAllergens: string[];
}) {
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const [revealHidden, setRevealHidden] = useState(false);
  const [portions, setPortions] = useState<Record<number, number>>({});
  const hasAllergenFilter = selectedAllergens.length > 0;
  const sorted: ScoredResultItem[] = useMemo(() => {
    if (!result || result.error) return [];
    const withIndex = result.items.map((item, sourceIndex) => ({
      ...item,
      sourceIndex,
    }));
    const itemMatchesAllergen = (item: { allergens: string[] }) =>
      hasAllergenFilter &&
      item.allergens.some((allergen) => selectedAllergens.includes(allergen));
    const active =
      hasAllergenFilter && !revealHidden
        ? withIndex.filter((item) => !itemMatchesAllergen(item))
        : withIndex;

    return sortItemsByGoals(active, selectedGoals);
  }, [
    result,
    selectedGoals,
    selectedAllergens,
    hasAllergenFilter,
    revealHidden,
  ]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset stale per-result UI state for a new scan result
    setPortions({});
    setRevealHidden(false);
  }, [result]);

  useEffect(() => {
    if (!__DEV__ || !result || result.error || result.items.length === 0)
      return;

    console.log(
      JSON.stringify(
        {
          selected_goals: selectedGoals,
          total_items: sorted.length,
          items: sorted.map((item, index) => ({
            rank: index + 1,
            name: item.name,
            macros: {
              protein_g: item.protein_g,
              carb_g: item.carb_g,
              fat_g: item.fat_g,
              estimated_calories: item.estimated_calories,
            },
            alignment_score: item.alignment_score,
            display_score: squashZScore(item.alignment_score),
            goal_scores: item.goal_scores,
            allergens: item.allergens,
          })),
        },
        null,
        2,
      ),
    );
    console.log(
      "[rank top10]\n" +
        sorted
          .slice(0, 10)
          .map(
            (item, index) =>
              `${String(index + 1).padStart(2)}. ${item.name} ` +
              `P${item.protein_g} C${item.carb_g} F${item.fat_g} ` +
              `cal${item.estimated_calories} score=${item.alignment_score.toFixed(2)}`,
          )
          .join("\n"),
    );
    console.log(
      "[allergens top10]\n" +
        sorted
          .slice(0, 10)
          .map(
            (item, index) =>
              `${String(index + 1).padStart(2)}. ${item.name}: ${
                item.allergens.length > 0 ? item.allergens.join(", ") : "none"
              }`,
          )
          .join("\n"),
    );
  }, [result, selectedGoals, sorted]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center px-10">
        <ActivityIndicator size="large" color={colors.foreground} />
        <Text className="font-sans text-caption text-muted-foreground mt-3 text-center">
          Enriching menu items...
        </Text>
      </View>
    );
  }

  if (!result) {
    return (
      <View className="flex-1 items-center justify-center px-10">
        <Text className="font-sans text-subtle text-muted-foreground text-center">
          No items to rank.
        </Text>
      </View>
    );
  }

  if (result.error) {
    return (
      <View className="flex-1 items-center justify-center px-10">
        <Text className="font-sans text-body text-danger text-center">
          {result.error}
        </Text>
      </View>
    );
  }

  if (result.items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center px-10">
        <Text className="font-sans text-subtle text-muted-foreground text-center">
          No items to rank.
        </Text>
      </View>
    );
  }

  const highlight = selectedMacros(selectedGoals);
  const lowConfidence =
    result.items.filter((item) => item.confidence === "low").length /
      result.items.length >=
    0.75;
  const matchesAllergen = (item: { allergens: string[] }) =>
    item.allergens.some((allergen) => selectedAllergens.includes(allergen));
  const hiddenCount = hasAllergenFilter
    ? result.items.filter(matchesAllergen).length
    : 0;

  return (
    <FlatList
      data={sorted}
      keyExtractor={(item) => String(item.sourceIndex)}
      contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
      ListHeaderComponent={
        <>
          {hasAllergenFilter && (
            <View className="rounded-card border border-border bg-card p-4 mb-3">
              <Text className="font-sans text-body text-danger">
                AI-estimated. Confirm allergens with restaurant staff before
                ordering.
              </Text>
            </View>
          )}
          {hiddenCount > 0 && (
            <Pressable
              onPress={() => setRevealHidden((value) => !value)}
              className="rounded-card border border-border bg-card p-4 mb-3"
              accessibilityRole="button"
              accessibilityLabel={
                revealHidden
                  ? "Hide allergen items"
                  : "Show hidden allergen items"
              }
            >
              <Text className="font-sans text-body text-foreground">
                {revealHidden
                  ? `Showing ${hiddenCount} hidden ${
                      hiddenCount === 1 ? "item" : "items"
                    } · Hide`
                  : `${hiddenCount} ${
                      hiddenCount === 1 ? "item" : "items"
                    } hidden due to allergens · Show anyway`}
              </Text>
            </Pressable>
          )}
          {lowConfidence && !noticeDismissed ? (
            <Pressable
              onPress={() => setNoticeDismissed(true)}
              className="rounded-card border border-border bg-card p-4 mb-3"
              accessibilityRole="button"
              accessibilityLabel="Dismiss low-confidence notice"
            >
              <Text className="font-sans text-body text-foreground">
                Descriptions on this menu are light on details.
              </Text>
              <Text className="font-sans text-subtle text-muted-foreground mt-1">
                Nutritional estimates are rough because the menu does not list
                ingredients. For confident choices, ask your waiter. Tap to
                dismiss.
              </Text>
            </Pressable>
          ) : null}
        </>
      }
      renderItem={({ item, index }) => {
        const id = item.sourceIndex;

        return (
          <MenuItemRow
            item={item}
            rank={index + 1}
            highlight={highlight}
            portion={portions[id] ?? 1}
            showAllergens={hasAllergenFilter}
            onPortionChange={(portion) =>
              setPortions((prev) => ({ ...prev, [id]: portion }))
            }
          />
        );
      }}
    />
  );
}

/** Results screen for reviewing OCR output and downstream placeholder phases. */
export default function ResultsScreen() {
  const { extraction, extractionLoading, enrichment, enrichmentLoading } =
    useAnalysisStore();
  const selectedGoals = useGoalsStore((state) => state.selectedGoals);
  const toggleGoal = useGoalsStore((state) => state.toggleGoal);
  const selectedAllergens = useAllergensStore(
    (state) => state.selectedAllergens,
  );
  const toggleAllergen = useAllergensStore((state) => state.toggleAllergen);
  const [phase, setPhase] = useState(0);

  const ocrDone = !!extraction && !extraction.error;

  const canNavigate = (target: number) => {
    if (target === 0) return true;
    return ocrDone && selectedGoals.length > 0;
  };

  const goTo = (target: number) => {
    if (canNavigate(target)) setPhase(target);
  };

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-background">
      <Stack.Screen options={{ headerShown: false }} />

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
        <Text className="font-display text-h1 text-foreground ml-1">
          Results
        </Text>
      </View>

      <PhaseIndicator
        current={phase}
        canNavigate={canNavigate}
        onSelect={goTo}
      />

      <View className="flex-1">
        {phase === 0 && (
          <GoalsPhase
            loading={extractionLoading}
            result={extraction}
            selectedGoals={selectedGoals}
            onToggleGoal={toggleGoal}
            selectedAllergens={selectedAllergens}
            onToggleAllergen={toggleAllergen}
            onContinue={() => goTo(1)}
          />
        )}
        {phase === 1 && (
          <ResultsPhase
            loading={enrichmentLoading}
            result={enrichment}
            selectedGoals={selectedGoals}
            selectedAllergens={selectedAllergens}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
