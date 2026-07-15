# DELEGATION BRIEF — Horizontal Menus (critical-path #4)

> **Read this file in full before doing anything.** It is the entry point for zero-context LLMs continuing this work. It overrides your defaults, except the repo's `CLAUDE.md` and `AGENTS.md` (below), which also govern — read both and follow them STRICTLY.

---

## ⚡ PROGRESS LOG (newest first — every planner session APPENDS here before ending)

- **2026-07-14 (Eval 067 diagnostic approved):** User approved Option 1 with a hard live-cost cap of ~$0.55 (about $0.18/run, stop after first scored failure). Executor Checkpoint-1 task block handed off: repair Eval-066 staging (`supabase/.temp` accidental commit + uncommitted approved Alitas pin), commit the already-written Eval-066 ledger/brief updates, then TDD a harness-only trace that always saves final items + existing `raw_response` under Eval-067-specific filenames and stops after the first scored failure. **NEXT ACTION:** collect executor Checkpoint 1 (commits + tests + diff); verify no extraction/verifier/merge behavior changed; only then relay the already-approved detached launch. Do not spend API cost before that planner checkpoint.
- **2026-07-14 (Eval 066 diagnosed):** I9 landed and improved its three target classes, but the forced 2x2 probe was only 1/3 (r1 all green; r2 47/40; r3 46/40; other four dims green 3/3). Photo adjudication shows the residual is duplicated Alitas plus cross-tile word/field recombinations (`Boneless El Jr`, `Tender de Coliflor`, `Cheesy`/`Boneless P`, `Ensalada Verde 350gr/$70`, `Nuggets de Coliflor`). Root cause is scope: v3 verifies independent name existence per tile, so two representations of one real card can both pass; the prompt already contains the generic two-dish-mashup warning. Evidence gap: the probe omits existing raw tile responses and writes only failing final dumps, so current r1 is unauditable (on-disk r1 is stale). Repo checkpoint also needs repair: `369e98b` accidentally contains two `supabase/.temp` files and omitted the approved Alitas fixture pin, which remains uncommitted. **NEXT ACTION:** await user approval for Eval 067 diagnostic trace: $0 repo/harness-only repair + always save final/raw tile outputs, then run until first scored failure (about $0.18/run, max 3/~$0.55). Do NOT choose another prompt/merge fix or start the detector trigger until the source-tile trace is analyzed.
- **2026-07-14 (late night):** Verifier v3 LANDED and KEPT (commit 00dec3c; rejections 0/2/1, only Ensaladas mangles — no real-dish over-deletion). Ensaladas oracle tolerance LANDED (2f93a9a; restore clause written into ROADMAP Phase 2). v3 probe = ledger eval 065: FAILED 3/3 but for NEW reasons — v2's random over-deletion had been masking a tile-twin/echo overcount (51 & 50 vs 45 ceiling). Dump decomposition → 3 deterministic fixes, ALL USER-APPROVED with re-probe ~$0.55: (I9a) dropOptionEchoItems (Paletas flavors; USER RULING: no combo machinery, price guard only, bias to keeping standalone dishes); (I9b) twin-fold relax — section-agnostic + near-name, grams-equality guard stays; (I9c) remapTruncatedSectionTitles (exactly-one-superset guard); plus ORACLE (approved): "Alitas" unchecked options pin (becomes required Shape-A pin at Phase 2 kickoff). EXECUTOR TASK BLOCK for all of this ("Eval 066") was handed to Santiago — NEXT ACTION: collect the executor's checkpoint/final report, ledger eval 066, analyze. If items/options go green, residual watch-items are (E) run-1-class heading miss (no tile read "Sandwiches & Hamburguesas"; contingency = tile overlap bump OR one heading-focused tile-prompt sentence) and (C) inventions ("Crispy (500gr)"/"Chicken Bacon"; contingency = one verifier-prompt sentence) — iterate ONE variable if either recurs. After polloteria 2×2 is 3/3 → detector trigger probe (aspect-scoped P1 density suffix, ~$0.90 ALREADY approved) → Phase 1 exit.
- **2026-07-14 (evening):** Phase 1c iteration 3 pending. Verifier v2 probe (ledger eval 064): items/options/categories/grams GREEN 3/3 on polloteria; ONLY section_context fails (Ensaladas — Phase-2 coupling, see eval 064). NEXT ACTION: user approval was requested for (a) verifier v3 = per-tile, name-only, pre-merge, price machinery removed; (b) TEMPORARY oracle tolerance: polloteria `sections` "Ensaladas" → `section_headers` + drop its pins, restore at Phase 2 close; (c) re-probe ×3 ~$0.55. If approved → executor task block for v3; if v3 holds → detector trigger (aspect-scoped P1 suffix, ~$0.90 ALREADY approved) → Phase 1 exit (polloteria 3/3 through the full production path incl. detector).
- **2026-07-14:** Verifier v1 over-deleted real dishes (eval 063); v2 designed + run (eval 064). parseItemGrams comma bug fixed ("1,200gr"→1200). RULING: duplication/invention = release-blocking; verification pass pulled INTO scope; polloteria over-band stays +5.
- **2026-07-13/14:** Hygiene ladder landed (evals 061-062): tolerated_categories scorer field; dropBannerEchoOptions; nullPriceNoteSections; tile-pass twin fold + truncation drop (merge.ts); misread pin retargets. Geometry A/B: 2×2 WINS, 4×1col REJECTED.
- **2026-07-13:** Detector diagnosis (eval 060): TOTAL blind spot on landscape (dense=false + crop_direction=none 3/3). Phase 0 CLOSED (eval 059): 3 fixtures built + self-consistent.

## Where you are in the plan hierarchy

```
Menu Scan App development (AGENTS.md — product, stack, rules)
└─ Core feature: OCR extraction hardening
   (MASTER ROADMAP: main repo docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md
    — Features 1-4 CLOSED; pre-release critical path #1 wiring ✅, #2 auto-cutter ✅, #3 compression ✅)
   └─ Critical-path #4: Horizontal/landscape menus  ← YOU ARE HERE
      (this folder: ROADMAP.md = phases/rulings; this brief = entry point + log)
      └─ after this: #5 Stage-2 enrichment benchmark → model bake-off
```

## The planner ↔ executor split (KEEP RUNNING IT)

Two LLM sessions, one human (Santiago):
- **PLANNER (this brief's primary audience):** analysis, brainstorming, probe design, dump diagnosis, gate judgment, ledger/roadmap/brief writes, authoring executor task blocks. Uses the superpowers skills (brainstorming / systematic-debugging / writing-plans) at the corresponding moments.
- **EXECUTOR (separate zero-context session; Santiago pastes task blocks to it):** writes code TDD-first, runs self-checks/`deno check`/`deno test`/`tsc`, commits, launches detached runs, monitors logs, reports RAW results verbatim. Executor task blocks must be self-contained (exact code, exact commands, expected output) and always end with hard stops: report back at checkpoints; never launch multi-run gates without an explicit relayed cost approval; never commit in the main checkout.
- **SANTIAGO decides:** all ORACLE-CHANGEs (fixture truth), convention rulings, cost approvals, device scans. When evidence needs a ruling, the planner presents options with a recommendation and waits.

## Non-negotiable operating rules (hard-won; violating them wasted real money)

1. Read the MASTER ROADMAP's "Strategy Rules" + "Lessons learned — GENERAL rules" (10 rules) before any prompt/eval work. Highlights: one run proves nothing (temp-0 ≠ determinism); probe cheap before gating expensive; prompt edits have NON-LOCAL side effects — one sentence at a time, mode-scoped to where evidence was measured; adjudicate from the MENU PHOTO, never from model output; fix at the layer where information still exists; instrument before theorizing.
2. Long live runs: `nohup … > log 2>&1 &` then poll the log file. NEVER foreground (10-min tool timeout kills runs), never pipe live output.
3. Validate offline ($0: score-dump vs archived dumps, self-checks) before paying for live runs. `OPENAI_API_KEY` is in the worktree's `.env.local` (gpt-4o, Tier-1 30k TPM / 90k TPD — campaigns exhaust the daily window; both prior 3/3 closures were daytime runs).
4. Every experiment gets a ledger entry (same format as evals 001-064). Every planner session updates the ⚡ PROGRESS LOG above.
5. The worktree `/private/tmp/menu-scan-app-extraction-eval-harness` (branch `feat/extraction-eval-harness`, pushed to origin) can vanish from /private/tmp — recreate with `git worktree add /private/tmp/menu-scan-app-extraction-eval-harness feat/extraction-eval-harness` and ask Santiago for `.env.local`. Commit early and often. The MAIN checkout (`/Users/santiagoaguirre/Desktop/CODING/menu-scan-app`, branch feat/selectable-options) is device-builds only — NEVER commit the client slice there (docs-only commits allowed).
6. Vertical safety during iteration is proven BY CONSTRUCTION (portrait behavior unit-pinned byte-identical; new rules scoped to the tile pass / landscape mode), not by burning gates. The 6 vertical menus re-run live only at the Phase-4 combined exit gate (~$1.35-1.50/attempt, approval per attempt).
7. Generalization rule: no hardcoded menu-specific counts/names/geometry in production code. Fixture-level tolerances are the mechanism for menu-specific quirks.

## File map (all paths)

**This folder (worktree):** `docs/superpowers/horizontal-menus/`
- `DELEGATION-BRIEF.md` — this file (entry point + progress log)
- `ROADMAP.md` — phases 0-4, rulings (Shape A, aderezos, fixture counts, verification pass scope), architecture decisions, cost policy

**Governing docs:**
- `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app/CLAUDE.md` + `AGENTS.md` — READ AND FOLLOW STRICTLY (AGENTS.md also carries the critical-path status line)
- Main repo `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md` — MASTER roadmap (strategy rules, lessons, release scope)
- Main repo `docs/superpowers/diagrams/menu-extraction-pipeline.md` — pipeline + verbatim P1/P2 prompts (update on close, re-copy to ~/Downloads)

**Worktree evidence trail:**
- `docs/superpowers/extraction-iteration-ledger.md` — EVERY experiment ever (horizontal work = evals 059-064+; read at least those before proposing anything)
- `docs/superpowers/specs/` + `docs/superpowers/plans/` — prior specs/plans (ticket #3 compression etc.)

**Code (worktree-relative):**
- `supabase/functions/analyze-menu/extract.ts` — P1 + suffixes, runPagedExtraction (phase-1, `{needs_crops}` on dense), runGroupedExtraction (tile groups; verification pass lives here), extractWithRetry
- `supabase/functions/analyze-menu/merge.ts` — mergeItemSources (tile-pass twin fold + truncation drop live here), postprocess.ts (hygiene chain, `--self-check`), index.ts (edge handlers, 10M-char per-photo cap)
- `scripts/eval-027-live.ts` — THE gate runner (GATE_DIMS all 5 + detector asserts; production-mirror input via photo-input.ts)
- `scripts/eval-extraction.ts` — scoreMenu + self-check; `scripts/score-dump.ts` — offline dump scorer; `scripts/photo-input.ts` — production-mirror input; `scripts/extract-draft.ts` — new-menu drafts; `scripts/probe-fidelity.ts`, `scripts/probe-detector.ts`, `scripts/probe-tiles.ts` — probes
- `scripts/fixtures/*.expected.json` — oracles (bistro/polloteria/guest-house = the landscape three; NEVER edit without a Santiago ruling)
- Client slice: `src/lib/compressImage.ts`, `analyzeMenu.ts`, `adaptiveExtraction.ts` (gridCropRects), `src/app/(tabs)/index.tsx`, `src/components/scan/GalleryButton.tsx`, `src/store/scan.store.ts`

**Assets:** `/Users/santiagoaguirre/Downloads/MenusTesting/` — 6 vertical photos + `BistroMenu.png`, `PolloteriaMenu.png` (dense landscape), `GuestHouseMenu.png` (English landscape); user-corrected truths `*.png.draft.json`; `*.actual.json` = free offline validation dumps (check mtimes — overwritten per run).

## Iteration log — DO NOT REPEAT THESE (full detail in ledger evals 059-064)

| Tried | Result | Lesson |
|---|---|---|
| Full-page extraction of dense landscape (polloteria) | 39-46 of 55 items, names mangled, detector silent | Landscape rescale (768px SHORTEST side = height) crushes small print; GuestHouse survives only because its type is larger |
| 4×1col column-strip tiles | REJECTED — loses left-column sections 3/3, unstable counts | Don't retry column strips |
| 2×2 tiles (portrait-proven geometry) | WINNER — full coverage; needed the hygiene ladder on top | Keep 2×2 for landscape |
| Widening bands to absorb phantoms | REJECTED BY RULING — duplication/invention is release-blocking (waiter-embarrassment test) | Fix, don't tolerate; band stays +5 |
| Verifier v1 (one boolean, drop on false) | Over-deleted real dishes (Dedos de Queso, all Ensaladas) | Price-mismatch ≠ deletion; field flakes are acceptable, missing dishes are not |
| Verifier v2 (two-field, twin-tie price drops) | price path NEVER fired; name path high-variance (3 vs 12 drops across runs) | 50 names × 4 overlapping images in one call is too hard; price/twin handling belongs to the merge rules |
| Verifier v3 (per-tile, name-only, pre-merge) | KEPT — rejections 0/2/1, only Ensaladas mangles (eval 065) | Verifier's blind spot BY DESIGN: word-mashup inventions ("Crispy (500gr)") survive because every word IS printed |
| Post-merge verification as an overcount fix | v2 only LOOKED like it controlled counts — it was randomly deleting ~12 names | Overcounts are merge-rule problems (twins/echoes), not verification problems |
| More P1 prompt rules naming dish patterns | (Earlier eras: v4, v7.1) REGRESSED — priming effects | Never name specific dish/box patterns in P1 |
| Consistency-intersection for phantoms | REJECTED (nikkori era): stable phantoms survive intersection | — |

**Working set that must not regress (all TDD'd, tile-pass-scoped):** tolerated_categories (scorer), dropBannerEchoOptions, nullPriceNoteSections, twin fold + truncation drop (merge.ts), parseItemGrams comma fix, misread pin substrings ("tiBoneless", "Megach", Cabeza/Cubeta + "El Tender" unchecked keys), verifier v3 (00dec3c). IN-FLIGHT with the executor (task block "Eval 066"): dropOptionEchoItems + remapTruncatedSectionTitles (postprocess.ts, tile-chain-wired), twin-fold relax (merge.ts), "Alitas" unchecked pin — confirm landed + probe results before assuming.

## Known watch-items / open threads

- Ensaladas (polloteria) = size-variant cards; blocked on Phase 2's extraction convention (Shape A ruled). Temporary tolerance pending approval (see PROGRESS LOG).
- Detector trigger not built: production NEVER routes landscape-dense menus to tiles yet — Phase 1's remaining exit blocker. Approved approach to probe: aspect-scoped P1 density suffix (edge reads image dims from the file header; portrait never sees it).
- Stable misreads (Cabeza/469, TortiBoneless/480, El Tender*) = model-level, tolerance-managed; candidates for the post-#5 model bake-off (polloteria + guest-house join its fixture set).
- Rotation arm (Phase 3) untouched; combined 9-menu exit gate (Phase 4) untouched.
