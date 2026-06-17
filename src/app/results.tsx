import { useState } from "react";
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
import { GoalSelector } from "@/components/results/GoalSelector";
import { MenuItemRow, type MacroMaxes } from "@/components/results/MenuItemRow";
import { PhaseIndicator } from "@/components/results/PhaseIndicator";
import { selectedMacros, sortItemsByGoals } from "@/lib/analyzeMenu";
import type {
  EnrichedItem,
  EnrichmentResult,
  ExtractionResult,
} from "@/types/scan";

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
  onContinue,
}: {
  loading: boolean;
  result: ExtractionResult | null;
  selectedGoals: string[];
  onToggleGoal: (goal: string) => void;
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

/** Computes the menu-relative max for each macro across all items. */
function computeMaxes(items: EnrichedItem[]): MacroMaxes {
  return {
    protein_g: Math.max(0, ...items.map((item) => item.protein_g)),
    carb_g: Math.max(0, ...items.map((item) => item.carb_g)),
    fat_g: Math.max(0, ...items.map((item) => item.fat_g)),
    estimated_calories: Math.max(
      0,
      ...items.map((item) => item.estimated_calories),
    ),
  };
}

/** Phase 1: the goal-ranked list of enriched menu items. */
function ResultsPhase({
  loading,
  result,
  selectedGoals,
}: {
  loading: boolean;
  result: EnrichmentResult | null;
  selectedGoals: string[];
}) {
  const [noticeDismissed, setNoticeDismissed] = useState(false);

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

  const maxValues = computeMaxes(result.items);
  const highlight = selectedMacros(selectedGoals);
  const sorted = sortItemsByGoals(result.items, selectedGoals);
  const lowConfidence =
    result.items.filter((item) => item.confidence === "low").length /
      result.items.length >=
    0.75;

  return (
    <FlatList
      data={sorted}
      keyExtractor={(item, index) => `${item.name}-${index}`}
      contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
      ListHeaderComponent={
        lowConfidence && !noticeDismissed ? (
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
        ) : null
      }
      renderItem={({ item, index }) => (
        <MenuItemRow
          item={item}
          rank={index + 1}
          maxValues={maxValues}
          highlight={highlight}
        />
      )}
    />
  );
}

/** Results screen for reviewing OCR output and downstream placeholder phases. */
export default function ResultsScreen() {
  const { extraction, extractionLoading, enrichment, enrichmentLoading } =
    useAnalysisStore();
  const selectedGoals = useGoalsStore((state) => state.selectedGoals);
  const toggleGoal = useGoalsStore((state) => state.toggleGoal);
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
            onContinue={() => goTo(1)}
          />
        )}
        {phase === 1 && (
          <ResultsPhase
            loading={enrichmentLoading}
            result={enrichment}
            selectedGoals={selectedGoals}
          />
        )}
      </View>
    </SafeAreaView>
  );
}
