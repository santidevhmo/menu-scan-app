import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { X } from "lucide-react-native";
import type { ScanPhoto } from "@/types/scan";
import { colors } from "@/constants/theme";

interface Props {
  photo: ScanPhoto;
  page: number;
  onRemove: (id: string) => void;
}

/** One page in the review filmstrip, measured off `2b · Review`. */
export function PhotoThumb({ photo, page, onRemove }: Props) {
  return (
    <View className="w-[260px] h-[364px] rounded-[14px] overflow-hidden bg-[#DDDDDD]">
      <Image
        source={{ uri: photo.uri }}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
      />
      <Pressable
        onPress={() => onRemove(photo.id)}
        hitSlop={10}
        className="absolute top-2 right-2 w-8 h-8 rounded-2xl bg-white/90 items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel={`Remove page ${page}`}
      >
        <X size={16} color={colors.foreground} strokeWidth={2} />
      </Pressable>
      <View className="absolute bottom-2 left-2 py-[3px] px-2 rounded-md bg-white/90">
        <Text className="text-[11px] leading-[14px] font-semibold text-foreground">
          Page {page}
        </Text>
      </View>
    </View>
  );
}
