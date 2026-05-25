import { useEffect, useRef } from "react";
import { useCameraPermissions as useExpoCameraPermissions } from "expo-camera";

export function useCameraPermissions() {
  const [permission, requestPermission] = useExpoCameraPermissions();
  const requesting = useRef(false);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain && !requesting.current) {
      requesting.current = true;
      requestPermission().finally(() => {
        requesting.current = false;
      });
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
