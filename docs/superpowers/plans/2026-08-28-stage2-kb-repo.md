# Stage 2 — `menu-scan-kb` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the private repo `santidevhmo/menu-scan-kb` — durable Menu Scan product and pipeline knowledge, delivered as Claude Code skills installed by symlink, modelled on `SendtoWin/sendtech-product-kb`.

**Architecture:** Curated prose under `docs/`, thin skills under `skills/` that route to it. `install.sh` symlinks each skill directory into `~/.claude/skills/`, so `git pull` is the entire update and no second copy can drift. One document moves wholesale (the ledger); everything else is **distilled** — the KB stores what an agent cannot find by looking, and points at the app repo for what it can.

**Tech Stack:** git, `gh` CLI (authenticated as `santidevhmo`), POSIX `sh`, markdown. No build, no runtime, no CI.

**Spec:** `docs/superpowers/specs/2026-08-28-kb-and-linear-design.md`

**Prerequisite:** Stage 1 (`2026-08-28-stage1-docs-repair.md`) is complete and its Task 8 acceptance checks all pass. This plan reads paths that Stage 1 creates (`docs/archive/…`). Do not start otherwise.

## Global Constraints

- **Two repos are in play.** `APP` = the worktree `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app/.claude/worktrees/stage2-macro-benchmark`. `KB` = the new clone. Every step says which one it runs in. Getting this wrong is the single most likely failure in this plan.
- **The KB repo is private and stays private.** Never `gh repo edit --visibility public`.
- **Distil, do not duplicate.** A fact that exists in the app repo's code or config is **pointed at**, never restated. The exception is the ledger, which moves wholesale by ruling D9.
- **Every stored document carries a provenance header** — a `>` blockquote naming the source file, the date it was filed, and how far it can be trusted.
- **No orphans.** Every file under `KB/docs/` must have a row in some skill's "Source documents" table. Task 10 checks this.
- **Skills stay under ~150 lines.** Past that, demote detail into `docs/` behind a pointer.
- **Never invent** a persona, a brand value, a date, a metric, or a status. Empty means empty — say so.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  ```

---

### Task 1: Create the repo and its skeleton

**Files:**
- Create: the repo `santidevhmo/menu-scan-kb`, plus `KB/README.md` and the empty directory tree

**Interfaces:**
- Consumes: nothing
- Produces: `$KB`, the absolute path to the clone. Every later task uses it.

- [ ] **Step 1: Confirm `gh` is authenticated as the right account**

Run in `APP`:

```bash
gh auth status
```

Expected: `Logged in to github.com account santidevhmo`. If it names a different account, **stop** — the repo would land in the wrong place, and D2 named `santidevhmo` specifically.

- [ ] **Step 2: Create the private repo and clone it beside the app repo**

```bash
gh repo create santidevhmo/menu-scan-kb --private \
  --description "Menu Scan product and pipeline knowledge base"
git clone https://github.com/santidevhmo/menu-scan-kb.git \
  /Users/santiagoaguirre/Desktop/CODING/menu-scan-kb
export KB=/Users/santiagoaguirre/Desktop/CODING/menu-scan-kb
export APP=/Users/santiagoaguirre/Desktop/CODING/menu-scan-app/.claude/worktrees/stage2-macro-benchmark
echo "$KB" > /tmp/menuscan-kb-path
echo "$APP" > /tmp/menuscan-app-path
```

**Both variables are used by every remaining task in this plan.** If your shell resets between
tasks, re-export them from those two files before continuing — a step that runs against the wrong
repo is the most likely way this plan goes wrong.

- [ ] **Step 3: Verify it is private**

```bash
gh repo view santidevhmo/menu-scan-kb --json isPrivate,name
```

Expected: `"isPrivate": true`. If false, **stop and fix it before writing a single document** — the ledger is going in here.

- [ ] **Step 4: Create the directory tree**

```bash
cd $KB
mkdir -p docs/adr docs/pipeline docs/research docs/design-system docs/personas docs/brand
mkdir -p skills/menuscan-product skills/menuscan-pipeline skills/menuscan-research \
         skills/menuscan-design-system skills/menuscan-linear
```

- [ ] **Step 5: Write `KB/README.md`**

```markdown
# Menu Scan knowledge base

Curated product and pipeline knowledge for **Menu Scan** — what the product is, what the
extraction pipeline has learned, what was already tried and failed — plus the `menuscan-*`
Claude Code skills that read it.

**This is a separate repository from the application.** It is not part of `menu-scan-app` and its
contents must never be committed there.

## Layout

| Path | What |
|---|---|
| `skills/` | The `menuscan-*` skills. Start at `menuscan-product/SKILL.md` — it is the hub. |
| `docs/pipeline/` | The eval ledger, the lessons, the oracle rules, the closed-phase numbers. |
| `docs/research/` | Competitors, prior art, the portion-estimation literature. |
| `docs/design-system/` | Why the design tokens are what they are. The tokens themselves live in the app. |
| `docs/adr/` | Architecture decision records. |
| `docs/personas/`, `docs/brand/` | Empty. See the stubs for what belongs there. |

## Skills

| Skill | For |
|---|---|
| `menuscan-product` | Hub — start here (`/menuscan-product`); routes to the rest. |
| `menuscan-pipeline` | The OCR and macro pipeline: what was tried, what failed, why. |
| `menuscan-research` | Competitors, academic prior art, what the literature says we are up against. |
| `menuscan-design-system` | The rationale behind the tokens the app enforces. |
| `menuscan-linear` | Filing work into `linear.app/menu-scan-app`. |

Every `menuscan-*` skill is explicit-invoke only (`/menuscan-product`, …) — an agent cannot call
them on its own.

## Setup

```sh
git clone https://github.com/santidevhmo/menu-scan-kb.git
sh menu-scan-kb/skills/install.sh
```

Clone it anywhere and name it anything — the installer derives its paths from its own location.
Then open Claude Code and type `/menuscan-product`.

`install.sh` writes **symlinks** into `~/.claude/skills/`, one per skill. It copies nothing, so
there is no installed second copy that can drift. It refuses to overwrite a real directory of the
same name.

### Staying up to date

```sh
git -C path/to/menu-scan-kb pull
```

That is the whole update. Because the skills are symlinked rather than copied, edits are live in
the next session with no reinstall. Re-run `install.sh` only when a new skill has been added.

### Why user scope and not the app repo's `.claude/skills/`

Deliberately outside every git worktree: creating and deleting worktrees never takes the skills
with them, and a project-scoped copy **shadows** the user-scoped one, silently serving stale
content from whatever branch that worktree is on.

## Status is not here

What is done and what is next lives in Linear: <https://linear.app/menu-scan-app>. This repo holds
knowledge, not state. **Never quote a benchmark number out of a document** — re-derive it through
the harness in the app repo's `scripts/`.
```

- [ ] **Step 6: Commit and push**

```bash
cd $KB
git add -A
git commit -m "kb: skeleton and README

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push -u origin main
```

---

### Task 2: `BRIEF.md` — what an agent cannot find by looking

**Files:**
- Create: `KB/docs/BRIEF.md`

**Interfaces:**
- Consumes: `APP/AGENTS.md` (Project Overview), `APP/docs/sunny-lemon-development-plan.md` (§1 Context)
- Produces: the file every skill's first line points at. Skills written in Task 8 open with `Read [../../BRIEF.md](../../BRIEF.md) first.`

**The scope rule for this file.** It holds only what an agent **cannot find by looking**. The feature list is in `AGENTS.md`; do not restate it. The schema is in the migration; do not restate it. What goes here is the shape of the problem, the constraints that are not written in any file, and the traps that have cost sessions.

- [ ] **Step 1: Read the sources before writing**

Run in `APP`:

```bash
sed -n '1,60p' AGENTS.md
grep -n "Boring SaaS\|## 1\." docs/sunny-lemon-development-plan.md | head
```

- [ ] **Step 2: Write `KB/docs/BRIEF.md`**

```markdown
# Menu Scan — product brief

> Compiled 2026-08-28 from `menu-scan-app/AGENTS.md` and `docs/sunny-lemon-development-plan.md` §1.
> It holds only what an agent **cannot find by looking**. Feature lists, schema and tokens live in
> the app repo and are pointed at, never restated.

## What the product is

Point a phone at a restaurant menu. Get the same menu back, sorted by how well each dish matches
the nutritional goals you picked. Codename in the older planning docs: **Sunny Lemon**.

It is deliberately a "boring SaaS" — one loop, done properly, before anything optional.

## The one thing that has to be right

The sorted list. Everything else — profiles, history, the paywall — is optional around it. A
sorted list that is wrong is worse than no app, because the user acts on it in a restaurant.

## What makes this hard, and it is not the OCR

Reading the menu is close to solved. **Estimating what is on the plate is not.** Two facts shape
every decision downstream:

1. **Nutritionists average ~41% error at visual portion estimation** (Nutrition5k). The bar is not
   perfection; the bar is beating an expert eyeballing a plate.
2. **Plate mass is a nearly spent lever.** Reading mass straight from the answer key scores 75%.
   The shipped pipeline is at 62%. The residual is composition error, which no portion mechanism
   touches. See `pipeline/closed-phases.md`.

## Constraints that are not written in any code file

- **Two languages, one lookup key.** Users scan Spanish *and* English menus. Every nutrition
  database is English-only, so English is an **internal lookup key** — never the UI language. Show
  the user the menu's own words.
- **Price is never evidence of grams.** Not the dish's price, not price parity with its neighbours.
  This has been tried and it is wrong.
- **The allergen disclaimer is not negotiable.** When any allergen filter is active the results
  screen shows *"AI-estimated. Confirm allergens with restaurant staff before ordering."* It cannot
  be removed, hidden, or collapsed.
- **Never publish an accuracy percentage as a marketing claim.** The figure that exists is
  on-corpus and it is macro *fields*, not dishes. Present a **range** in the UI, never a confident
  integer.
- **Images never reach Supabase Storage.** They live on the capturing device and are sent
  ephemerally. Zero bytes in a bucket is a live invariant.
- **Max 6 navigable screens.** A hard constraint. Sheets and dev routes do not count.

## Traps that have cost real sessions

- **A number written in a document is a snapshot.** Re-derive it. This rule exists because status
  once rotted in five documents simultaneously.
- **Temp-0 is not determinism.** Never conclude a change worked from one or two runs.
- **A competitor agreeing with us is not evidence we are right.** A shipped rival lands at 0.65×
  our answer key on the one dish we compared — the identical ratio our own pre-FORM pipeline
  produced. See `research/`.
- **The fixture photos are real.** They are phone photos of real paper menus. The long-repeated
  "every scan is a photo of a screen" claim is false and the field-test question is closed.

## Stage

Pre-launch. TestFlight, internal only. Not in either store.

## Where the live state is

Linear: <https://linear.app/menu-scan-app>. Not here, and not in the app repo.
```

- [ ] **Step 3: Verify it restates nothing findable**

```bash
grep -c "expo-camera\|nativewind\|#ffda6e\|create table" $KB/docs/BRIEF.md
```

Expected: `0`. A hit means you copied something the agent could have read from the app repo.

- [ ] **Step 4: Commit**

```bash
cd $KB && git add docs/BRIEF.md
git commit -m "kb: BRIEF.md

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: `product-intent.md` and the ADRs

**Files:**
- Create: `KB/docs/product-intent.md`
- Create: `KB/docs/adr/README.md`, `KB/docs/adr/0001-clerk-for-auth.md`, `KB/docs/adr/0002-images-never-leave-the-device.md`, `KB/docs/adr/0003-english-is-a-lookup-key-not-a-ui-language.md`

**Interfaces:**
- Consumes: `APP/docs/sunny-lemon-development-plan.md` §2 (Locked Architectural Decisions), §9 (Deferred)
- Produces: `docs/adr/` — referenced by the `menuscan-product` skill's routing table in Task 8.

**Why only three ADRs when §2 locks twenty-odd decisions.** Most of §2 is *findable* — that the app uses Zustand is visible in `package.json`. An ADR earns its place when the **reasoning** would otherwise be lost, or when the decision **overturned an earlier one**. These three qualify. The rest stay in the roadmap where they are.

- [ ] **Step 1: Write `KB/docs/product-intent.md`**

```markdown
# Product intent

- **Decided** — ratified by Santiago. Binding.
- **Proposed** — written down, argued for, not ratified.
- **Idea** — recorded so it is not lost. Nothing more.

> Seeded 2026-08-28 from `sunny-lemon-development-plan.md` §2 and §9. Anything with a date and a
> ruling is Decided; anything the plan calls a "working hypothesis" or a "stretch" is Proposed;
> anything in §9 is an Idea unless stated otherwise.

## Decided

- **Auth is Clerk.** 2026-08-28. Supersedes every "Supabase auth" line in the roadmap. See
  `adr/0001-clerk-for-auth.md`.
- **Images never persist server-side.** Local device only, sent ephemerally.
  See `adr/0002-images-never-leave-the-device.md`.
- **No RevenueCat.** Native StoreKit and Play Billing directly, receipt validation in an edge
  function.
- **Stage-2 macro accuracy is closed at v33 FORM sizing.** 2026-08-28, on a ceiling argument, not
  a target. See `pipeline/closed-phases.md`.
- **GPT-5.5 was measured, beat GPT-4o on macros, and was declined** — roughly 2.4× slower on
  Stage 2.
- **Drinks and alcohol are out of scope** until after launch.

## Proposed

- **Pricing: 5 free scans/month, then $4.99/mo or $29.99/yr.** The roadmap calls this a working
  hypothesis to be refined against research that has not been done. Profiles and history stay free
  forever on the reasoning that locking retention features drives churn.
- **Runtime USDA normalization** — fuzzy-match each item to a USDA entry and overwrite the
  estimate above a confidence threshold. Written as a Phase 9 stretch; never started.

## Idea

- A "Notes" field on profiles, for a later AI-suggestions feature. The column already exists.
- Opt-in cloud image backup as a paid-tier perk. Default stays local-only.
- Restaurant-owner claim flow · Uber Eats menu import · community leaderboards.

## Open, and it is Santiago's call

- **The printed-weight scope convention.** Named as open in the roadmap's Phase 9 handoff and
  never settled.
- **The `auth.uid()` consequence of choosing Clerk.** Every table is declared owned by
  `auth.uid()` with RLS, and two tables carry `references auth.users` — Supabase-native
  constructs. Either Clerk JWTs get wired into Supabase so `auth.uid()` still resolves, or those
  foreign keys and policies change shape. **This must be decided before the first migration.**
- **§2's Auth row still reads "Deferred — no auth gate at launch"**, which contradicts the Clerk
  ruling above it. One of the two lines is wrong and only Santiago can say which.
```

- [ ] **Step 2: Write `KB/docs/adr/README.md`**

```markdown
# Architecture decision records

| ADR | Title | Status | Date |
|---|---|---|---|
| [0001](0001-clerk-for-auth.md) | Clerk for auth | Accepted | 2026-08-28 |
| [0002](0002-images-never-leave-the-device.md) | Images never leave the device | Accepted | 2026-05-20 |
| [0003](0003-english-is-a-lookup-key-not-a-ui-language.md) | English is a lookup key, not a UI language | Accepted | 2026-08-24 |

## Adding one

Copy `0001` as a template. Name it `NNNN-short-title.md`, zero-padded to four digits. Fill in
Status, Context, Decision, Consequences. **Add a row to the table above in the same commit** — an
ADR with no row is invisible.

An ADR earns its place when the *reasoning* would otherwise be lost, or when the decision
overturned an earlier one. A decision whose rationale is obvious from the code does not need one.
```

- [ ] **Step 3: Write `KB/docs/adr/0001-clerk-for-auth.md`**

```markdown
# ADR-0001: Clerk for auth

## Status

Accepted — 2026-08-28. Supersedes the "Supabase auth" approach described throughout
`sunny-lemon-development-plan.md` Phase 1d and §2.

## Context

The roadmap was written against Supabase auth: anonymous sign-in on launch, Apple/Google/magic
link behind a generic auth UI, `linkIdentity` for the anonymous-to-permanent upgrade. Code for all
of that exists on an abandoned branch of the **archived** predecessor project and has never been
present in this repository.

`AGENTS.md` meanwhile said, plainly: *"Use Clerk. Do not build custom auth."* The two documents
contradicted each other for months while no auth code existed in either direction, so nothing
broke and nobody was forced to choose.

## Decision

**Clerk.** `AGENTS.md` wins. Every "Supabase auth" mention in the roadmap is stale and must not be
followed.

## Consequences

- The four Phase-1d deliverables are written against Supabase auth and are void as written.
- **An unresolved data-model consequence blocks the first migration.** The schema declares every
  table owned by `auth.uid()` with RLS, and `profiles.user_id` and `feedback.user_id` are
  `references auth.users` — Supabase-native constructs that Clerk does not populate. Either Clerk
  JWTs are wired into Supabase so `auth.uid()` resolves, or those foreign keys and policies change
  shape. **Decide before writing the migration, not after.**
- §2's Auth row still reads "Deferred — no auth gate at launch". That line has not been reconciled
  with this decision and is tracked as an open question in `product-intent.md`.
```

- [ ] **Step 4: Write `KB/docs/adr/0002-images-never-leave-the-device.md`**

```markdown
# ADR-0002: Images never leave the device

## Status

Accepted — 2026-05-20. Reaffirmed 2026-08-28 as a live invariant.

## Context

The obvious design stores menu photos in Supabase Storage so scans can be re-viewed from any
device and re-processed later. That is what a normal app would do.

## Decision

**No Supabase Storage. No bucket exists.** Photos live only on the capturing device, in the
private app sandbox via `expo-file-system`. They are sent ephemerally as base64 to the edge
function, parsed, and only the *response* is persisted.

## Consequences

- **Privacy is structural, not promised.** There is no server-side image to leak, subpoena or
  mis-permission. This is the strongest privacy claim the product has and it costs nothing to keep.
- **History is device-local for images.** Reopening a scan on a second device shows the parsed
  items plus a "Photos are on your other device" placeholder. The UI must handle this gracefully
  rather than showing a broken-image icon.
- **A re-scan needs the physical menu again.** There is no server-side re-processing of an old
  photo when the pipeline improves.
- **"Supabase Storage usage remains at 0 bytes"** is a launch-readiness check precisely because it
  is the one-line proof this decision still holds.
- Opt-in cloud backup as a paid perk stays an Idea, never a default.
```

- [ ] **Step 5: Write `KB/docs/adr/0003-english-is-a-lookup-key-not-a-ui-language.md`**

```markdown
# ADR-0003: English is a lookup key, not a UI language

## Status

Accepted — 2026-08-24.

## Context

The user base scans **Spanish and English** menus. Every nutrition database that could ground a
macro estimate — USDA FoodData Central, FNDDS — is English-only. So a Spanish dish name has to
become an English term somewhere before any lookup can happen.

The tempting shortcut is to translate the menu and show the user the translation.

## Decision

Translation happens **inside the pipeline, as an internal lookup key**. The user always sees the
menu's own words.

## Consequences

- A Spanish menu returns Spanish item names, ranked. The English term never surfaces.
- Lookup-coverage failures are **not** translation failures and must not be diagnosed as such.
  When 44 of 82 off-corpus gaps were examined, none were translation problems — they were sauces,
  steak enhancements and flavour selectors that are not orderable dishes at all.
- Any future retrieval layer (FNDDS or otherwise) inherits this split: it is keyed in English and
  renders in the menu's language.
```

- [ ] **Step 6: Verify every ADR has an index row**

```bash
cd $KB
for f in docs/adr/0*.md; do grep -q "$(basename $f)" docs/adr/README.md || echo "MISSING: $f"; done
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
cd $KB && git add docs/
git commit -m "kb: product intent ledger and the first three ADRs

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Move the ledger

**Files:**
- Create: `KB/docs/pipeline/ledger.md`
- Delete (in `APP`): `docs/superpowers/extraction-iteration-ledger.md`

**Interfaces:**
- Consumes: `APP/docs/superpowers/extraction-iteration-ledger.md`
- Produces: `KB/docs/pipeline/ledger.md`. Task 6 rewrites the paths inside it. Task 9 updates `AGENTS.md` so sessions know to append here.

**This is the one document that moves wholesale, by ruling D9.** It is 5,240 lines, 189 numbered entries, and its governing rule is *"never re-try a hypothesis whose Verdict is REVERTED."* Do not summarise it, do not restructure it, do not renumber it.

- [ ] **Step 1: Copy it across byte-for-byte**

```bash
cp $APP/docs/superpowers/extraction-iteration-ledger.md $KB/docs/pipeline/ledger.md
diff $APP/docs/superpowers/extraction-iteration-ledger.md $KB/docs/pipeline/ledger.md && echo IDENTICAL
```

Expected: `IDENTICAL`.

- [ ] **Step 2: Prepend a provenance and location header**

Insert at the very top of `KB/docs/pipeline/ledger.md`, above the existing `# Extraction Iteration Ledger` heading:

```markdown
> Moved here from `menu-scan-app/docs/superpowers/extraction-iteration-ledger.md` on 2026-08-28,
> byte-for-byte. **This is now its only home.** Paths inside older entries that point at
> `docs/superpowers/plans/…` or `docs/superpowers/specs/…` were rewritten to `docs/archive/…` in
> the same migration; they refer to files in the **app** repo, not this one.
>
> ⚠️ **Appending here is mandatory at the end of every session that runs an eval** — see the
> Working Rules in `menu-scan-app/AGENTS.md`. Because this file now lives in a different repository
> from the code, a session is only complete once **both** repos are committed and pushed.

```

- [ ] **Step 3: Remove it from the app repo**

Run in `APP`:

```bash
git rm docs/superpowers/extraction-iteration-ledger.md
```

- [ ] **Step 4: Leave a tombstone so nobody looks for it forever**

Create `APP/docs/superpowers/extraction-iteration-ledger.md.MOVED`:

```markdown
# The ledger moved

`extraction-iteration-ledger.md` now lives in the **`menu-scan-kb`** repository at
`docs/pipeline/ledger.md`.

Type `/menuscan-pipeline` to load it, or clone
<https://github.com/santidevhmo/menu-scan-kb>.

**Appending to it is still mandatory at the end of every session that runs an eval.** It is now a
commit in a second repository — a session is not complete until both are pushed.
```

- [ ] **Step 5: Verify both sides**

```bash
wc -l $KB/docs/pipeline/ledger.md
ls $APP/docs/superpowers/extraction-iteration-ledger.md 2>&1 | grep -c "No such file"
```

Expected: roughly 5,250 lines in the KB (5,240 plus the header), and `1` from the second command.

- [ ] **Step 6: Commit in both repos**

```bash
cd $KB && git add -A && git commit -m "kb: move the extraction iteration ledger here

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
cd $APP && git add -A && git commit -m "docs: ledger moved to menu-scan-kb, tombstone left behind

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Distil `lessons.md`, `model-findings.md`, `oracle-rules.md`, `closed-phases.md`

**Files:**
- Create: `KB/docs/pipeline/lessons.md`, `KB/docs/pipeline/model-findings.md`, `KB/docs/pipeline/oracle-rules.md`, `KB/docs/pipeline/closed-phases.md`

**Interfaces:**
- Consumes: `APP/docs/archive/plans/2026-07-04-ocr-extraction-master-roadmap.md` lines 807–857 and its closure block; `APP/docs/model-findings.md`; `APP/docs/archive/specs/2026-08-22-oracle-widening-rulings.md` and `…-round-2-rulings.md`
- Produces: four files the `menuscan-pipeline` skill routes to in Task 8.

**The distillation rule, applied.** `lessons.md` and `model-findings.md` are **already** distillations and move wholesale. `oracle-rules.md` is **new writing** — the per-dish rulings stay in the app repo's archive because `scripts/unweighted-oracle-build.ts` reads from them and an agent can find them by looking; what cannot be found by looking is the *general rule* each ruling established.

- [ ] **Step 1: Move the lessons across**

```bash
sed -n '807,857p' $APP/docs/archive/plans/2026-07-04-ocr-extraction-master-roadmap.md \
  > $KB/docs/pipeline/lessons.md
wc -l $KB/docs/pipeline/lessons.md
```

Expected: ~51 lines beginning with the `## Lessons learned` heading. Then prepend:

```markdown
> Moved here 2026-08-28 from the extraction master roadmap (now
> `menu-scan-app/docs/archive/plans/2026-07-04-ocr-extraction-master-roadmap.md`), verbatim.
> Distilled from Features 1–4 and the evals that followed. **These are priors, not prohibitions** —
> a falsified hypothesis tells the next brainstorm where to look, it does not close the door.

```

- [ ] **Step 2: Move `model-findings.md` across**

```bash
cp $APP/docs/model-findings.md $KB/docs/pipeline/model-findings.md
cd $APP && git rm docs/model-findings.md
```

Prepend to the KB copy:

```markdown
> Moved here from `menu-scan-app/docs/model-findings.md` on 2026-08-28, verbatim. App-wide
> model-choice findings, deliberately independent of any phase.
>
> ⚠️ **A flawed fixture silently flatters whichever model shares its flaw.** Read a model
> comparison in this file together with the state of the fixtures on the date it was run.

```

- [ ] **Step 3: Write `KB/docs/pipeline/oracle-rules.md` — the general rules, not the per-dish rulings**

```markdown
# Oracle rules — how the answer key gets built

> Written 2026-08-28. Distilled from the ruling documents, which stay in the app repo at
> `docs/archive/specs/2026-08-22-oracle-widening-rulings.md` and
> `…-round-2-rulings.md` because `scripts/unweighted-oracle-build.ts` reads from them.
> **The per-dish rulings are findable by looking. The rules below are not** — that is why they are
> here.

## What the oracle is, and what it is not

The **answer key**. A hand-built, USDA-sourced record of what each test dish really contains. It
lives at `scripts/fixtures/unweighted-oracle.json` (57 dishes, the /684) plus
`macro-oracle.json` (8 printed-weight dishes, the separate /96).

**It never runs in the app.** It exists only to grade us.

It stores **bands only** — a mass band, four macro bands, and a prose `assumed` string. There is
no per-ingredient array; the decomposition lives in the ruling documents.

## The rules

1. **It is generated. Never hand-edit the JSON.** Add a `Draft` to
   `scripts/unweighted-oracle-build.ts` and re-run it. `deriveBands()` does the arithmetic.
2. **Put the derivation in the `assumed` string, not a code comment.** Comments never reach the
   JSON, and the JSON is what a future session re-derives from.
3. **Definitional-to-dish-type beats category-typical.** If an ingredient is part of what makes the
   dish that dish, it is assumed present. If it is merely common in that category, it is not.
4. **Price is never evidence of grams.** Not the dish's own price, not parity with its neighbours
   on the same menu.
5. **Every gram is a hand ruling.** The per-100g values are USDA-sourced, but `usda-oracle.ts` has
   never fetched `foodPortions` — so the portion weights are judgement, not data. FNDDS publishes
   portion weights and would fix this; it has not been done.
6. **A changed oracle re-grades all of history for free.** Replaying saved model answers costs $0
   and calls no API. This is why correcting the answer key is cheap and why a wrong one is
   expensive — every past ranking was scored against it.
7. **An oracle change gets its own ledger entry, with Verdict `ORACLE-CHANGE`,** and needs
   Santiago's approval. A score comparison across an oracle change is not apples-to-apples.

## The one named exception

A dressing was kept as an assumed ingredient on one salad against rule 3. It is recorded as a
**named exception, not a precedent.** Do not generalise from it.

## The open discrepancy

Pizza. The oracle's gram figure and the published portion weights disagree and it has never been
reconciled.
```

- [ ] **Step 4: Write `KB/docs/pipeline/closed-phases.md`**

This is the **one home** for the Phase-5 exit numbers. Read the closure block first:

```bash
sed -n '1,62p' $APP/docs/archive/plans/2026-07-04-ocr-extraction-master-roadmap.md
```

Then write:

```markdown
# Closed phases — exit numbers and why they closed

> Written 2026-08-28 from the closure block of the extraction master roadmap (now
> `menu-scan-app/docs/archive/plans/2026-07-04-ocr-extraction-master-roadmap.md`) and ledger eval
> 189, which derived the figures through the harness on 2026-08-25 using replays and simulations
> only — no API calls, $0.
>
> ⚠️ **These are historical exit numbers, not a live score.** They record where a phase stood on
> the day it closed. To learn where the pipeline stands *today*, re-derive through the harness in
> `menu-scan-app/scripts/`. Never quote a number out of this file as current.

## Stage-2 macro enrichment accuracy — closed 2026-08-28

Production is edge function `analyze-menu` **v33, FORM sizing**, live since 2026-08-23. The model
names each dish's form from a fixed enum and **our** code sets the plate's mass from a gram table
we own.

| | /684 unweighted | fields in band | dish-draws with all four macros in band |
|---|---|---|---|
| `dual` (was v32) | 333 | 49% | 12.3% |
| **`FORM` (v33, live)** | **408–435, mean 422.6** | **62%** | **24.0%** |

Printed-weight dishes, inside their real menu: **17/96 failed = 82% pass.**

### Why it closed, and it was not "we hit a target"

Reading plate mass straight out of the answer key scores **516/684 = 75%**. That is the ceiling of
the entire sizing lever *with the answers in hand*. `FORM` sits at 62%. The residual is composition
error that no portion mechanism touches. **There is no path from here to 90% through sizing.**

### What was accepted, not solved

1. **The 62% is on-corpus and nothing else has ever been measured.** All 57 oracle dishes come from
   the five menus the gram table was built from. True off-corpus performance is **bounded 54–62%
   and unmeasured.**
2. **38 of 57 dishes score differently run to run.** That is a UX problem, not an accuracy problem
   — a user rescanning one menu sees different macros.
3. **The accompaniment defect is the largest known remaining one.** Sides and sauces are sized from
   a nutrition-label serving rather than from what is actually served: 24% of weighted items,
   12–20% of those dishes' calories. Prose and a duplicate schema field have both failed at it.

### The constraints these place on the UI

**Present a range, never a confident integer.** Never publish "60% accurate" as a claim — it is
macro *fields*, not dishes, and it is on-corpus. Against the measured human baseline (nutritionists
average ~41% error at visual portion estimation) the pipeline is already better than an expert
eyeballing a plate, and that is the honest claim.

### Do not re-open this without a new hypothesis

Eleven arms have been tried since `dual`; none beat `FORM` with a confidence interval excluding
zero. `COMBO` in particular is **not established and must not ship** — pooled over four runs it is
+18.0, CI −7.7 to +43.5, which includes zero.

## Horizontal and rotated menus — closed 2026-08-04

Shipped as edge function v22. Detail in `menu-scan-app/docs/archive/horizontal-menus/`.

## Pre-release critical path — all five closed

Per-page multi-photo wiring (2026-07-10) · dense-menu auto-cutter (2026-07-12) · client compression
fidelity (2026-07-12) · horizontal menus (2026-08-04) · Stage-2 enrichment accuracy (2026-08-28).
```

- [ ] **Step 5: Verify all four files exist and carry provenance headers**

```bash
cd $KB
for f in docs/pipeline/*.md; do
  head -1 "$f" | grep -q '^>' || echo "NO PROVENANCE HEADER: $f"
done
```

Expected: no output.

- [ ] **Step 6: Commit in both repos**

```bash
cd $KB && git add -A && git commit -m "kb: lessons, model findings, oracle rules, closed phases

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
cd $APP && git add -A && git commit -m "docs: model-findings moved to menu-scan-kb

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Rewrite the ledger's broken paths

**Files:**
- Modify: `KB/docs/pipeline/ledger.md`

**Interfaces:**
- Consumes: the `docs/archive/` layout created in Stage 1 Task 4
- Produces: a ledger whose every path reference resolves. This is the mandatory mitigation named in the spec, §5.1.

**Why this exists.** The ledger cites plans and specs by path throughout its 189 entries. Stage 1 moved those files to `docs/archive/`, and Task 4 moved the ledger to a different repository. Every such reference is now broken twice. Left alone, a future session follows a path, finds nothing, and concludes the evidence does not exist.

- [ ] **Step 1: Count the damage before fixing it**

```bash
grep -c 'docs/superpowers/plans/\|docs/superpowers/specs/\|docs/superpowers/horizontal-menus/' \
  $KB/docs/pipeline/ledger.md
```

Record the number. Step 4 must bring it to zero.

- [ ] **Step 2: Rewrite the three path prefixes**

```bash
cd $KB
sed -i '' \
  -e 's|docs/superpowers/plans/|menu-scan-app/docs/archive/plans/|g' \
  -e 's|docs/superpowers/specs/|menu-scan-app/docs/archive/specs/|g' \
  -e 's|docs/superpowers/horizontal-menus/|menu-scan-app/docs/archive/horizontal-menus/|g' \
  docs/pipeline/ledger.md
```

- [ ] **Step 3: Fix the paths that did NOT move**

Some referenced files stayed active in the app repo. Repoint those at the repo, not the archive:

```bash
sed -i '' \
  -e 's|menu-scan-app/docs/archive/plans/2026-08-28|menu-scan-app/docs/superpowers/plans/2026-08-28|g' \
  docs/pipeline/ledger.md
sed -i '' \
  -e 's|docs/superpowers/diagrams/|menu-scan-app/docs/superpowers/diagrams/|g' \
  -e 's|docs/superpowers/START-HERE.md|menu-scan-app/docs/superpowers/START-HERE.md|g' \
  -e 's|docs/superpowers/extraction-iteration-ledger.md|this file|g' \
  docs/pipeline/ledger.md
```

- [ ] **Step 4: Verify zero unrewritten references remain**

```bash
grep -n 'docs/superpowers/plans/\|docs/superpowers/specs/\|docs/superpowers/horizontal-menus/' \
  $KB/docs/pipeline/ledger.md | grep -v 'menu-scan-app/'
```

Expected: **no output.**

- [ ] **Step 5: Verify every rewritten path actually resolves**

```bash
cd $KB
grep -o 'menu-scan-app/docs/[a-zA-Z0-9/._-]*' docs/pipeline/ledger.md \
  | sort -u \
  | sed "s|^menu-scan-app/|$APP/|" \
  | while read -r p; do [ -e "$p" ] || echo "BROKEN: $p"; done
```

Expected: **no output.** Any `BROKEN:` line is a file that was cited but never existed, or one you mis-rewrote. Investigate each before continuing — this check is the entire point of the task.

- [ ] **Step 6: Commit**

```bash
cd $KB && git add docs/pipeline/ledger.md
git commit -m "kb: rewrite ledger paths for the archive move and the repo split

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Research, design-system, and the two honest stubs

**Files:**
- Create: `KB/docs/research/competitors.md`, `KB/docs/research/prior-art.md`, `KB/docs/design-system/rationale.md`, `KB/docs/personas/README.md`, `KB/docs/brand/README.md`
- Modify (in `APP`): `git rm docs/superpowers/competitor-analysis-2026-08-23.md`, `git rm docs/superpowers/research/2026-08-07-macro-estimation-prior-art.md`

**Interfaces:**
- Consumes: the two research documents in `APP`, plus `APP/DESIGN.md` and roadmap §3
- Produces: the files `menuscan-research` and `menuscan-design-system` route to.

- [ ] **Step 1: Move the two research documents across**

```bash
cp $APP/docs/superpowers/competitor-analysis-2026-08-23.md $KB/docs/research/competitors.md
cp $APP/docs/superpowers/research/2026-08-07-macro-estimation-prior-art.md $KB/docs/research/prior-art.md
cd $APP
git rm docs/superpowers/competitor-analysis-2026-08-23.md
git rm docs/superpowers/research/2026-08-07-macro-estimation-prior-art.md
```

- [ ] **Step 2: Prepend provenance headers**

To `competitors.md`:

```markdown
> Moved here from `menu-scan-app/docs/superpowers/competitor-analysis-2026-08-23.md` on
> 2026-08-28, verbatim. Filed 2026-08-23.
>
> 🪤 **A competitor agreeing with us is never evidence we are right.** The shipped rival examined
> here lands at 0.65× our answer key on Salmón Roll — the identical ratio our own pre-FORM
> pipeline produced. Their calorie figure also contradicts their own macro numbers; ours cannot,
> because our code computes the total rather than asking the model for it.

```

To `prior-art.md`:

```markdown
> Moved here from `menu-scan-app/docs/superpowers/research/2026-08-07-macro-estimation-prior-art.md`
> on 2026-08-28, verbatim. Filed 2026-08-07.
>
> The load-bearing finding: **nutritionists average ~41% error at visual portion estimation**
> (Nutrition5k), and there is peer-reviewed evidence that LLMs systematically underestimate large
> portions. That sets the honest bar for what "good" means here. FNDDS portion tables are CC0 flat
> files and remain the obvious unexploited resource.

```

- [ ] **Step 3: Write `KB/docs/design-system/rationale.md`**

**Do not copy the tokens.** They live in `APP/DESIGN.md` and `src/global.css` and restating them creates a second truth that drifts.

```markdown
# Design system — the rationale

> Written 2026-08-28. **The tokens themselves are not here.** They live in
> `menu-scan-app/DESIGN.md` and `src/global.css`, which are the source of truth. Read them there.
> This file holds only the reasoning, which exists in no file.

## The reference

Pirsch Analytics. Chosen for a flat, calm, two-tier surface treatment that reads as trustworthy
rather than gamified — which matters because the product asks people to act on a nutritional
estimate in a restaurant.

## Why two surfaces and no shadows

There are exactly two surfaces: a white page and a warm off-white card. Separation is done with
background colour alone. **No elevation shadows anywhere.** A shadow implies a stacking order the
app does not have, and once one component has one, every component needs a decision about it.

## Why exactly two accent colours

Sunbeam Yellow is the primary call to action. Leafy Green is the secondary and the positive
signal. **No third accent may be added.** The results screen is a long list of items with a score;
the moment a third colour exists, the list starts trying to encode meaning in hue and becomes
unreadable to anyone who cannot distinguish them.

Green is deliberately *not* used for "this dish is good for you." Ranking already says that, by
position. Colour saying it again would read as a health claim the estimate cannot support.

## Why one font, two weights

DM Sans, 400 and 500 only. A third weight invites a visual hierarchy deeper than six screens can
justify.

## Why no square corners

Every radius is non-zero — 24px cards, 12px buttons, 6px inputs. It is a single decision applied
everywhere so no component needs to relitigate it.

## The constraint that shapes everything

**Six navigable screens, maximum.** Sheets and dev routes do not count. This is why filter editing
and profile editing live in bottom sheets rather than screens, and it is why any proposal that
starts "add a screen for…" needs to say which existing screen it replaces.

## Known open defect

Tab-bar labels clip the descender on DM Sans Medium. React Navigation's auto-sized tab bar is the
cause. The fix is either 11px with a custom line-height and a manual bar height, or dropping labels
entirely and relying on icons. **Do not re-derive the bar height from `useColorScheme()`** — that
hook is hard-pinned to `"light"` in this app.
```

- [ ] **Step 4: Write the two stubs — honestly**

`KB/docs/personas/README.md`:

```markdown
# Personas

**Nothing here yet. This is a real gap, not an oversight.**

No user research has been done. The roadmap's Phase 3 — "Post-MVP User & Competitive Research" — is
not started, and it is the phase that would fill this directory.

## What belongs here when it exists

- Who the product is for, in their words rather than ours.
- What they are hired to do — the job the app is being pulled in to solve.
- What they object to, and what would make them not trust a macro estimate.
- A quote bank, attributed by source and date.

## What must not go here

**An invented persona.** A persona derived from what we imagine the user wants is worse than an
empty directory, because it gets cited in decisions as though it were evidence. Leave this empty
until real user voice exists.

Tracked in Linear: <https://linear.app/menu-scan-app>
```

`KB/docs/brand/README.md`:

```markdown
# Brand

**Nothing here yet.**

The product has a visual identity — see `../design-system/rationale.md` and
`menu-scan-app/DESIGN.md` — but no brand work: no positioning statement, no voice definition, no
naming rationale beyond the codename "Sunny Lemon", no logo system.

## What belongs here when it exists

- Positioning: what this is, for whom, instead of what.
- Voice: how the app talks, especially in error and empty states, and especially when it has to
  admit uncertainty about an estimate.
- Naming rationale.
- Any logo or identity system.

## What must not go here

**Invented brand values.** Leave this empty until Santiago decides them.

Tracked in Linear: <https://linear.app/menu-scan-app>
```

- [ ] **Step 5: Commit in both repos**

```bash
cd $KB && git add -A && git commit -m "kb: research, design rationale, and two honest stubs

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
cd $APP && git add -A && git commit -m "docs: research documents moved to menu-scan-kb

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: The five skills and `install.sh`

**Files:**
- Create: `KB/skills/install.sh`, and `SKILL.md` in each of the five skill directories

**Interfaces:**
- Consumes: every document written in Tasks 2–7
- Produces: `/menuscan-product` and four sibling commands. Task 10 verifies they load.

**The template every skill follows.** YAML frontmatter with `disable-model-invocation: true`; then `Read [../../docs/BRIEF.md](../../docs/BRIEF.md) first.`; then domain sections; then a **Source documents** table; then `## Answering`; then `## Updating`. Under ~150 lines each.

- [ ] **Step 1: Write `KB/skills/install.sh`**

```sh
#!/bin/sh
# Symlink every skill in this repo into ~/.claude/skills/.
# Paths are derived from this script's own location, so the clone can live
# anywhere and be named anything.
set -e

top=$(cd "$(dirname "$0")/.." && pwd)
dest="$HOME/.claude/skills"
mkdir -p "$dest"

fail=0
for src in "$top"/skills/*/; do
  name=$(basename "${src%/}")
  target="$dest/$name"

  if [ -e "$target" ] && [ ! -L "$target" ]; then
    echo "skip $name (real directory here, not replacing it)"
    continue
  fi

  ln -sfn "${src%/}" "$target"

  if [ -f "$target/SKILL.md" ]; then
    echo "ok   $name"
  else
    echo "FAIL $name (link made, but no SKILL.md behind it)"
    fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo
  echo "A link that does not reach a SKILL.md is worse than no link:"
  echo "the skill appears in the list and then fails on invocation."
  exit 1
fi

echo
echo "Done. Open Claude Code and type /menuscan-product"
```

- [ ] **Step 2: Make it executable and run it**

```bash
chmod +x $KB/skills/install.sh
sh $KB/skills/install.sh
```

Expected at this point: five `FAIL` lines and exit 1, because no `SKILL.md` exists yet. **That is the correct failure** — it proves the check works. Step 8 re-runs it green.

- [ ] **Step 3: Write `KB/skills/menuscan-product/SKILL.md` — the hub**

```markdown
---
name: menuscan-product
description: Menu Scan product knowledge hub, routing to pipeline, research, design-system and Linear-filing knowledge. Use when starting work on the Menu Scan app, when unsure which knowledge a task needs, or when filing new material about the product.
disable-model-invocation: true
---

# Menu Scan product knowledge

Read [`../../docs/BRIEF.md`](../../docs/BRIEF.md) first.

**This hub is a loader, not a signpost.** Do not tell the user to go and invoke another skill —
they already invoked the one that knows where everything is. Work out what the task needs from the
routing below, **read those files yourself**, and answer.

## The roster

| Skill | For |
|---|---|
| [`menuscan-pipeline`](../menuscan-pipeline/SKILL.md) | The OCR and macro pipeline: what was tried, what failed, why. |
| [`menuscan-research`](../menuscan-research/SKILL.md) | Competitors, academic prior art, the honest accuracy bar. |
| [`menuscan-design-system`](../menuscan-design-system/SKILL.md) | Why the tokens are what they are. |
| [`menuscan-linear`](../menuscan-linear/SKILL.md) | Filing work into `linear.app/menu-scan-app`. |

If a `menuscan-*` skill is not listed here, it is missing a row.

## Routing

- **A prompt, schema, eval, oracle or edge-function change** → `menuscan-pipeline`. Read the
  ledger before proposing anything; eleven arms have been tried and most failed.
- **"How accurate are we?" / "is this good enough?"** → `menuscan-research` for the bar,
  `docs/pipeline/closed-phases.md` for the numbers. Then re-derive rather than quoting.
- **Any UI, layout, colour, spacing or component question** → `menuscan-design-system`.
- **"What should I work on?" / "file this" / "is there a ticket?"** → `menuscan-linear`.
- **A product decision, or "was this decided?"** → `docs/product-intent.md` and `docs/adr/`.

## The three kinds of knowledge here

- **Durable** — the brief, the ADRs, the lessons, the oracle rules, closed-phase numbers. Curated
  prose, hand-written, under `docs/`.
- **Undecided** — quarantined in `docs/product-intent.md` behind an explicit Decided / Proposed /
  Idea marker. Never promote one without Santiago saying so.
- **Perishable** — the current score, what is in flight, what is next. **Not stored here at all.**
  Status is Linear; scores are re-derived through the harness.

## The four rules every file here follows

1. **Cache what the agent cannot find by looking.** Hex codes live in `global.css`; restating them
   creates a second truth that drifts. The *reason* a value carries meaning exists in no file —
   that is what belongs here.
2. **Single source of truth.** A new fact **replaces** the line it contradicts rather than sitting
   beside it.
3. **Progressive disclosure.** Past ~150 lines, demote detail into `docs/` behind a pointer.
4. **Derived content carries its origin.** Anything generated from the codebase records
   `generated_from: <sha>` and is re-checked with `git diff` before it is trusted.

## Source documents

| File | What |
|---|---|
| `docs/BRIEF.md` | What the product is; the constraints that are in no code file. |
| `docs/product-intent.md` | Decided / Proposed / Idea, plus what is open and Santiago's call. |
| `docs/adr/` | Architecture decision records. |

## Filing new material

Route it → store **and** index in the same pass → distil → reconcile → verify no orphans → show
the diff and wait.

- Store at `docs/<area>/<kebab-case-name>.md` where area is one of `pipeline`, `research`,
  `design-system`, `personas`, `brand`. No other directory is valid.
- Every stored file opens with a `>` provenance header: source, date filed, how far to trust it.
- **Distil, then apply the cache test:** could an agent have found this by looking? If yes, point
  at it instead of storing it.
- **Reconcile:** a new fact replaces the line it contradicts. Do not leave both.
- **No orphans:** every stored file needs a row in some skill's Source documents table.

## Updating

Draft → show the diff → wait for explicit approval → write → commit and push **to this repo**,
never to `menu-scan-app`.

Live is not the same as saved. Because the skills are symlinked, an edit is live in the next
session immediately — but it is only backed up once pushed.
```

- [ ] **Step 4: Write `KB/skills/menuscan-pipeline/SKILL.md`**

```markdown
---
name: menuscan-pipeline
description: Menu Scan's OCR and macro-estimation pipeline — what has been tried, what failed and why, how the oracle is built, and the closed-phase exit numbers. Use before proposing any prompt, schema, eval, oracle or edge-function change.
disable-model-invocation: true
---

# The Menu Scan pipeline

Read [`../../docs/BRIEF.md`](../../docs/BRIEF.md) first.

## The shipped pipeline

Mistral OCR → GPT-4.1 structuring → GPT-4o macro enrichment → a form-label call whose grams **our
code** supplies from a table we own. It runs as the Supabase edge function `analyze-menu`.

**The code is in the app repo** at `supabase/functions/analyze-menu/`. Read it there — do not trust
a description of it in this file over the file itself.

## Before you propose anything, read the ledger

[`../../docs/pipeline/ledger.md`](../../docs/pipeline/ledger.md) — 189 numbered entries, newest
last. Its governing rule: **never re-try a hypothesis whose Verdict is REVERTED.** The Lesson line
says why it failed.

Eleven arms have been tried since `dual`. None beat `FORM` with a confidence interval excluding
zero. If your idea sounds new, search the ledger for it first — it usually is not.

## The findings that change what to try

- **Schema force beats wording.** A prompt *sentence* is 0 for 5. A required *schema field* is 6
  for 8. Riders: ask for a number not a string; free text causes merging; field order matters; an
  overlapping field just returns a copy. **Ask for a CATEGORY, not a NUMBER.**
- **Sizing is nearly spent; composition is not.** Perfect plate mass scores 75%; we are at 62%.
  There are ~13 points left in sizing and the rest is composition error.
- **The model does not compute the macro totals — the code does.** This is why our calories can
  never contradict our own macros.
- **Temp-0 is not determinism.** Never conclude anything from one or two runs. There is a measured
  noise floor and a change has to clear it.
- **Cheap probes before expensive gates.** A targeted single-menu run is cents; a full gate is
  ~$0.90 and eleven minutes. Burning gates to learn what a probe would have shown is the main
  waste.
- **Replays cost $0.** Re-scoring saved model answers calls no API, which is why a corrected oracle
  re-grades all of history for free.

## Answering "how accurate is it?"

**Do not quote a number from any document, including this one.** Re-derive through the harness in
the app repo's `scripts/`. The closed-phase exit numbers, with their derivation and their caveats,
are in [`../../docs/pipeline/closed-phases.md`](../../docs/pipeline/closed-phases.md) — read the
caveats with the figure, never the figure alone.

Two caveats travel with every number: it is **on-corpus**, and it is macro **fields**, not dishes.

## Source documents

| File | What |
|---|---|
| `docs/pipeline/ledger.md` | The lab notebook. 189 evals. Append here at session end. |
| `docs/pipeline/lessons.md` | General rules distilled from Features 1–4 and the evals after. |
| `docs/pipeline/model-findings.md` | App-wide model-choice findings, phase-independent. |
| `docs/pipeline/oracle-rules.md` | How the answer key is built, and the rules that govern it. |
| `docs/pipeline/closed-phases.md` | Exit numbers for closed phases, with their caveats. |

## Updating

**Appending to the ledger is mandatory at the end of any session that runs an eval.** One entry,
newest last, with a Verdict and a one-line Lesson.

The ledger now lives in a **different repository from the code**. A session is complete only when
both `menu-scan-app` and `menu-scan-kb` are committed and pushed.

A new fact that contradicts a line in these files **replaces** it. Do not add a caveat beside it.
```

- [ ] **Step 5: Write `KB/skills/menuscan-research/SKILL.md`**

```markdown
---
name: menuscan-research
description: Menu Scan competitive intelligence and academic prior art — who else does this, how well, and what the literature says the honest accuracy bar is. Use when positioning the product, judging whether accuracy is good enough, or evaluating a competitor's claim.
disable-model-invocation: true
---

# Research — competitors and prior art

Read [`../../docs/BRIEF.md`](../../docs/BRIEF.md) first.

## The honest bar

**Nutritionists average ~41% error at visual portion estimation** (Nutrition5k). There is
peer-reviewed evidence that LLMs systematically underestimate large portions.

That is the comparison that matters. The pipeline is already better than an expert eyeballing a
plate, and that is the claim to make — not a percentage.

## Reading a competitor

🪤 **A competitor agreeing with us is never evidence we are right.** The rival examined in
`docs/research/competitors.md` lands at 0.65× our answer key on the one dish compared — the
identical ratio our own *pre-FORM* pipeline produced. Two systems sharing a bias look like
corroboration and are not.

One asymmetry worth knowing: their published calorie figure contradicts their own macro numbers.
Ours structurally cannot, because our code computes the total rather than asking the model for it.

## What has not been done

**No user research exists.** No personas, no quote bank, no review mining. Roadmap Phase 3 covers
it and has not started. `docs/personas/` is deliberately empty — see its stub for why an invented
persona is worse than none.

## Source documents

| File | What |
|---|---|
| `docs/research/competitors.md` | Competitive teardown, filed 2026-08-23. Screenshots and analysis. |
| `docs/research/prior-art.md` | Academic prior art on macro and portion estimation, filed 2026-08-07. |
| `docs/personas/README.md` | Stub. What belongs there, and why it is empty. |
| `docs/brand/README.md` | Stub. What belongs there, and why it is empty. |

## Updating

New research goes to `docs/research/<kebab-case-name>.md` with a `>` provenance header naming the
source, the date, and how far it can be trusted. Add a row above in the same commit.

**Never fill a stub with something plausible.** An invented persona gets cited later as evidence.
```

- [ ] **Step 6: Write `KB/skills/menuscan-design-system/SKILL.md`**

```markdown
---
name: menuscan-design-system
description: Menu Scan design system rationale — why the tokens, surfaces, colours and screen budget are what they are. Use before any UI, layout, colour, spacing, component or navigation work.
disable-model-invocation: true
---

# Design system

Read [`../../docs/BRIEF.md`](../../docs/BRIEF.md) first.

**The tokens are not here.** They live in `menu-scan-app/DESIGN.md` and `src/global.css`, which are
the source of truth. Read them there. This skill holds the *reasoning*, which exists in no file.

## The rules that constrain any UI proposal

- **Six navigable screens, maximum.** Sheets and dev routes do not count. A proposal that adds a
  screen must say which one it replaces.
- **Two surfaces, no shadows.** White page, warm off-white card. Separation by background colour
  only.
- **Two accent colours, and no third.** Sunbeam Yellow is the primary CTA; Leafy Green is
  secondary and positive. A third accent makes the results list try to encode meaning in hue.
- **Green does not mean "healthy".** Ranking already says that by position. Colour repeating it
  reads as a health claim the estimate cannot support.
- **One font, two weights.** DM Sans 400 and 500.
- **No square corners anywhere.**
- **No raw hex outside `global.css` and the theme file.**

## The non-negotiable UI element

When any allergen filter is active, the results screen shows — prominently, always —
*"AI-estimated. Confirm allergens with restaurant staff before ordering."* It cannot be removed,
hidden or collapsed behind an interaction.

## The accuracy display rule

**Present a range, never a confident integer.** `612 kcal` in a confident font is not defensible;
a range is. See `docs/pipeline/closed-phases.md` for why.

## Known open defect

Tab-bar labels clip the descender on DM Sans Medium. Do **not** re-derive the tab-bar height from
`useColorScheme()` — that hook is hard-pinned to `"light"` in this app.

## Source documents

| File | What |
|---|---|
| `docs/design-system/rationale.md` | Why each design decision was made. |

Tokens, primitives and the component list: `menu-scan-app/DESIGN.md` and roadmap §3.

## Updating

A ratified design decision goes into `docs/design-system/rationale.md` with its date. Token changes
go in the **app repo**, never here — restating a hex code here creates a second truth that drifts.
```

- [ ] **Step 7: Write `KB/skills/menuscan-linear/SKILL.md` — with the workspace guard**

```markdown
---
name: menuscan-linear
description: Files work into the Menu Scan Linear workspace specifically — linear.app/menu-scan-app, team "Menu Scan App". Picks the right project and labels, then writes it. USE ONLY WHEN THE WORK IS MENU SCAN'S. Trigger on "add a task", "file this", "make an issue", "put this in Linear", "track this", "log this bug", and on requests to find existing issues by area or phase. DO NOT USE FOR ANY OTHER PRODUCT'S LINEAR — other projects have their own workspaces and their own filing skills, and a misfile is silent.
disable-model-invocation: true
---

# Filing work in Menu Scan's Linear

Read [`../../docs/BRIEF.md`](../../docs/BRIEF.md) first.

This skill holds the **grammar** of the workspace — the rules that do not change. It deliberately
holds **no live state**: no project names, no dates, no what-is-in-flight. That lives in Linear and
is read at run time. A skill that cached the project list would be wrong within a week and would be
trusted anyway, which is worse than not knowing.

## Stop — confirm the workspace before anything else

This skill is symlinked into `~/.claude/skills/`, so it loads in **every** repo. Santiago runs
several products, each with its own Linear workspace and its own filing skill.

**First tool call, before reading anything and before any write:**

```
get_workspace()        # must return "Menu Scan App"
```

**If it returns anything else, STOP.** Do not file. Do not adapt these rules to the other
workspace, and do not fall back to a generic Linear flow — that is exactly the failure this check
prevents. Say which workspace the MCP is actually connected to, name the one the user asked for,
and let them redirect.

*(This is not hypothetical. On 2026-08-28 the equivalent SendTech skill auto-invoked inside the
menu-scan-app repo on "save this as a Linear issue" while the MCP was connected to SendTech
Product. Nothing errors in that situation — the issue simply lands in a backlog nobody reviews.)*

## The hierarchy

```
Initiative  (a stage of the launch)
  └── Project   (a Sunny Lemon phase)
        └── Milestone  (a sub-phase — only where one genuinely exists)
              └── Issue  (a task)
```

**An issue cannot belong to an initiative.** Only projects can. So every issue needs a project — a
project-less issue is invisible to every roadmap view and is how work quietly disappears.

## How to file

### 1. Read the live structure first

```
list_projects(team: "Menu Scan App")
list_milestones(project: "<name>")
```

Never file from memory of a previous session.

### 2. Place it

Match the issue to a project by **what it changes**, not by which discipline does the work. A
design fix to the onboarding screens belongs to the onboarding project, not to a design bucket.

### 3. Write it

- **Title** — the outcome, in the words the person actually used.
- **Description** — who asked, when, and **why**. The why decays fastest and matters most.
- **One `area` label** — `pipeline`, `app`, `backend`, `design`, `security`, `analytics`,
  `marketing`, `docs`. One only; they are a group.
- **A type** — `Bug`, `Feature`, `Improvement`, `research`, `idea`, `chore`.

Leave priority and estimate empty unless the request implies them. Guessed priority is noise that
later reads as a decision.

**No dates.** The roadmap has none, and inventing them produces overdue badges for deadlines nobody
set — which is how a tool gets ignored.

### 4. The two labels that change what agents may do

- **`needs-decision`** — blocked on a product call from Santiago. Nobody starts it, human or agent.
  An agent that guesses at a product question produces confident wrong work that costs more to
  unpick than to have waited.
- **`agent-ready`** — the spec is complete enough to execute unattended. **Nothing touching
  production data, payments, or a live API key is ever `agent-ready`**, however well written.

### 5. Confirm before writing

Draft it, show it, write it once approved. A wrongly-filed issue has to be found before it can be
moved, and nobody goes looking for issues they do not know exist.

## Finding work already written down

Query, never answer from memory:

```
list_issues(team: "Menu Scan App", label: "design", state: "backlog")
list_issues(project: "<name from list_projects>")
```

**Never invent work.** An empty result is information. If a filter returns nothing, say so rather
than generating plausible tasks to fill the gap.

## Two things that are not this skill's job

**Status lives in Linear, and Linear alone.** If a markdown file in either repo asserts a phase or
a score, it is stale by construction — fix it or ignore it, never believe it.

**Never put secrets in Linear.** No keys, tokens, passwords or credentialled URLs, in issues,
comments or attachments. Paths and hostnames are fine; the values they authenticate with are not.
```

- [ ] **Step 8: Re-run the installer and confirm it is green**

```bash
sh $KB/skills/install.sh
```

Expected: five `ok` lines, exit 0, and the closing `/menuscan-product` hint. If any `FAIL` appears, that skill's `SKILL.md` is missing or misnamed.

- [ ] **Step 9: Confirm the symlinks point into the repo and not at a copy**

```bash
ls -l ~/.claude/skills/ | grep menuscan
```

Expected: five symlinks, each resolving into `$KB/skills/`. If any is a real directory, `install.sh` skipped it — remove the directory and re-run.

- [ ] **Step 10: Commit**

```bash
cd $KB && git add -A
git commit -m "kb: five skills and the symlink installer

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
git push
```

---

### Task 9: Wire the two repos together

**Files:**
- Modify (in `APP`): `AGENTS.md` (the session-end Working Rule), `README.md`, `docs/superpowers/START-HERE.md`

**Interfaces:**
- Consumes: the KB repo URL
- Produces: the mitigation that ruling D9 depends on. **This task is not optional** — without it, the ledger silently stops being appended.

- [ ] **Step 1: Find the session-end Working Rule**

```bash
grep -n "before the session ends\|🧾" $APP/AGENTS.md
```

- [ ] **Step 2: Replace that rule with this exact content**

```markdown
- 🧾 **Before the session ends — and this is now TWO repositories.** If the session ran an eval,
  append one entry to the ledger, which lives in the **`menu-scan-kb`** repo at
  `docs/pipeline/ledger.md` (type `/menuscan-pipeline`, or clone
  <https://github.com/santidevhmo/menu-scan-kb>).

  **A session is not complete until both repos are committed AND pushed.** The ledger is the memory
  of this project and it no longer sits beside the code that produces it. One forgotten push makes
  it silently wrong, which is the failure this rule exists to prevent.

  ```sh
  git -C <menu-scan-app>  status --short   # must be clean or intentionally staged
  git -C <menu-scan-kb>   status --short   # must be clean
  ```
```

- [ ] **Step 3: Add the KB row to `APP/README.md`**

The "Where things are" table already has a row reading `the menu-scan-kb repo — type /menuscan-product`. Extend it with the URL:

```markdown
| Durable product and pipeline knowledge | [`menu-scan-kb`](https://github.com/santidevhmo/menu-scan-kb) — type `/menuscan-product` |
```

- [ ] **Step 4: Confirm `START-HERE.md` already points at the KB**

```bash
grep -c "menuscan-product\|menu-scan-kb" $APP/docs/superpowers/START-HERE.md
```

Expected: `2` or more — Stage 1 Task 6 wrote those pointers. If it returns `0`, add them to the "Where everything lives" table now.

- [ ] **Step 5: Commit and push both repos**

```bash
cd $APP && git add -A
git commit -m "docs: session-end rule now spans both repos, link the KB

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
cd $KB && git push
```

---

### Task 10: Stage acceptance

**Files:** none

**Interfaces:**
- Consumes: everything above
- Produces: a green light for Stage 3. Do not start Stage 3 until every check passes.

- [ ] **Step 1: The repo is private and pushed**

```bash
gh repo view santidevhmo/menu-scan-kb --json isPrivate,pushedAt
cd $KB && git status --short
```

Expected: `"isPrivate": true`, a recent `pushedAt`, and a clean tree.

- [ ] **Step 2: No orphans — every document is reachable from a skill**

```bash
cd $KB
for f in $(find docs -name '*.md' | grep -v '/README.md$'); do
  b=$(basename "$f")
  grep -rq "$b" skills/ || echo "ORPHAN: $f"
done
```

Expected: no output. An orphan is a document no skill will ever load, which means it will never be read.

- [ ] **Step 3: Skills are within budget**

```bash
wc -l $KB/skills/*/SKILL.md
```

Expected: every file under ~150 lines. A longer one should have demoted detail into `docs/` behind a pointer.

- [ ] **Step 4: The workspace guard is present**

```bash
grep -c 'get_workspace()' $KB/skills/menuscan-linear/SKILL.md
grep -c 'Menu Scan App' $KB/skills/menuscan-linear/SKILL.md
```

Expected: at least `1` each. This guard is the whole reason the skill can safely be installed globally.

- [ ] **Step 5: Nothing findable was duplicated**

```bash
grep -rn '#ffda6e\|#6ece9d\|#f8f5ed' $KB/docs/ $KB/skills/
```

Expected: **no output.** A hex code here is a second truth that will drift from `global.css`.

- [ ] **Step 6: The ledger's paths all resolve** — re-run Task 6 Step 5 and confirm it is still empty.

- [ ] **Step 7: The app repo lost nothing it should have kept**

```bash
cd $APP && git status --short && ls docs/superpowers/
```

Expected: a clean tree; `docs/superpowers/` now holds `START-HERE.md`, the `.MOVED` tombstone, `how-testing-works.html`, `diagrams/`, `plans/2026-08-28-*`, `specs/2026-08-28-*`.

- [ ] **Step 8: Load the skill for real**

Open a fresh Claude Code session in any directory and type `/menuscan-product`. It must load and route. **This is the only check that proves the whole delivery mechanism works** — every other check tests a file, this one tests the product.

- [ ] **Step 9: Report and stop**

Report: the repo URL, the file and line counts, the output of Steps 2 and 5 (both empty), and confirmation that `/menuscan-product` loaded. Then stop — Stage 3 is a separate plan and a separate gate.
