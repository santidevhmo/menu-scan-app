import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useScanStore } from "@/store/scan.store";
import { useAnalysisStore } from "@/store/analysis.store";
import { extractMenu, enrichMenu } from "@/lib/analyzeMenu";
import { PhotoThumb } from "@/components/review/PhotoThumb";
import { colors } from "@/constants/theme";

/** Review screen for confirming selected menu photos before extraction. */
export default function ReviewScreen() {
  const photos = useScanStore((s) => s.photos);
  const removePhoto = useScanStore((s) => s.removePhoto);
  const {
    setExtraction,
    setExtractionLoading,
    setEnrichment,
    setEnrichmentLoading,
    clear,
  } = useAnalysisStore();
  const [analyzing, setAnalyzing] = useState(false);

  /** Starts GPT-4o Vision extraction and sends the user to results. */
  const handleAnalyze = async () => {
    setAnalyzing(true);
    clear();
    setExtractionLoading(true);
    router.push("/results");

    try {
      const result = await extractMenu(photos, "gpt-vision");
      setExtraction(result);

      // Enrichment is goal-agnostic; run it while the user picks goals.
      if (!result.error && result.items.length > 0) {
        setEnrichmentLoading(true);
        enrichMenu(result.items, "gpt-4o")
          .then(setEnrichment)
          .catch((err) =>
            setEnrichment({
              provider: "gpt-4o",
              items: [],
              latency_ms: 0,
              model_id: "gpt-4o",
              error: err instanceof Error ? err.message : "Unknown error",
            }),
          )
          .finally(() => setEnrichmentLoading(false));
      }
    } catch (err) {
      setExtraction({
        provider: "gpt-vision",
        items: [],
        image_layout: null,
        // The call itself threw, so no page was ever judged. Empty means
        // "no per-page re-scan available", not "every page was fine".
        pages: [],
        latency_ms: 0,
        model_id: "gpt-vision",
        error: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setExtractionLoading(false);
      setAnalyzing(false);
    }
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
          Review
        </Text>
      </View>

      <View className="flex-1 justify-center">
        {photos.length === 0 ? (
          <Text className="font-sans text-caption text-muted-foreground text-center">
            No photos yet
          </Text>
        ) : (
          <FlatList
            horizontal
            data={photos}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{ paddingHorizontal: 24 }}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <PhotoThumb photo={item} onRemove={removePhoto} />
            )}
          />
        )}
      </View>

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
              photos.length === 0 || analyzing
                ? "text-muted-foreground"
                : "text-background"
            }`}
          >
            {analyzing ? "Analyzing..." : "Analyze Menu"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
