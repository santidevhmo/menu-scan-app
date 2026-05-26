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
