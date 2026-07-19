# Detector Trigger (step 1f) — Design Spec

**Date:** 2026-07-18 · **Status:** DRAFT for Santiago's spec review (design approach approved — ruling 21; sentence approved 2026-07-18)
**Owner:** horizontal-menus container (critical-path #4, Phase 1 step 1f — the last Phase-1 exit blocker)
**Evidence base:** eval 060 (landscape detector blind spot: `dense=false` + `crop_direction="none"` 3/3 on Polloteria); eval 085 (polloteria ×3 clean through the tile path, detector FORCED by the harness — 1f removes the force); rulings 21–23.

## Problem (plain)

The dense-detector decides "cut this menu into 4 tiles." On a **wide (landscape)** photo the image is scaled down (768px shortest side = height), which crushes the text so small the model reports `dense=false` — so a wide dense menu is never tiled and reads badly. Step 1e proved the tile path reads Polloteria perfectly *once forced*; 1f makes production **fire the trigger on its own** for wide dense menus, without touching normal (portrait) menus at all.

## Goal

For **landscape pages only** (photo width > height), append **one density-assessment sentence** to that page's phase-1 extraction prompt so the model correctly reports `dense=true` on genuinely dense wide menus (Polloteria) while leaving readable wide menus alone (Bistro). The client declares each photo's dimensions so the edge knows which pages are landscape. Portrait pages and requests without dimensions are **byte-identical to today**.

## Scope guards (non-negotiable)

- **Landscape-scoped, phase-1 only.** The new suffix is appended only when a page is landscape AND it is a phase-1 (non-tile) call. Portrait pages, tile calls, and dimension-less requests get today's exact prompt.
- **Byte-identical portrait path.** Unit-pinned: `landscape=false` (or absent dims) ⇒ the prompt string and call behavior are identical to today. This protects the 6 vertical menus by construction (architecture decision 2026-07-13).
- **Single variable.** The ONLY production change is: (a) client sends `photo_dims`; (b) edge validates it; (c) edge appends `LANDSCAPE_PROMPT_SUFFIX` on landscape phase-1 calls. No detail-mode change, no geometry change, no schema change, no model change.
- **No menu-specific values.** `landscape = width > height` is the only threshold; same worldwide. No hardcoded menu names/counts.
- **Cross-platform.** Uses only client-known dims (`photo.width/height`, already populated by expo APIs on iPhone and Android) — ruling 23 compliant.

## The approved sentence (single variable)

New export in `extract.ts`, appended verbatim on landscape phase-1 calls only:

```
LANDSCAPE_PROMPT_SUFFIX =
"\nThis is a wide (landscape) menu photo, scaled down before you see it, so
packed text can look small. If you cannot clearly read every item across the
full width, set image_layout.dense=true."
```

Rationale: the trigger is tied to **readability**, not width alone — so Bistro (wide but readable) stays `dense=false` while Polloteria (unreadable when shrunk) flips to `dense=true`. Ruling 21 authorizes ONE reword round (~$0.15) if B1 (below) shows it fires wrong, before escalating back to Santiago.

## Architecture — three small edits

### 1. Client — `src/lib/analyzeMenu.ts` (phone)

The `stage:"extract"` invocation (currently line ~202):

```ts
body: { photos: base64Photos, goals: [], provider, stage: "extract" }
```

gains a `photo_dims` array parallel to `photos`, built from the original photo objects (which already carry width/height):

```ts
body: {
  photos: base64Photos,
  photo_dims: photos.map((p) => ({ width: p.width, height: p.height })),
  goals: [],
  provider,
  stage: "extract",
}
```

- Uses the **original** photo dims (not compressed) — the client already trusts these to cut tile geometry (`gridCropRects(photo.width, photo.height)`). Compression preserves aspect ratio, so `width > height` is identical either way.
- No client change to the `extract-pages` (phase-2) request — 1f only affects the phase-1 detector call.

### 2. Edge validation — `request-validation.ts` + `index.ts`

New helper mirroring `isValidOcrPhotos` exactly:

```ts
export function isValidPhotoDims(
  value: unknown,
  photoCount: number,
): value is { width: number; height: number }[] {
  return value === undefined || (
    Array.isArray(value) &&
    value.length === photoCount &&
    value.every((d) =>
      d !== null && typeof d === "object" &&
      typeof (d as { width?: unknown }).width === "number" &&
      (d as { width: number }).width > 0 &&
      typeof (d as { height?: unknown }).height === "number" &&
      (d as { height: number }).height > 0
    )
  );
}
```

(Executor writes it strict-mode / no-`any` clean per AGENTS.md; the cast shape above is the intent.)

In `index.ts`: destructure `photo_dims` alongside `photos` (line ~234). Inside the `stage === "extract"` branch (line ~356), before calling the detector:

```ts
if (!isValidPhotoDims(photo_dims, photos.length)) {
  return badRequest("Invalid 'photo_dims'");
}
const result = await runPagedExtraction(
  photos, OPENAI_API_KEY, undefined, photo_dims ?? [],
);
```

- **Absent `photo_dims` → valid** (mirrors `ocr_photos`): old app builds and any non-updated client behave byte-identically. This is ruling 21's fail-open guarantee.
- **Malformed `photo_dims` → `badRequest`** (mirrors `ocr_photos` strictness): our own client always sends correct dims, so malformed input is a bug we want surfaced in testing, not silently swallowed. The fail-open guarantee is about the *absent* field, not garbage.

### 3. Edge brain — `extract.ts` (thread the `landscape` flag)

The suffix chain today: `runPagedExtraction → extractWithRetry → runExtraction`, prompt = `EXTRACT_PROMPT + (tile ? TILE_PROMPT_SUFFIX : page ? PAGE_PROMPT_SUFFIX : "")`.

- **`runExtraction`** gains a trailing `landscape = false` param; prompt becomes:
  ```ts
  EXTRACT_PROMPT +
    (tile ? TILE_PROMPT_SUFFIX : page ? PAGE_PROMPT_SUFFIX : "") +
    (landscape && !tile ? LANDSCAPE_PROMPT_SUFFIX : "")
  ```
  (`!tile` guard is belt-and-suspenders — tile calls never pass `landscape=true`, but the guard makes the phase-1-only scope explicit.)
- **`extractWithRetry`** gains a trailing `landscape = false` param, forwarded on both the initial call and the retry.
- **`runPagedExtraction`** gains `photoDims: { width: number; height: number }[] = []` (4th param). Per photo, `isLandscape(i) = photoDims[i] !== undefined && photoDims[i].width > photoDims[i].height`. Pass that as the `landscape` flag:
  - single-photo path: `extract(photos, apiKey, undefined, undefined, false, false, isLandscape(0))`
  - multi-photo path: `photos.map((photo, i) => extract([photo], apiKey, "high", undefined, false, true, isLandscape(i)))`

Positional booleans match the existing `tile`/`page` style (surgical-changes rule). Empty `photoDims` ⇒ every `isLandscape` is `false` ⇒ byte-identical to today.

## Byte-identical (portrait) pin

Unit test asserting:
- `runExtraction(..., landscape=false)` produces exactly today's prompt (no landscape suffix); `landscape=true` appends `LANDSCAPE_PROMPT_SUFFIX` and nothing else.
- `runPagedExtraction` with `photoDims = []` (and with an all-portrait dims array) passes `landscape=false` for every page — verified with an injected mock `extract` that captures its args. This is the guarantee that dimension-less / portrait requests are unchanged.

## Harness mirror

- **`scripts/probe-detector.ts`** (the exact 1f probe vehicle — it already runs phase-1 only and prints the dense verdict) is extended to pass the menu's real original dims into `runPagedExtraction(photos, apiKey, undefined, [{ width, height }])`. Dims read from the source file (e.g. `sips -g pixelWidth -g pixelHeight`, or a small helper in `photo-input.ts` returning `{ data, width, height }`) — the SAME original dims the client sends.
- Phase-4 follow-up (out of 1f scope): `eval-027-live.ts` / fixtures may later carry a per-menu `detector` expectation so the combined gate asserts it; 1f gates via the probe below, not the full runner.

## Detector-verdict expectations (ORACLE — pending Santiago's confirmation)

These are truth values Santiago owns; confirm before they enter the probe gate.

| Menu | Original dims | Orientation | Expected verdict | Gate |
|---|---|---|---|---|
| Polloteria | 2274×1572 | Horizontal | **dense = true** (tile it) | REQUIRED 3/3 |
| Bistro | 2384×1844 | Horizontal | **dense = false** (read whole) | REQUIRED 3/3 |
| Guest House | 2606×1580 | Horizontal | record only — either acceptable (ruling 21) | recorded, not gated |

## Verification ladder (gates before any deploy)

1. **Unit tests ($0):** `isValidPhotoDims` (undefined ok, correct array ok, wrong length / non-positive / missing-field rejected); `LANDSCAPE_PROMPT_SUFFIX` presence + prompt assembly (`landscape` on/off); `runPagedExtraction` landscape-flag routing via mock `extract`; portrait byte-identical pin. All existing `extract_test.ts` / `request-validation_test.ts` still green. `deno check` + `deno test` clean.
2. **B1 — detector-only probe (~$0.45, the decisive cheap test):** `PROBE_RUNS=3 probe-detector.ts` on all three wide menus with real dims. **Gate:** Polloteria `dense=true` 3/3; Bistro `dense=false` 3/3; Guest House recorded. This answers "does the nudge overcome the shrink blind spot?" before any bigger spend.
3. **B2 — polloteria end-to-end (~$0.87):** only if B1 passes — full production path with the detector LIVE (no harness force), ×3. Expect the scan to auto-fire tiles and reproduce eval-085's clean result. Gate: scored dims + ruling-6 raw-dump/photo audit (count bands alone prove nothing) + zero unprinted/invented items.
4. **B3 — bistro/guest-house non-regression (~$0.15–0.60):** full runs. Bistro must NOT tile (stays `dense=false`) **AND its item output must not regress** — this matters because on a landscape page that stays non-dense, the suffix is present in the phase-1 call whose items are actually used (dense pages discard phase-1 items; non-dense pages keep them). So B3 checks Bistro's extracted items against its prior clean baseline, not just its dense verdict. Guest House recorded either way (if it stays non-dense, same item-use note applies).

Live launches (B1–B3) need **fresh cost approval at launch** — the prior-era ~$0.90 approval is STALE. Unit tests and this spec are $0.

## Fallback lever (do NOT build now — ruling 21 plan B)

If B1 shows the sentence can't fire reliably, the ordered levers before escalating back to Santiago:
1. **One suffix reword** (~$0.15, ruling 21).
2. **`detail:"high"` on the single-photo landscape phase-1 call** (currently `detail=auto`, which may under-sample a large wide image) — a cheap, still-single-variable lever; needs its own B1-style probe.
3. **Deterministic force** (ruling 21 plan B): since the client declares dims, the edge force-routes landscape pages that look dense to tiles without asking the model to judge. Not primary — Bistro would pay ~5× per scan if forced blindly, so any deterministic version needs a density proxy beyond aspect alone.

## Explicitly out of scope

- Phase 3 rotation (sideways-text-inside-portrait) — separate, required next after 1f (rulings 22–23).
- Detail-mode changes, geometry changes, schema/model changes — single-variable discipline.
- The extract-pages (phase-2) path — 1f only touches the phase-1 detector call.
- Vertical menus' live runs — covered by the byte-identical pin; re-run only at the Phase-4 combined gate.

## Deploy discipline (from project memories)

Back up the currently deployed fn before any redeploy (`supabase/backups/`); deploy to the TEST project (uonuiadueykynbetxxrw) only — pre-release, edge deploys are for testing, not shipping. 1f's edge change (validation + suffix) is deployed to the test project only when B-ladder gates pass.
