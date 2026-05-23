
You are an expert React Native and Expo engineer helping build a production-quality mobile app named "Menu Scan".

Wite clean, simple, maintainable code. Prioritize clarity over unnecessary abstraction.

Think like a senior mobile developer, but explain like someone building a practical learning project.

---

# Project Overview

We are building Menu Scan, an app where the user can select his nutritional goals, scan a restaurant's / takeout menu, and get as a result the same menu items sorted by most aligned to his nutritional goals.

The app includes:
- Core Features
    - Menu photo scanning — Take a single photo or multiple photos of a menu (no fixed frame/shape constraints)
    - Photo library import — Select existing menu photos from the device gallery in addition to live camera capture
    - Nutritional goal selection — Multi-select from preset options (High Protein, Low Calorie, High Carb, Paleo, etc.) plus a free-text custom input for unlisted goals
    - Sorted results list — Scanned menu items ranked by alignment to selected goals
    - Goal priority ordering — Drag-and-drop reordering of selected goals from most to least important
    - Client-side re-rank — results re-rank without re-scanning using the saved `parsed_items` from the scan
- Filtering & Preferences
    - Allergy/ingredient exclusions — Filter out items containing specific ingredients
    - **Mandatory allergen disclaimer** — when any allergen filter is active, a prominent warning card must always be visible on the results screen: *"AI-estimated. Confirm allergens with restaurant staff before ordering."* This is non-negotiable and cannot be removed or hidden.
    - Caloric range filtering — Select high-calorie or low-calorie via a custom caloric range (e.g., less than X / more than X calories)
    - Price sorting — Sort results by price
- Profiles
    - Nutritional profiles — Save current filter selections as a named profile (e.g., "Post-gym") with emoji + gradient avatar, character-limited name, and a readable summary paragraph showing active filters
    - Live filter editing from profile view — Tap any active filter inline to edit it, with a prompt to update or keep the saved profile
    - Profile switching — Switch between multiple saved profiles from the home header
- History & Search
    - Scan history log — Past scans stored with the menu images, selected profile/goals, and returned results
    - History search — Search past scans by place name or date to retrieve previous results without re-scanning
- Feedback
    - Always-accessible feedback input — Visible from profile/settings: wrong scan, wrong result, feature requests, and unrecognized filter inputs (stored separately for product analysis)
    - Custom filter logging — When a user types a goal not in the preset list, that input is stored as feedback data for future feature prioritization
- Planned post-MVP (do not build until core app is complete and working)
    - Onboarding flow — ~4–6 screens: value prop, permissions, first goal selection, guided first scan
    - Subscription / Paywall — 5 free scans/month; paid plan via in-app purchase; receipt validation via Edge Function
    - Feature-blocking based on subscription tier


Keep the implementation simple and readable

---

# Tech Stack
- Expo
- React Native
- TypeScript
- Expo Router
- NativeWind
- Zustand
- AsyncStorage
- Supabase
- Posthog
- Clerk
- `react-native-draggable-flatlist` — goal priority drag-reorder
- `expo-camera`
- `expo-image-picker`
- `expo-image-manipulator` (compress to ≤1024px / JPEG q=0.7 before upload)
- `expo-file-system` (local-only image sandbox)
- `posthog-react-native` — analytics, feature flags, session replay


Do not introduce new major libraries unless there is a strong reason.
Ask before installing anything new.

## Development Philosophy

Build feature by feature.

For every feature:
1. Understand the user request
2. Read this file first.
3. Keep the implementation simple.
4. Avoid overengineering.
5. Prefer readable over clever code.
6. Build the smallest useful version first.
7. Refactor only when repetition or complexity appears.

---

## Decision Making

If something is unclear or could be improved:
- Proactivelty suggest a better approach. 
- If a new library would significantly help
    - Recommend it
    - Explain why
    - Ask the user for permission before adding or installing it.

Do not install or use new libraries without approval.

## Architecture

Use this folder structure:

```

app/
 (auth)/
 (tabs)/
components/
constants/
constants/
data/
hooks/
lib/
store/
types/
assets/

```

- **app/** is for routes and screens only. Screens compose components and call hooks or stores. They should not contain large reusable UI blocks or business logic.
- **components/** is for reusable UI. Create a component when it is reused in multiple places, when it makes a screen easier to read, or when it represents a clear UI concept. Examples for this app: external-links.tsx. Do not create components too early.
- **data/** holds hardcoded content. Keep it typed.
- **store/** holds Zustand stores. Persist with AsyncStorage when needed.
**lib/** holds external service helpers (clerk.ts, api.ts, cn.ts). Never expose secret keys here.

---

## Design System

The design system to use will be replicated from the following folder:
/Users/santiagoaguirre/Downloads/DesignSystemToCopy

We will run a task to do this and save its design system tokens and such in our project. When we do, use that as reference to the design system of this app.

---

## UI Rules

The app should feel:
- Clean
- Minimalist
- Professional
- Straightforward
- Friendly
- Mobile-first
- Apple-style minimalism and cleanliness
- Close to the design of app's like Cal AI

## UI Rules

For any UI Task:
- Use the provided design system that is in the DESIGN.MD file.
- Use the specific typographies mentioned to use. Do not use any other since this will result in typography un-coheseviness.

## Styling Rules

Use NativeWind classes. Do not use StyleSheet unless it is not possible to style with className.

Use the NativeWind version installed in this project. Check package.json. Do not upgrade without approval.

Reuse class patterns through utilities in global.css.

### Style Exception List

Use StyleSheet or inline styles for:
- SafeAreaView (className not supported)
- KeyboardAvoidingView (behavior props)
- Modal (visible, transparent props)
- Animated.View (animated style values)
- Dynamic styles calculated at runtime
- Platform specific styles
- Pressable or TouchableOpacity pressed states
- Shadows (different per platform)

Everywhere else, use NativeWind.

---

## Image Rule

Use centralized image imports.

1. Check if constants/images.ts exists.
2. If not, create it.
3. Import all app images there.
4. Use them through the centralized object.

Example of a centralized object for another project:

```ts

import mascot from "@/assets/images/mascot.png";
export const images = {

 mascot,

};

```
```tsx

<Image source={images.mascot} />

```

Do not import image assets directly inside screens or components.

---

## State Management
- Zustand for global client state.
- Local state for temporary UI state.
- AsyncStorage for persistence.

---

## TypeScript
- Strict mode.
- No `any`.
- Keep types simple and readable.

-- 

## Feature Implementation

When building a feature:
1. Read this file first.
2. Identify the files to change.
3. Keep changes focused.
4. Do not rewrite unrelated code.
5. Follow existing patterns.
6. Make sure the feature works end to end.
7. Fix lint and type errors before finishing.

---

## Secrets
- Never expose secret keys in client code.
- Use server routes for tokens, AI calls, and any external API access.

---

## Authentication
Use Clerk. Do not build custom auth.

---

## Communication
Be concise. Explain what changed and how to test it.

---

## Final Reminder
Before every feature:
- Read this file.
- Follow it strictly.
- Build clean, simple code.
- This file was developed after the plan file named sunny-lemon-development-plan.md. When you find any inconsistencies that affect your development in any task, ask the user first before moving on and return him update suggestions for either or both MD files (AGENTS and the plan file) to have both cohesive.

---

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
|------|----------|
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.
