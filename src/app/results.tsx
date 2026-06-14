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
          {`${result.items.length} items in ${(result.latency_ms / 1000).toFixed(1)}s via ${result.model_id}`}
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
    return false;
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
