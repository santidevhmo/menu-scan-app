import { Pressable, View } from "react-native";

type Props = {
  onPress: () => void;
  disabled?: boolean;
};

export function ShutterButton({ onPress, disabled }: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={12}
      style={({ pressed }) => ({ opacity: pressed || disabled ? 0.7 : 1 })}
      className="w-20 h-20 rounded-full border-4 border-background items-center justify-center"
    >
      <View className="w-16 h-16 rounded-full bg-background" />
    </Pressable>
  );
}
