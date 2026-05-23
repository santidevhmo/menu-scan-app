export const colors = {
  background: "#FFFFFF",
  foreground: "#0A0A0A",
  card: "#F5F5F5",
  muted: "#F5F5F5",
  mutedForeground: "#6B6B6B",
  border: "#E5E5E5",
  accentLime: "#D9F26B",
  accentRose: "#F7C5C0",
  success: "#22C55E",
  danger: "#EF4444",
} as const;

export const fontFamilies = {
  display: {
    regular: "Montserrat_400Regular",
    semibold: "Montserrat_600SemiBold",
    bold: "Montserrat_700Bold",
  },
  sans: {
    regular: "Inter_400Regular",
    medium: "Inter_500Medium",
    semibold: "Inter_600SemiBold",
    bold: "Inter_700Bold",
  },
} as const;

export const typography = {
  display: { fontFamily: fontFamilies.display.bold, fontSize: 32, lineHeight: 38 },
  h1: { fontFamily: fontFamilies.display.bold, fontSize: 26, lineHeight: 32 },
  h2: { fontFamily: fontFamilies.display.semibold, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: fontFamilies.sans.regular, fontSize: 16, lineHeight: 24 },
  subtle: { fontFamily: fontFamilies.sans.regular, fontSize: 14, lineHeight: 20 },
  button: { fontFamily: fontFamilies.sans.semibold, fontSize: 16, lineHeight: 20 },
  caption: { fontFamily: fontFamilies.sans.medium, fontSize: 12, lineHeight: 16 },
} as const;

export const spacing = {
  screenX: 24,
  gridUnit: 4,
} as const;

export const radii = {
  chip: 12,
  card: 16,
  full: 9999,
} as const;

export const theme = { colors, fontFamilies, typography, spacing, radii } as const;
export type Theme = typeof theme;
