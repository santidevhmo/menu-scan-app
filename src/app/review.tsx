import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import { ChevronLeft, Plus } from "lucide-react-native";
import { MAX_SCAN_PHOTOS } from "@/lib/adaptiveExtraction";
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
    <SafeAreaView
      style={{ flex: 1 }}
      edges={["top", "left", "right"]}
      className="bg-background"
    >
      <Stack.Screen options={{ headerShown: false }} />

      <View className="px-6 pt-2 gap-1">
        <View className="flex-row items-center gap-1 -ml-2">
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            className="w-10 h-10 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            {/* The artboard draws a 12 x 20 chevron at a flat 2 px stroke.
                lucide's chevron is 1:2 inside a 24-unit box, so size 40 gives
                10 x 20 and strokeWidth 1.2 renders as 2 px (40 / 24 * 1.2). */}
            <ChevronLeft
              size={40}
              strokeWidth={1.2}
              color={colors.foreground}
            />
          </Pressable>
          <Text className="text-[24px] leading-[30px] tracking-[-0.24px] font-semibold text-foreground">
            Review
          </Text>
        </View>
        <Text className="pl-0.5 text-[13px] leading-[18px] text-muted-foreground">
          {photos.length} of {MAX_SCAN_PHOTOS} pages · one menu, one scan
        </Text>
      </View>

      <View className="flex-1 justify-center overflow-hidden">
        {photos.length === 0 ? (
          <Text className="text-[13px] leading-[18px] text-muted-foreground text-center">
            No photos yet
          </Text>
        ) : (
          <FlatList
            horizontal
            data={photos}
            keyExtractor={(p) => p.id}
            contentContainerStyle={{
              paddingHorizontal: 24,
              gap: 12,
              alignItems: "center",
              flexGrow: 1,
              justifyContent: "center",
            }}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item, index }) => (
              <PhotoThumb
                photo={item}
                page={index + 1}
                onRemove={removePhoto}
              />
            )}
          />
        )}
      </View>

      <View className="px-6 pb-[34px] gap-3">
        <Pressable
          onPress={() => router.back()}
          disabled={photos.length >= MAX_SCAN_PHOTOS}
          className="flex-row items-center justify-center gap-[7px] py-[11px] rounded-full border border-border"
          accessibilityRole="button"
          accessibilityLabel="Add another page"
          accessibilityState={{ disabled: photos.length >= MAX_SCAN_PHOTOS }}
        >
          <Plus size={16} strokeWidth={1.7} color={colors.foreground} />
          <Text className="text-sm leading-[18px] font-semibold text-foreground">
            Add another page
          </Text>
        </Pressable>

        <Pressable
          onPress={handleAnalyze}
          disabled={photos.length === 0 || analyzing}
          className={`items-center justify-center py-4 rounded-full ${
            photos.length === 0 || analyzing ? "bg-muted" : "bg-foreground"
          }`}
          accessibilityRole="button"
          accessibilityLabel="Analyze menu photos"
          accessibilityState={{ disabled: photos.length === 0 || analyzing }}
        >
          <Text
            className={`text-base leading-5 font-semibold ${
              photos.length === 0 || analyzing
                ? "text-muted-foreground"
                : "text-background"
            }`}
          >
            {analyzing ? "Analyzing…" : "Analyze menu"}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
