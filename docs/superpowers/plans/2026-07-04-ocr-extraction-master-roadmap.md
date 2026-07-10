# OCR Extraction Master Roadmap

> **What this is:** the roadmap you return to *between* conversations. It is NOT an individual feature plan. Each of the 5 features below gets its own `superpowers:writing-plans` plan, written and executed in its own conversation, using the kickoff template at the bottom.

> **📊 Live pipeline diagram (SOURCE OF TRUTH for the flow + prompts):** `docs/superpowers/diagrams/menu-extraction-pipeline.md` — a Mermaid **sequence diagram** of the current extraction/enrichment flow (Client → Edge Fn stages → GPT-4o Vision / Gemini APIs → postprocess → merge → scoring), with both full prompts (P1 `EXTRACT_PROMPT`, P2 `ENRICH_PROMPT`) verbatim and a 🟢/🟡/🔴 status legend. A snapshot copy is at `~/Downloads/menu-extraction-pipeline.md`. **MANDATORY: whenever you close a feature OR change P1/P2 or the flow, update this diagram (status colors, notes, prompt text) and re-copy it to Downloads — see "Diagram discipline" below.**

## Context

For several sessions the extraction eval loop chased all scoring dimensions at once (item totals, sections, options, categories) across 6 menus, and no iteration passed everything on more than one menu. Offline re-scoring showed iterations **trading dimensions against each other** (iter-010/011 gained options but broke item extraction on nikkori/brasero-two). Iteration 001 was re-certified as the best-known baseline with a ±2-pass noise floor.

The fix is process, not prompt: split the core OCR feature into 5 sequenced sub-features, work each one in its own conversation with its own narrow plan, close it only when its scoped dimension passes on all menus across 3 consecutive live runs, then freeze it as a permanent regression gate before starting the next.

**Scope of the whole roadmap: extraction only.** Success = the extraction JSON is correctly filled. UI work (toggleable options, "Huevos → Revueltos" display) is out of scope and comes after all 5 features close. UI notes are recorded per feature as future intent only.

---

## Strategy Rules (read before every feature)

- **One feature per plan per conversation.** Never iterate on two dimensions at once. This is the rule the whole roadmap exists to enforce.

- **Exit gate (uniform): the feature's scoped dimension passes on ALL 6 menus in 3 of 3 consecutive live eval runs.** Menus: `brasero`, `brasero-two`, `casa-nostra`, `el-marcos`, `mochomos`, `nikkori`. This supersedes the ±2 noise-floor *acceptance* rule for **closing** a feature (±2 stays useful for judging progress mid-iteration).

- **Cumulative regression gates (passing consistency) — the core rule:** once a feature is closed, its scoped check joins a frozen regression suite. From then on, every later feature's exit gate is:

  > **active feature's dimension passes 3/3 on all menus AND every previously-completed feature's check also passes in those same 3 runs.**

  Feature N is **not done** if it broke features 1..N-1. A prompt/schema change that wins the active dimension but regresses a frozen one is **rejected outright** — this is exactly the dimension-trading failure (iter-010/011) the roadmap prevents. Because all dimensions are scored from the **same** API responses, re-checking frozen gates costs **zero** extra API calls.

  **Practical (do not skip):** the crop-aware runner `scripts/eval-027-live.ts` hardcodes its gate dimension list (`GATE_DIMS`, currently `["items"]`). When you start a feature, **widen that array to include every closed dimension plus your new one** (F2 → `["items","options"]`, F3 → add `section_context`, …). `scoreMenu` already scores all dimensions per response, so this is a one-line edit with zero extra API cost. Forget it and the run prints `GATE PASS` while silently never checking the frozen gates.

- **Ledger discipline:** every iteration inside a feature logs to `extraction-iteration-ledger.md` and `extraction-eval-log.md` in the worktree, as today.

- **Diagram discipline (do NOT skip on close):** the moment a feature closes — or any change lands to the prompts (P1 `EXTRACT_PROMPT` / P2 `ENRICH_PROMPT`), the schema, or the call flow — update `docs/superpowers/diagrams/menu-extraction-pipeline.md`: flip that stage's status flag (🔴/🟡→🟢), update the sequence-diagram notes and the Status table, edit the verbatim prompt appendix if the prompt changed, then re-copy the file to `~/Downloads/menu-extraction-pipeline.md`. The diagram is the fresh-context source of truth for "what does the pipeline look like right now"; a stale diagram misleads the next LLM.

---

## Prior art — DoorDash's menu-transcription pipeline (researched 2026-07-09, Feature 2)

DoorDash runs LLM menu-photo transcription in production at scale. Their published system was studied during Feature 2 and shaped our option semantics. **Read before proposing pipeline/architecture changes** — don't re-derive what they already learned.

**Sources (downloaded local copies — the originals are behind a 403 for fetch tools):**
- `/Users/santiagoaguirre/Downloads/Using LLM to transcribe restaurant menu photos  - DoorDash.pdf` (DoorDash Eng blog, 2025-03-19 — the primary source; note the filename contains a non-breaking space before " - DoorDash")
- `/Users/santiagoaguirre/Downloads/How DoorDash uses AI Models to Understand Restaurant Menus.pdf` (ByteByteGo's analysis of the same system)

**Their pipeline:** menu photo → TWO transcription models in parallel (Model 1: OCR→LLM summarization, stable but weak context; Model 2: multimodal vision LLM = our GPT-4o approach, better context but fragile on bad photos) → a **guardrail ML classifier** (LightGBM beat every neural alternative) scoring photo + OCR + LLM-output features to predict transcription accuracy → above threshold: auto-publish; below: route to **human transcription** (which also produces their labeled training data). Their #1 failure mode: **linking attributes to the correct parent item** — exactly what Features 3–4 harden. Their "extraction order" (Category | Name | Price | Calorie | Description) is the *column order of their output table*, not a pipeline sequence — extraction is single-pass, like our P1. Their schema: categories → items → attributes; modifiers/add-ons attach to the item, never become new items — the convention Feature 2 adopted (2026-07-09, user-locked).

**Adoption decisions (2026-07-09, user-aligned):**
1. ✅ Adopted: item-owns-options modifier model (Feature 2's fold convention); eval-gated iteration (we already had it — our fixture gate IS the guardrail at 6-menu scale); routing hard layouts to a different path (our dense-crop recipe ≈ their human-routing).
2. 📌 Post-F5 backlog — **use `image_quality` in the client**: P1 already returns `image_quality {usable, issues[]}`; the app should prompt a photo re-take when `usable=false` (or issues are severe) BEFORE paying for extraction — the cheapest version of their guardrail. Slot it with the Stage-2/UX work after the extraction features close.
3. 📌 Post-F5 backlog — consistency-as-confidence: run-to-run/model disagreement flags low-confidence items in the UI (their lesson: no single model wins; disagreement is signal). Do NOT dual-run models per scan yet (doubles cost).
4. 📌 The planned feedback feature (AGENTS.md: "wrong scan / wrong result" reports) doubles as the **label factory**: each user correction = (photo, corrected truth) pair — the data a real DoorDash-style guardrail classifier would need. No new build; just don't drop the feedback plans.
5. ❌ Rejected for now: separate OCR+LLM pipeline (their own data shows weaker context understanding; only worth it at uncontrolled-photo scale), trained guardrail classifier (needs thousands of labels we don't have), human-transcription workforce (n/a — our user IS the human in the loop).
6. Feature order stays F3 → F4 → F5 (user decision 2026-07-09): our sequence already mirrors their category→item→attribute hierarchy and attacks their hardest problem (linkage) next.

---

## Feature Sequence (MVP order)

Food first because the app's value is macro-sorted **food**; drinks come last.

### Feature 1 — Extract all Food menu items ✅ CLOSED 2026-07-06
- **Plan file:** `docs/superpowers/plans/2026-07-04-feature-1-extract-food-items.md` (see its Execution Log for the final results, distinct-dish convention, el-marcos re-adjudication, and Feature 2–5 gotchas).
- **Goal:** every food item on the menu appears exactly once in the JSON; count matches the fixture's food total.
- **Scoped dimension:** `items` count, food category only.
- **Harness work:** split each fixture's `total_items` into food/drink counts (currently combined — e.g. el-marcos 45 = food + drink). Add a category/dimension filter flag to `eval-extraction.ts` so a run scores only the active feature's dimension plus already-frozen gates.
- **Frozen gates when starting:** none (first feature).
- **Exit gate:** `items` (food) passes on all 6 menus, 3/3 runs.

### Feature 2 — Extract options of Food items
- **Goal:** food items with choices (e.g. "Caesar Salad" → Chicken / Fish) carry those choices in `options`.
- **Scoped dimension:** `options` pass + `optionRecall`, food items only.
- **Harness work:** reuse existing `items_with_options` fixtures; el-marcos option corrections already applied.
- **Frozen gates when starting:** Feature 1 (`items`/food — now a COMPLETENESS gate: distinct food dish-names within ±3, no true duplicates; section-header hygiene was moved to Feature 3). Fixtures are distinct-dish counts; el-marcos re-adjudicated to 28.
- **Run the gate via `scripts/eval-027-live.ts`, NOT the plain `eval-extraction.ts --gate`** — Nikkori passes `items` ONLY through the crop-merge path that script routes; a single full-page call spuriously fails it. See feature-1 plan Execution Log "Gotchas".
- **Feature 1 close-out context is in `2026-07-04-feature-1-extract-food-items.md` (Execution Log) + ledger iterations 025–029.** Read those before starting: the Chilaquiles/Revueltos variants and el-marcos are your primary option targets; brasero-two is count-fragile near +3.
- **UI intent (future):** options render as toggles in the already-merged selectable-options UI so the user sees macro deltas.
- **Exit gate:** `options` passes on all 6 menus, 3/3 runs, **AND** Feature 1 (`items` completeness) still green in those runs.

### Feature 3 — Extract sections & sub-sections
- **Goal:** section hierarchy is captured; trimmed item names get their parent section so "Revueltos" reads as "Huevos → Revueltos".
- **Scoped dimension:** `sections` list match + full-item-name rule.
- **Harness work:** reuse `sections` fixture arrays; el-marcos Huevos full-name expectations already in fixtures.
- **Frozen gates when starting:** Features 1, 2.
- **UI intent (future):** display "Huevos → Revueltos" so trimmed titles aren't confusing.
- **Exit gate:** `sections` passes on all 6 menus, 3/3 runs, **AND** Features 1–2 still green.

### Feature 4 — Extract each item's closest section + category
- **Goal:** each item is tagged with its nearest section ("Cocktails", "Steaks", "Desserts") and coarse category (Appetizer / Main / Drink).
- **Scoped dimension:** `section_context` + `categories`.
- **Harness work:** reuse `section_expectations` per fixture; may need more expectation entries per menu.
- **Grams capture (added 2026-07-09, user request):** printed weights/volumes are high-value for Stage-2 macro accuracy (P2 already prefers printed weights over guesses). Today grams exist ONLY on options (`options[].grams`); item-level weights ride as text inside `name`/`description` ("CHILAQUILES (70gr.)", "(350mL)"). At F4 kickoff decide: add an item-level `grams` field to the schema + a scoped check, or keep text-embedded and verify P2 parses it. Known limit to watch: digit misreads in small print (60gr→650gr, ledger iter-036).
- **Option/variant PRICE accuracy (added 2026-07-09, user request):** `options[].price` is already extracted but NOT gate-checked — Feature 2's gate verified option NAMES only, so a wrong option price passes silently (proven live: el-marcos Revueltos' "Con jamón, chorizo o tocino" option came back @84 instead of the printed @90 when the model dropped the middle line; the fold maps prices correctly whenever all lines are transcribed). F4 harness work: extend `items_with_options` targets with expected option prices and make the scorer verify price (and grams, above) per matched option — the user-facing price/macro deltas on option toggles depend on both.
- **Frozen gates when starting:** Features 1, 2, 3.
- **Exit gate:** `section_context` + `categories` pass on all 6 menus, 3/3 runs, **AND** Features 1–3 still green.

> **Stage-2 note:** grams flowing from Feature 4 feed enrichment directly — when benchmarking Stage 2, include printed-weight items (el-marcos gramajes, nikkori ml) in the comparison so the "prefer printed weights" P2 rule is actually measured.

### Feature 5 — Extract all Drink menu items
- **Goal:** every drink item appears exactly once; count matches the fixture's drink total.
- **Scoped dimension:** `items` count, drink category.
- **Harness work:** uses the drink counts created in Feature 1's fixture split.
- **Frozen gates when starting:** Features 1, 2, 3, 4.
- **Exit gate:** `items` (drink) passes on all 6 menus, 3/3 runs, **AND** Features 1–4 still green.

---

## Reference Block — COPY THIS VERBATIM INTO EVERY INDIVIDUAL FEATURE PLAN

### Branches

```
┌────────────────────────────────┬─────────────┬─────────────────────────────────────────────────────────────────────────┐
│             Branch             │   Status    │                                 Purpose                                 │
├────────────────────────────────┼─────────────┼─────────────────────────────────────────────────────────────────────────┤
│ feat/extraction-eval-harness   │ Active WIP  │ ← eval-log.md is here — measuring extraction quality across iterations;  │
│                                │             │   includes offline re-scoring against corrected El Marcos options;       │
│                                │             │   tracking pass/fail rates and option detection improvements             │
├────────────────────────────────┼─────────────┼─────────────────────────────────────────────────────────────────────────┤
│ feat/options-extraction-eval   │ 7 commits   │ Earlier extraction eval setup — GPT-4o vision caller, prompt configs,    │
│                                │             │   scoring framework with TDD                                             │
├────────────────────────────────┼─────────────┼─────────────────────────────────────────────────────────────────────────┤
│ feat/multi-goal-zscore-sorting │ Merged      │ ✓ Goal ranking algorithm (soft-clamped z-scores) — already in main       │
├────────────────────────────────┼─────────────┼─────────────────────────────────────────────────────────────────────────┤
│ feat/selectable-options        │ Current     │ ✓ Menu option UI selection feature — already in main                     │
├────────────────────────────────┼─────────────┼─────────────────────────────────────────────────────────────────────────┤
│ feat/phase3-goal-selection     │ Merged      │ ✓ Goal filtering logic — already in main                                 │
└────────────────────────────────┴─────────────┴─────────────────────────────────────────────────────────────────────────┘
```

**Working directory:** eval work happens in the worktree `/private/tmp/menu-scan-app-extraction-eval-harness` on branch `feat/extraction-eval-harness`.

### Files (reference — NOT MANDATORY TO READ ALL)

> Relevant files NOT MANDATORY TO READ ALL. Reading all results in burned context and unable to start task. Keep these as reference and to read when necessary.

- All evaluation results → `/private/tmp/menu-scan-app-extraction-eval-harness/docs/superpowers/extraction-eval-log.md`
- `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app/CLAUDE.md`
- `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app/AGENTS.md`
- `/private/tmp/menu-scan-app-extraction-eval-harness/docs/superpowers/extraction-options-handoff.md`
- `/private/tmp/menu-scan-app-extraction-eval-harness/docs/superpowers/extraction-iteration-ledger.md`
- `/private/tmp/menu-scan-app-extraction-eval-harness/docs/superpowers/specs/2026-07-03-two-pass-options-design.md`
- `/private/tmp/menu-scan-app-extraction-eval-harness/docs/superpowers/plans/2026-07-03-two-pass-options-iteration-009.md`
- `/private/tmp/menu-scan-app-extraction-eval-harness/supabase/functions/analyze-menu/postprocess.ts`
- `/private/tmp/menu-scan-app-extraction-eval-harness/scripts/eval-extraction.ts`
- `/private/tmp/menu-scan-app-extraction-eval-harness/scripts/fixtures/*.expected.json`

### Edge Function (menu scanning)

```bash
curl -s -X POST "https://uonuiadueykynbetxxrw.supabase.co/functions/v1/analyze-menu" \
  -H "Authorization: Bearer <EXPO_PUBLIC_SUPABASE_ANON_KEY from .env>" \
  -H "Content-Type: application/json" \
  -d '{"photos":["<base64 img1>","<base64 img2>"],"goals":[],"provider":"gpt-vision","stage":"extract"}'
```

Anon key is in `.env` as `EXPO_PUBLIC_SUPABASE_ANON_KEY`. Response includes `items`, `raw_response`, `latency_ms`, `model_id`. Local `supabase serve` runs also need `OPENAI_API_KEY` set in the environment (per prior sessions).

---

## Per-Feature Kickoff Prompt (paste into a NEW conversation)

```
Read CLAUDE.md and AGENTS.md and follow them strictly.
Read the master roadmap at docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md.

We are on Feature N: <name>.

Use superpowers:writing-plans to create the individual plan for THIS FEATURE ONLY.
Scope: extraction JSON only — no UI work.
Exit gate: the feature's scoped dimension passes on all 6 menus in 3/3 consecutive
live runs, AND every previously completed feature (<list closed features>) still
passes in those same runs. The feature is NOT done if any earlier feature regressed.
Copy the roadmap's Reference Block (branches, files, curl) verbatim into the plan.
On close: update the pipeline sequence diagram (docs/superpowers/diagrams/menu-extraction-pipeline.md)
— status flags, notes, and prompt appendix if P1/P2 changed — and re-copy it to ~/Downloads (Diagram discipline).
Last step: revoke any OpenAI API key pasted into chat or exposed during live evals.
```

## Progress Checklist

- [x] Feature 1 — Extract all Food menu items ✅ CLOSED 2026-07-06 (completeness gate; see feature-1 plan Execution Log)
- [x] Feature 2 — Extract options of Food items ✅ CLOSED 2026-07-09 (fold convention; 3/3 live gate eval 038; see `2026-07-09-feature-2-extract-food-options.md` Execution Log)
- [ ] Feature 3 — Extract sections & sub-sections
- [ ] Feature 4 — Extract closest section + category
- [ ] Feature 5 — Extract all Drink menu items
