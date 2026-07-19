# OCR Extraction Master Roadmap

> **What this is:** the roadmap you return to *between* conversations. It is NOT an individual feature plan. Each of the 5 features below gets its own `superpowers:writing-plans` plan, written and executed in its own conversation, using the kickoff template at the bottom.

> **📊 Live pipeline diagram (SOURCE OF TRUTH for the flow + prompts):** `docs/superpowers/diagrams/menu-extraction-pipeline.md` — a Mermaid **sequence diagram** of the current extraction/enrichment flow (Client → Edge Fn stages → GPT-4o Vision + GPT-4o enrichment → postprocess → merge → scoring), with both full prompts (P1 `EXTRACT_PROMPT`, P2 `ENRICH_PROMPT`) verbatim and a 🟢/🟡/🔴 status legend. A snapshot copy is at `~/Downloads/menu-extraction-pipeline.md`. **MANDATORY: whenever you close a feature OR change P1/P2 or the flow, update this diagram (status colors, notes, prompt text) and re-copy it to Downloads — see "Diagram discipline" below.**

## Context

For several sessions the extraction eval loop chased all scoring dimensions at once (item totals, sections, options, categories) across 6 menus, and no iteration passed everything on more than one menu. Offline re-scoring showed iterations **trading dimensions against each other** (iter-010/011 gained options but broke item extraction on nikkori/brasero-two). Iteration 001 was re-certified as the best-known baseline with a ±2-pass noise floor.

The fix is process, not prompt: split the core OCR feature into 5 sequenced sub-features, work each one in its own conversation with its own narrow plan, close it only when its scoped dimension passes on all menus across 3 consecutive live runs, then freeze it as a permanent regression gate before starting the next.

**Scope of the whole roadmap: extraction only.** Success = the extraction JSON is correctly filled. UI work (toggleable options, "Huevos → Revueltos" display) is out of scope and comes after all 5 features close. UI notes are recorded per feature as future intent only.

---

## Strategy Rules (read before every feature — then read "Lessons learned" below)

- **One feature per plan per conversation.** Never iterate on two dimensions at once. This is the rule the whole roadmap exists to enforce.

- **Exit gate (uniform): the feature's scoped dimension passes on ALL 6 menus in 3 of 3 consecutive live eval runs.** Menus: `brasero`, `brasero-two`, `casa-nostra`, `el-marcos`, `mochomos`, `nikkori`. This supersedes the ±2 noise-floor *acceptance* rule for **closing** a feature (±2 stays useful for judging progress mid-iteration).

- **Cumulative regression gates (passing consistency) — the core rule:** once a feature is closed, its scoped check joins a frozen regression suite. From then on, every later feature's exit gate is:

  > **active feature's dimension passes 3/3 on all menus AND every previously-completed feature's check also passes in those same 3 runs.**

  Feature N is **not done** if it broke features 1..N-1. A prompt/schema change that wins the active dimension but regresses a frozen one is **rejected outright** — this is exactly the dimension-trading failure (iter-010/011) the roadmap prevents. Because all dimensions are scored from the **same** API responses, re-checking frozen gates costs **zero** extra API calls.

  **Practical (do not skip):** the crop-aware runner `scripts/eval-027-live.ts` hardcodes its gate dimension list (`GATE_DIMS`, currently `["items"]`). When you start a feature, **widen that array to include every closed dimension plus your new one** (F2 → `["items","options"]`, F3 → add `section_context`, …). `scoreMenu` already scores all dimensions per response, so this is a one-line edit with zero extra API cost. Forget it and the run prints `GATE PASS` while silently never checking the frozen gates.

- **Ledger discipline:** every iteration inside a feature logs to `extraction-iteration-ledger.md` and `extraction-eval-log.md` in the worktree, as today.

- **Diagram discipline (do NOT skip on close):** the moment a feature closes — or any change lands to the prompts (P1 `EXTRACT_PROMPT` / P2 `ENRICH_PROMPT`), the schema, or the call flow — update `docs/superpowers/diagrams/menu-extraction-pipeline.md`: flip that stage's status flag (🔴/🟡→🟢), update the sequence-diagram notes and the Status table, edit the verbatim prompt appendix if the prompt changed, then re-copy the file to `~/Downloads/menu-extraction-pipeline.md`. The diagram is the fresh-context source of truth for "what does the pipeline look like right now"; a stale diagram misleads the next LLM.

---

## Lessons learned — GENERAL rules for future iterations (read before ANY prompt/eval work)

Distilled from Features 1–4 and the 2026-07-10 per-page-wiring close (ledger evals 045–048). These are not menu-specific; they are the mistakes an LLM will repeat unless told not to.

1. **Temp-0 + fixed seed is NOT determinism.** GPT-4o flips between document-global "transcription modes" (verbatim-caps vs normalized-title-case; weights kept vs silently dropped) under the SAME `system_fingerprint`. Never conclude a change works — or that it broke something — from 1–2 runs. Nor is a passed 3/3 gate a proof; it's a sample. That's why frozen gates re-check on every later run.
2. **Cheap probes before expensive gates.** A full 6-menu 3-run gate is ~$0.90 and ~11 min. A targeted `EVAL_MENUS=<menu>` run is ~$0.03–0.12. When iterating, probe the sensitive menu(s) ×6+ first; only run the full gate when probes are clean. Burning gates to discover what a probe would have shown is the main money/time waste.
3. **Prompt edits have NON-LOCAL side effects.** One added sentence about printed weights caused a never-before-seen failure on a *different* menu (a dish card returned as a section heading). Corollaries: (a) any P1 change requires probes on ALL sensitive menus plus the full frozen-dim gate; (b) instruct WHAT to preserve, never WHERE/HOW to lay it out — layout-literalism pressure ("exactly where it is printed") is what caused the heading split; (c) iterate ONE sentence at a time so causality stays attributable.
4. **Adjudicate from the menu photo, never from model output or fixture history.** The "Omelette de Camarón [Marlin]" option looked like a model false positive; reading the photo showed the menu prints "…de Camarón **y** Marlin" — one dish — so the model was wrong and the fix was linguistic ("y/and" joins ≠ "o/or" choices). Before ANY oracle change, look at the photo (the Read tool renders images).
5. **"UNCHECKED" is a scorer semantic, not a deletion.** Removing an expectation whose target the model *sometimes* extracts flips the failure to a false positive instead of fixing it. Model tolerance explicitly (e.g. `unchecked: true` on an `items_with_options` entry) with self-checks, and don't silently repurpose an existing fixture shape that already has a meaning (`options: []` = "require some option").
6. **Fix at the layer where the information still exists.** Text the model never emitted (a dropped "(70gr.)", a skipped option line) is NOT postprocess-recoverable — the prompt is the only lever. Conversely, when the info survives extraction, deterministic postprocess beats prompt work (F2/F4 precedent). Decide the layer first; don't iterate prompts for what a fold can do, or postprocess for what was never transcribed.
7. **Instrument before theorizing.** One `console.log` of `system_fingerprint` killed a wrong "backend drift window" theory in a single 8-run probe — without it, the plan was "wait for a better window" that did not exist. When behavior is nondeterministic, log the discriminating variable and measure the base rate BEFORE choosing a fix.
8. **Long runs: detach + monitor, and never filter the live log.** A 10-min tool timeout killed a gate mid-run (wasted ~$0.90); piping gate output through `tail`/`grep` destroyed run-1 diagnostics of another. Launch gates with `nohup … > log &` and watch the log file; keep the raw log intact.
9. **Failure dumps are overwritten per attempt** (`<menu>.eval027-r<N>.actual.json`). Check file mtimes before diagnosing from a dump — it may be from a different attempt than you think.
10. **A behavior-preserving refactor can still fail the gate.** The wiring refactor built byte-identical requests, yet gates failed for days-old model-side flakiness that eval 047 happened to miss. Before touching code on a gate failure, ask: does the failing path even run the changed code? Diff the request, not just the diff.

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

## Release scope decision (user, 2026-07-10) — READ BEFORE PICKING UP ANY WORK

Features 1–4 are CLOSED and the user chose **release momentum over roadmap completeness**. The core feature the release must deliver: *user photographs a menu (one or several pages) → every food item + its variants extracted → macros enriched precisely (printed grams + ingredients) → items sorted by the user's nutritional goals.*

**Pre-release critical path (work on THESE, in this order):**
1. **Production wiring of the per-page multi-photo recipe** ✅ DONE 2026-07-10 (3/3 gate, ledger eval 048) — shared `runPagedExtraction` in `extract.ts`: edge `stage:"extract"` + eval runner both call it (1 photo ⇒ 1 call; N photos ⇒ N parallel high-detail calls → `merge.ts` → ONE unified menu; enrichment once/scan); `extractWithRetry` now production; multi-page detail locked `high` (`auto` A/B deferred to the cost pass). Closing the gate required P1 v3 (keep printed weights verbatim; "y/and" joins are one dish — see diagram appendix) + Plato Surtido options ORACLE-CHANGE (`unchecked: true`). Spec/plan in the worktree (`docs/superpowers/specs/2026-07-10-per-page-multi-photo-wiring-design.md`).
2. **Dense-menu auto-cutter** ✅ DONE 2026-07-12 (3/3 gate eval 055 + same-day device verification) — two-phase stateless: phase-1 `stage:"extract"` returns `{needs_crops}` on dense signal (`image_layout.dense` OR terminal timeout/length after retry); client cuts 2×2 PNG tiles from ORIGINALS (`gridCropRects`+`prepareTile`) → `stage:"extract-pages"` → `runGroupedExtraction` (tile calls get `TILE_PROMPT_SUFFIX`, page calls get P1 v7 `PAGE_PROMPT_SUFFIX`; per-tile drink filter; sectionLenient merge; post-merge `dropHeaderEchoes`). Closing the gate took: `dropSiblingEchoOptions` postprocess, Chipo one-indel scorer tolerance (user ruling), v7 page-scoped completeness (global v6 REGRESSED — mode-scope prompt rules!). Detector 100% correct all campaign (5 normal menus never trigger — credit guard). Known limits ledgered: Churrasquería box recall ~25% (union-of-2, post-release), device tile fidelity below eval (ImagePicker re-encode suspect — client-fidelity follow-up). Spec/plan/ledger in the worktree.
3. **Client compression fidelity fix** ✅ DONE 2026-07-12 (ledger evals 056-058 + device 3/3; spec/plan `2026-07-12-client-compression-fidelity-*` in the worktree) — NO JPEG re-encode setting cleared the oracle row (4-arm ladder + q90/q95 probes: q0.85/q0.90 stably misread small price digits, q95 still lost el-marcos options + mochomos section_context 4/4). **Shipped: passthrough uploads** — originals ≤6.75MB file (≈9M b64 vs the 10M cap) upload untouched as correct-mime data URLs; 2048px/q0.95 fallback only for oversized. Intake compression removed (main checkout's stale intake files were double-compressing and feeding tiles a 1024px copy — the T9 device delta's root cause); eval gate phase-1 input = the production mirror permanently. ImagePicker re-encode DISPROVEN (gallery PNGs byte-identical at quality:1). Norteños = tolerated header (oracle). New offline tool: `scripts/score-dump.ts`.
4. **Horizontal/landscape menu handling** (user 2026-07-12) — detect menu orientation and extract accordingly. Expected user behavior: a physically landscape menu gets photographed in portrait, rotated 90° (menu's left edge at the top, right edge at the bottom — as if the menu in front of you were flipped 90°). Candidate approach: detect the rotation (EXIF, aspect ratio + a cheap model signal, or P1's layout assessment) and rotate the image upright client-side before phase-1; tiles then cut from the rotated image. Never tested — all 6 fixtures are portrait-upright; needs at least one landscape fixture (can reuse an existing menu photographed/rotated sideways) + detector false-positive assertions on the 6 upright menus (same discipline as the dense detector). **ACTIVE since 2026-07-13 as the containerized sub-roadmap `docs/superpowers/horizontal-menus/` on the eval-worktree branch (entry point: its DELEGATION-BRIEF.md; rotation is its Phase 3). Status 2026-07-17: Phase 1 (dense-landscape) in progress — forced 2×2 tiles proven, semantic tile verifiers exhausted and rejected (ledger evals 060–069); external research reviewed (eval 070, report archived in the container) → next: Eval 071 spatial co-location replay (layout-OCR region boxes, harness-only) → Eval 072 nested tile-3 probe (≥25% overlap) → ×3 confirmation. See container ROADMAP ruling 8.**
5. **Stage-2 enrichment accuracy benchmark** (user reorder 2026-07-12: runs BEFORE the model bake-off) — macro accuracy has never been gated (the enrichment model is decided: GPT-4o, same as extraction — Gemini 2.5 Flash discarded 2026-07-10); include printed-weight items so the "prefer printed weights" P2 rule is measured (grams now flow from F4's `items[].grams`). Note: if the later bake-off changes the extraction backend, spot-check the benchmark on the winner's output shape.

**Model bake-off track (user, 2026-07-11; resequenced 2026-07-12) — run AFTER the Stage-2 benchmark (#5). Order is now: #3 compression → #4 horizontal → #5 Stage-2 benchmark → bake-off:**
- **E1 — Chandra-OCR-2** (`datalab-to/chandra-ocr-2`: Qwen3.5-based, 5B, 90+ languages, hosted Datalab API, OpenRAIL-M free <$2M revenue). Pipeline: photo → Chandra transcription → GPT-4o **text-mode** structuring into `EXTRACT_SCHEMA` → same postprocess → `scoreMenu` on the SAME 6 Spanish fixtures. Also run nikkori WITHOUT tiling — hypothesis: a strong OCR model reads dense pages whole, which would make the auto-cutter's tile cost optional. Decide by oracle scores, never by public benchmarks (olmOCR is English-document-heavy).
- **E2 — Infinity-Parser2-Pro** (`infly/Infinity-Parser2-Pro`: Qwen3.5-based, 35B, EN/ZH only, Apache 2.0, NO hosted API → rent an H100 + vLLM):
  - Run on the Spanish fixtures too (user request 2026-07-11: "just to see real results") despite the model card's multilingual-degradation warning — score it, don't assume.
  - **Dense English menu protocol (user-adjudicated side-by-side):** ⚠️ REMINDER — first source a dense ENGLISH menu photo (none in fixtures; all 6 are Spanish). Then have BOTH GPT-4o and Infinity-Parser2-Pro read the SAME photo and emit TWO separate JSON files with menu items in the SAME (printed-menu) order; the user opens the photo alongside each JSON and counts reading errors per model. This is the routing decision input for English menus.
  - If a routed pipeline beats GPT-4o on our oracles → add a language-routing layer (English → winner; other languages → GPT-4o or Chandra, per E1).
- **DoorDash-inspired runtime guardrails** (analysis 2026-07-11, see Prior art section): (a) OCR text as auxiliary LLM input ("every OCR-detected item must appear in output"); (b) price-token-count completeness check (cheap OCR counts price tokens; extraction returning far fewer items → auto-retry); (c) agreement-based union-of-2 (already ledgered). Post-release unless the exit gate stalls again.
- **Layout-first candidates (added 2026-07-17 per the external research, ledger eval 070):** benchmark layout-first pipelines, not only pure-VLM swaps — Mistral OCR as coordinates/box provider + LLM grouping (supersedes the unconcluded 2026-06-23 extractor-swap evaluation), Gemini 3.x vision, PaddleOCR-VL/PP-StructureV3 (self-host). If the horizontal container's Eval 071 co-location gate proves the geometry signal, hypothesis D (layout parser → bounded tokens → LLM grouping) is the end-state candidate.
- **Fixture-diversity gaps (flagged 2026-07-12):** (a) landscape/horizontal menus — PROMOTED to critical-path #4 above (user 2026-07-12); (b) **camera-taken photos** (HEIC, EXIF rotation, real lighting) vs gallery imports — field smoke-test with the standalone Release build; (c) the dense ENGLISH menu E2 needs anyway.

**POST-RELEASE (deliberately deferred — do NOT work on these now, even if a file or plan mentions them):**

*OPTIONAL — reference only, neither urgent nor mandatory (user ruling 2026-07-12). These three exist as documented ideas to read when relevant; no one should schedule them:*
- **Union-of-2 recall guardrail** — run each page's extraction twice in parallel, merge the union (targets read-recall flakes like the Churrasquería box ~25%); doubles extraction cost; risk of phantom accumulation — must be oracle-validated before any wiring. (Also listed as DoorDash guardrail (c) in the bake-off track above.)
- **Name-verification pass** — a second cheap model pass re-checking extracted item NAMES against the photo to kill stable misreads/phantoms ("Chiplo", "Marc Antonio", "Pollo Roll"); name spelling is deliberately ungated today.
- **Option-price perfection beyond the F4 gate** — known tolerated misses (Revueltos 84/90 migration, Plato Surtido's 82, jamón@78 price-null flake) stay tolerated; macro-inverting variants are already handled by F2's fold convention.

*Remaining deferred scope:*
- **Wide-menu dense discrimination (cost optimization)** — container ruling 24 (2026-07-18) tiles ALL landscape pages (~$0.24 vs ~$0.05 on the rare simple wide menu; dense wide scans actually get ~$0.05 cheaper) because evals 086–088 proved cheap single-signal dense detection infeasible on wide photos: the prompt brackets without separating, items/MP fails on dense under-reads, and physical text size interleaves (bistro 10.9px sits between polloteria 9.2 and nikkori 12.2 after the 768 rescale). If revisited post-release: OCR-geometry caches exist for all 9 fixture menus (`~/Downloads/MenusTesting/*.mistral-ocr-2048q95.json`); OCR blocks-per-megapixel showed a 1.6× boundary gap on only N=2 dense samples — collect many more wide fixtures before trusting any threshold.
- **Feature 5 — drinks** (deferred 2026-07-10; food-first value; the crop path's drink filter stays).
- **Combo suggestions** (drink+dish macro pairings) — idea only.
- **`image_quality` photo-retake prompt in the client** and **consistency-as-confidence flags** (the existing Post-F5 backlog items in the DoorDash section above).
- Everything in AGENTS.md's "Planned post-MVP" list (onboarding, paywall).

Rationale (user, 2026-07-10): options matter mainly where variants invert macros (already solved by F2's fold convention); coarse categories were always extracted; drinks don't serve the food-sorting core. Price extraction stays in results — it's free — but is not to be perfected further pre-release.

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

### Feature 2 — Extract options of Food items ✅ CLOSED 2026-07-09
- **Plan file:** `docs/superpowers/plans/2026-07-09-feature-2-extract-food-options.md` (see its Execution Log for the fold convention, oracle rulings, the deterministic postprocess chain, and Feature 3–5 gotchas).
- **Goal:** food items with choices (e.g. "Caesar Salad" → Chicken / Fish) carry those choices in `options`.
- **Scoped dimension:** `options` pass + `optionRecall`, food items only.
- **Harness work:** reuse existing `items_with_options` fixtures; el-marcos option corrections already applied.
- **Frozen gates when starting:** Feature 1 (`items`/food — now a COMPLETENESS gate: distinct food dish-names within ±3, no true duplicates; section-header hygiene was moved to Feature 3). Fixtures are distinct-dish counts; el-marcos re-adjudicated to 28.
- **Run the gate via `scripts/eval-027-live.ts`, NOT the plain `eval-extraction.ts --gate`** — Nikkori passes `items` ONLY through the crop-merge path that script routes; a single full-page call spuriously fails it. See feature-1 plan Execution Log "Gotchas".
- **Feature 1 close-out context is in `2026-07-04-feature-1-extract-food-items.md` (Execution Log) + ledger iterations 025–029.** Read those before starting: the Chilaquiles/Revueltos variants and el-marcos are your primary option targets; brasero-two is count-fragile near +3.
- **UI intent (future):** options render as toggles in the already-merged selectable-options UI so the user sees macro deltas.
- **Exit gate:** `options` passes on all 6 menus, 3/3 runs, **AND** Feature 1 (`items` completeness) still green in those runs.

### Feature 3 — Extract sections & sub-sections ✅ CLOSED 2026-07-10
- **Plan file:** `docs/superpowers/plans/2026-07-10-feature-3-extract-sections.md` (see its Execution Log for the section-oracle rulings, food-scoping, the nondeterminism catalogue, and Feature 4–5 gotchas).
- **Goal:** section hierarchy is captured; trimmed item names get their parent section so "Revueltos" reads as "Huevos → Revueltos".
- **Scoped dimension:** `sections` list match + full-item-name rule.
- **Harness work:** reuse `sections` fixture arrays; el-marcos Huevos full-name expectations already in fixtures.
- **Frozen gates when starting:** Features 1, 2.
- **UI intent (future):** display "Huevos → Revueltos" so trimmed titles aren't confusing.
- **Exit gate:** `sections` passes on all 6 menus, 3/3 runs, **AND** Features 1–2 still green.

### Feature 4 — Extract each item's closest section + category ✅ CLOSED 2026-07-10
- **Plan file:** `docs/superpowers/plans/2026-07-10-feature-4-section-category-price-grams.md` (see its Execution Log for the user-verified price/grams oracle, the postprocess-filled `items[].grams` design, dropPriceNoteItems, and Feature 5 gotchas).
- **Goal:** each item is tagged with its nearest section ("Cocktails", "Steaks", "Desserts") and coarse category (Appetizer / Main / Drink).
- **Scoped dimension:** `section_context` + `categories`.
- **Harness work:** reuse `section_expectations` per fixture; may need more expectation entries per menu.
- **Grams capture (added 2026-07-09, user request):** printed weights/volumes are high-value for Stage-2 macro accuracy (P2 already prefers printed weights over guesses). Today grams exist ONLY on options (`options[].grams`); item-level weights ride as text inside `name`/`description` ("CHILAQUILES (70gr.)", "(350mL)"). At F4 kickoff decide: add an item-level `grams` field to the schema + a scoped check, or keep text-embedded and verify P2 parses it. Known limit to watch: digit misreads in small print (60gr→650gr, ledger iter-036).
- **Option/variant PRICE accuracy (added 2026-07-09, user request):** `options[].price` is already extracted but NOT gate-checked — Feature 2's gate verified option NAMES only, so a wrong option price passes silently (proven live: el-marcos Revueltos' "Con jamón, chorizo o tocino" option came back @84 instead of the printed @90 when the model dropped the middle line; the fold maps prices correctly whenever all lines are transcribed). F4 harness work: extend `items_with_options` targets with expected option prices and make the scorer verify price (and grams, above) per matched option — the user-facing price/macro deltas on option toggles depend on both.
- **Frozen gates when starting:** Features 1, 2, 3.
- **Exit gate:** `section_context` + `categories` pass on all 6 menus, 3/3 runs, **AND** Features 1–3 still green.

> **Stage-2 note:** grams flowing from Feature 4 feed enrichment directly — when benchmarking Stage 2, include printed-weight items (el-marcos gramajes, nikkori ml) in the comparison so the "prefer printed weights" P2 rule is actually measured.

### Feature 5 — Extract all Drink menu items ⏸ DEFERRED POST-RELEASE (user decision 2026-07-10 — see "Release scope decision" above)
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
- [x] Feature 3 — Extract sections & sub-sections ✅ CLOSED 2026-07-10 (food-scoped section_context, 3/3 live gate eval 044; see `2026-07-10-feature-3-extract-sections.md` Execution Log)
- [x] Feature 4 — Extract closest section + category ✅ CLOSED 2026-07-10 (categories/grams/option-price gate, 3/3 eval 047; postprocess-filled `items[].grams`; see `2026-07-10-feature-4-section-category-price-grams.md` Execution Log)
- [ ] Feature 5 — Extract all Drink menu items ⏸ DEFERRED POST-RELEASE (user decision 2026-07-10; pre-release critical path = production wiring → dense auto-cutter → Stage-2 benchmark — see "Release scope decision")
