import { Pressable, Text, View } from "react-native";

type Props = {
  value: 1 | 2;
  onChange: (zoom: 1 | 2) => void;
};

const OPTIONS: (1 | 2)[] = [1, 2];

export function ZoomToggle({ value, onChange }: Props) {
  return (
    <View className="self-center flex-row bg-black/40 rounded-full p-1">
      {OPTIONS.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            hitSlop={8}
            className={`px-4 py-1.5 rounded-full ${active ? "bg-background" : ""}`}
          >
            <Text
              className={`font-button text-sm ${active ? "text-foreground" : "text-background"}`}
            >
              {opt}x
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
