import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { ChevronRight } from "lucide-react-native";
import type { ScanPhoto } from "@/types/scan";
import { colors } from "@/constants/theme";

type Props = {
  photos: ScanPhoto[];
  onPress: () => void;
};

export function ThumbStack({ photos, onPress }: Props) {
  if (photos.length === 0) return <View className="w-12 h-12" />;

  const last = photos[photos.length - 1];

  return (
    <Pressable onPress={onPress} hitSlop={8} className="flex-row items-center">
      <View className="relative">
        <View className="w-12 h-12 rounded-chip overflow-hidden border-2 border-background">
          <Image
            source={{ uri: last.uri }}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
          />
        </View>
        {photos.length > 1 ? (
          <View
            style={{ zIndex: 10, elevation: 10 }}
            className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-accent-lime items-center justify-center"
          >
            <Text className="font-button text-[11px] text-foreground">
              {photos.length}
            </Text>
          </View>
        ) : null}
      </View>
      <ChevronRight size={20} color={colors.background} strokeWidth={2} />
    </Pressable>
  );
}
