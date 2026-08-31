# Mobile app design process, ordered phase by phase

> Duplicated from the shared `product-engineering` KB —
> **`~/Desktop/product-engineering/vault/playbooks/mobile-app-design-phase-order.md`**, created
> 2026-08-30 — into this repo on 2026-08-30 so progress can be checked off locally
> (`[x]` / `[~]` / `[ ]`, same convention as `docs/sunny-lemon-development-plan.md`). This copy is
> **not auto-synced** with the KB original. Linear is intentionally **not** adapted to this process
> (decided 2026-08-30) — this file is the source of truth for design-process status.
>
> **Menu Scan is the first project to run this playbook.** Expect the process itself to be wrong in
> places. When it is, fix **both** files in the same session — this copy for the project-specific
> version, the KB original for the reusable lesson. Edits are expected to run in parallel for the
> whole of this first pass.

## Before starting any task or phase: run `/product-engineer`

**Trigger:** moving on to the next unchecked item, closing a phase, or any prompt of the form
"what's next to execute?" / "let's start phase N".

**Action:** invoke the `product-engineer` skill *first*, and route the task through it (via
`pe-search`, on `phase` + `work_kind` — never on the project name) to surface the resources,
strategies, tools and prior knowledge already filed for that specific task.

**Why:** the whole point of the KB is to store an action once and have it resurface at the moment
it becomes actionable. A playbook step that names a tool is a *pointer into the vault*, not a
hard dependency — if the named tool is unavailable, `/product-engineer` is where the substitute
comes from. Anything learned or found during the task gets filed back with `pe-capture`.

A dependency-ordered playbook for sequencing mobile app design work, built by comparing a list of
design tasks/tools against an existing 7-phase Notion roadmap (Product Definition → High-Level
User Journey → Detailed User Journeys → UX Design → UI Design → Implementation → Polish) and
re-deriving a strict linear order — not just across phases, but for every item inside each phase —
using one rule throughout: **a task that would get invalidated or redone by a later task must come
after it.**

## Why Design System sits last in UI Design, not first

The 5-Sentence Decision Log (below) assigns concrete values ("20px/700, the only red in the
interface") before a formal design system exists. That's not a contradiction: those values are
being *decided* per-screen, not looked up from an existing system. The Design System step is what
comes after — going back over the decisions made designing the key screens and extracting what
was actually needed into reusable tokens/components. **System-as-output-of-design, not
system-as-input-to-design.**

## 1. Product Definition

- [x] **App-store market scan** — widest, cheapest lens first; revenue/downloads/ads/keywords tell
      you which competitors are even worth your time before you spend it. **The tool is
      interchangeable** — AppKittie is one option, not the task. Run `/product-engineer` to pick
      from what's actually available and affordable right now.
- [x] **Competitor teardown** (gather + list likes/dislikes), using the **`competitor-profiling`**
      skill (coreyhaines31/marketingskills) — now teardown the competitors step 1 flagged as
      significant, not a random set. Takes store URLs in, writes profile markdown out.
- [ ] **abtest.design** (curated A/B test results) — check which *proven* patterns (paywall,
      onboarding, retention, monetization, referral, etc.) matter most given what steps 1–2
      revealed about this market.
- [ ] **before.click** (onboarding/paywall/screenshot library) — narrower, curated aesthetic pass
      on the same categories step 3 flagged as relevant.
- [ ] **Mobbin MCP** (600k+ real screens) — broadest, least-curated reference; used on-demand once
      you know specific patterns to pull, not as a first browse.
- [~] **`product-marketing` skill** (coreyhaines31/marketingskills) — positioning/ICP/
      differentiation, now grounded in real market + competitor + proven-pattern data instead of a
      guess. Writes `.agents/product-marketing.md`, which the other marketing skills then read.
- [ ] **`customer-research` skill** (coreyhaines31/marketingskills) — user research last;
      interview questions are sharp enough to validate or break the positioning thesis, and it's
      the slowest/most expensive step, so it shouldn't run on a vague brief.

**Output (closes the phase):** Product Vision, User Persona(s), Core Use Cases.

## 2. High-Level User Journey

- [ ] **Customer Journey Map skill** — single step; needs the Product Definition outputs as input
      (e.g. Login → Import mailbox → Warmup …).

## 3. Detailed User Journeys

- [ ] **App User Flows / App Flows**, using the **text-to-flows** Figma skill
      (`figma.com/community/skill/75455`) — breaks the high-level journey into per-screen flows
      (Login turns into Google? Microsoft? Phone number?).

## 4. UX Design

- [ ] **Low-Fidelity screens**, using the **screen-alternatives** Figma skill
      (`figma.com/community/skill/75445`) — converts the detailed flows into actual screen
      structure.
- [ ] **Content Hierarchy Pattern** (see `content-hierarchy-pattern` resource) — bucket every
      screen's content into State→Action→Identity→Context before assigning any visual weight.
- [ ] **Gestalt Design Debugger** (see `gestalt-ui-organisation-skill` resource) — checks the
      resulting layout's proximity/alignment/hierarchy actually reflects the bucketing above.

## 5. UI Design

- [ ] **Five-Sentence Decision Log** (see `five-sentence-decision-log` resource) — per key screen,
      write the literal size/weight/color rationale; this is where you discover what actually
      needs visual weight.
- [ ] **60/30/10 Contrast rule** (see `sixty-thirty-ten-contrast-rule` resource) — derive the
      3-color palette from what the decision logs just revealed needs the rare "10%" pop, not the
      other way around.
- [ ] **value-upfront-rewrite** Figma skill (`figma.com/community/skill/75386`) — copy audit, now
      that layout and color are stable enough that rewrites won't get thrown out.
- [ ] **Design System** (choose shadcn/ui, theme it) — **last.** Crystallizes the tokens/components
      that steps 1–3 proved were actually needed.

## 6. Implementation

- [ ] **Shadscan** — static analysis of the shadcn components, run once they're coded to the
      phase-5 theme, then continuously in CI as a regression gate, not a one-time task.

## 7. Polish

- [ ] **Micro-interactions/motion** — now legitimately gated on the Design System from phase 5
      existing.
- [ ] **App Store screenshots** via **AppShot**, with **before.click** reused as a direct
      screenshot-style reference (its second use in this playbook, after phase 1).
