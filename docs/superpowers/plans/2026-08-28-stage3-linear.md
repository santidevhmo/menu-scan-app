# Stage 3 — Populate Linear — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `linear.app/menu-scan-app` from an empty workspace into the single source of truth for Menu Scan's status — 4 initiatives, 16 projects, milestones where they earn their place, and one issue per unchecked roadmap item.

**Architecture:** Labels first (issues reference them), then projects, then milestones, then issues. Initiatives are created by hand in the UI because this MCP build has no tool for them. Every issue traces to a specific unchecked line in `docs/sunny-lemon-development-plan.md` — nothing is invented.

**Tech Stack:** The `linear-server` MCP. No code, no repo changes.

**Spec:** `docs/superpowers/specs/2026-08-28-kb-and-linear-design.md`

**Prerequisite:** Stages 1 and 2 complete and their acceptance checks passing.

## Global Constraints

- **Confirm the workspace before the first write.** `get_workspace()` must return **`Menu Scan App`**. If it returns anything else — `SendTech Product` especially — **stop**. A misfile is silent: nothing errors, the work just lands in a backlog nobody reviews.
- **Team:** `Menu Scan App` (the only team; id `1d843592-9729-422f-ac33-35f7fcb82703`).
- **NO DATES.** Not on initiatives, not on projects, not on milestones, not on issues. The roadmap has none, and invented dates render as overdue badges for deadlines nobody set.
- **No estimates, no priorities, no cycles, no assignees.** Solo plus agents. Guessed priority reads later as a decision.
- **Forward-only.** Never create an issue for work already done. Completed work is one paragraph in the project description.
- **Never invent an issue.** Every issue traces to a line in the roadmap. If you cannot point at the line, do not create the issue.
- **Pass `&` literally, never `&amp;`.** HTML escaping is stored verbatim and renders as five characters on screen.
- **Draft, show, then write.** Projects especially — they carry the roadmap view.

---

### Task 1: Guard the workspace, then create the labels

**Interfaces:**
- Consumes: nothing
- Produces: the label vocabulary every later task applies. Issues cannot be labelled before this exists.

- [ ] **Step 1: Confirm the workspace — before anything else**

```
get_workspace()
```

Expected: `{"name": "Menu Scan App", "url": "https://linear.app/menu-scan-app"}`.

**If it returns anything else, STOP and tell the user which workspace the MCP is actually connected to.** Do not adapt this plan to another workspace.

- [ ] **Step 2: Check what already exists**

```
list_issue_labels(limit: 100)
list_projects(team: "Menu Scan App")
```

Expected at first run: three built-in labels (`Bug`, `Improvement`, `Feature`) and **zero** projects. If projects already exist, someone has run this plan before — **stop and ask** rather than creating duplicates.

- [ ] **Step 3: Discover whether label groups are supported**

```
create_issue_label(name: "area", team: "Menu Scan App")
```

Then inspect the tool's schema for a parent/group parameter. **If grouped labels are supported**, create the eight `area` labels as children of `area`, which makes them mutually exclusive — applying two is rejected outright. **If they are not**, delete the `area` label you just made and use flat prefixed names (`area/pipeline`, …); exclusivity then becomes convention rather than enforcement. Record which of the two you did — Task 5 needs to know the exact label names.

- [ ] **Step 4: Create the eight `area` labels**

| Label | For |
|---|---|
| `pipeline` | OCR, extraction, enrichment, oracle, evals, the edge function |
| `app` | React Native client — screens, state, navigation |
| `backend` | Supabase, migrations, RLS, edge function plumbing |
| `design` | Design system, styleguide, visual and accessibility polish |
| `security` | Secrets, RLS gaps, audit, data handling |
| `analytics` | PostHog, Sentry, instrumentation, dashboards |
| `marketing` | ASO, screenshots, store listing, outreach |
| `docs` | Documentation and the knowledge base |

Each of these appears in three or more phases — that is why it is a label and not just a project. Labels that would name exactly one project (`paywall`, `onboarding`, `app-store`, `auth`) are deliberately **not** created; the project already says it.

- [ ] **Step 5: Create the three extra `type` labels**

`research` · `idea` · `chore`. Linear's built-in `Bug` / `Feature` / `Improvement` sit outside the group — treat all six as one vocabulary.

- [ ] **Step 6: Create the two behaviour labels, with descriptions**

- **`needs-decision`** — description: *"Blocked on a product call from Santiago. Nobody starts this, human or agent. An agent that guesses at a product question produces confident wrong work that costs more to unpick than to have waited."*
- **`agent-ready`** — description: *"Spec is complete enough to execute unattended. Nothing touching production data, payments, or a live API key is ever agent-ready, however well written."*

- [ ] **Step 7: Verify**

```
list_issue_labels(limit: 100)
```

Expected: 3 built-ins + 8 area + 3 type + 2 behaviour = **16**.

---

### Task 2: Create the four initiatives — by hand

**Interfaces:**
- Consumes: nothing
- Produces: the four containers Task 3's projects are dropped into.

**This task cannot be automated.** This MCP build exposes no initiative tool at all — no `create_initiative`, no `list_initiatives`, no `save_initiative`. Initiatives are UI-only. Do not work around it by inventing a project instead.

- [ ] **Step 1: Confirm initiatives are enabled in the workspace**

They may need turning on in workspace settings. If the sidebar has no Initiatives section, that is the first click.

- [ ] **Step 2: Ask Santiago to create these four, in this order**

Give him this list verbatim, names and descriptions:

| # | Name | Description |
|---|---|---|
| 1 | **Foundation** | The walking skeleton. Design-system primitives, database migrations in-repo, auth, and the observability that everything else reports through. Nothing here is user-visible; everything downstream depends on it. |
| 2 | **Core Loop** | Photo → sorted list. The one thing that has to be right. Scanning, ranking, filtering, and the macro pipeline behind them. A sorted list that is wrong is worse than no app, because the user acts on it in a restaurant. |
| 3 | **Growth & Retention** | Everything optional around the loop — research, profiles, history, feedback, pricing and onboarding. Sequenced after the loop deliberately: none of it is worth building on top of a loop that is not solid. |
| 4 | **Launch** | Security audit, store listing, submission, and post-launch outreach. The gate between feature-complete and public. |

- [ ] **Step 3: Record the initiative names exactly as created**

Task 3 assigns projects to them. If Santiago renames one, use his name, not this plan's.

- [ ] **Step 4: Check whether `save_project` can assign an initiative**

Inspect the `save_project` schema for an initiative parameter. **If it accepts one**, Task 3 assigns as it creates. **If not**, Task 3 creates all 16 projects unassigned and Santiago drags them into initiatives in the UI afterwards — note that as a handoff step and do not block on it.

---

### Task 3: Create the sixteen projects

**Interfaces:**
- Consumes: the initiative names from Task 2
- Produces: the 16 projects every issue attaches to. **An issue cannot belong to an initiative — only a project can**, so a project-less issue is invisible to every roadmap view.

**Every project description follows the same three-part shape:** what the phase is for · what already shipped (one paragraph, per D12 — this is where completed work is recorded instead of as closed issues) · what is left. **No dates on any of them.**

- [ ] **Step 1: Create the Foundation projects**

| Project | Initiative | Already shipped (for the description) |
|---|---|---|
| **Phase 1 — Bootstrap, Design System, Auth Shell, Vision Harness** | Foundation | Expo 56 + NativeWind v5 + `DESIGN.md` tokens are in place (1a). The Supabase database exists remotely with six tables and RLS on all of them, but no migration or generated types are in this repo (1c). The image pipeline is done — compress, tile, passthrough upload (1f). |
| **Phase 12 — Analytics & Error Tracking** | Foundation | Fatal-JS-error reporting to `public.scan_log` works, and per-scan server telemetry is live. PostHog and Sentry are both absent from `package.json`. |

- [ ] **Step 2: Create the Core Loop projects**

| Project | Initiative | Already shipped |
|---|---|---|
| **Phase 2 — MVP: Single Photo → Sorted Results** | Core Loop | The core loop ships and is device-verified: camera → review → extract → enrich → goal-ranked results. Extraction quality far exceeds this phase's original bar. **No `scans` row is ever written** — the app only calls the edge function. |
| **Phase 4 — Multi-Goal Selection & Multi-Page Scans** | Core Loop | Multi-goal selection with z-score weighting ships. Multi-page scanning ships and goes well beyond the original scope — per-page wiring, dense auto-cutter, rotation handling. |
| **Phase 5 — Calorie Range, Allergens, Price Sort, Gallery** | Core Loop | Allergen filters ship with per-item warnings and the mandatory disclaimer card. Gallery import ships. |
| **Phase 9 — Vision Model Consolidation & Macro Accuracy** | Core Loop | **The macro-accuracy half is CLOSED (2026-08-28).** Production is edge fn v33 FORM sizing, live since 2026-08-23. Exit numbers and their caveats: `menu-scan-kb` → `docs/pipeline/closed-phases.md`. Model consolidation is deployed: Mistral OCR → GPT-4.1 → GPT-4o. |

For Phase 9, append this to the description verbatim:

> 🚫 **Do not re-open the macro accuracy work as bugs, and do not schedule a new Stage-2 arm without a new hypothesis and Santiago's explicit approval.** Eleven arms have been tried since `dual`; none beat `FORM` with a CI excluding zero.

- [ ] **Step 3: Create the Growth & Retention projects**

`Phase 3 — User & Competitive Research` · `Phase 6 — Profiles` · `Phase 7 — History Log` · `Phase 8 — Feedback & Custom-Filter Capture` · `Phase 10 — Pricing & Paywall` · `Phase 11 — Onboarding`.

All six are `[ ]` not started, so each description says what the phase is for and states plainly that nothing has shipped. Two carry a dependency worth recording:

- **Phase 7** — *"Blocked on Phase 2's persistence deliverable. There is no data behind this phase: the app has never written a `scans` row."*
- **Phase 6 and Phase 8** — *"The database tables already exist remotely; the schema is ahead of the app. No UI exists."*

- [ ] **Step 4: Create the Launch projects**

`Phase 13 — Pre-Launch Security Audit` · `Phase 14 — App Store Screenshots & ASO` · `Phase 15 — Launch` · `Phase 16 — Post-Launch Outreach`.

For Phase 15, record: *"TestFlight build 7 is internal testing only. Not submitted to either store."*

- [ ] **Step 5: Verify all sixteen exist with no dates**

```
list_projects(team: "Menu Scan App", fields: ["id","name","targetDate","startDate","initiatives"])
```

Expected: 16 projects, every `targetDate` and `startDate` **null**. A non-null date means one was invented — clear it.

---

### Task 4: Add milestones only where a phase genuinely has sub-phases

**Interfaces:**
- Consumes: the projects from Task 3
- Produces: milestones for Phase 1. Task 5 attaches issues to them.

**Only Phase 1 gets milestones.** It is the one phase the roadmap itself decomposes (1a–1f). Linear's docs describe milestones as "stages in a project's lifecycle", and a project with four issues does not have stages — it has four issues. Do not add milestones elsewhere just for symmetry.

- [ ] **Step 1: Create five milestones on Phase 1, in this order**

| Milestone | Covers |
|---|---|
| `1b — Component primitives & /styleguide` | The design-system primitives and the developer route. **This is the next work item** per the roadmap's §0 rule. |
| `1c — Migrations, RLS & generated types in-repo` | The database exists remotely; getting it into the repo. |
| `1d — Auth (Clerk)` | The Clerk decision is made; the data-model consequence is not. |
| `1e — Vision harness` | Superseded in substance by the offline eval harness. Recorded, not scheduled. |
| `1f — Observability` | Sentry and PostHog. |

`1a` gets no milestone — it is done, and per D4 completed work is not filed.

- [ ] **Step 2: Add this note to the `1e` milestone description**

> Superseded in substance by the offline extraction eval harness (`scripts/`, nine fixture menus, the oracle files, the ledger), which is far stronger for extraction but is not an in-app screen. Kept because the roadmap never marked it done — decide whether to close it as superseded rather than build it.

- [ ] **Step 3: Verify**

```
list_milestones(project: "Phase 1 — Bootstrap, Design System, Auth Shell, Vision Harness")
```

Expected: five, no dates.

---

### Task 5: Create the issues

**Interfaces:**
- Consumes: labels (Task 1), projects (Task 3), milestones (Task 4)
- Produces: the workspace's actual content.

**Every issue below traces to an unchecked line in `docs/sunny-lemon-development-plan.md`.** Nothing here is invented. Each issue's description must name the phase and quote or closely paraphrase the source line, so a reader can find it again.

**Format for every issue:** title = the outcome in the roadmap's own words · description = what and why, plus the source phase · exactly one `area` label · one type · `needs-decision` or `agent-ready` only where stated below.

- [ ] **Step 1: Phase 1 issues — attach each to its milestone**

**Milestone `1b`** (area `design`, type `Feature`):
- Build all component primitives listed in roadmap §3 — `Button` (primaryYellow / secondaryGreen / ghost / danger), `Card`, `Tag`, `TextInput`, `Sheet`, `Screen`, `Heading`, `Body`, `Caption`, `Divider`, `EmptyState`, `LoadingPulse`
- Build a developer-only `/styleguide` screen rendering every primitive in every variant
- Fix the tab-bar label crop with DM Sans Medium *(area `design`, type `Bug`; description must carry: do not re-derive the bar height from `useColorScheme()` — it is hard-pinned to `"light"`)*
- Install the missing dependencies: `react-native-draggable-flatlist`, Sentry, PostHog *(area `app`, type `chore`)*

**Milestone `1c`** (area `backend`):
- Commit a formalized `0001_init.sql` migration — the remote database has six tables and RLS, none of it is in the repo *(type `Feature`)*
- Generate and commit Supabase TypeScript types *(type `chore`)*
- Apply `seed.sql` with the default `nutrition_goals` catalog *(type `chore`)*
- Run Supabase database advisors and resolve or document every finding *(type `chore`)*
- Resolve the `supabase db lint` decision — if output stays PostGIS-only, document that explicitly *(type `chore`)*
- Fix the NativeWind wrapper type-depth errors in `src/tw/image.tsx` and `src/tw/index.tsx` blocking a full compile *(area `app`, type `Bug`; description must note these are **not** Supabase type-generation failures)*

**Milestone `1d`** (area `backend`):
- ⚠️ **Decide the `auth.uid()` consequence of choosing Clerk** *(type `Feature`, label **`needs-decision`**)*. Description: every table is declared owned by `auth.uid()` with RLS, and `profiles.user_id` and `feedback.user_id` are `references auth.users` — Supabase-native constructs Clerk does not populate. Either Clerk JWTs get wired into Supabase so `auth.uid()` resolves, or those foreign keys and policies change shape. **This must be decided before the first migration is written, which means it blocks milestone `1c`.**
- ⚠️ **Reconcile roadmap §2's Auth row with the Clerk ruling** *(area `docs`, type `chore`, label **`needs-decision`**)*. §2 still reads "Deferred — no auth gate at launch" while 1d says Clerk. One of the two is wrong.
- Install and wire Clerk *(type `Feature`)*. Description must state that the four Phase-1d deliverables in the roadmap are written against Supabase auth and are **void as written**.

**Milestone `1e`** (area `pipeline`, type `chore`):
- Decide whether to close `1e` as superseded by the offline eval harness, or build the in-app vision lab *(label **`needs-decision`**)*

**Milestone `1f`** (area `analytics`, type `Feature`):
- Wire Sentry across client and edge functions, with source maps uploaded via an EAS post-build hook
- Wire PostHog with autocapture and a stable device-level anonymous `distinct_id`

- [ ] **Step 2: Phase 2 issues**

- **Persist each scan — write the `scans` row** *(area `app`, type `Feature`)*. Description: the single named not-done deliverable of Phase 2. The app calls the edge function and never writes a row. Phase 7 (History) has no data behind it until this ships. Include `local_image_keys` referencing the on-device file.
- Emit the `scan_completed` PostHog event with duration, model and tokens *(area `analytics`, type `Feature`)*
- Confirm edge-function logs retain zero image bytes after response *(area `security`, type `chore`)*

- [ ] **Step 3: Phase 4 issues** *(area `app`)*

- Drag-to-reorder goal priority with `react-native-draggable-flatlist` *(type `Feature`)*
- Free-text "type your own goal" input, persisted to `custom_filter_requests` *(type `Feature`)*
- Honour goal priority order in ranking, so higher-priority goals weight `matchScore` more heavily *(type `Feature`)*

- [ ] **Step 4: Phase 5 issues** *(area `app`, type `Feature`)*

- Calorie-range filter — presets (`<400`, `<600`, `>500`, custom) plus a numeric range input, wired to `filters.calorieRange`
- Price ascending/descending sort toggle on the results screen

- [ ] **Step 5: Phase 9 issues** — the remaining work only, not the closed macro half

- Roll out the PostHog `vision_model.active` feature flag 10% → 50% → 100% with `scan_failed` monitored *(area `pipeline`, type `Feature`)*
- Remove `/dev/vision-lab` from production builds *(area `pipeline`, type `chore`)*
- ⚠️ **Decide the printed-weight scope convention** *(area `pipeline`, type `Feature`, label **`needs-decision`**)*. Named as open in the roadmap's Phase 9 handoff and never settled.
- **Present macros as a RANGE, not a confident integer** *(area `app`, type `Feature`)*. Description: 38 of 57 dishes score differently run to run, so a user rescanning one menu sees different numbers. This is a UX problem, not an accuracy one. `612 kcal` in a confident font is not defensible; a range is.
- Measure off-corpus accuracy — hand-rule one unseen menu into the oracle *(area `pipeline`, type `research`)*. Description: all 57 oracle dishes come from the five menus the gram table was built from. True off-corpus performance is bounded 54–62% and has never been measured. Costs oracle labour, not API spend.
- The accompaniment defect — sides and sauces are sized from a nutrition-label serving rather than what is served *(area `pipeline`, type `Bug`)*. Description: 24% of weighted items, 12–20% of those dishes' calories. Prose and a duplicate schema field have both failed at it. **Accepted, not solved.**

- [ ] **Step 6: Phase 3, 6, 7, 8, 10, 11 issues**

Create issues from each phase's Deliverables list, one per bullet, keeping the roadmap's own wording. **Use this table to check completeness** — if your count for a phase is short, you skipped a bullet; if it is over, you split one that should have stayed whole.

| Phase | Expected issues | Default `area` | Default type |
|---|---|---|---|
| 3 — User & Competitive Research | **7** — 3 research targets (direct competitors; adjacent apps and review mining; top-N requested filter types) + 4 process (review-aggregation pass; quote bank; synthesized report; Cal AI teardown) | `marketing` | `research` |
| 6 — Profiles | **7** — profiles tab; profile detail sheet; save-as-profile flow; Home profile picker; live re-rank with "Save changes?" prompt; 32-char name cap; emoji picker | `app` | `Feature` |
| 7 — History Log | **6** — history tab; full-text search; scan detail screen; image carousel with second-device placeholder; re-rank and re-scan actions; optional place de-duplication | `app` | `Feature` |
| 8 — Feedback | **6** — Settings feedback card; 3 inline entry points (bad result, bad scan, missing filter); `submit-feedback` edge function forwarding to PostHog; weekly cron summarising `custom_filter_requests` | `app` (the cron and the edge function are `backend`) | `Feature` |
| 10 — Pricing & Paywall | **7** — 2 research (pricing findings pull; refine the hypothesis) + 5 implementation (store products; IAP integration and receipt validation; paywall screen; soft-then-hard paywall gating; restore purchases) | `app` (`backend` for receipt validation) | `Feature` |
| 11 — Onboarding | **3** — apply research findings; implement the 4–6 screen flow; make it A/B testable via a PostHog flag | `app` | `Feature` |

Notable flags:

- **Phase 3** *(area `marketing`, type `research`)* — one issue per research target group (direct competitors; adjacent apps and review mining; top-N requested filter types), plus the three process deliverables (review-aggregation pass, quote bank, synthesized report). The synthesized report issue must note it is *a binding addendum to the roadmap* — Phases 4–15 plan against its findings.
- **Phase 10** *(area `app`)* — the pricing hypothesis (5 free scans/month, $4.99/mo or $29.99/yr) is **Proposed, not Decided**; file it with label **`needs-decision`** and quote the roadmap's own warning about this phase verbatim.
- **Phase 7** — every issue's description opens by noting the phase is blocked on Phase 2's persistence issue.
- **Phase 8** — a weekly cron summarising top `custom_filter_requests` is `backend`; the UI entry points are `app`.

- [ ] **Step 7: Phase 13, 14, 15, 16 issues**

- **Phase 13** *(area `security`)* — one issue per audit scope item (edge-function env vars; RLS on all tables; no API keys in the client bundle; zero image bytes retained; hardcoded-secrets grep; Sentry DSN scope), plus "resolve all P0/P1 findings" as a gate. Include the audit-prompt URL in the description. **Add a check that Supabase Storage usage is still 0 bytes and no bucket exists** — that is the one-line proof ADR-0002 still holds.
- **Phase 14** *(area `marketing`, except the two polish issues which are `design`)* — screenshots, ASO keyword research, listing copy, plus a visual QA pass against `DESIGN.md` and an accessibility pass (44pt targets, dynamic type, VoiceOver/TalkBack labels, WCAG AA contrast).
- **Phase 15** *(area `marketing`)* — follow the Expo → App Store publishing guide end-to-end (include the URL); store submissions; production monitoring on with a documented EAS Update rollback path.
- **Phase 16** *(area `marketing`, type `research`)* — the outreach plan, one issue.

- [ ] **Step 8: The docs-debt and KB-stub issues** *(area `docs`)*

- Fill `docs/personas/` — no user research exists *(type `research`)*. Description: currently an honest stub. **An invented persona is worse than an empty directory**, because it gets cited later as evidence. Depends on Phase 3.
- Fill `docs/brand/` — no positioning, voice or naming rationale exists *(type `research`, label **`needs-decision`**)*
- Update the pipeline sequence diagram — `docs/superpowers/diagrams/menu-extraction-pipeline.md` was last updated 2026-08-09 and predates v33 FORM sizing *(type `chore`)*

- [ ] **Step 9: Verify the issue set**

```
list_issues(team: "Menu Scan App", limit: 250)
```

Check every one of these:

| Check | Expected |
|---|---|
| Issues with no project | **zero** — a project-less issue is invisible to every roadmap view |
| Issues with a due date | **zero** |
| Issues with a priority or estimate | **zero** unless the roadmap implied one |
| Issues with no `area` label | **zero** |
| Issues with two `area` labels | **zero** |
| Issues in a `completed` or `canceled` state | **zero** — this is forward-only |
| `needs-decision` count | **7** — the Clerk `auth.uid()` consequence, §2's Auth row, `1e`'s fate, the printed-weight convention, the pricing hypothesis, the brand direction, and any you added deliberately |

---

### Task 6: Stage acceptance

- [ ] **Step 1: The shape is right**

```
get_workspace()
list_projects(team: "Menu Scan App", fields: ["id","name","initiatives","milestones"])
```

Expected: workspace `Menu Scan App`; 16 projects; each in one of the four initiatives (or flagged for Santiago to drag, per Task 2 Step 4); Phase 1 carrying five milestones and no other project carrying any.

- [ ] **Step 2: Nothing carries an invented date**

Confirm every project, milestone and issue has null dates. This is the check most likely to have drifted, because several MCP calls accept a date and it is easy to pass one.

- [ ] **Step 3: Spot-check traceability**

Pick five issues at random. For each, open `docs/sunny-lemon-development-plan.md` and find the unchecked line it came from. **If you cannot find the line, the issue was invented — delete it.**

- [ ] **Step 4: The next action is discoverable**

Open the Foundation initiative. The lowest-numbered unchecked work should be visibly `1b — Component primitives & /styleguide`. If a reader cannot tell in one glance what to do next, the structure has failed at its only real job — say so rather than declaring success.

- [ ] **Step 5: Report**

Report to Santiago: counts of initiatives, projects, milestones and issues; the seven `needs-decision` issues listed by title, because those are the ones that block work and only he can clear them; and anything you had to leave for him to do in the UI.

---

## Handoff — what Santiago has to do himself

1. **Create the four initiatives** (Task 2) — UI-only, no MCP tool exists.
2. **Drag the 16 projects into them**, if `save_project` turned out not to accept an initiative.
3. **Clear the seven `needs-decision` issues.** The `auth.uid()` one is the most urgent: it blocks the first migration, which blocks milestone `1c`.
