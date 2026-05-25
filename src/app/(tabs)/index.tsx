import { useRef, useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, type CameraView as CameraViewType } from "expo-camera";
import { router } from "expo-router";
import { useCameraPermissions } from "@/hooks/useCameraPermissions";
import { useScanStore } from "@/store/scan.store";
import { compressImage } from "@/lib/compressImage";
import { CameraFrame } from "@/components/scan/CameraFrame";
import { FlashToggle } from "@/components/scan/FlashToggle";
import { ZoomToggle } from "@/components/scan/ZoomToggle";
import { ShutterButton } from "@/components/scan/ShutterButton";
import { GalleryButton } from "@/components/scan/GalleryButton";
import { ThumbStack } from "@/components/scan/ThumbStack";

function randomId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function ScanScreen() {
  const { isGranted, isDenied, isLoading } = useCameraPermissions();
  const photos = useScanStore((s) => s.photos);
  const addPhoto = useScanStore((s) => s.addPhoto);

  const cameraRef = useRef<CameraViewType | null>(null);
  const [flash, setFlash] = useState<"on" | "off">("off");
  const [zoom, setZoom] = useState<1 | 2>(1);
  const [capturing, setCapturing] = useState(false);

  const capture = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
      });
      if (!photo) return;
      const compressed = await compressImage(
        photo.uri,
        photo.width,
        photo.height,
      );
      addPhoto({
        id: randomId(),
        uri: compressed.uri,
        width: compressed.width,
        height: compressed.height,
        source: "camera",
      });
    } catch (err) {
      console.warn("Capture failed", err);
    } finally {
      setCapturing(false);
    }
  };

  if (isLoading) {
    return <View className="flex-1 bg-background" />;
  }

  if (isDenied || !isGranted) {
    return (
      <SafeAreaView style={{ flex: 1 }} className="bg-background">
        <View className="flex-1 px-6 items-center justify-center">
          <Text className="font-display text-h1 text-foreground text-center">
            Camera access needed
          </Text>
          <Text className="font-sans text-body text-muted-foreground text-center mt-3">
            Enable camera access to scan menus.
          </Text>
          <Pressable
            onPress={() => Linking.openSettings()}
            className="mt-8 px-8 py-4 rounded-full bg-foreground"
          >
            <Text className="font-button text-button text-background">
              Open Settings
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const goToReview = () => router.push("/review");
  const zoomProp = (zoom - 1) / 4;

  return (
    <View className="flex-1 bg-foreground">
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing="back"
        flash={flash}
        zoom={zoomProp}
      />
      <SafeAreaView
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        pointerEvents="box-none"
      >
        <View className="flex-1" pointerEvents="box-none">
          <View className="flex-1 px-6 pt-4 pb-6" pointerEvents="box-none">
            <CameraFrame>
              <View className="absolute top-4 right-4" pointerEvents="box-none">
                <FlashToggle
                  value={flash}
                  onToggle={() => setFlash((f) => (f === "on" ? "off" : "on"))}
                />
              </View>
              <View
                className="absolute bottom-4 left-0 right-0 items-center"
                pointerEvents="box-none"
              >
                <ZoomToggle value={zoom} onChange={setZoom} />
              </View>
            </CameraFrame>
          </View>

          <View className="px-6 pb-6">
            <View className="flex-row items-center justify-between">
              <GalleryButton />
              <ShutterButton onPress={capture} disabled={capturing} />
              <ThumbStack photos={photos} onPress={goToReview} />
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
