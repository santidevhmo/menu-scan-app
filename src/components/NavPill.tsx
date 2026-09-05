import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import { Camera, Settings } from "lucide-react-native";
import { colors } from "@/constants/theme";

type Item = {
  label: string;
  href: "/" | "/settings";
  Icon: typeof Camera;
};

const ITEMS: Item[] = [
  { label: "Scan", href: "/", Icon: Camera },
  { label: "Settings", href: "/settings", Icon: Settings },
];

/**
 * Space the floating pill occupies at the bottom of a screen: its own offset,
 * its 62 px height, and the 4 px the artboard leaves above it.
 */
export function useNavPillClearance() {
  return usePillBottom() + 62 + 4;
}

/** ponytail: the artboard sits the pill 22 px off a canvas that draws no home
 * indicator, so 22 is a floor, not a measurement of the device inset. */
function usePillBottom() {
  return Math.max(useSafeAreaInsets().bottom, 22);
}

/**
 * The app's floating navigation pill.
 *
 * DESIGN.md → Controls → Floating nav pill. It is the only surface in the app
 * that carries a shadow (rule narrowed by Santiago 2026-09-05: a surface the
 * content scrolls under may have one, a static surface may not).
 */
export function NavPill() {
  const pathname = usePathname();
  const bottom = usePillBottom();

  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", left: 0, right: 0, bottom }}
      className="items-center"
    >
      <View
        style={{ boxShadow: "0px 6px 20px rgba(10, 10, 10, 0.10)" }}
        className="flex-row items-center gap-1.5 p-1.5 rounded-full bg-background border border-border"
      >
        {ITEMS.map(({ label, href, Icon }) => {
          // Results is downstream of Scan, so anything that is not Settings
          // leaves Scan lit — as `18 · Results` draws it.
          const active = (pathname === "/settings") === (href === "/settings");
          return (
            <Pressable
              key={href}
              onPress={() => router.navigate(href)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
              className={`items-center gap-0.5 py-1.5 px-5 rounded-full ${
                active ? "bg-muted" : ""
              }`}
            >
              <Icon
                size={20}
                strokeWidth={2}
                color={active ? colors.foreground : colors.mutedForeground}
              />
              <Text
                className={`text-[11px] leading-[14px] ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
