# Per-page multi-photo extraction wiring — design

**Date:** 2026-07-10
**Roadmap item:** pre-release critical-path #1 (`docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md`, "Release scope decision").
**Branch:** `feat/extraction-eval-harness` (worktree). Test/perfect phase — validated via the eval harness, **no cloud deploy**.

## Context & problem

The per-page multi-photo recipe (one `runExtraction` call **per photo**, then `mergeItemSources`) is proven since ledger iter-036, but it lives **only in the eval runner** (`scripts/eval-027-live.ts` → `extractMenu`). The shared extraction code (`supabase/functions/analyze-menu/extract.ts`) and the edge `stage:"extract"` handler still send **all photos in one call**. So:

- The eval proves a recipe the real code path does not run.
- Multi-page menus (part of the core "photograph one or several pages" sentence) degrade in the actual app — a single combined call provably drops content (iter-036: per-page recovered brasero-two's "A elegir" line the combined call dropped).
- Production has **no retry** resilience; `extractWithRetry` (retry once on timeout / `finish_reason=length`, iter-034/043) is eval-only.

## Goal

Move the per-page recipe into **one shared function** that both the edge `stage:"extract"` handler and the eval runner call, so the 3/3 gate proves the real code. Wire the edge handler to it. Verify by the eval gate + `deno check` + code review (boundary "A", user-approved).

## Scope

**In:** shared orchestrator for single/multi-page extraction; relocate `mergeItemSources` server-side; move `extractWithRetry` into shared code; wire edge `stage:"extract"`; repoint eval runner's single/multi-page branches to the shared function; unified single-menu output guarantee (below).

**Out (do NOT touch — separate features):**
- Dense-menu auto-cutter (critical-path #2). The eval's `DENSE_TILES` branch feeds pre-cut tiles and stays untouched.
- Client-side per-page orchestration (client keeps sending all photos in one request; the edge does per-page server-side).
- Cloud deploy of the function.
- Any P1/P2 prompt, schema, or scorer change.

## Architecture

One shared entry point in `extract.ts`, called by the edge handler and the eval runner:

```
runPagedExtraction(photos, apiKey):
  if photos.length === 1:                 // common case
     return extractWithRetry(photos, apiKey)          // ONE call, default detail, no merge
  // multi-page:
  const results = await Promise.all(
     photos.map(p => extractWithRetry([p], apiKey, "high"))   // N calls, concurrent
  )
  return {
     items: mergeItemSources(results.map(r => r.items)),               // dedup/merge once
     image_quality: { usable: results.every(r => r.image_quality.usable),
                      issues: dedupe(results.flatMap(r => r.image_quality.issues)) },
     image_layout: results.find(r => r.image_layout.dense)?.image_layout
                   ?? results[0].image_layout,   // any dense page ⇒ that page's layout
     raw_response: JSON.stringify(results.map(r => r.raw_response)),
  }
```

**`image_layout` fold (forward-compat with the dense auto-cutter, critical-path #2):** the cutter will key on `image_layout.dense`. Taking only page 1's layout would silently lose a dense page-2 signal, so the fold picks the first dense page's **whole** layout (dense + its `crop_direction` travel together — `validateLayout` forbids `dense:true` with `crop_direction:"none"`), falling back to page 1's layout when no page is dense. The cutter feature refines per-page layout handling when it needs it.

**`raw_response` shape (multi-page):** becomes a JSON-stringified *array* of per-page raw model payloads instead of a single payload. Nothing downstream parses `raw_response` as a model payload — the scorer and postprocess consume `items`; offline re-scoring of dumps operates on scored items. Dump tooling written later must expect the array form for multi-page runs.

**Efficiency guarantees (hard requirements):**
- 1 photo ⇒ **exactly 1 call**, no loop, no merge.
- N photos ⇒ **exactly N calls** (the minimum for correctness — one full budget per page), run **in parallel** so wall-clock ≈ one call, not N×.
- No path ever issues >1 call for a single page.

**Unified single-menu processing (hard requirement, user 2026-07-10):** N pages are ONE menu, never N menus. Concretely:
- Per-page extraction calls each run `postprocessItems` internally (inside `runExtraction` — the gate-proven recipe), then `mergeItemSources` dedups/merges cross-page into **one** `items` list. The response is a single menu payload, indistinguishable in shape from a single-page scan.
- Cross-page duplicates (overlapping shots, the same dish photographed twice) are collapsed by the merge — that is what `mergeItemSources` exists for.
- Downstream stages therefore run **once per scan, never per page**: the client sends the one merged `items` list to `stage:"enrich"`, which already operates on items (not photos) — exactly one enrichment call, one macro pass, one ranking input. No change needed there; this spec guarantees the extract stage preserves that structure.

## Components & changes

| File | Change |
|---|---|
| `supabase/functions/analyze-menu/extract.ts` | Add `extractWithRetry` (moved from eval runner) and `runPagedExtraction`. `runExtraction` unchanged. |
| `supabase/functions/analyze-menu/merge.ts` (new) | Move `mergeItemSources` + its private dedup helpers here from `src/lib/adaptiveExtraction.ts`. The deployed function bundles only its own dir, so the merge must live server-side. |
| `src/lib/adaptiveExtraction.ts` | Remove `mergeItemSources` (+ helpers moved). Keep `MAX_SCAN_PHOTOS`, `CropRect`, `validateLayout`, cropping helpers (client uses those). |
| `supabase/functions/analyze-menu/index.ts` | `stage:"extract"` calls `runPagedExtraction(photos, OPENAI_API_KEY)` instead of `runExtraction(photos, ...)`. Response shape unchanged. |
| `scripts/eval-027-live.ts` | `extractMenu` single + multi-page branches → one call to `runPagedExtraction`. `DENSE_TILES` branch unchanged (imports `extractWithRetry`/`mergeItemSources` from their new homes). |
| eval scripts using `mergeItemSources` (`eval-adaptive-crops.ts`, `run-nikkori-024.ts`) | Repoint imports to `merge.ts`. |

**Type alignment (implementation detail):** `mergeItemSources` is typed on `ExtractedItem` (`src/types/scan.ts`); edge items carry `options`/`grams` (`ExtractedMenuItem` in `extract.ts`). Reconcile so the merge operates on the extract-side item shape (or a shared type) without losing `options`/`grams`.

## Multi-page detail: locked to `high` (A/B deferred)

Multi-page calls run at `detail:"high"` — the gate-proven setting since iter-036. The `auto`-vs-`high` A/B existed only to test whether the *cheaper* setting is safe; per user decision 2026-07-10, cost/speed optimization is post-release work, so the A/B is **deferred to the cost pass** and the proven setting ships. Single-page detail stays `auto` (default), matching the eval's production-faithful path.

## Error handling

`extractWithRetry` wraps `runExtraction` with **one** retry on transient failure (timeout, `finish_reason=length`). The shared orchestrator uses it for **every** call, so single- and multi-page — and production — inherit the resilience the gate depends on.

## Testing / verification

- **Source of truth:** the eval runner calls the same `runPagedExtraction` the edge handler uses → the live gate proves the real code.
- **Behavior parity:** because the eval already ran per-page for brasero-two, the refactor must be behavior-preserving; the gate is the regression check.
- **Regression bar:** the full 6-menu gate (frozen F1–F4 dims: items, options, section_context, categories, grams) stays green — `eval-027-live.ts`, 3/3.
- **Edge handler:** `deno check` + code review (boundary A; no local `supabase serve`).
- **Unit:** existing `mergeItemSources` tests move with it (`merge_test.ts`); the eval's per-page behavior is now exercised through the shared function.

## Success criteria

1. `stage:"extract"` routes single-photo → 1 call, multi-photo → N parallel calls → merge, via `runPagedExtraction` — always returning ONE unified menu payload (single `items` list; dense flag OR-ed across pages), so enrichment downstream runs exactly once per scan.
2. `mergeItemSources` + `extractWithRetry` live in the edge-function dir; the eval runner delegates to the shared function (no duplicated per-page logic).
3. Multi-page `detail` locked to `high` (gate-proven; `auto` A/B deferred to the post-release cost pass), recorded in the ledger.
4. Full 6-menu gate green 3/3; `deno check` clean; moved unit tests pass.
5. Pipeline diagram updated (Stage-1 per-page note) + re-copied to `~/Downloads` (diagram discipline).

## Non-goals / deferred

Dense auto-cutter (#2), Stage-2 macro-accuracy benchmark (#3), client per-page orchestration, cloud deploy, prompt/schema/scorer changes, `auto`-vs-`high` multi-page detail A/B (deferred to the post-release cost pass — cost/speed explicitly not a pre-release concern, user 2026-07-10).
