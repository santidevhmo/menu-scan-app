import { Pressable, View } from "react-native";
import { Image } from "expo-image";
import { Trash2 } from "lucide-react-native";
import type { ScanPhoto } from "@/types/scan";
import { colors } from "@/constants/theme";

interface Props {
  photo: ScanPhoto;
  onRemove: (id: string) => void;
}

export function PhotoThumb({ photo, onRemove }: Props) {
  return (
    <View className="w-40 h-56 rounded-card overflow-hidden bg-card mr-3">
      <Image
        source={{ uri: photo.uri }}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
      />
      <Pressable
        onPress={() => onRemove(photo.id)}
        hitSlop={10}
        className="absolute top-2 right-2 w-8 h-8 rounded-full bg-background/85 items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel="Remove photo"
      >
        <Trash2 size={16} color={colors.danger} strokeWidth={2} />
      </Pressable>
    </View>
  );
}
