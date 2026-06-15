import { useState } from "react";
import {
  ActivityIndicator,
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
import { PhaseIndicator } from "@/components/results/PhaseIndicator";
import type { ExtractionResult } from "@/types/scan";

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
          accessibilityLabel="Continue to nutrition"
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

/** Renders a placeholder for downstream phases that are not built yet. */
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

/** Results screen for reviewing OCR output and downstream placeholder phases. */
export default function ResultsScreen() {
  const { extraction, extractionLoading } = useAnalysisStore();
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
