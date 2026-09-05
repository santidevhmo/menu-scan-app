import type { ReactNode } from "react";
import { View } from "react-native";

// 40 x 40, 4 px, white, 14 px on the outer corner — measured off `16 · Camera`.
const CORNER = "absolute w-10 h-10 border-white";

/** Draws the corner frame overlay used on top of the live camera preview. */
export function CameraFrame({ children }: { children?: ReactNode }) {
  return (
    <View className="flex-1 relative" pointerEvents="box-none">
      <View
        className={`${CORNER} top-0 left-0 border-t-4 border-l-4 rounded-tl-[14px]`}
        pointerEvents="none"
      />
      <View
        className={`${CORNER} top-0 right-0 border-t-4 border-r-4 rounded-tr-[14px]`}
        pointerEvents="none"
      />
      <View
        className={`${CORNER} bottom-0 left-0 border-b-4 border-l-4 rounded-bl-[14px]`}
        pointerEvents="none"
      />
      <View
        className={`${CORNER} bottom-0 right-0 border-b-4 border-r-4 rounded-br-[14px]`}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}
