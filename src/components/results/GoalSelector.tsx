import { Pressable, Text, View } from "react-native";
import { GOAL_PAIRS } from "@/data/goals";

interface GoalSelectorProps {
  selected: string[];
  onToggle: (goal: string) => void;
}

/**
 * One row per macro, each carrying a High / Low segmented control.
 *
 * Measured off `3 · Goals`. The row label owns the remaining width and the
 * control is a fixed 133 px lane, so the four rows share one vertical lane
 * whatever the label says in any language.
 */
export function GoalSelector({ selected, onToggle }: GoalSelectorProps) {
  return (
    <View>
      {GOAL_PAIRS.map((pair) => (
        <View
          key={pair.group}
          className="flex-row items-center gap-3 py-2 self-stretch"
        >
          <Text className="flex-1 text-base leading-5 font-medium text-foreground">
            {pair.group}
          </Text>
          <View className="flex-row items-center gap-[3px] p-[3px] rounded-full bg-muted shrink-0">
            {[
              { goal: pair.high, label: "High" },
              { goal: pair.low, label: "Low" },
            ].map(({ goal, label }) => {
              const isSelected = selected.includes(goal);
              return (
                <Pressable
                  key={goal}
                  onPress={() => onToggle(goal)}
                  className={`w-[62px] h-[30px] items-center justify-center rounded-full ${
                    isSelected ? "bg-foreground" : ""
                  }`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={goal}
                >
                  <Text
                    className={`text-[13px] leading-4 ${
                      isSelected
                        ? "font-semibold text-background"
                        : "font-medium text-muted-foreground"
                    }`}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}
