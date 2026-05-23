# Menu Scan — Design System

Canonical UI rules for the app. Source of truth for visual language. Referenced by `AGENTS.md`. When implementing UI, follow this file strictly.

The visual language is Apple-style minimalism, similar to Cal AI: neutral base, near-black primary action, generous whitespace, pill-shaped CTAs.

---

## Palette

Neutral base + sparingly used accents. Use Tailwind/NativeWind utility classes (e.g. `bg-background`, `text-foreground`) wired through `global.css` `@theme`.

| Token              | Hex       | NativeWind class                    | Intent                                      |
| ------------------ | --------- | ----------------------------------- | ------------------------------------------- |
| background         | `#FFFFFF` | `bg-background`                     | Screen background                           |
| foreground         | `#0A0A0A` | `text-foreground` / `bg-foreground` | Primary text, primary button fill           |
| card               | `#F5F5F5` | `bg-card`                           | Unselected option cards, subtle fills      |
| muted              | `#F5F5F5` | `bg-muted`                          | Disabled / inert surfaces                   |
| muted-foreground   | `#6B6B6B` | `text-muted-foreground`             | Secondary text, captions                    |
| border             | `#E5E5E5` | `border-border`                     | Hairline borders on cards / dividers        |
| accent-lime        | `#D9F26B` | `bg-accent-lime`                    | Sparingly: highlight chips, badges          |
| accent-rose        | `#F7C5C0` | `bg-accent-rose`                    | Sparingly: avatar gradients, soft accents   |
| success            | `#22C55E` | `text-success` / `bg-success`       | Positive states                             |
| danger             | `#EF4444` | `text-danger` / `bg-danger`         | Allergen disclaimer, destructive            |

Use accents sparingly. The app should read mostly black-on-white.

---

## Typography

Two families only. **Montserrat** for titles / display. **Inter** for body / UI text. Do not introduce any other font.

| Token     | Family     | Weight       | Size / Line | Usage                                |
| --------- | ---------- | ------------ | ----------- | ------------------------------------ |
| display   | Montserrat | 700 Bold     | 32 / 38     | Onboarding hero, large screen titles |
| h1        | Montserrat | 700 Bold     | 26 / 32     | Screen titles                        |
| h2        | Montserrat | 600 SemiBold | 20 / 26     | Section headers                      |
| body      | Inter      | 400 Regular  | 16 / 24     | Default body copy                    |
| subtle    | Inter      | 400 Regular  | 14 / 20     | Secondary copy, helper text          |
| button    | Inter      | 600 SemiBold | 16 / 20     | Button labels                        |
| caption   | Inter      | 500 Medium   | 12 / 16     | Captions, microcopy, tags            |

NativeWind helpers: `font-display` → Montserrat 700. `font-sans` → Inter 400. Other weights load via `@expo-google-fonts/*` and are referenced by exact family name (e.g. `style={{ fontFamily: "Inter_600SemiBold" }}`) — see `src/constants/theme.ts` `fontFamilies`.

Token object lives at `src/constants/theme.ts` for cases where NativeWind cannot style (per AGENTS.md Style Exception List).

---

## Spacing & Layout

- 4px grid. Use Tailwind defaults (`p-1` = 4px, `p-2` = 8px, …).
- **Screen horizontal padding**: `24px` (`px-6`). Applies to every screen container.
- Vertical rhythm: large gap between hero title and content (`mt-8`).
- **CTA placement**: primary action pinned near the bottom of the screen with safe-area inset. Secondary "Not now" / dismiss appears as a plain text button directly below.
- Avoid shadows. Use the `border-border` hairline for separation.

---

## Radii

| Token  | Value     | Usage                  |
| ------ | --------- | ---------------------- |
| chip   | `12px`    | Small chips, tags      |
| card   | `16px`    | Option cards, panels   |
| full   | `9999px`  | Pill buttons, avatars  |

NativeWind: `rounded-chip` (12), `rounded-card` (16), `rounded-full`.

---

## Component primitives (spec — build on first use)

Do **not** build these eagerly. Implement each only when a screen needs it. Specs live here so the implementation is consistent.

### PrimaryButton
- Full-width, pill (`rounded-full`), `bg-foreground`, label `text-background font-button`.
- Height ~56px (`py-4`), centered label.
- Pinned to bottom of screen with safe-area inset and `mb-2`–`mb-4` breathing room.
- Pressed state: opacity 0.85 (via Pressable; per AGENTS.md, pressed states use inline style).

### SecondaryButton
- Plain text button below `PrimaryButton`. Label `text-muted-foreground font-button`.
- No background, no border. Used for "Not now" / "Skip".

### OptionCard
- `rounded-card`, full-width, generous vertical padding (`py-4`).
- Unselected: `bg-card`, `text-foreground`.
- Selected: `bg-foreground`, `text-background`.
- Optional leading icon (24×24).
- Hairline `border border-border` when unselected; no border when selected.

### ScreenContainer
- `flex-1 bg-background px-6`. Wraps every screen.
- Use `SafeAreaView` from `react-native-safe-area-context` (className not supported per AGENTS.md — use inline `style={{ flex: 1 }}`).

### ScreenHeader
- Back arrow (24×24, `text-foreground`) on the left.
- Optional progress bar centered — thin (`h-1`), `bg-border` track, `bg-foreground` fill.
- Optional right action (text button, `font-button text-foreground`).

### AllergenDisclaimerCard (mandatory per AGENTS.md)
- Shown on results screen when any allergen filter is active.
- `rounded-card`, `border border-danger`, `bg-background`, `p-4`.
- Title `font-button text-danger`. Body `text-subtle text-foreground`.
- Copy: *"AI-estimated. Confirm allergens with restaurant staff before ordering."*
- Non-negotiable. Cannot be removed or hidden.

---

## Iconography

Use a single icon library (TBD on first need — likely `lucide-react-native`). Icons are line-style, 24×24 default, `text-foreground` for active, `text-muted-foreground` for inactive. Confirm library choice with the user before installing.

---

## Styling rules (recap from AGENTS.md)

- NativeWind classes by default.
- `StyleSheet` / inline style only for the exception list (`SafeAreaView`, `KeyboardAvoidingView`, `Modal`, animated values, dynamic styles, platform branches, pressed states, shadows).
- Do not introduce new fonts.
- Do not deviate from the palette without updating this file first.
