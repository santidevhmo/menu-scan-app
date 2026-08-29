# Menu Scan KB + Linear — design spec

> Written 2026-08-28 from a decision interview with Santiago. Every decision below was
> explicitly ruled on by him. Where a recommendation was overruled, the spec records **both**
> the ruling and the argument against it, so an executor does not re-litigate a settled call
> and does not mistake the losing argument for the plan.

**Status:** Ratified 2026-08-28. Implemented by three plans:
`2026-08-28-stage1-docs-repair.md` → `2026-08-28-stage2-kb-repo.md` → `2026-08-28-stage3-linear.md`.
They run **in that order**. Each ends at a coherent stopping point.

---

## 1. What this builds

Three things, in sequence:

1. **A repaired `menu-scan-app` docs tree** — one front door, one set of numbers, one archive.
2. **A new private repo `santidevhmo/menu-scan-kb`** — durable product and pipeline knowledge,
   delivered as Claude Code skills, modelled on `SendtoWin/sendtech-product-kb`.
3. **A populated Linear workspace** (`linear.app/menu-scan-app`) that becomes the single
   source of truth for project *status*.

## 2. The problem being solved

The repo asserts that status lives "in exactly one place." It does not. It lives in five,
and three of them currently disagree:

| Source | Claims |
|---|---|
| `docs/superpowers/START-HERE.md` | Phase 5 is **open**; lists next steps ①–⑤ |
| `AGENTS.md:538` | **434–453/684 (65%)** — the retired ruler |
| `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md` | **408–435/684 (62%)**, Phase 5 **closed** 2026-08-28 |
| `docs/superpowers/extraction-iteration-ledger.md` | eval 189, the derivation behind the roadmap's figures |
| `docs/sunny-lemon-development-plan.md` | per-phase `[x]` / `[~]` / `[ ]` markers |

The project's own doctrine — *"never quote a number written in a document; re-derive it"* — is a
workaround for exactly this defect. `README.md` is untouched `create-expo-app` boilerplate, so
nothing at the front door describes the product at all.

## 3. Ratified decisions

| # | Decision | Ruling |
|---|---|---|
| D1 | KB audience and content | Human-first **product** knowledge; agents read it too. Both, split by folder. |
| D2 | Repo owner and name | **`santidevhmo/menu-scan-kb`**, private |
| D3 | Relationship to `docs/` | **Migrate** — durable findings leave `docs/` for the KB |
| D4 | Linear records | **Forward-only.** No retroactive issues for completed work. |
| D5 | Process weight | Solo + agents. **No cycles, no estimates, no triage queue.** |
| D6 | Canonical roadmap | `docs/sunny-lemon-development-plan.md` ("Sunny Lemon", 16 phases) |
| D7 | Docs repair | **In scope**, all four defects |
| D8 | KB delivery | **Skills + `install.sh` symlinks**, same mechanism as `sendtech-product-kb` |
| D9 | What migrates | Durable findings **+ `extraction-iteration-ledger.md`** |
| D10 | What stays behind | Moves to **`docs/archive/`**, reachable for future pipeline work |
| D11 | Linear hierarchy | **4 initiatives → 16 projects → milestones → issues** |
| D12 | Issue granularity | **Unchecked items only.** Completed work summarised in the project description. |
| D13 | Status ownership | **Linear owns status.** Docs stop asserting it and link out. |
| D14 | Empty KB folders | Ship as **stubs** that say "nothing here yet", plus a Linear issue to fill each |
| D15 | Labels | 8 `area` · 6 `type` · `needs-decision` · `agent-ready`. **No dates on anything.** |
| D16 | Sequencing | **Sequential**, a commit per stage |

## 4. Decisions where the recommendation was overruled

**Do not re-open these. They are Santiago's calls. Both sides are recorded so the executor
understands the risk it is carrying, not so it can argue.**

### D9 — the ledger migrates (recommendation was: it should not)

`extraction-iteration-ledger.md` is 5,240 lines, 189 entries, the project's lab notebook. Its
governing rule is *"never re-try a hypothesis whose Verdict is REVERTED."* `AGENTS.md` makes an
entry **mandatory before every session ends**.

The argument against moving it: a session is then only complete after committing to **two**
repos, and the first forgotten push makes the project's memory silently wrong.

**Ruling: it migrates.** The mitigation is mandatory, not optional — Stage 2 Task 8 rewrites the
`AGENTS.md` session-end rule to name both repos explicitly. Do not skip that task.

### D11 — 4 initiatives (recommendation, after reading Linear's docs, was: 2)

Linear's docs define an initiative as grouping projects toward **a strategic outcome**, and warn
that projects are expected to have a clear start and end. "Foundation / Core Loop / Growth /
Launch" are four *stages of one outcome*, which is what milestones are for.

**Ruling: 4 initiatives.** It is defensible and readable; it is simply less Linear-idiomatic.

## 5. Consequences that fall out of D9 + D10 together

Handled inside the plans; listed here so they are not lost:

1. The ledger cites plans and specs **by path**. Moving the ledger to another repo *and* moving
   those files to `docs/archive/` breaks every reference twice. A path-rewrite pass with a
   zero-broken-references check is mandatory (Stage 2, Task 6).
2. `horizontal-menus/` is guarded **by name** in both `CLAUDE.md` and `AGENTS.md`. Moving it
   without updating both guards silently disables the guard (Stage 1, Task 5).
3. The three plan files and this spec are **active work**, not history. Stage 1's archive move
   must exclude anything matching `2026-08-28-*` (Stage 1, Task 4).

## 6. The KB tree

```
menu-scan-kb/
├── README.md
├── docs/
│   ├── BRIEF.md              what Menu Scan is — facts an agent cannot find by looking
│   ├── product-intent.md     Decided / Proposed / Idea ledger
│   ├── adr/                  Sunny Lemon §2 locked decisions + the Clerk ruling
│   ├── pipeline/             the deviation from SendTech — where the bulk lands
│   │   ├── ledger.md
│   │   ├── lessons.md
│   │   ├── model-findings.md
│   │   ├── oracle-rules.md
│   │   └── closed-phases.md
│   ├── research/             competitor analysis · macro prior-art · portion literature
│   ├── design-system/        the rationale behind DESIGN.md, not the tokens
│   ├── personas/             STUB — empty on day 1
│   └── brand/                STUB — empty on day 1
└── skills/
    ├── install.sh
    ├── menuscan-product/     hub — the /menuscan-product you type
    ├── menuscan-pipeline/
    ├── menuscan-research/
    ├── menuscan-design-system/
    └── menuscan-linear/      with the get_workspace() guard
```

**Why `pipeline/` exists and SendTech has no equivalent.** The two products have inverse
knowledge profiles. SendTech has ~1,281 lines on personas and ~0 on engineering evidence;
Menu Scan has 0 on personas and 47,718 lines of pipeline evidence. Forcing Menu Scan's knowledge
into SendTech's five buckets would produce five thin folders and a homeless ledger.

## 7. Rules inherited from `sendtech-product-kb`

These are load-bearing. Apply them to every file written in Stage 2.

1. **Cache what the agent cannot find by looking.** Hex codes live in the config file; restating
   them creates a second truth that drifts. The *reason* a value carries meaning exists in no
   file — that is what belongs in a skill.
2. **Single source of truth.** A new fact **replaces** the line it contradicts, rather than
   sitting beside it.
3. **Progressive disclosure.** Past ~150 lines, demote detail into `docs/` behind a pointer so
   the skill stays cheap to load.
4. **Derived content carries its origin.** Anything generated from the codebase records
   `generated_from: <sha>` and is re-checked with `git diff` before it is trusted.
5. **Stored documents carry a provenance header** — a `>` blockquote naming the source, the date
   it was filed, and how far it can be trusted.
6. **No orphans.** Every file under `docs/` has a row in some skill's "Source documents" table.

## 8. Out of scope

Touching `src/`, `supabase/functions/`, `scripts/`, or any fixture. Deleting anything. Running a
paid API call. Inventing a persona, a brand, a date, or a status. Changing the pipeline.

## 9. How the disagreeing numbers get resolved

The three sources disagree because all three **assert** a score. Under D13 they stop asserting.
So the fix is not to copy the freshest number into the stale places — it is to remove the
assertions and leave exactly one home for the figure.

| Where | Today | After |
|---|---|---|
| `AGENTS.md:538` | asserts **434–453/684 (65%)** | assertion **removed**, replaced by a pointer |
| `START-HERE.md` | asserts a whole stale status block | file rebuilt; asserts nothing, links out |
| master roadmap | asserts 408–435/684 (62%) | untouched — it is closed history, and history may carry its own numbers |
| KB `pipeline/closed-phases.md` | — | **the one place the Phase-5 exit numbers live**, sourced from the roadmap with its provenance stated |
| Linear | — | owns *status*: what is done, what is next |

This sidesteps the doctrine problem rather than accepting it: no number is copied from one
asserting document into another. The KB file records the figure **as a closed-phase exit
number with its derivation named** (eval 189, 2026-08-25, `$0` replays and sims), which is
history, not a live claim.

**If a future reader needs the current score, it is re-derived through the harness — never read
out of a document.** Both the KB file and the rebuilt `START-HERE.md` must say so explicitly.
