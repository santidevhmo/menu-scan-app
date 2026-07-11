# Dense-menu auto-cutter — design

**Date:** 2026-07-10 (night)
**Roadmap item:** pre-release critical-path #2 (`docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md`, "Release scope decision").
**Branch:** `feat/extraction-eval-harness` (worktree `/private/tmp/menu-scan-app-extraction-eval-harness`).
**Prior art:** `docs/superpowers/specs/2026-07-04-adaptive-dense-menu-extraction-design.md` (this worktree) — the benchmark evidence that selected the 2×2 uncompressed-tile recipe and rejected 2/3 full-height crops, compressed 2×2, and full-compressed-image extraction. Read it before re-deriving geometry.
**User decisions (2026-07-10):** full slice — edge/eval AND React Native client, with device testing (Apple Developer is now PAID; the AGENTS.md blocker is stale). Phase 2 is a stateless full re-submit. Empirically A/B-ing alternative approaches during implementation is explicitly welcomed (cost unconstrained in test/perfect phase).

## Context & problem

The gate-proven dense recipe (2×2 uncompressed tiles at `detail:"high"`, one call per tile, drink-filtered, merged) exists only as test-harness *input routing*: `scripts/eval-027-live.ts` feeds pre-cut Nikkori tiles from a hardcoded `DENSE_TILES` map. Production has no path from "user photographs a dense menu" to that recipe:

- The edge `stage:"extract"` sends the compressed full page — measured tonight on production-compressed Nikkori (646×1024 JPEG): 1× `dense:true` with 71 garbage items, 2× terminal `finish_reason=length` after retry. Dense menus in production today return either junk or an error.
- The old `stage:"extract-crops"` exists but takes 2–3 client-cut crops of the *compressed* image — the geometry the 2026-07-04 benchmark **rejected** (10–11/42 roll recall). No client code calls it.
- The eval's `DENSE_TILES` map is menu-specific input routing that the roadmap's generalization rule says must never become solution logic. It must die with this feature.

## Detector: failure-as-signal (probed 2026-07-10, 3/3 correct)

A page is **dense-signaled** when its phase-1 extraction either:
1. returns `image_layout.dense === true`, or
2. terminally fails with timeout or `finish_reason=length` (after `extractWithRetry`'s one retry).

Probe on production-compressed Nikkori: run 1 → `dense:true` (signal 1); runs 2–3 → `finish_reason=length` twice (signal 2). 3/3 routed to cropping. Normal menus hit neither signal (6 menus × many runs of gate history: zero `dense:true`, terminal failures only from transient timeouts that the retry absorbed).

Rejected alternatives: a dedicated low-detail "is it dense?" pre-call (+1 call on EVERY photo, unvalidated); always-crop (5× cost on all menus). A/B them later only if the failure-as-signal detector misroutes a real menu.

`crop_direction` is ignored by the cutter (the 2×2 grid is direction-agnostic — probe run 1 returned the invalid `dense:true` + `"none"` combo, so trusting direction is unsafe anyway). `validateLayout`'s "dense requires a direction" invariant is deleted with its client call sites.

## Architecture: stateless two-phase

**Phase 1 — unchanged request shape.** Client compresses pages (existing ≤1024px/q0.7) → `stage:"extract"`. Edge `runPagedExtraction` v2 runs per-page calls with `Promise.allSettled` and classifies each page:
- No page dense-signaled → merged unified menu, response exactly as today. **Normal scans: zero behavior change, zero extra cost.**
- Any page dense-signaled → respond `{ needs_crops: number[] }` (0-based page indices) instead of items. Dense full-page items are garbage (71/115-item hallucination modes probed) — never returned, never merged.
- A page that fails terminally for a NON-dense reason (network, API error) still fails the whole scan as today.

**Phase 2 — new `stage:"extract-pages"`.** Client re-submits ALL pages as groups, in page order: a normal page = `[compressed photo]`; a dense page = its 4 tiles (client-cut from the ORIGINAL, below). Edge, per group: 1 photo → one `extractWithRetry` call (default detail); 4 photos → 4 parallel `detail:"high"` calls → per-tile drink filter (`category !== "drink"` — release-scope decision: crop path's drink filter stays until F5) → `mergeItemSources` across tiles. Then `mergeItemSources` across page-group results → ONE unified menu; same response shape as `stage:"extract"`; enrichment downstream still runs exactly once per scan. Request validation: 1–10 groups, each of exactly 1 or 4 photos, existing per-photo base64 size cap.

**Failure handling:** any group call that terminally fails (post-retry) fails the scan with the group index in the error. No silent partial menus (2026-07-04 decision reaffirmed). If a tile call itself dense-signals, that's a failure too — no recursive cutting.

**Cost:** normal scans unchanged (~$0.03/page). Dense page ≈ $0.15 (1 phase-1 + 4 tiles). Dense multi-page scans re-extract their normal pages in phase 2 (+$0.03 each) — accepted for the stateless contract (user decision).

## Crop geometry: one pure function, two consumers

`gridCropRects(width, height): CropRect[4]` — the proven 2×2: each tile 60%×60% of the source, origins at (0|40%, 0|40%), 20% overlap on both axes. For Nikkori 1196×1896 this reproduces the exact 718×1138 tiles the gate has passed with since eval 027. Lives beside the existing `cropRects` in `src/lib/adaptiveExtraction.ts` (pure TS, no platform deps) so client and eval import the same function. The old direction-based `cropRects`/`validateLayout`/`DENSE_CROP_COUNT` become dead once callers are gone — delete them and their tests in this feature (they encode the rejected 2/3-crop strategy).

**Tile fidelity:** tiles are cut from the ORIGINAL image and are NOT run through the 1024px/q0.7 compressor (compression is what killed every rejected candidate). Client encodes tiles as JPEG q0.85; if a tile's longest edge exceeds 2048px (phone originals are 3–4k px), downscale that tile to 2048px longest-edge — still ~2× the linear resolution of the proven 718×1138 tiles, and keeps 4-tile payloads under the 10MB/photo cap. Eval tiles: cut at runtime from the original fixture with macOS `sips` into a temp dir — `DENSE_TILES` map deleted; the eval becomes production-faithful end to end (detector → cut → extract-pages path).

## Client changes (React Native — full slice, user decision)

- `src/lib/analyzeMenu.ts`: `extractMenu` becomes two-phase — phase 1 as today; on `needs_crops`, cut the flagged pages' ORIGINALS with `expo-image-manipulator` (`manipulateAsync(uri, [{crop: rect}], {compress: 0.85, format: JPEG}]` per rect from `gridCropRects`, plus the 2048px resize rule), then call `stage:"extract-pages"` with the groups. Return shape to callers unchanged (`ExtractionResult`).
- Originals already survive until extraction (2026-07-04 decision, already implemented: capture/import keeps original URI + dimensions; compression happens at extract time). Verify, don't rebuild.
- `ScanPhoto` already carries `width`/`height` for the crop math.
- No UI changes: existing loading state covers the (rare) second phase; existing error surface shows the page-numbered failure.
- Unit tests: `gridCropRects` geometry (exact Nikkori tile assert), two-phase orchestration with a mocked `supabase.functions.invoke` (phase-1 normal → 1 call; phase-1 needs_crops → phase-2 groups assembled correctly).

## Device verification (Apple Developer now paid — update AGENTS.md blocker)

After the eval gate is green: build to a physical iPhone, then (1) scan the original Nikkori photo from the gallery → verify the app shows the dense flow completing and ~48 food items in results; (2) scan one normal menu (brasero) → verify single-phase, normal results; (3) scan a 2-page menu (brasero-two photos) → verify one unified result list. Manual checklist in the plan; PostHog/console logs to confirm call counts.

## Exit gate

1. Full 6-menu gate 3/3 (`scripts/eval-027-live.ts`), frozen dims [items, options, section_context, categories, grams], with **Nikkori flowing the production path**: phase-1 detector → runtime `sips` cut via `gridCropRects` → `stage:"extract-pages"`-equivalent grouped extraction (5 calls). Other menus unchanged (still through `runPagedExtraction`). All scoring stays against the manually-adjudicated oracles (`scripts/fixtures/*.expected.json`) — every comparison and A/B in this feature is judged by `scoreMenu` against those fixtures, never by eyeball or raw counts (user requirement 2026-07-10).
1b. **Detector false-positive check (user requirement 2026-07-10):** in those same 3 gate runs, the 5 non-dense menus (brasero, brasero-two, casa-nostra, el-marcos, mochomos) must NEVER dense-signal — no `needs_crops`, no phase 2, exactly the same call count as today (a false positive wastes ~4 extra calls + a round trip + client cropping per page). The eval logs each page's detector verdict per run so this is asserted, not assumed. Nikkori (production-compressed) must dense-signal in every run — a missed detection is equally a failure.
2. `DENSE_TILES` deleted; no menu-name-keyed routing anywhere in the eval or solution code.
3. Unit tests green (geometry, orchestration, edge handler validation); `deno check` + client `tsc` clean.
4. Device checklist passed on a physical iPhone.
5. Diagram updated (dense branch 🔴→🟢, new stage, call-order section) + re-copied to `~/Downloads`; ledger entries newest-last; roadmap critical-path #2 ticked.

**Watch item folded in:** nikkori's 52/48 count edge (2× on 2026-07-10). If it blocks the gate, debug the failing tile dump before touching the ±3 band; the tile-merge and drink filter are the suspects.

## A/B latitude (user 2026-07-10)

Running alternative recipes to compare results is pre-approved when a probe is cheap: e.g. 4-tile vs 6-tile grids on ultra-dense menus, q0.85 vs lossless tiles, detector variants. Log every comparison in the ledger (newest last); the frozen gate remains the acceptance bar for whatever wins.

## Non-goals / deferred

- Feature 5 drinks (crop drink filter stays).
- Removing the legacy `stage:"extract-crops"` route + `runCropExtractions` (unused by production after this feature; delete in a cleanup pass once the client never references it — flagged, not scoped).
- Cloud deploy (test/perfect mode; deploy-to-test only when device testing needs it — the device checklist DOES require deploying the current function to the test project, which is allowed under "deploy to edge fn only to TEST").
- Recursive cutting (a tile that dense-signals = failure, not deeper recursion).
- Cost optimization (phase-2 re-extraction of normal pages accepted; `auto`-detail A/B stays deferred).
