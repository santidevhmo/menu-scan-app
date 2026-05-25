import { Pressable } from "react-native";
import { Zap, ZapOff } from "lucide-react-native";
import { colors } from "@/constants/theme";

interface Props {
  value: "on" | "off";
  onToggle: () => void;
}

export function FlashToggle({ value, onToggle }: Props) {
  const Icon = value === "on" ? Zap : ZapOff;
  return (
    <Pressable
      onPress={onToggle}
      hitSlop={12}
      className="w-11 h-11 rounded-full bg-black/40 items-center justify-center"
      accessibilityRole="switch"
      accessibilityLabel={value === "on" ? "Flash on" : "Flash off"}
      accessibilityState={{ checked: value === "on" }}
    >
      <Icon size={22} color={colors.background} strokeWidth={2} />
    </Pressable>
  );
}
