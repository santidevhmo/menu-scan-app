import { Tabs } from "expo-router";

/**
 * Tab layout for the scan and settings screens.
 *
 * The native tab bar is hidden: navigation is the floating nav pill each screen
 * renders itself (DESIGN.md → Controls → Floating nav pill).
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, tabBarStyle: { display: "none" } }}
    >
      <Tabs.Screen name="index" options={{ title: "Scan" }} />
      <Tabs.Screen name="settings" options={{ title: "Settings" }} />
    </Tabs>
  );
}
