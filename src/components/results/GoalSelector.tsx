import { Pressable, Text, View } from "react-native";
import { GOAL_PAIRS } from "@/data/goals";

interface GoalSelectorProps {
  selected: string[];
  onToggle: (goal: string) => void;
}

/** Two-column High/Low multi-select grid of preset nutrition goals. */
export function GoalSelector({ selected, onToggle }: GoalSelectorProps) {
  return (
    <View>
      {GOAL_PAIRS.map((pair) => (
        <View key={pair.group} className="flex-row gap-3 mb-3">
          {[pair.high, pair.low].map((goal) => {
            const isSelected = selected.includes(goal);

            return (
              <Pressable
                key={goal}
                onPress={() => onToggle(goal)}
                className={`flex-1 rounded-card py-4 items-center justify-center ${
                  isSelected ? "bg-foreground" : "bg-card border border-border"
                }`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                accessibilityLabel={goal}
              >
                <Text
                  className={`font-sans text-button ${
                    isSelected ? "text-background" : "text-foreground"
                  }`}
                >
                  {goal}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
