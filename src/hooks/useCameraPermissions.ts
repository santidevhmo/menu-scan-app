import { useEffect } from "react";
import { useCameraPermissions as useExpoCameraPermissions } from "expo-camera";

export function useCameraPermissions() {
  const [permission, requestPermission] = useExpoCameraPermissions();

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  return {
    permission,
    requestPermission,
    isGranted: !!permission?.granted,
    isDenied: !!permission && !permission.granted && !permission.canAskAgain,
    isLoading: !permission,
  };
}
