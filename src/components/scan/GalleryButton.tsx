import { Pressable } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Images } from "lucide-react-native";
import { compressImage } from "@/lib/compressImage";
import { useScanStore } from "@/store/scan.store";
import { colors } from "@/constants/theme";

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function GalleryButton() {
  const addPhoto = useScanStore((s) => s.addPhoto);

  const handlePress = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      quality: 1,
    });
    if (result.canceled) return;

    for (const asset of result.assets) {
      try {
        const compressed = await compressImage(
          asset.uri,
          asset.width,
          asset.height,
        );
        addPhoto({
          id: randomId(),
          uri: compressed.uri,
          width: compressed.width,
          height: compressed.height,
          source: "gallery",
        });
      } catch (err) {
        console.warn("Failed to import asset", err);
      }
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      hitSlop={12}
      className="w-12 h-12 rounded-full bg-black/40 items-center justify-center"
      accessibilityRole="button"
      accessibilityLabel="Import photos from gallery"
    >
      <Images size={22} color={colors.background} strokeWidth={2} />
    </Pressable>
  );
}
