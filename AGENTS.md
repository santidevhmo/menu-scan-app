
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
    - Nutritional goal selection — Multi-select from preset options (High Protein, Low Calorie, High Carb, Paleo, etc.). Free-text custom input is a fast-follow until feedback/analytics infrastructure is integrated.
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
    - Custom filter logging — Fast-follow: when a user types a goal not in the preset list, store that input as feedback data for future feature prioritization after feedback infrastructure is integrated.
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
- `expo-image-manipulator` (phase-1 uploads passthrough originals ≤6.75MB; 2048px/JPEG q0.95 fallback for oversized — ticket #3, 2026-07-12; dense tiles cut from originals)
- `expo-file-system` (local-only image sandbox)
- `posthog-react-native` — analytics, feature flags, session replay

## OCR / Extraction Model Decision

**The pipeline (deployed).** A scan runs three model calls:

| Stage | Model | Job |
|---|---|---|
| 1a | `mistral-ocr-4-0` | photo → page `markdown` (transcription only) |
| 1b | `gpt-4.1-2025-04-14` | markdown → menu schema, via `EXTRACT_PROMPT`/`EXTRACT_SCHEMA` |
| 2 | GPT-4o | items → per-macro grams, calories, allergens |

Stage 1 is deliberately split: transcription and structuring fail in different ways, and
separating them lets each be pinned and measured on its own. Both live in
`supabase/functions/analyze-menu/`.

**Always pin models to a dated snapshot, never an alias.** `mistral-ocr-latest` silently
became a different model mid-project and invalidated a week of measurements — an alias can
be substituted under you with no changelog, which makes every gate you ran meaningless.
A pin removes vendor substitution; it does NOT remove sampling variance, so a passing
single run still proves nothing.

**Cost per scan:** ~$0.015–0.05 extraction + ~$0.03 enrichment. Re-baseline after any
model or prompt change rather than quoting these figures forward.

**Keep every model API call inside the Supabase Edge Function.** Never expose provider
keys in client code. The client sends photos and receives items; it never talks to a model
vendor directly.

**Extraction quality is eval-gated, and the gate has rules:**
- `scripts/fixtures/*.expected.json` and `scripts/fixtures/drafts/*` are **ORACLE files** —
  the recorded truth of what each menu actually prints. Never edit one without an explicit
  ruling from Santiago made from the photo. Never run `deno fmt` over a glob that can reach
  `scripts/fixtures/`.
- **Never quote a single run as quality — report the range across runs.** The structuring
  model returns a different but equally valid item list each call.
- **Archive raw model responses on every paid run, including passing ones.** A run you
  cannot re-read is a run you have to pay for twice.
- A numeric score is never sufficient on its own: also audit the raw output against the
  menu photo for invented or unprinted items.

**Where to start:** `docs/superpowers/START-HERE.md` — the entry point for any new session. It
contains no status (status drifts); it routes you to the two roadmaps, which are nested:
**`docs/sunny-lemon-development-plan.md`** is the PRODUCT roadmap (16 phases, bootstrap → launch),
and the OCR extraction roadmap below is **one workstream inside its Phase 9**. Do not use
`docs/superpowers/horizontal-menus/` as an entry point — that phase is closed.

**Where status lives:** `docs/superpowers/extraction-iteration-ledger.md` (every experiment,
newest last) and `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md`
(phases, release scope, and the lessons learned from real mistakes made in this codebase).
Read those for current state — do not restate status in this file, it drifts.

**Stage 2 enrichment** produces `protein_g`, `carb_g`, `fat_g` and `estimated_calories`, and retains
per-item `allergens` so the mandatory allergen disclaimer keeps working.

⚠️ **The model does NOT compute the macro totals — the code does.** This is the single most
important thing to know before editing `enrich.ts`, and it is measured, not stylistic. The model
returns *knowledge*: `printed_total_g`, and per ingredient a `within_printed_weight` flag, a
conventional `typical_serving_g`, and `*_per_100g` composition. Then `resolveGrams` fits the
inside-the-printed-weight servings to that weight and `sumIngredientMacros` multiplies composition ×
grams, sums, and derives calories by Atwater (4/4/9). Every time arithmetic was taken away from the
model and left as knowledge, accuracy improved; every time it was asked for a finished number, it
returned a round multiple of 5. **Do not "simplify" this by asking the model for the totals.**

**The ingredient rule (Santiago, 2026-08-11) — the description is the source of truth above all
else.** The NAME says what the dish *is*; the DESCRIPTION says what that dish exactly has.

| the menu gives | what to do |
|---|---|
| a description listing ingredients | **use exactly those — add none, remove none.** This is the source of truth. |
| a name whose dish form requires components the menu never lists (a roll's rice and nori, a burger's bun, a taco's tortilla, a pizza's dough) | add ONLY those constitutive components — this is `name_implied_components` (B15), a measured win |
| nothing else | **never invent.** No sesame, mayo or eel sauce that the menu did not mention. |

Worked example, the case that settled it: *Salmón Roll — "Por dentro: queso crema, pepino, aguacate
y surimi. Por fuera: salmón."* Those five are used exactly as printed. Rice and nori are added
because a roll cannot exist without them, and the menu never lists them — they are 150 g and 42 of
the dish's 54 g of carbs, and an independent cross-check put the result at ~592 kcal, matching.
Nothing else may be added.

Two mechanical guards in `enrich_test.ts` fail the build: **schema property order** (`ingredients[]`
must precede the macro fields, or the chain-of-thought silently stops working) and **no food, dish
or cuisine name in the prompt's nutrition step** (measured harmful — a food list leaked the test set
into a prompt that ships to every menu on earth).

**The portion rule — a printed weight decides WHICH question to ask (measured 2026-08-13).** These
two are not interchangeable and each is wrong in the other's place:

| the item | ask for | why |
|---|---|---|
| **prints a weight** | each ingredient's **standard reference amount** (B21 / 21 CFR 101.12 RACC) | `resolveGrams` pins the total from the printed weight, so only the PROPORTIONS matter. This is what took the weighted score to ~96% |
| **prints no weight** | the amount **actually present in one order as served** | nothing pins the total, so the same numbers set the dish's WEIGHT too — and reference servings assemble a dish that is far too lean per gram |

Worked example: a 28 cm pizza built from reference servings is 1.81 kcal/g where a real one is
~2.4–2.75, because 30 g is a standalone serving of cheese and not the amount on a pie. **Correcting
the total cannot fix this** — rescaling preserves proportions, so at the very top of the pizza's
verified weight band it is still 26% low on calories. Measured: 28/72 → **37/72** on the unweighted
oracle (Arm P; it read 38/72 before the pizza's band was corrected on 2026-08-16). Do NOT ask an
unweighted item for a plate total instead; that family of arms is retired (see the roadmap's
`🎯 CURRENT PHASE`).

⚠️ **THE THIRD CASE, and it is a DEFECT rather than a rule — an ingredient served ALONGSIDE the item.**
`resolveGrams` never rescales anything marked `within_printed_weight: false`, so a reference serving
reaches the plate untouched — and for a spooned sauce the reference serving is USDA's **30 g dipping
container** rather than the ~15 g actually served. It affects **24% of weighted items** and is
**12–20% of those dishes' calories**. Unfixed as of 2026-08-16; prose and a duplicate schema field
have both failed at it. ⚠️ **Do not fix the weight alone** — chimichurri is 2× too heavy AND ~3× too
lean, the two errors currently cancel, and halving the grams makes the dish worse.

**WORDING DOES NOT WORK HERE. SCHEMA FORCE DOES. (measured, 2026-08-16 — scoreboard, not a rule.)**
Before designing any change to Stage 2, weigh this: **a new sentence in `ENRICH_PROMPT` is 0 for 6;
a new REQUIRED FIELD in `ENRICH_SCHEMA_OPENAI` is 6 for 8.**

| approach | record | cases |
|---|---|---|
| ask in prose | **0 for 6** | B11, B13, B23, two `serving_pieces` wordings, Arm S, **Arm P-inline** |
| force a required field | **6 for 8** | B4 `printed_total_g`, B15 `name_implied_components`, forced `serving_pieces`, B24b, Arm S2 |

The cleanest demonstration: two prompt wordings asked for a conventional piece count and both returned
`null`; making the field required and non-nullable fixed it immediately. On 2026-08-16 the SAME request
was tested both ways within one hour — as a sentence it was ignored outright (`chimichurri sauce 30 g
/ fat 15` unchanged), as a required field it was answered on every ingredient of every draw.

⚠️ **A required field whose meaning OVERLAPS an existing field returns a COPY.** Schema force compels
an ANSWER, not a DIFFERENT answer. `amount_as_served_g` was added beside `typical_serving_g` and came
back identical in **364 of 364** ingredients. Before adding a field, ask what question it answers that
no existing field can.

⚠️ **Two riders, both measured the same day.** (1) **Ask for a NUMBER, not a string.** A required string
buys a description: ingredients that came back with a share ("mayonnaise 50%") got the right fat,
ingredients that came back as a bare list ("parsley, garlic, olive oil, vinegar") kept their placeholder.
(2) **A free-text field invites MERGING** — given somewhere to describe a mixture, the model stops
decomposing and collapses ingredients (`shrimp` + `breading` + `oil` became `breaded shrimp 150 g`).
(3) **Field ORDER is load-bearing**: strict mode emits in schema order, so a field must sit BEFORE the
numbers it is meant to constrain.

This is a prior for the next design, not a ban on prose — if a hypothesis says wording is the lever
*for a different reason*, say what would falsify it and run it.

**A BENCHMARK MUST BE REALISTIC, NOT BIG (Santiago, 2026-08-18).** He reloads the OpenAI account in
$10 increments and a whole-menu run was eating $2 of it. Measured: the prompt+schema is only ~1,265
tokens per call, so the bill is almost entirely OUTPUT — a full ingredient list with per-100 g
composition for every item. **The lever is therefore how many items you ENRICH, never how you word the
prompt.**

🔑 **`callGptEnrich` chunks sequentially and fires each batch as its OWN request, so a scored dish is
influenced only by the ≤9 items sharing ITS call.** Enriching a whole 95-item menu to measure two
dishes pays for 8 batches that cannot touch the result. `scripts/bench-mixed-menu.ts` therefore sends
only the batches its fixtures land in — located in the WHOLE menu first, so the chunk boundaries are
exactly production's — and costs **~$0.40 per arm instead of ~$1.8, measuring the identical request
bytes.** A test pins the equivalence: every kept batch must be a verbatim, in-order slice.

⚠️ **This is NOT licence to shrink a benchmark's SCOPE.** Cost is not a constraint (below), and the
8-dish weighted benchmark is cheap ($0.05) precisely *because* of the blind spot that motivated the
mixed-menu harness — it scores a regime production never runs. **Generalisation lives in the DIVERSITY
of the menus and the realism of the neighbours, not in the item count.** Cut arithmetic that changes
nothing; never cut a menu, a dish, a draw, or a real neighbour. Do not add `--full-menu` to "be
thorough": 4.5× the cost, no change to the score.

⚠️ **A PER-ITEM CONDITION IN PROSE IS NOT READ AS ONE (measured 2026-08-18).** Arm P-inline scoped a
sentence to items whose `printed_total_g` is null. Measured against the archives: the items it was
scoped to **did not move** (median serving-sum 1.00×), while the items it explicitly EXCLUDED were
shuffled (4.00×, 1.94×, 1.87× on individual dishes; only 4 of 38 unchanged). **The model applied it
indiscriminately.** If a change must apply to some items and not others, the separation has to be
structural, not a clause.

🔑 **THE ONE THING THAT HAS EVER MOVED THE UNWEIGHTED SCORE IS AN INTERACTION, NOT A LEVER
(measured 2026-08-18, a full 2×2).** Arm P = a split batch + a sentence, and it is worth 25–28 → 37/72.
**Neither half works alone:**

| | shipped prompt | + Arm P's sentence |
|---|---|---|
| **mixed batch** | 25–28 (baseline) | **29** (P-inline) |
| **split batch** | **21** (SplitOnly — *worse than doing nothing*) | **37** (Arm P) |

⚠️ **An earlier version of this file said "batch composition moves answers more than any wording".
That was a hypothesis, the $0.50 control falsified it, and it is retracted.** The split is not
valuable in itself — it is what lets the instruction be stated as an **unconditional fact about the
whole request** (*"The items in this request print no weight"*). Phrased as a per-item condition in a
mixed batch, the same idea was applied indiscriminately. **Prefer a homogeneous request plus a flat
statement over a heterogeneous request plus a condition.**

**Price is NEVER evidence of grams (Santiago, 2026-08-13).** Not in an oracle, not in a prompt, not in
code. Price reflects margin and scarcity, never mass — *"a menu can have an expensive pizza of 1k+
dollars, doesn't mean it weighs 10x the size of a large pizza."* Price parity between items on one
menu is the same fallacy at smaller scale.

**Sourcing a USDA record: the food is not enough, the VARIANT decides the number.** FNDDS stores
venue, crust, preparation and topping class as SEPARATE records, and picking the wrong axis moves a
value 30–46% — restaurant vs *from frozen* pizza differs by 46% in fat. The oracle has been wrong
five times this way, and twice the "pipeline defect" was the oracle's own error. **Search every
variant before choosing one** (`scripts/unweighted-portions.ts --search <terms>`), record the axis in
the entry's `assumed` field, and re-source before believing any single-dish failure.

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


## Package Installation

Use **pnpm** as this project's package manager for scripts and JavaScript dependencies.

Do:
- Run scripts with `pnpm <script>` or `pnpm run <script>`.
- Install non-Expo JavaScript packages with `pnpm add <pkg>` / `pnpm add -D <pkg>`.
- Keep `pnpm-lock.yaml` as the only JS package lockfile.

Do NOT:
- Use `npm install`, `npm uninstall`, `npm update`, or `npm run`.
- Commit `package-lock.json` or `yarn.lock`.
- Mix npm and pnpm installs; this can create a split `node_modules` tree and cause NativeWind / `react-native-css` / `lightningcss` bundling failures.

This repo has no `expo` npm script, so `npx expo install ...` will fail with "Missing script: expo". Always install Expo SDK packages by invoking the locally installed CLI binary directly:

```bash
./node_modules/.bin/expo install <pkg> [<pkg> ...]
```

This ensures SDK-compatible versions are picked (via `expo install`'s version resolution) without depending on a global `expo` install or an `npm run` script that doesn't exist here.

Do NOT:
- Use `npx expo install` (resolves as a missing npm script in this repo).
- Use `npx expo@latest install` (rejected by the npm wrapper).
- Use raw `npm install` for Expo SDK packages — it skips Expo's version-compatibility check and can pull versions that break the SDK.

---

## Design System

Use the checked-in `DESIGN.MD` file as the source of truth for this app's design system.

## Iconography

We're using Lucide icons via lucide-react-native and react-native-svg


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

## Status / Pending Blockers

Track here anything that blocks testing or shipping. Update as items resolve.

- **Apple Developer Program — ✅ PAID (confirmed 2026-07-11).** Physical-device testing works — first on-device verification ran 2026-07-12 (auto-cutter 3-scan checklist, all passed).
- **Macro-enrichment blockers are NOT restated here** — status lives in exactly one place, the
  `🎯 CURRENT PHASE` block of `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md`,
  with the takeover briefing in the `🆕 2026-08-16 HANDOFF` block of
  `docs/superpowers/START-HERE.md`. Read those, not a copy. As of 2026-08-16: **production is edge fn
  v31** (the 0-kcal fix, no accuracy change), all work is committed but unpushed on
  `feat/forced-serving-pieces`, and the next step is a harness that can judge Arm P for shipping.

---

## Final Reminder
Before every feature:
- Read this file.
- Follow it strictly.
- Build clean, simple code.
- This file was developed after the plan file named `docs/sunny-lemon-development-plan.md` (recovered into the repo 2026-08-06; it is the PRODUCT roadmap). When you find any inconsistencies that affect your development in any task, ask the user first before moving on and return him update suggestions for either or both MD files (AGENTS and the plan file) to have both cohesive.

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
