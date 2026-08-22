# Sunny Lemon — Menu Scanning Nutritional Filter App

> ## 📍 THE OVERALL PRODUCT ROADMAP — start here for "what do we build next?"
>
> This is the **product-level** plan: 16 phases from bootstrap to launch and marketing. The
> extraction-quality work has its own sub-roadmap
> (`docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md`) — that one is **one
> workstream inside Phase 9 of this plan**, not a replacement for it.
>
> **PROVENANCE — read before trusting any status below.** This file was written for the
> **previous project**, archived at `~/Desktop/CODING/ARCHIVE/MENU-SCAN-prev/`. It was last
> edited **2026-05-20**; this repository's first commit is **`bf7b65c`, 2026-05-22**. The app was
> restarted, with a different folder layout (`src/app|components|lib|store` here, vs
> `src/shared|features|design-system` there). **Every commit hash in the original Phase-1 status
> block refers to the archived repo and none of them exist here** — verified with `git cat-file`.
> It was recovered into this repo on **2026-08-06** because it had dropped out of view entirely
> while the OCR work grew its own doc tree.
>
> **RECONCILED 2026-08-06** against the actual codebase. Every `Status:` line below was re-derived
> from evidence (file existence, `package.json`, live DB, `grep`), not carried over. Where a phase
> is partly built it is marked `[~]` with what is and is not done. Two findings worth knowing up
> front:
> - **No scan is ever persisted.** The app only calls the edge function; it never writes a `scans`
>   row. Phase 7 (History) has no data behind it, and the DB schema is ahead of the app.
> - **Auth is contradicted between documents.** This plan specifies Supabase auth; `AGENTS.md`
>   says "Use Clerk. Do not build custom auth." Neither is installed. Resolve before Phase 1d.
>
> **Keeping it honest:** follow §0's convention below — flip a box only when verified, and record
> the commit. A status block that silently rots is what caused this file to be lost in the first
> place.

> Working codename: **Sunny Lemon** (yellow accent from design system + "lemon" as fresh/light food metaphor). Final name TBD before launch.

---

## 0. Progress-tracking convention (read first, every session)

**This plan is the single source of truth for what is done.** Any LLM or human working on this project must keep it in sync with reality.

**Rules:**

1. Each `### Phase N — ...` heading carries a **Status (sub-phases):** block immediately under it (or a single `[ ]` / `[x]` if the phase has no sub-phases). Mark each sub-phase `[x]` the moment it is fully verified (verification criteria from the phase's own "Verification" section).
2. When you start a sub-phase, append  `← *in progress`* to that bullet. When it ships, remove the marker and flip `[ ]` → `[x]`, and add the commit hash in backticks (e.g. `(commit \`7e05c54)`).
3. Never mark a sub-phase complete if tests fail, the verification step was skipped, or the work is partial. Partial work stays `[ ]` with the in-progress marker.
4. If you add a new sub-phase mid-flight (e.g. an unforeseen `1f`), add it to the Status block in the same commit.
5. The first action of every new session must be: read this plan, find the lowest-numbered unchecked sub-phase, and confirm with the user before starting.
6. Carry-forward bugs / deferred items belong in §8a, not inside a phase's status block.

---

## 1. Context

**Problem being solved:** A user with specific nutritional goals (high protein, low calorie, paleo, gluten-free, allergen-free, price-conscious, etc.) walks into a restaurant or fast-food place, photographs the menu, and wants a sorted list of menu items ranked by how well each item matches their current goals. Today they manually paste menu photos into ChatGPT/Claude and prompt for this. This app removes that friction.

**Ethos — "Boring SaaS":** Solve one niche problem with the fewest steps, beautiful but minimal UI (Cal AI-grade polish, Pirsch Analytics warmth from `DESIGN.md`), no feature creep. Main feature ships first, fully tested, before any optional features begin.

**Build-then-research:** Per user direction, momentum > research-first. We ship the **main feature MVP (Phase 2)** before competitive/user research. Findings from research (Phase 3) then inform Phases 4 onward.

**Intended outcome of this plan:** A phased, dependency-ordered build sequence that backend, frontend, and design specialists can execute in parallel without re-aligning on stack, schema, or design tokens. Each phase has explicit deliverables, verification criteria, and a "done" definition.

**Reference inputs already locked into this plan:**

- `Downloads/Introduction 35fe6266e5108040afe7f32228eea1be.md` — the brief (read this for original product voice)
- `Downloads/CLAUDE (1).md` — coding guardrails (copied into project root as `CLAUDE.md`)
- `Downloads/DESIGN.md` — Pirsch Analytics-style design system (copied into project as `DESIGN.md` and tokenized into NativeWind theme)

---

## 2. Locked Architectural Decisions

All four critical decisions were resolved in this planning session. **Do not relitigate during implementation.**


| Area                          | Decision                                                                                                         | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile framework              | **Expo SDK (latest) + React Native + TypeScript**                                                                | Managed workflow. EAS Build for iOS + Android.                                                                                                                                                                                                                                                                                                                                                                                                           |
| Navigation                    | **Expo Router** (file-based)                                                                                     | Required for deep links into scan/profile/history routes.                                                                                                                                                                                                                                                                                                                                                                                                |
| State management              | **Zustand** + `zustand/middleware/persist` (MMKV-backed)                                                         | Slices: filters, activeProfile, currentScan, history-cache, scans list, profiles list. Zustand manages all state — client and server-fetched. Data is loaded via direct `@supabase/supabase-js` calls from Zustand async actions. **TanStack Query removed** (npm security issue; unnecessary for this app's data complexity).                                                                                                                           |
| Styling                       | **NativeWind v5 (preview) + Tailwind v4 (CSS-first)** with theme bound to `DESIGN.md` tokens                     | Decision revised during Phase 1a per up-to-date `expo:expo-tailwind-setup` skill. Uses `react-native-css` + `@tailwindcss/postcss`. CSS is the source of truth (`src/global.css` with `@theme` block) instead of a JS `tailwind.config.js`. RN primitives must be wrapped with `useCssElement` (in `src/tw/`) before they accept `className`. No raw color hex outside `global.css` + `src/design-system/theme.ts`. No `babel.config.js` for NativeWind. |
| Backend                       | **Supabase** (Postgres + Auth + Edge Functions + RLS)                                                            | Vision API calls **must** be proxied through Edge Functions so provider API keys never ship to client. **No Supabase Storage** (see below).                                                                                                                                                                                                                                                                                                              |
| Backend workflow              | **Supabase Agent Skills** (official)                                                                             | Install at session start so backend agents follow Supabase's own guardrails for RLS, `security_invoker` views, current CLI usage, and migration discipline. Install commands listed in Phase 1 deliverables.                                                                                                                                                                                                                                             |
| Auth                          | **Deferred — no auth gate at launchZ**                                                                           | User gets immediate access to scanning. Auth necessity will be evaluated post-MVP via Phase 3 research. If re-enabled: Apple + Google (native SDK / `signInWithIdToken`) + Email magic-link + optional anonymous-first. Browser-redirect OAuth approach from Phase 1d is superseded by the native SDK approach. Domain `menu-scan-app` purchased for OAuth redirect config.                                                                              |
| Vision / OCR                  | **Multi-model abstraction layer**                                                                                | A `VisionProvider` interface with four concrete adapters: **Gemini 1.5 Flash**, **Gemini 2.0 Flash**, **Mistral OCR**, **GPT-4o**. Phase 1 ships with Gemini 2.0 Flash as default + the testing harness. Winning model is locked at end of Phase 9.                                                                                                                                                                                                      |
| Macro estimation source       | LLM-estimated, displayed with confidence label, in v1. USDA FoodData Central normalization is a Phase 9 stretch. |                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Payments                      | **Native StoreKit (iOS) + Play Billing (Android), direct**                                                       | Via `expo-in-app-purchases` (and `react-native-iap` as fallback if needed on Android). No RevenueCat. Receipt validation in a Supabase Edge Function.                                                                                                                                                                                                                                                                                                    |
| Analytics                     | **PostHog** (mobile SDK)                                                                                         | Self-hostable later if needed; rich session replay + feature flags.                                                                                                                                                                                                                                                                                                                                                                                      |
| Error tracking                | **Sentry** (`sentry-expo`)                                                                                       | Source maps uploaded via EAS hook.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Camera / images               | `expo-camera` + `expo-image-picker` + `expo-image-manipulator`                                                   | **Images are NEVER persisted to Supabase Storage.** Images live only on the capturing device via `expo-file-system` (private app sandbox). They are sent ephemerally as base64/multipart to the `scan-menu` Edge Function, parsed, and the response is what gets persisted. Compress to ≤1024px longest edge / JPEG q=0.7 to cap vision API token cost.                                                                                                  |
| OTA updates                   | **EAS Update**                                                                                                   | Critical-bug-fix channel only; not for feature flags.                                                                                                                                                                                                                                                                                                                                                                                                    |
| Forms / validation            | **react-hook-form** + **zod**                                                                                    | Zod schemas are the contract between frontend and Edge Functions. Share via `src/shared/schemas/`.                                                                                                                                                                                                                                                                                                                                                       |
| Drag-to-reorder               | `react-native-draggable-flatlist`                                                                                | Multi-goal priority list.                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Bottom sheets                 | `@gorhom/bottom-sheet`                                                                                           | Filter editor + profile editor live in sheets, not modal screens.                                                                                                                                                                                                                                                                                                                                                                                        |
| Feature flags / kill switches | PostHog feature flags                                                                                            | Used to roll out the winning vision model gradually.                                                                                                                                                                                                                                                                                                                                                                                                     |
| Screen count                  | **Max 6 navigable screens**                                                                                      | Hard constraint. Sheet routes and dev-only routes do not count toward this limit.                                                                                                                                                                                                                                                                                                                                                                        |


### Supabase Agent Skills — backend agent workflow

Install once at the start of Phase 1 so every backend coding session honors Supabase's official rules:

```bash
# Option A: Claude Code plugin (preferred — uses our existing toolchain)
claude plugin marketplace add supabase/agent-skills
claude plugin install supabase@supabase-agent-skills

# Option B: cross-tool install
npx skills add supabase/agent-skills
```

What this enforces (automatically, via skill `SKILL.md`):

- **Docs-before-code:** Use the MCP `search_docs` tool, then fetch `*.md` Supabase doc URLs, then native web search — in that order — before writing any Supabase-specific code.
- **RLS by default** on all tables; never expose a view without `with (security_invoker = true)`.
- **Schema iteration workflow:** Use `execute_sql` MCP / `supabase db query` for fast iteration in dev; run **Supabase database advisors** before formalizing; only then commit a migration.
- **Never connect MCP to production DB.** Local / staging only.
- Avoid hallucinated CLI commands (e.g. agents commonly invent `supabase db execute` — the real one is `supabase db query`).

Backend deliverables in every phase below **assume this skill is active**. Don't restate these rules per phase.

---

## 3. Design System — Contract for All UI Work

Source of truth: `DESIGN.md` (Pirsch Analytics style). The frontend specialist must implement these tokens **before any screen is built**. See Phase 1 for exact deliverables.

**Color tokens** (NativeWind class names in parentheses):

- `midnight-ink` `#000000` (`text-midnight-ink`, `bg-midnight-ink`) — primary text, headings, icons, outlines
- `ghostly-gray` `#f8f5ed` (`bg-ghostly-gray`) — card surfaces
- `muted-stone` `#707070` (`text-muted-stone`) — secondary text, disabled
- `sunbeam-yellow` `#ffda6e` (`bg-sunbeam-yellow`) — **primary CTA** (Scan menu, Save profile, Apply filters)
- `leafy-green` `#6ece9d` (`bg-leafy-green`) — **secondary CTA**, selected nav, positive feedback
- Canvas: `#FFFFFF` (root background)

**Typography:** DM Sans (loaded via `expo-font` from Google Fonts), weights 400 + 500 only. Fallback Inter. Scale: 14 / 16 / 18 / 20 / 24 / 28 / 64.

**Radii:** Cards 24px, buttons 12px, inputs 6px, tags 24px. **No square corners anywhere.**

**Spacing:** 8 / 16 / 24 / 32 / 48 / 64 / 128 / 192. Section gap 48px, card padding 32px, element gap 16px.

**Surfaces:** Two-tier — canvas `#FFFFFF` (page) and card-surface `#f8f5ed` (cards). **No elevation shadows.** Visual separation via background color only.

**Forbidden:**

- New accent colors beyond Sunbeam Yellow + Leafy Green
- Any font besides DM Sans
- Dark/saturated backgrounds
- Sharp corners
- Box shadows

**Component primitives to build in Phase 1** (`src/design-system/components/`):
`Button` (variants: primaryYellow, secondaryGreen, ghost, danger), `Card`, `Tag`, `TextInput`, `Sheet`, `Screen` (safe-area wrapper), `Heading`, `Body`, `Caption`, `Divider`, `EmptyState`, `LoadingPulse`.

---

## 4. Data Model (Supabase Schema)

> All tables have `id uuid primary key default gen_random_uuid()`, `created_at timestamptz default now()`, RLS enabled. Anonymous users own rows by `auth.uid()`; `linkIdentity` lifts ownership to the linked permanent user automatically. Views, if any, must use `with (security_invoker = true)` (enforced by Supabase Agent Skills).

### Tables

`**profiles`** — user-saved filter presets

- `user_id uuid references auth.users not null`
- `name text not null check (char_length(name) <= 32)`
- `emoji text not null` (single grapheme; validated client+server)
- `filters jsonb not null` — see Filter Schema below
- `notes text` (free-form, used by future "AI suggestions" feature)
- `is_active boolean default false` — only one active per user (partial unique index)

`**nutrition_goals**` — seedable catalog of selectable goals

- `slug text primary key` (e.g. `high-protein`, `low-calorie`, `paleo`, `gluten-free`, `vegan`, `keto`, `low-carb`, `high-carb`, `low-sodium`, `dairy-free`)
- `label text not null` (display name)
- `category text not null` (`macro` | `diet` | `allergen` | `price`)
- `enabled boolean default true`
- `sort_order int`
- Server-controlled so new options can be added remotely without a build.

`**custom_filter_requests**` — capture filter ideas users typed that aren't in the catalog

- `user_id uuid references auth.users`
- `text_value text not null`
- `normalized text` (lowercased, trimmed — used for aggregation queries)
- `scan_id uuid references scans` nullable
- Implicit feedback per the brief; feeds the product backlog.

`**scans**` — history log (ChatGPT-conversation pattern)

- `user_id uuid references auth.users not null`
- `title text` (auto-generated from place name + first item, editable later)
- `place_name text` (optional, parsed from menu header if AI confident; otherwise null)
- `geo geography(Point, 4326)` (optional, only if user grants location)
- `image_count int not null default 0` — number of pages captured (display only; **no image URLs are stored server-side**)
- `local_image_keys text[]` — opaque local-file references (e.g. `scan-<uuid>-page-1.jpg`) that the **capturing device** can resolve from its own `expo-file-system` cache. Other devices see this as empty/unresolvable, which is the expected behavior.
- `filters_snapshot jsonb not null` (filters used at scan time — frozen)
- `profile_id uuid references profiles` nullable (if user scanned while on a profile)
- `parsed_items jsonb not null` — array of `MenuItem`
- `vision_model text not null` (e.g. `gemini-2.0-flash`)
- `vision_model_version text` (e.g. `2025-03-15`)
- `confidence_score numeric` (0-1, model self-reported)
- `tokens_used int` (cost telemetry)

`**feedback`** — explicit feedback

- `user_id uuid references auth.users`
- `type text not null check (type in ('bad_scan','bad_result','feature_request','missing_filter','general'))`
- `content text not null`
- `scan_id uuid references scans` nullable
- `item_index int` nullable (when type = `bad_result`, which item in `parsed_items`)
- `app_version text`
- `device jsonb` (OS, model, locale — collected silently)

`**vision_model_runs**` — Phase 1 testing harness output (also useful long-term)

- `scan_id uuid references scans` nullable
- `model text not null`
- `latency_ms int`
- `tokens_used int`
- `cost_usd numeric`
- `parsed_items jsonb`
- `error text`
- Feeds `vision-models/results.md` (Phase 9) but lives in DB so it's queryable.

### Storage

**No Supabase Storage buckets.** Menu images live on the capturing device only, in the app's `expo-file-system` private sandbox under `documentDirectory/menu-scans/`. Lifecycle:

1. Camera capture → write to local sandbox → keep a 30-day rolling cache.
2. On scan submit: read file → compress (`expo-image-manipulator`, ≤1024px long edge, JPEG q=0.7) → base64-encode → POST to `scan-menu` Edge Function.
3. Edge Function streams the image directly to the vision provider, parses the response, returns structured `MenuItem[]`. **Edge Function does NOT persist the image anywhere.**
4. On a different device viewing history, the original image is unresolvable (see `local_image_keys`); the UI shows a placeholder icon and the parsed items only.

This is a deliberate tradeoff: zero ongoing storage cost, simpler privacy story, in exchange for "you can only re-view the photo on the device that captured it." The parsed items + filter snapshot + sorted results are fully cross-device.

### Filter Schema (the jsonb contract used by `profiles.filters` and `scans.filters_snapshot`)

```ts
// src/shared/schemas/filters.ts — exported zod schema
{
  goals: [                              // ordered, drag-sortable
    { slug: 'high-protein', priority: 0 },
    { slug: 'low-carb',     priority: 1 },
  ],
  customGoals: [                        // free-text goals AI must honor
    { text: 'mediterranean', priority: 2 }
  ],
  calorieRange?: { min?: number; max?: number },
  allergens: string[],                  // exclude items containing any of these
  priceSort?: 'asc' | 'desc',
  ingredientExcludes: string[],         // user-typed e.g. "cilantro"
}
```

### Edge Functions (Supabase Deno runtime)

- `scan-menu` — accepts inline image data + filters, fans out to selected `VisionProvider`, returns normalized `MenuItem[]`. **All vision API keys live here.** Images are never written to disk on the function side.
- `verify-iap-receipt` — receipt validation for App Store + Play Store.
- `submit-feedback` — writes to `feedback`, also forwards to PostHog event for live dashboards.
- `aggregate-custom-filters` — cron-scheduled (Phase 8), surfaces top user-requested filters into an internal report.

### `MenuItem` shape (returned by `scan-menu`)

```ts
{
  index: number,
  name: string,
  description?: string,
  price?: { amount: number; currency: string },
  estimatedMacros: {
    calories?: number,
    proteinG?: number,
    carbsG?: number,
    fatG?: number,
    fiberG?: number,
  },
  detectedAllergens: string[],
  detectedDietTags: string[],
  confidence: number,                    // 0-1
  matchScore: number,                    // 0-1, computed against active filters
  matchReasoning?: string,
  warnings?: string[],
}
```

### Seed catalog (`supabase/seed.sql`)

Default `nutrition_goals` rows (research in Phase 3 will refine this list):

- **macro:** high-protein, high-carb, low-carb, low-calorie, high-calorie
- **diet:** keto, paleo, vegan, vegetarian, pescatarian, mediterranean, gluten-free, dairy-free
- **allergen:** peanut, tree-nut, shellfish, dairy, gluten, soy, egg, fish, sesame
- **price:** cheap, mid, expensive *(used as ordering hints rather than filters; price sort lives in filter UI)*

---

## 5. Project Structure

```
sunny-lemon/
├── app/                              # Expo Router routes — MAX 6 NAVIGABLE SCREENS
│   ├── (tabs)/
│   │   ├── index.tsx                 # Screen 1: Home — big Scan CTA, active profile header
│   │   ├── history.tsx               # Screen 4: History list + search
│   │   ├── profiles.tsx              # Screen 5: Profile list (detail editor is a sheet here)
│   │   └── settings.tsx              # Screen 6: Settings + feedback shortcut
│   ├── scan/
│   │   ├── camera.tsx                # Screen 2: Multi-shot camera + inline page review
│   │   └── result/[scanId].tsx       # Screen 3: Sorted results
│   ├── filters.tsx                   # Sheet route (NOT a screen) — filter editor
│   ├── feedback.tsx                  # Sheet route (NOT a screen) — feedback form
│   └── _layout.tsx                   # Root layout, providers, theme
├── src/
│   ├── design-system/
│   │   ├── theme.ts                  # All tokens — source of truth
│   │   ├── components/               # Button, Card, Tag, TextInput, Sheet, …
│   │   └── icons/                    # Filled, black, moderate stroke
│   ├── features/
│   │   ├── scan/                     # Camera, image pipeline (local-only), scan submit
│   │   ├── filters/                  # Goal multi-select + drag-reorder UI
│   │   ├── profiles/                 # Profile CRUD + sentence editor
│   │   ├── history/                  # List + search
│   │   ├── feedback/                 # Always-visible feedback entry points
│   │   └── auth/                     # Apple/Google/Magic-link/Anon flows
│   ├── shared/
│   │   ├── schemas/                  # zod — used both client + edge functions
│   │   ├── supabase/                 # client, types (generated via supabase gen)
│   │   ├── vision/                   # client-side provider abstraction (talks to edge fn)
│   │   ├── analytics/                # PostHog wrapper
│   │   ├── images/                   # expo-file-system wrapper, compression, cache eviction
│   │   └── store/                    # Zustand slices
│   └── lib/
├── supabase/
│   ├── migrations/                   # SQL (formalized only after advisors pass)
│   ├── functions/                    # Deno edge functions
│   │   ├── scan-menu/
│   │   ├── verify-iap-receipt/
│   │   └── submit-feedback/
│   └── seed.sql                      # seeds nutrition_goals catalog
├── vision-models/
│   └── results.md                    # human-curated test results (Phase 1 + Phase 9)
├── research/                         # Phase 3 + Phase 10/11/14 research artifacts
├── CLAUDE.md                         # copy of Downloads/CLAUDE (1).md
├── DESIGN.md                         # copy of Downloads/DESIGN.md
└── README.md
```

---

## 6. Phase Plan

Each phase has: **Goal · Deliverables · Verification · Done definition.** Phases are executed strictly sequentially **unless explicitly marked parallel-safe**. No phase may begin until the previous phase passes verification.

### Phase 1 — Project Bootstrap, Design System, Auth Shell, Vision Testing Harness

**Status (sub-phases) — RECONCILED against THIS repo 2026-08-06:**

> ⚠️ The commit hashes below (`7e05c54`, `1a0dc84`, `cdb714e`, `9c32c33`, `31c966d`) are from the
> **ARCHIVED project** at `~/Desktop/CODING/ARCHIVE/MENU-SCAN-prev/`. **None of them exist in this
> repository** — this repo restarted at `bf7b65c` on 2026-05-22. Treat them as history, not as
> proof that the work is present here.

- [x] **1a** — Expo bootstrap + DESIGN.md tokens + NativeWind v5 — **DONE here** (Expo 56, `nativewind@5.0.0-preview.4`, `DESIGN.md` present)
- [ ] **1b** — Component primitives + `/styleguide` developer route — **no `/styleguide` route in this repo**
- [~] **1c** — Supabase schema + RLS + seed + type gen — **DB exists remotely** (6 app tables, RLS on all) **but this repo has no `0001_init.sql` and no generated types file**; `src/lib/supabase.ts` is a hand-written client
- [ ] **1d** — Auth shell — **no auth code here at all.** ⚠️ Unresolved contradiction: this plan specifies **Supabase auth**, `AGENTS.md` says **"Use Clerk. Do not build custom auth."** Neither is installed. Decide before any auth work.
- [ ] **1e** — Vision testing harness (`/dev/vision-lab` + 4 adapters) — **not built as specified.** Superseded in substance by the offline extraction eval harness (`scripts/`, 9 fixture menus, oracle files, 141-entry ledger), which is far stronger for extraction but is NOT an in-app screen
- [~] **1f** — Observability + image pipeline — **image pipeline DONE** (`compressImage`/`prepareTile`/passthrough uploads); **Sentry and PostHog both ABSENT**; fatal-error reporting now exists instead via `scan_log` (eval 141)


**Goal:** Walking skeleton — empty app that boots on iOS + Android, theme is correct, and a sample image can be run through all four vision providers with results logged. Auth is deferred (see below).

**Deliverables — Foundation:**

- Initialize Expo + TypeScript project. Configure EAS Build (dev, preview, production profiles).
- Install + configure: Expo Router, NativeWind v5 preview + Tailwind v4 + `react-native-css` + `@tailwindcss/postcss` (per `expo:expo-tailwind-setup` skill), DM Sans via `expo-font`, Zustand + persist (MMKV), react-hook-form, zod, Sentry, PostHog, `@gorhom/bottom-sheet`, `react-native-draggable-flatlist`, `expo-camera`, `expo-image-picker`, `expo-image-manipulator`, `expo-file-system`.
- Copy `CLAUDE.md` and `DESIGN.md` into project root.
- Build `src/design-system/theme.ts` mapping every token from `DESIGN.md` (colors, type scale, spacing, radii) into NativeWind + a TS export.
- Build all component primitives listed in section 3.
- Build a developer-only `/styleguide` screen rendering every primitive in every variant for visual QA.

**Deliverables — Supabase (using Supabase Agent Skills workflow):**

- Install Supabase Agent Skills: `claude plugin marketplace add supabase/agent-skills && claude plugin install supabase@supabase-agent-skills`.
- Create Supabase project (local + staging; **never connect MCP to production**).
- Iterate the section-4 schema in dev via `execute_sql` MCP / `supabase db query`.
- Run **Supabase database advisors**; resolve any flagged issues.
- Once schema is stable, commit a single formalized migration `0001_init.sql`.
- Apply RLS policies. Apply `seed.sql` (default `nutrition_goals`).
- Generate types via `supabase gen types typescript`.

**Phase 1c handoff — current state (2026-05-14):**

- Working branch: `phase-1c-supabase-schema`.
- Linked Supabase dev project: `menu-scan-app` (`uonuiadueykynbetxxrw`). Treat as dev/staging only; do not use production.
- Local migration updated but not committed: `supabase/migrations/0001_init.sql` now includes `profiles.updated_at`, trigger function `public.set_updated_at()`, trigger `profiles_set_updated_at`, and generated `scans.search_tsv` with `scans_fts_idx`.
- Remote dev database was applied with `supabase db push --include-seed`.
- Verified remotely: 6 app tables exist; `nutrition_goals` has 25 rows; RLS is enabled on all 6 app tables; anon role can read `nutrition_goals` and sees 0 private `profiles` / `scans`; `profiles_set_updated_at` trigger exists; `scans.search_tsv` generated column exists; `scans_fts_idx` exists.
- Generated types file exists at `menu-scan-app/src/shared/supabase/types.ts`; it includes `profiles.updated_at` and `scans.search_tsv`.
- Added `supabase/.temp/` to `.gitignore` because Supabase CLI link metadata is local-only.
- `supabase db lint --linked` reports issues only in PostGIS extension functions (`st_findextent`, `populate_geometry_columns`, `addgeometrycolumn`, `lockrow`, `addauth`, etc.) — zero findings on any app table or the `set_updated_at` trigger. **Decision:** accepted as Supabase/PostGIS extension noise; no action required on app schema.
- Focused compile passes: `npx tsc --noEmit --skipLibCheck src/shared/supabase/types.ts`.
- Full project compile still fails on pre-existing NativeWind wrapper type-depth errors in `src/tw/image.tsx` and `src/tw/index.tsx`; do not treat those as Supabase type generation failures.

**Phase 1c handoff — next steps for takeover:**

1. Re-run verification before claiming completion:
  - `supabase db query --linked "select count(*) as app_table_count from pg_tables where schemaname = 'public' and tablename in ('profiles','nutrition_goals','scans','custom_filter_requests','feedback','vision_model_runs');" -o table`
  - `supabase db query --linked "select count(*) as nutrition_goals_count from public.nutrition_goals;" -o table`
  - `supabase db query --linked "select tablename, rowsecurity from pg_tables where schemaname = 'public' and tablename in ('profiles','nutrition_goals','scans','custom_filter_requests','feedback','vision_model_runs') order by tablename;" -o table`
  - `supabase db query --linked "select trigger_name, event_manipulation, action_timing from information_schema.triggers where event_object_schema = 'public' and event_object_table = 'profiles' and trigger_name = 'profiles_set_updated_at';" -o table`
2. Resolve the advisor/lint decision:
  - Run `supabase db lint --linked`.
  - If output remains PostGIS-only, document that explicitly in the commit/PR notes or find a Supabase-supported app-schema-only advisor path.
3. Re-run type generation only if the remote schema changed:
  - `supabase gen types --linked --schema public > src/shared/supabase/types.ts`
  - `npx tsc --noEmit --skipLibCheck src/shared/supabase/types.ts`
4. Update Phase 1c status only after verification policy is satisfied:
  - If advisor/lint handling is accepted, flip **1c** to `[x]`, remove `← *in progress`*, and add the commit hash.
  - If not accepted, leave **1c** in progress and record the exact blocker.
5. Commit the Phase 1c files only after the above:
  - Include `supabase/migrations/0001_init.sql`, `supabase/seed.sql`, `src/shared/supabase/types.ts`, `.gitignore`, and this plan file.
  - Do not commit `supabase/.temp/`, `.agents/`, or `skills-lock.json` unless the user explicitly wants plugin metadata tracked.

**Auth Deferral Decision (2026-05-14):**

Auth is **fully disabled** for the main development and testing phases. The user gets straight access to scanning on first install with no sign-in gate. This keeps focus on the core scanning loop.

The open question — *is Auth truly necessary for this app's functionality?* — will be answered in Phase 3 research and/or a dedicated brainstorm after the MVP is solid. Auth will only be re-enabled if research confirms it's needed for a feature users care about (e.g. cross-device history, profile sync, subscription entitlement).

**What exists in the codebase (branch `phase-1d-auth`, commit `9c32c33`):**

- `src/shared/supabase/client.ts` — typed Supabase client with AsyncStorage session persistence.
- `src/shared/store/authStore.ts` — Zustand auth slice (signInAnonymously, signInWithGoogle/Apple, signInWithEmail, linkWithGoogle/Apple, signOut).
- `src/features/auth/AuthPanel.tsx` — auth UI component (link vs sign-in flows).
- The anonymous sign-in trigger in `app/_layout.tsx` is **removed** for now; re-enable by restoring the `useEffect` that calls `signInAnonymously()`.
- `.env.example` documents all Supabase dashboard settings required before any auth flow can work.

**Native auth pivot (if/when auth is re-enabled):**
The Phase 1d implementation used the browser-redirect approach (`signInWithOAuth` + `expo-web-browser`). Supabase's official recommendation for Expo React Native is the **native SDK approach**:

- **Google**: `@react-native-google-signin/google-signin` → `supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })`
- **Apple**: `expo-apple-authentication` → `supabase.auth.signInWithIdToken({ provider: 'apple', token: idToken, nonce })`

This gives a native dialog instead of a browser popup and is the correct architecture to implement when auth is re-enabled.

**Domain:** `menu-scan-app` domain has been purchased. Use this as the:

- Authorized JavaScript origin and redirect URI when configuring the Google Cloud OAuth 2.0 client (Web application type).
- Supabase redirect URL allowlist entry (e.g. `https://menu-scan-app.com/auth/callback`).
- Future marketing site / App Store privacy policy URL.

**Required Supabase dashboard settings (when re-enabling auth):**

1. Authentication → Settings → Enable "Anonymous sign-ins"
2. Authentication → URL Configuration → Redirect URLs: `menuscanapp://auth`, `exp://localhost:8081`, `https://menu-scan-app.com/auth/callback`
3. Authentication → Providers → Google: Web Client ID + Secret from Google Cloud Console
4. Authentication → Providers → Apple: Service ID + Secret Key from Apple Developer Console

**Deliverables (deferred — do not implement until auth decision is made):**

- Anonymous sign-in on app launch (default path). *(code exists, disabled)*
- Apple, Google, Email magic-link flows behind a generic `Auth` UI on Settings tab. *(code exists, disabled)*
- `linkIdentity` upgrade flow so anonymous → permanent migration is lossless. *(code exists, disabled)*
- Upgrade Google/Apple flows to native SDK approach (see pivot note above).

**Deliverables — Vision Testing Harness:**

- Implement `VisionProvider` interface in `src/shared/vision/types.ts`:
  ```ts
  interface VisionProvider {
    id: 'gemini-1.5-flash' | 'gemini-2.0-flash' | 'mistral-ocr' | 'gpt-4o';
    scan(images: string[], filters: Filters): Promise<{ items: MenuItem[]; meta: RunMeta }>;
  }
  ```
- Implement all four adapters as Deno modules in `supabase/functions/scan-menu/providers/`.
- `scan-menu` orchestrator accepts `?model=<id>` OR `?models=<id,id,id>` (multi-select test mode).
- Build a developer-only `/dev/vision-lab` screen: upload an image, multi-select models, run, see side-by-side results + latency + token cost. Persist each run to `vision_model_runs`.
- Create `vision-models/results.md` template — model, prompt version, sample-set name, accuracy notes, cost-per-scan, latency, qualitative notes.

**Deliverables — Image pipeline (local-only):**

- `src/shared/images/` module: `saveCapture()`, `loadCapture()`, `compressForUpload()`, `evictOlderThan(days)`.
- 30-day rolling local cache, cleaned on app cold-start.

**Deliverables — Observability:**

- Sentry wired (client + edge functions).
- PostHog wired with autocapture + a stable anonymous device-level `distinct_id` (since Supabase auth is deferred; switch to Supabase user ID if auth is re-enabled).

**Verification:**

- App boots cleanly on iOS simulator + Android emulator + a physical device of each platform.
- `/styleguide` matches DESIGN.md (manual visual diff against tokens).
- `/dev/vision-lab` returns parsed items from all four models for a test menu image; `vision_model_runs` rows persist; cost telemetry visible in PostHog.
- Supabase advisors report zero unresolved issues.
- *(Auth verification deferred — see Auth Deferral Decision above)*

**Done:** All bullets above pass on both platforms.

---

### Phase 2 — Main Feature MVP: Single Photo → Sorted Results (one goal at a time)

**Status:** `[~]` **MOSTLY DONE in this repo** — the core loop ships (camera → review → extract → enrich → goal-ranked results) and is device-verified. **NOT done: the last deliverable, "persist scan to history".** The app writes NO `scans` row — `grep` finds only `functions.invoke` and the crash reporter. Also absent: Sentry, PostHog `scan_completed`. Extraction quality far exceeds this phase's bar (see the OCR sub-roadmap).

**Goal:** The core "boring SaaS" loop works end-to-end with one nutrition goal at a time. **This is the headline feature — must be rock-solid before anything else.**

**Deliverables:**

- Home screen: big yellow `Scan a menu` card (~70-80% of screen height per brief), active-profile header above (placeholder profile in this phase). Secondary `Select a photo` action.
- Goal picker: single-select bottom sheet listing seeded `nutrition_goals` (multi-select + drag-reorder arrive in Phase 4).
- Camera screen (single shot for now): take photo → preview → confirm.
- Submit pipeline: read local image → compress → base64 → call `scan-menu` Edge Function with default model (Gemini 2.0 Flash) → write `scans` row (with `local_image_keys` referencing the on-device file) → navigate to results.
- Results screen: list of `MenuItem` cards sorted descending by `matchScore`, showing name, price, short reasoning blurb, and a low-confidence warning when applicable.
- Persist scan to history (history UI is Phase 7, but data must be written now).

**Verification:**

- Manually scan 10 real menus (mix of fast food, sit-down, multi-page) — all produce a usable sorted list with no crashes.
- Sentry shows zero crashes in a 50-scan dogfood session.
- PostHog `scan_completed` event fires with duration + model + tokens.
- Confirm Edge Function logs show no image bytes retained server-side after response.

**Done:** A non-technical tester completes the main loop in <60 seconds without help.

---

### Phase 3 — Post-MVP User & Competitive Research *(parallel-safe with Phase 4+)*

**Status:** `[ ]` not started — no `research/` directory in this repo.

**Goal:** Now that the main feature works, validate priorities and surface modifications against real user voice **before** building optional features. Research output directly informs which Phase 4–8 deliverables get expanded, trimmed, or reordered.

**Why now (not before development):** User-directed. Momentum first. The MVP is a concrete artifact to evaluate research findings against, which is more useful than speculating.

**Deliverables — Research targets:**

1. **Direct competitors** (apps with menu-scanning or nutrition-from-photo as core feature):
  - Cal AI, Foodvisor, Yuka, Bite AI, FoodAi, Snap-Eat, Lifesum's Snap, Macros (the iOS app).
  - For each: pricing model, free-tier limits, paywall placement, onboarding flow, retention hooks, viral mechanics, common complaints, common praise.
2. **Adjacent apps where users have requested this main feature** (people already on these apps who'd switch or add ours):
  - MyFitnessPal, RP Diet Coach, Cronometer, Lose It!, Carbon Diet Coach, MacroFactor, Hevy + nutrition extensions.
  - Mining: App Store reviews (1- and 2-star reviews are gold), Reddit (`r/MyFitnessPal`, `r/loseit`, `r/RPstrength`, `r/EatCheapAndHealthy`, `r/MacroFactor`), Twitter/X searches for "wish [app] could scan menus" / "menu nutrition app" / "restaurant calories app".
  - For each: surface explicit feature requests for menu scanning + nutritional filtering, frequency of request, concrete user pain quotes.
3. **Top-N user-requested filter types** — refine the `nutrition_goals` seed catalog. Add anything frequently requested that isn't already there (e.g. "low FODMAP", "PCOS-friendly", "diabetic-friendly").

**Deliverables — Process (use the SendTech `product-market` skill / equivalent already in user's toolchain):**

- One Reddit + App Store review aggregation pass per app (script or AI-assisted).
- Quote bank in `research/quotes.md` — direct user-voice quotes, attributed by source.
- Synthesized report `research/competitive-and-feature-demand.md` covering: top 5 confirmed wants, top 3 confirmed dealbreakers, recommended additions to Phase 4-8 deliverables, recommended additions to `nutrition_goals` seed, recommended onboarding hooks (carried to Phase 11), recommended paywall placement (carried to Phase 10), recommended marketing hooks (carried to Phase 15).
- Cal AI section is deep here (replaces what was previously a separate "Cal AI deep study" phase): teardown of onboarding, viral loop, retention, paywall — including what NOT to copy.

**Verification:** User reviews the synthesized report. Any new filters from research are appended to `supabase/seed.sql` and applied.

**Done:** Phases 4–15 plan the user-approved modifications. The research doc is treated as a binding addendum to this plan.

---

### Phase 4 — Multi-Goal Selection with Drag-Reorder Priority + Multi-Page Scans

**Status:** `[~]` **PARTIAL** — multi-goal selection ✅ (`GOAL_PAIRS`, `sortItemsByGoals`, z-score weighting) and multi-page scans ✅ (far beyond this phase: per-page wiring, dense auto-cutter, rotation). **NOT done:** drag-reorder priority (`react-native-draggable-flatlist` is NOT installed) and the free-text custom-goal input.

**Goal:** User can stack multiple goals, drag-reorder them, and capture book-style menus (multiple pages in one scan).

**Deliverables:**

- Filter editor sheet: multi-select goal list, free-text "type your own goal" input (writes to `customGoals` and persists to `custom_filter_requests`).
- `react-native-draggable-flatlist` drag-to-reorder for goal priority.
- `scan-menu` updated to honor priority order in its prompt (higher-priority goals weight `matchScore` more heavily).
- Camera screen: `Add another page` button; captured page thumbnails appear inline below the viewfinder with delete/reorder controls before submit. No separate review route — review is inline within `scan/camera.tsx` (hard screen-count constraint).

**Verification:** Scanning a 3-page menu with `[low-carb, high-protein, no-cilantro]` returns one combined sorted list where priority ordering visibly affects results when goals conflict.

**Done:** User can reorder mid-scan and re-rank without re-scanning (client-side re-rank using existing `parsed_items` is fine; only the prompt-driven ranking needs a server round-trip).

---

### Phase 5 — Calorie Range, Allergen Filters, Price Sort, Gallery Import

**Status:** `[~]` **PARTIAL** — allergen filters ✅ (`AllergenSelector`, persisted store, per-item warnings) with the mandatory disclaimer ✅; gallery import ✅ (`GalleryButton`). **NOT done:** calorie-range filter, price sort toggle.

**Goal:** All remaining filter types from the User Flow Specs are functional.

**Deliverables:**

- Calorie filter UI: presets (`<400`, `<600`, `>500`, custom range) + numeric range input. Wired to `filters.calorieRange`.
- Allergen filter UI: chip multi-select (common allergens from `nutrition_goals` category=allergen) + free-text "I'm allergic to X". Items containing any selected allergen are demoted or hidden (user setting: demote vs hide; default demote).
- **Mandatory allergen disclaimer**: when any allergen filter is active, results screen shows a prominent Sunbeam-Yellow info card: *"AI-estimated. Confirm allergens with restaurant staff before ordering."* This is in the brief — must not be removed.
- Price ascending/descending sort toggle on results screen.
- Gallery import: `expo-image-picker` for selecting pre-existing photos; same pipeline as camera capture (image stays in local sandbox).

**Verification:** Scan a menu with calorie max 500 + allergen "peanut" + sort price asc. Items >500 cal and items containing peanut are hidden/demoted per setting; remaining items sort by price.

**Done:** Allergen disclaimer impossible to bypass when allergens are active.

---

### Phase 6 — Profiles System (Save / Load / Sentence Editor / Live Updates)

**Status:** `[ ]` not started — no profiles screen. The `profiles` table exists remotely; the schema is ahead of the app.

**Goal:** User can save filter combinations as named profiles with emoji avatars and edit them in the "Looking for menu items that are [...]" sentence style described in the brief.

**Deliverables:**

- Profiles tab: list of profile cards (emoji-as-avatar gradient circle, name h2, sentence preview).
- Profile detail sheet (opens from Profiles tab via `@gorhom/bottom-sheet` — not a separate screen; hard screen-count constraint): sentence-style editor where each bracketed chunk is a tappable chip that opens the matching filter sub-editor in a nested sheet.
- Save-as-profile flow accessible from active filter state.
- Profile picker on Home replaces placeholder header from Phase 2: profile circle + name + sentence summary; tap to switch profile; long-press to edit.
- **Live update**: when a profile is active and the user edits a filter chip, the current results screen re-ranks in place (no re-scan) and subtly prompts: *"Save changes to [profile]?"* with `Save` / `Keep as one-off` actions.
- Profile name capped at 32 chars (DB constraint + form validation).
- Emoji picker (`rn-emoji-keyboard` or similar lightweight lib).

**Verification:** Create profile "Post-gym 💪" with `[high-protein, high-carb]` + calorieRange `{min: 600, max: 1200}`. Switch from Home, scan a menu, results respect it, edit calorieRange inline, see the "Save changes?" prompt, confirm, profile updates.

**Done:** Three saved profiles round-trip through scan → result → edit → save with no data loss.

---

### Phase 7 — History Log (ChatGPT-Style Search + Recall)

**Status:** `[ ]` not started — no history screen, **and no data behind it**: the app never writes a `scans` row (see Phase 2). Building this needs the Phase-2 persistence deliverable first.

**Goal:** User can find and reopen any past scan, see filters used at the time, and original results. **Image re-view is device-local only** (see Section 4) — UI must communicate this gracefully.

**Deliverables:**

- History tab: reverse-chrono list of `scans` rows with auto-generated titles, date, profile used.
- Search bar: full-text search across `title`, `place_name`, `parsed_items[].name`, and `filters_snapshot.goals[].slug`. Implementation: Postgres `tsvector` generated column, queried via Supabase rpc.
- Scan detail screen:
  - Filters snapshot (read-only chips), full sorted item list.
  - Image carousel: if `local_image_keys` resolve on this device → show photos; if not (different device) → show a friendly placeholder card *"Photos are on your other device"* + parsed items remain fully visible.
  - Action: `Re-rank with current filters` (re-runs ranking client-side using saved `parsed_items`) and `Re-scan` (re-captures images on this device, uploads to a fresh `scans` row).
- Optional: place de-duplication — when two scans share `place_name`, group in list.

**Verification:** Three weeks of dogfood scans are searchable by place name, by item name, and by goal slug. Reopening a scan from 14 days ago on the original device shows photos + `filters_snapshot`. Reopening on a different device shows the parsed items + placeholder.

**Done:** Search latency <300ms on a 200-scan history; second-device experience is graceful (no broken-image icons).

---

### Phase 8 — Feedback System + Custom-Filter Request Capture

**Status:** `[ ]` not started — `feedback` and `custom_filter_requests` tables exist remotely; no UI. `settings.tsx` is a "Coming soon" placeholder.

**Goal:** Frictionless feedback from every relevant surface; turn "I typed a filter that didn't exist" into product intelligence.

**Deliverables:**

- Settings tab: always-visible `Send feedback` text input card (per brief — must be one tap from Settings, not buried).
- Inline feedback entry points:
  - Results card → menu → `This result is wrong` (writes `feedback` with `type=bad_result` + `scan_id` + `item_index`).
  - Results screen header → `Menu was scanned wrong` (writes `type=bad_scan`).
  - Empty-state "no goals matched" → `Wish I could filter by ___` (writes `type=missing_filter` + a `custom_filter_requests` row).
- `submit-feedback` Edge Function forwards to PostHog as event for live monitoring.
- Weekly cron via Supabase scheduled function summarizing top `custom_filter_requests.normalized` values (informs `nutrition_goals` additions over time).

**Verification:** Each entry point creates correct row type. PostHog event fires. Weekly cron summary file is generated.

**Done:** User can post feedback from any screen in ≤2 taps.

---

### Phase 9 — Vision Model Consolidation + Optional USDA Macro Normalization

**Status:** `[~]` Model consolidation is deployed: Stage 1a `mistral-ocr-4-0` → Stage 1b
`gpt-4.1-2025-04-14` → Stage 2 `gpt-4o-2024-08-06` enrichment. Macro accuracy is benchmark-gated
against a USDA FoodData Central **benchmark-only** oracle of **8 dishes** (the oracle never runs in
the app; runtime USDA normalization is still out of scope).

🚀 **CURRENT (2026-08-19): edge function v32 — the DUAL PASS.** Stage 2 runs twice: pass 1 is the
whole menu with today's prompt (its answers used for items that print a weight), pass 2 re-sends only
the items that print NO weight, in their own batches, with one extra sentence and a `system`-role
envelope. Measured: **unweighted dishes 25 → 35–36/72 (35% → 49–50%)**, weighted **unchanged**
(14–17/96 against a fresh 15/96 control, because pass 1's request bytes are identical), Stage 2
**1.56–1.92× slower**, **~$0.03 → ~$0.05 per scan**. Merged to `main` the same day.

⚠️ **THOSE UNWEIGHTED FIGURES ARE ON A RETIRED RULER (2026-08-21).** The unweighted set grew 6 → 9
dishes and the pass rule changed to "the average dish ±20%", so **the denominator is now /108, not
/72, and no pre-2026-08-20 unweighted number is comparable.** Re-measured on one ruler: shipped
`dual` **67/108 (62%)**, pre-dual `baseline` **60/108 (56%)**, and the retired plate-weight Arm A
**36/108**. **Nothing has beaten v32 since it shipped**, so nothing is awaiting deployment — the
blocker is that no better arm has been found, not that a better arm is unreleased. Full detail:
`docs/superpowers/START-HERE.md` §0 and ledger evals 157–158.

History — ✅ **An enrichment fix WAS selected and IS deployed (2026-08-09): "B4", edge function v28.** The
model now supplies ingredient knowledge — a conventional serving and per-100 g composition per
ingredient, plus what the menu's printed weight covers — and the **code** does the fitting,
multiplication and summation. Measured: **39/96 failed field/draws at 37.7% mean error → 24–27/96
at 21.0–21.2%**, over 4 runs × 3 draws. ⚠️ One known regression shipped with it: small dressed side
dishes (Coleslaw) got worse. **GPT-5.5 was measured, beat GPT-4o on macros, and was DECLINED** —
~2.4× slower on Stage 2. Nothing else is authorised for deployment.

**Macro handoff — read in this order:** the master roadmap's `🎯 CURRENT PHASE` block
(`docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md`) is the single source of truth
for status; `docs/superpowers/stage2-macro-benchmark.md` is the living log (Runs, Rulings, the
deployment entry); `docs/superpowers/plans/2026-08-07-stage2-macro-benchmark.md` holds the paid-run
procedure only — its Tasks 1–5 are COMPLETE. Do not rerun paid baselines without a new hypothesis
and Santiago's explicit cost approval. **One decision is open and it is his:** the printed-weight
*scope* convention.
⚠️ **The largest known remaining macro defect is the ACCOMPANIMENT one** — sides and sauces are sized
from a nutrition-label serving rather than what is served: 24% of weighted items, 12–20% of those
dishes' calories. Prose and a duplicate schema field have both failed at it. (The "real-restaurant field test" that used to sit beside it was **closed
2026-08-16 as a false premise** — the fixture menus are real phone photos of real paper menus, not
photos of a screen.)

**Goal:** Pick the winning vision model from Phase 1 testing + production data, lock it via feature flag, optionally improve macro accuracy.

**Deliverables:**

- Curate `vision-models/results.md` with ≥30 real-world test scans per model from accumulated `vision_model_runs` + Phase 2-8 dogfood data. User picks winner.
- Set PostHog feature flag `vision_model.active` to winner; gradual rollout 10% → 50% → 100% over a week, with `scan_failed` rate monitored.
- Remove `/dev/vision-lab` from production builds (keep in dev only).
- **Stretch (if budget remains):** USDA FoodData Central normalization step in `scan-menu` — fuzzy-match each `MenuItem.name` to a USDA entry; overwrite `estimatedMacros` with authoritative values when confidence ≥0.7.

**Verification:** Production scan success rate ≥97%. P95 scan latency <8s.

**Done:** Single model in production. Other adapters remain in code (cheap insurance — do not delete).

---

### Phase 10 — Pricing Strategy + Paywall

**Status:** `[ ]` not started — no RevenueCat/purchases dependency.

**Goal:** Convert without scaring users away. The brief explicitly warns: *"DO NOT FUCK THIS UP."* Treat this phase carefully.

**Deliverables — Research extension** (use Phase 3 base + extend):

- Pull pricing-specific findings from Phase 3 report. Add: Starter Story + Reddit (`r/SaaS`, `r/iOSProgramming`) deep dive on free-tier limits + scan-count strategies. Output: `research/pricing.md`.
- Working hypothesis (refine against research): **5 free scans/month**, then $4.99/mo or $29.99/yr. Profiles + history are free forever (locked retention features = high churn). Higher tier with AI suggestions etc. reserved for later.

**Deliverables — Implementation:**

- StoreKit + Play Billing products configured in App Store Connect + Google Play Console.
- `expo-in-app-purchases` integration; receipt validation in `verify-iap-receipt` Edge Function; entitlement state written to a new `subscriptions` table (add to schema, advisors pass, formalize migration).
- Paywall screen (Cal AI-style — high-quality, single-screen, value prop + social proof + CTA). One yellow CTA.
- Soft paywall after 4th free scan ("1 free scan left this month"), hard paywall after 5th.
- Restore Purchases flow.

**Verification:** TestFlight + internal Android track: subscribe, cancel, restore, sandbox refund — all entitlement transitions correct in <30s.

**Done:** No customer-data-loss bug across upgrade/downgrade/cancel/restore matrix.

---

### Phase 11 — Onboarding

**Status:** `[ ]` not started.

**Goal:** First-run experience → first scan in <2 minutes.

**Deliverables:**

- Apply Phase 3 onboarding findings + Cal AI teardown + user's saved Notion onboarding resources. Output: `research/onboarding.md`.
- Implement onboarding: ~4–6 screens — value prop, permission requests (camera + photo library; defer notifications), select first nutrition goal (becomes auto-profile "Default 🍋"), guided first scan with a sample menu image bundled in the app, paywall preview (without forcing subscribe).
- A/B testable via PostHog feature flag.

**Verification:** New-install → first-scan funnel completes for 80% of internal testers without help.

**Done:** Onboarding completion event fires for ≥80% of new installs in dogfood cohort.

---

### Phase 12 — Analytics + Error Tracking Review

**Status:** `[~]` **PARTIAL** — fatal-JS-error reporting to `public.scan_log` ✅ (`src/lib/crashReporter.ts`, eval 141) and per-scan server telemetry ✅ (`scan_log`). **NOT done:** PostHog and Sentry are both absent from `package.json`.

**Goal:** Confirm full visibility for launch.

**Deliverables — Instrument these PostHog events:**

- `app_opened`, `onboarding_step_completed`, `onboarding_finished`
- `scan_started`, `scan_completed`, `scan_failed` (with error class)
- `goal_added`, `goal_reordered`, `custom_goal_entered`
- `profile_created`, `profile_switched`, `profile_edited`
- `paywall_viewed`, `paywall_dismissed`, `subscription_started`, `subscription_canceled`
- `feedback_submitted` (with type)
- `history_search_used`, `scan_reopened`
- `app_uninstalled` (best-effort via OS lifecycle; partial signal)

**Deliverables — Dashboards:**

- Activation funnel: install → first scan → second scan
- Retention: D1 / D7 / D30
- Subscription: paywall → start → 7d retain
- Quality: scan_failed rate by model, p50/p95 scan latency

**Deliverables — Sentry:**

- All Edge Functions covered. Source maps uploaded automatically via EAS post-build hook.

**Verification:** All events emit in dogfood. Dashboards render with non-zero data.

**Done:** Launch readiness checklist signed off.

---

### Phase 13 — Pre-Launch Security Audit

**Status:** `[ ]` not started.

**Goal:** Confirm no exposed secrets, insecure API surfaces, RLS gaps, or client-side data leaks before the app reaches the public. This phase is the gate between "feature-complete and device-tested" and "preparing to ship."

**Deliverables:**

- Run the full security audit prompt: [https://docs.google.com/document/d/1m1v59_NLWi_M_9o6pSuayUpz_IRIw1-TjWwbI8qFKzU/edit?tab=t.0](https://docs.google.com/document/d/1m1v59_NLWi_M_9o6pSuayUpz_IRIw1-TjWwbI8qFKzU/edit?tab=t.0)
- Audit scope:
  - Edge Function environment variables — no secrets hardcoded, all via Supabase vault or env.
  - RLS policies on all tables — every table locked down; no `anon` write access beyond intended.
  - Client bundle — no API keys shipped to the app (use `expo-constants` + check build output).
  - Image handling — confirm Edge Function logs show zero image bytes retained after response.
  - Hardcoded secrets scan — grep source for patterns like `sk`_, `key=`, `secret`, `password`.
  - Sentry DSN scope — locked to this project only.
- Resolve all **P0/P1** findings before proceeding to Phase 14.
- Log P2+ findings and mitigations in `research/security-audit.md`.

**Verification:** Zero P0/P1 findings. Audit log committed to repo.

**Done:** Audit log signed off. No blockers remain.

---

### Phase 14 — App Store Screenshots, ASO/SEO/AEO, Final Polish

**Status:** `[ ]` not started.

**Goal:** Store listing ready + optimized to convert; visual + accessibility polish complete.

**Deliverables — Screenshots:**

- Apply Phase 3 Cal AI screenshot teardown + competitor screenshots + Notion saved resources. Output: `research/screenshots.md`.
- Design 6–8 screenshot frames per platform: hero ("Eat smarter at any restaurant"), feature highlights (multi-goal stacking, drag-reorder priority, profile system, history search, allergen safety).
- Pirsch Analytics style language — yellow + green accents, DM Sans, real product screens with annotation labels.
- Localize for top 3 markets (US-English first; Spanish + Portuguese fast-follow if revenue justifies).

**Deliverables — ASO/SEO/AEO:**

- Keyword research output: `research/aso.md`.
- App title (~30 char hook, TBD post-research).
- Subtitle (~30 char, feature keywords).
- Description: scannable, benefit-first, 3-bullet feature recap, social-proof block.
- Keywords field: macro-targeted niche keywords (`menu nutrition`, `restaurant calories`, `protein menu`, etc.).

**Deliverables — Final polish:**

- Apply remaining Phase 3 Cal AI findings (referral mechanic, social proof in onboarding, streak/habit nudge that doesn't feel coercive — only if confirmed valuable in research).
- Visual QA pass against `DESIGN.md` on all 6 screens.
- Accessibility pass: minimum tap target 44pt, dynamic type respected, VoiceOver/TalkBack labels on all interactive elements, color contrast WCAG AA across every token combo used.

**Verification:** Store listing draft reviewed by user. ASO keyword score (App Radar / similar) ≥7/10. No P0/P1 issues open.

**Done:** Store listing fully populated, ready to submit. Polish complete.

---

### Phase 15 — Launch

**Status:** `[ ]` not started — TestFlight build 5 is internal testing, not launch.

**Deliverables:**

- Before submitting to the App Store, follow Nick Saraev's complete Expo → App Store publishing guide end-to-end: [https://docs.google.com/document/d/12mIPPoxNnmJnOpDwUXxwmVSFMDG1SVywrQ2ULV1VJKQ/edit?tab=t.0#heading=h.ifd4mhmpnl6d](https://docs.google.com/document/d/12mIPPoxNnmJnOpDwUXxwmVSFMDG1SVywrQ2ULV1VJKQ/edit?tab=t.0#heading=h.ifd4mhmpnl6d) — covers provisioning, EAS build configuration, App Store Connect setup, review guidelines, and common rejection pitfalls.
- App Store + Google Play submission.
- Production PostHog + Sentry monitoring on. Rollback plan ready (EAS Update rollback path documented).

**Verification:** Both stores approve. Production dashboards green.

---

### Phase 16 — Post-Launch Outreach / Marketing

**Status:** `[ ]` not started.

**Goal:** Validate channels per brief.

**Deliverables:** Outreach plan options written up: self-driven content vs. paid creator partnership, region targeting (start with one English-speaking metro + one Spanish-speaking metro to test localization ROI). Pull cross-app feature-request audiences identified in Phase 3 (e.g. r/MacroFactor users who explicitly asked for menu scanning) as targeted launch posts. Output: `research/launch-channels.md`. User decides which to pursue.

---

## 7. Critical Files to be Created / Modified

(Anchor list for backend + frontend agents. Paths are project-relative.)

**Configuration & contracts**

- `CLAUDE.md` — copy of `Downloads/CLAUDE (1).md`
- `DESIGN.md` — copy of `Downloads/DESIGN.md`
- `src/design-system/theme.ts` — token source of truth
- `src/shared/schemas/filters.ts` — zod filter schema
- `src/shared/schemas/menuItem.ts` — zod MenuItem schema (shared with edge function)
- `supabase/migrations/0001_init.sql` — full section-4 schema (formalized after advisors pass)
- `supabase/seed.sql` — seeded `nutrition_goals`
- `supabase/functions/scan-menu/index.ts` — orchestrator
- `supabase/functions/scan-menu/providers/{gemini-1-5,gemini-2-0,mistral-ocr,gpt-4o}.ts`
- `supabase/functions/verify-iap-receipt/index.ts`
- `supabase/functions/submit-feedback/index.ts`
- `src/shared/images/index.ts` — local-only image pipeline (save / compress / evict)
- `vision-models/results.md` — running test journal
- `research/competitive-and-feature-demand.md` — Phase 3 output, binding addendum

**Phase-1 walking-skeleton screens (6 total)**

- `app/_layout.tsx`, `app/(tabs)/index.tsx`, `app/(tabs)/settings.tsx`, `app/dev/styleguide.tsx`, `app/dev/vision-lab.tsx`
- Do not create `profile/[id].tsx` (profile editor is a sheet) or `scan/review.tsx` (review is inline in camera).

**Existing utilities to reuse / patterns to mirror**

- `react-native-draggable-flatlist` — official drag-to-reorder; do not invent.
- `@gorhom/bottom-sheet` — all editors and detail views are sheets, not navigable screens.
- `@supabase/supabase-js` standard client (mobile; `supabase/ssr` is not needed). Used directly from Zustand async actions for all server-state fetching.
- `posthog-react-native` with autocapture; explicit events still required for funnel steps.
- Supabase Agent Skills (`supabase/agent-skills`) — installed in Phase 1; all backend work flows through its `SKILL.md` rules.

---

## 8. Verification — How to Prove This Works End-to-End

Per-phase verification is listed inside each phase. Launch-readiness checklist:

1. **Main loop**: install fresh → anonymous login auto-creates user → goal picker → scan → see sorted results — under 60s on a real device, 3 different physical menus.
2. **Multi-device history**: scan on phone A, upgrade anonymous account to Apple ID, sign in on phone B, see same scan (parsed items + filters) in history; image placeholder on phone B is graceful.
3. **Allergen safety**: with `allergens=["peanut"]` set, no peanut-containing item ranks above an allergen warning banner. Disclaimer cannot be dismissed.
4. **Profile live-update**: edit a chip in the sentence editor; results re-rank in place; "Save changes?" prompt appears.
5. **Subscription matrix**: subscribe → cancel → resubscribe → restore on a second device — all entitlement states correct.
6. **Crash-free sessions**: ≥99.5% in 100 dogfood sessions across both platforms.
7. **Scan success rate**: ≥97% in 100 real menus across cuisines + countries.
8. **P95 scan latency**: <8s.
9. **Analytics**: all events from Phase 12 fire correctly in PostHog production project.
10. **Accessibility**: VoiceOver pass on home + scan + results + profile editor screens.
11. **Storage discipline**: Supabase Storage usage on the project remains at 0 bytes. No bucket exists.
12. **Supabase advisors**: zero unresolved issues at launch.

---

## 8a. Known issues (carry forward)

- **Tab-bar label crop with DM Sans Medium** (Phase 1a). React Navigation's auto-sized tab bar clips the descender on DM Sans Medium. Tracked for Phase 1b polish — likely fix is either drop to 11px + custom line-height + manual `tabBarStyle.height`, or hide labels entirely and rely on icons (Pirsch-style). Do not re-derive the tab-bar height from `useColorScheme()` — that hook is hard-pinned to `"light"`.

## 9. Open Items Deferred (Not Blocking)

Flagged but intentionally **not** in the main-feature path. Address only when a phase opens for them or user requests:

- USDA FoodData Central macro normalization (Phase 9 stretch).
- Future "Notes" field on profiles (already in `profiles` schema for forward-compat with the brief's AI-suggestions feature).
- Future `subscriptions` table for entitlement state is intentionally deferred to Phase 10 paywall work; do not add it to Phase 1c.
- Restaurant-owner claim flow / Uber Eats menu import / community leaderboards — brief's "Extra later-to-develop" section. Out of scope here.
- Optional later: opt-in cloud image backup via Supabase Storage as a paid-tier perk (revisit only if user demand surfaces in Phase 3 research; default remains local-only).

---

**End of plan.**
