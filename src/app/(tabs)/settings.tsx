import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SettingsScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} className="bg-background">
      <View className="flex-1 px-6 pt-4">
        <Text className="font-display text-[26px] leading-8 text-foreground">
          Settings
        </Text>
        <Text className="font-sans text-caption text-muted-foreground mt-2">
          Coming soon
        </Text>
      </View>
    </SafeAreaView>
  );
}
