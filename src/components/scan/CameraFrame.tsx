import type { ReactNode } from "react";
import { View } from "react-native";

const CORNER = "w-8 h-8 border-accent-lime";

export function CameraFrame({ children }: { children?: ReactNode }) {
  return (
    <View className="flex-1 relative" pointerEvents="box-none">
      <View
        className={`absolute top-0 left-0 border-t-4 border-l-4 rounded-tl-card ${CORNER}`}
        pointerEvents="none"
      />
      <View
        className={`absolute top-0 right-0 border-t-4 border-r-4 rounded-tr-card ${CORNER}`}
        pointerEvents="none"
      />
      <View
        className={`absolute bottom-0 left-0 border-b-4 border-l-4 rounded-bl-card ${CORNER}`}
        pointerEvents="none"
      />
      <View
        className={`absolute bottom-0 right-0 border-b-4 border-r-4 rounded-br-card ${CORNER}`}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}
