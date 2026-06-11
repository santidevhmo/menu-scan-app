import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useScanStore } from "@/store/scan.store";
import { useAnalysisStore, ALL_PROVIDERS } from "@/store/analysis.store";
import { extractMenu } from "@/lib/analyzeMenu";
import { PhotoThumb } from "@/components/review/PhotoThumb";
import { colors } from "@/constants/theme";

export default function ReviewScreen() {
  const photos = useScanStore((s) => s.photos);
  const removePhoto = useScanStore((s) => s.removePhoto);
  const { setResult, setLoading, clear } = useAnalysisStore();
  const [analyzing, setAnalyzing] = useState(false);

  const handleAnalyze = async () => {
    setAnalyzing(true);
    clear();
    router.push("/results");

    ALL_PROVIDERS.forEach(async (provider) => {
      setLoading(provider, true);
      try {
        const result = await extractMenu(photos, provider);
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
