import { Pressable } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Images } from "lucide-react-native";
import { MAX_SCAN_PHOTOS } from "@/lib/adaptiveExtraction";
import { useScanStore } from "@/store/scan.store";
import { colors } from "@/constants/theme";

/** Creates a short local id for imported photos before persistence exists. */
function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Opens the photo library and adds original images to the scan. */
export function GalleryButton() {
  const photos = useScanStore((s) => s.photos);
  const addPhoto = useScanStore((s) => s.addPhoto);

  /** Requests gallery access and imports every selected image. */
  const handlePress = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsMultipleSelection: true,
      mediaTypes: ["images"],
      quality: 1,
    });
    if (result.canceled) return;

    const remaining = MAX_SCAN_PHOTOS - photos.length;
    if (remaining <= 0) return;

    for (const asset of result.assets.slice(0, remaining)) {
      // ponytail: temp instrumentation (ticket #3) — remove after device verification.
      console.log("[fidelity] picked asset", {
        width: asset.width,
        height: asset.height,
        fileSize: asset.fileSize ?? null,
        mimeType: asset.mimeType ?? null,
        uriExt: asset.uri.split(".").pop(),
      });
      addPhoto({
        id: randomId(),
        uri: asset.uri,
        width: asset.width,
        height: asset.height,
        source: "gallery",
      });
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
