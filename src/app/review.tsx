import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, Stack } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useScanStore } from "@/store/scan.store";
import { PhotoThumb } from "@/components/review/PhotoThumb";
import { colors } from "@/constants/theme";

export default function ReviewScreen() {
  const photos = useScanStore((s) => s.photos);
  const removePhoto = useScanStore((s) => s.removePhoto);

  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-background">
      <Stack.Screen options={{ headerShown: false }} />
      <View className="flex-row items-center px-6 pt-2">
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          className="w-10 h-10 items-center justify-center -ml-2"
        >
          <ChevronLeft size={26} color={colors.foreground} strokeWidth={2} />
        </Pressable>
        <Text className="font-display text-h1 text-foreground ml-1">
          Review
        </Text>
      </View>

      <View className="flex-1 items-center justify-center px-6">
        <Text className="font-sans text-caption text-muted-foreground text-center">
          Nutritional goals — coming next
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
    </SafeAreaView>
  );
}
