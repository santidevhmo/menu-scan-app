import { Pressable, Text, View } from "react-native";
import { Check } from "lucide-react-native";
import { colors } from "@/constants/theme";

const PHASES = ["Menu OCR", "Nutrition", "Results"];

interface PhaseIndicatorProps {
  current: number;
  canNavigate: (target: number) => boolean;
  onSelect: (target: number) => void;
}

/** Shows the three scan phases and allows navigation to unlocked phases. */
export function PhaseIndicator({
  current,
  canNavigate,
  onSelect,
}: PhaseIndicatorProps) {
  return (
    <View className="flex-row items-center px-6 py-3">
      {PHASES.map((label, i) => {
        const isActive = i === current;
        const isDone = i < current;
        const enabled = canNavigate(i);

        return (
          <View key={label} className="flex-row items-center flex-1">
            <Pressable
              onPress={() => onSelect(i)}
              disabled={!enabled}
              hitSlop={8}
              style={{ opacity: enabled ? 1 : 0.4 }}
              className="flex-row items-center"
              accessibilityRole="button"
              accessibilityState={{ selected: isActive, disabled: !enabled }}
              accessibilityLabel={`Phase ${i + 1}: ${label}`}
            >
              <View
                className={`w-6 h-6 rounded-full items-center justify-center ${
                  isActive
                    ? "bg-foreground"
                    : isDone
                      ? "bg-success"
                      : "bg-muted"
                }`}
              >
                {isDone ? (
                  <Check size={14} color={colors.background} strokeWidth={3} />
                ) : (
                  <Text
                    className={`font-sans text-caption ${
                      isActive ? "text-background" : "text-muted-foreground"
                    }`}
                  >
                    {i + 1}
                  </Text>
                )}
              </View>
              <Text
                numberOfLines={1}
                className={`font-sans text-caption ml-2 ${
                  isActive ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {label}
              </Text>
            </Pressable>
            {i < PHASES.length - 1 && (
              <View className="h-px flex-1 mx-2 bg-border" />
            )}
          </View>
        );
      })}
    </View>
  );
}
