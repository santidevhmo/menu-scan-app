import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import type { ScanPhoto } from "@/types/scan";

interface Props {
  photos: ScanPhoto[];
  onPress: () => void;
}

/**
 * The captured pages, as a stack of plates that opens Review.
 *
 * Plate and badge geometry is measured off `16 · Camera`, shifted +1 / +6 so the
 * badge's negative offsets fall inside the box — Android clips what hangs out.
 * The stack lives to the right of the zoom pill inside the viewfinder (Santiago,
 * 2026-09-05) rather than in the bottom-right slot the artboard draws it in:
 * that slot belongs to the gallery button permanently, or importing from the
 * library removes the way back to the library.
 */
export function ThumbStack({ photos, onPress }: Props) {
  if (photos.length === 0) return null;

  const last = photos[photos.length - 1];
  const stacked = photos.length > 1;

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      className="w-[54px] h-[52px] relative"
      accessibilityRole="button"
      accessibilityLabel={`Review ${photos.length} page${stacked ? "s" : ""}`}
    >
      {stacked ? (
        <View className="absolute left-[10px] top-1.5 w-10 h-10 rounded-[11px] bg-white/30" />
      ) : null}
      <View className="absolute left-0.5 top-[10px] w-10 h-10 rounded-[11px] border-2 border-white overflow-hidden">
        <Image
          source={{ uri: last.uri }}
          style={{ width: "100%", height: "100%" }}
          contentFit="cover"
        />
      </View>
      {stacked ? (
        <View className="absolute top-0 right-0 min-w-5 h-5 px-1 rounded-[10px] bg-accent-lime items-center justify-center">
          <Text className="text-[11px] leading-[14px] font-semibold text-foreground">
            {photos.length}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
