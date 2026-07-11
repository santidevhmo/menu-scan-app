# Dense-Menu Auto-Cutter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Production automatically detects dense menu pages (failure-as-signal), the client cuts them into the proven 2×2 high-detail tiles from the ORIGINAL photo, and a new stateless `stage:"extract-pages"` merges everything into one menu — with the eval gate proving the whole path end-to-end (no more pre-cut `DENSE_TILES`).

**Architecture:** Phase 1 (`stage:"extract"`) classifies each page via `runPagedExtraction` v2 (`allSettled`; dense = `image_layout.dense` OR terminal timeout/`finish_reason=length`); if any page is dense it responds `{needs_crops}` instead of items. Phase 2 (`stage:"extract-pages"`) takes ALL pages as groups (normal page = 1 compressed photo, dense page = 4 original-resolution tiles), extracts each group (4-tile groups: parallel `detail:"high"` + per-tile drink filter + tile merge), cross-merges to ONE menu. One pure `gridCropRects` is shared by the RN client (expo-image-manipulator) and the eval (runtime `sips` cutting — verified pixel-identical to the proven tiles).

**Tech Stack:** Deno (Supabase Edge Fn), TypeScript, GPT-4o Vision, expo-image-manipulator (client), macOS `sips` (eval cutter), existing eval harness.

**Spec:** `docs/superpowers/specs/2026-07-10-dense-menu-auto-cutter-design.md` (this worktree).

## Global Constraints

- **Worktree** `/private/tmp/menu-scan-app-extraction-eval-harness`, branch `feat/extraction-eval-harness`. Paths relative to it unless absolute.
- **No P1/P2 prompt, `EXTRACT_SCHEMA`, or scorer-dimension changes.**
- **Oracle-scored comparisons only (user 2026-07-10):** every experiment, A/B, and gate in this plan is judged by `scoreMenu` against `scripts/fixtures/*.expected.json` — never by eyeball or raw counts.
- **Detector false-positive requirement (user 2026-07-10):** the 5 non-dense menus must NEVER dense-signal in the gate runs (no `needs_crops`, no extra calls); nikkori must dense-signal EVERY run. Both asserted by the eval, per page, per run.
- **No menu-name-keyed routing** in solution OR harness code after this feature (`DENSE_TILES` deleted; the detector decides).
- **Tiles are cut from ORIGINALS, never from the 1024px/q0.7 compressed image** (compression killed every rejected candidate — 2026-07-04 spec).
- **Efficiency:** normal scans = zero extra calls/round trips. Dense page = 1 phase-1 call + 4 tile calls. No recursion (a dense-signaling tile = scan failure).
- **Failure handling:** any terminal non-dense failure fails the whole scan with the page/group index; no silent partial menus.
- **Exit gate:** full 6-menu 3/3 via `scripts/eval-027-live.ts`, frozen dims `[items, options, section_context, categories, grams]` + detector assertions, nikkori through the production path. Then physical-iPhone checklist (Apple Developer is PAID — fix the stale AGENTS.md blocker in Task 9).
- **A/B latitude (user):** variation testing is encouraged and pre-approved; log every comparison in the ledger (newest last). Costs unconstrained.
- **Ledger + diagram discipline** as in the roadmap (diagram lives in the MAIN checkout; re-copy to `~/Downloads` on close).
- Live calls need `OPENAI_API_KEY` (in worktree `.env.local`). ~$0.03/call.
- **Long runs:** launch with `nohup … > log 2>&1 &` + monitor the log; NEVER pipe the live gate through grep/tail (roadmap Lessons #8).

---

## Reference Block (copied from the master roadmap)

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

### Task 1: `gridCropRects` + delete the rejected crop machinery

**Files:**
- Modify: `src/lib/adaptiveExtraction.ts` (add `gridCropRects`; delete `cropRects`, `validateLayout`, `CropCount`, `DENSE_CROP_COUNT`; keep `MAX_SCAN_PHOTOS`, `CropRect`, `limitPhotos`)
- Modify: `src/lib/adaptiveExtraction_test.ts` (replace crop/layout tests with grid tests; keep the `limitPhotos` test)

**Interfaces:**
- Produces: `export function gridCropRects(width: number, height: number): CropRect[]` — always 4 rects, each 60%×60%, origins at (0|40%W, 0|40%H), row-major (TL, TR, BL, BR). Tasks 4, 5, 6 consume it. `CropRect` unchanged (`{originX, originY, width, height}`).
- Deletes: `cropRects`, `validateLayout`, `CropCount`, `DENSE_CROP_COUNT` (dead — grep of `src/` and `scripts/` on 2026-07-10 found zero callers outside the file and its tests; they encode the REJECTED 2/3-crop strategy).

- [ ] **Step 1: Write the failing tests**

Replace the three `cropRects` tests and the `validateLayout` test in `src/lib/adaptiveExtraction_test.ts` with (keep the file's existing imports minus `assertThrows`/`cropRects`/`validateLayout`, plus `gridCropRects`):

```ts
Deno.test("grid produces the proven 2x2 nikkori tiles", () => {
  assertEquals(gridCropRects(1196, 1896), [
    { originX: 0, originY: 0, width: 718, height: 1138 },
    { originX: 478, originY: 0, width: 718, height: 1138 },
    { originX: 0, originY: 758, width: 718, height: 1138 },
    { originX: 478, originY: 758, width: 718, height: 1138 },
  ]);
});

Deno.test("grid rects stay within bounds for odd dimensions", () => {
  for (const rect of gridCropRects(1197, 1895)) {
    assertEquals(rect.originX + rect.width <= 1197, true);
    assertEquals(rect.originY + rect.height <= 1895, true);
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd /private/tmp/menu-scan-app-extraction-eval-harness && deno test src/lib/adaptiveExtraction_test.ts`
Expected: FAIL — `gridCropRects` not exported.

- [ ] **Step 3: Implement + delete**

In `src/lib/adaptiveExtraction.ts`: delete `validateLayout`, `cropRects`, `CropCount`, `DENSE_CROP_COUNT`, and the now-unused `CropDirection`/`ImageLayout` import if nothing else uses it. Add:

```ts
// The gate-proven dense recipe's geometry (2026-07-04 benchmark): four 2x2
// tiles, each 60% x 60% of the source, 20% overlap on both axes. For nikkori
// 1196x1896 this reproduces the exact 718x1138 tiles the gate passes with.
export function gridCropRects(width: number, height: number): CropRect[] {
  const tileW = Math.round(width * 0.6);
  const tileH = Math.round(height * 0.6);
  const oX = Math.round(width * 0.4);
  const oY = Math.round(height * 0.4);
  return [
    { originX: 0, originY: 0, width: tileW, height: tileH },
    { originX: oX, originY: 0, width: Math.min(tileW, width - oX), height: tileH },
    { originX: 0, originY: oY, width: tileW, height: Math.min(tileH, height - oY) },
    { originX: oX, originY: oY, width: Math.min(tileW, width - oX), height: Math.min(tileH, height - oY) },
  ];
}
```

Also fix `src/lib/compressImage.ts` if `deno check`/tsc complains about its `CropRect` import — it imports only the type, which stays.

- [ ] **Step 4: Run tests**

Run: `deno test src/lib/adaptiveExtraction_test.ts`
Expected: PASS (grid tests + limitPhotos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/adaptiveExtraction.ts src/lib/adaptiveExtraction_test.ts
git commit -m "feat: gridCropRects (proven 2x2 geometry); drop rejected direction-crop helpers"
```

---

### Task 2: Detector in `runPagedExtraction` + `runGroupedExtraction` (edge shared code)

**Files:**
- Modify: `supabase/functions/analyze-menu/extract.ts`
- Modify: `supabase/functions/analyze-menu/extract_test.ts`

**Interfaces:**
- Produces:
  - `export type PagedExtraction = ExtractionResult | { needs_crops: number[] }`
  - `runPagedExtraction(photos, apiKey, extract?): Promise<PagedExtraction>` — CHANGED return type. Dense signal = fulfilled `image_layout.dense===true` OR rejected with `/timed out|finish_reason=length/`. Any dense page ⇒ `{needs_crops: [indices]}` (0-based). Non-dense rejection ⇒ throw. No dense pages ⇒ merged `ExtractionResult` exactly as before.
  - `export async function runGroupedExtraction(groups: string[][], apiKey: string, extract = extractWithRetry): Promise<ExtractionResult>` — group of 1 ⇒ one call default detail; group of 4 ⇒ 4 parallel `"high"` calls, per-tile `category !== "drink"` filter, `mergeItemSources` across tiles; then `mergeItemSources` across groups. Meta fold: `usable` = AND of all calls, `issues` deduped, `image_layout` = first call's, `raw_response` = JSON array of all raw payloads.
- Behavior note: the old "first dense page's layout wins" fold is obsolete — dense pages now return `needs_crops` and never reach the merge. Update the existing multi-page unit test accordingly.

- [ ] **Step 1: Update/add the tests**

In `extract_test.ts`: extend the `./extract.ts` import with `runGroupedExtraction` and `PagedExtraction` (type import). In the existing test `runPagedExtraction: N photos means N high-detail single-photo calls, unified menu`, change page 2's fixture from `image_layout: { dense: true, crop_direction: "top_bottom" }` to omit the override (default `dense:false`), and change the layout assertion to `assertEquals(result.image_layout, { dense: false, crop_direction: "none" });` (add `if ("needs_crops" in result) throw new Error("unexpected dense");` before the assertions so the narrowed type checks). Then append:

```ts
Deno.test("runPagedExtraction: dense layout flag returns needs_crops, not items", async () => {
  const stub = (() =>
    Promise.resolve(fakeResult({
      image_layout: { dense: true, crop_direction: "none" },
      items: [menuItem("Garbage", 1)],
    }))) as typeof extractWithRetry;
  const result = await runPagedExtraction(["a"], "key", stub);
  assertEquals(result, { needs_crops: [0] });
});

Deno.test("runPagedExtraction: terminal length failure is a dense signal", async () => {
  const pages: (() => Promise<ExtractionResult>)[] = [
    () => Promise.resolve(fakeResult()),
    () =>
      Promise.reject(
        new Error("OpenAI extraction stopped with finish_reason=length"),
      ),
  ];
  let call = 0;
  const stub = (() => pages[call++]()) as typeof extractWithRetry;
  const result = await runPagedExtraction(["a", "b"], "key", stub);
  assertEquals(result, { needs_crops: [1] });
});

Deno.test("runPagedExtraction: non-dense terminal failure still throws", async () => {
  const stub = (() =>
    Promise.reject(new Error("OpenAI API error"))) as typeof extractWithRetry;
  await assertRejects(
    () => runPagedExtraction(["a"], "key", stub),
    Error,
    "OpenAI API error",
  );
});

Deno.test("runGroupedExtraction: 1-photo and 4-tile groups merge to one menu", async () => {
  const seen: { photos: string[]; detail?: string }[] = [];
  const results: ExtractionResult[] = [
    fakeResult({ items: [menuItem("Sopa", 80)], raw_response: "page1" }),
    fakeResult({
      items: [menuItem("Roll A", 100), {
        ...menuItem("Cola", 30),
        category: "drink" as const,
      }],
      raw_response: "t1",
    }),
    fakeResult({ items: [menuItem("Roll A", 100)], raw_response: "t2" }),
    fakeResult({ items: [menuItem("Roll B", 120)], raw_response: "t3" }),
    fakeResult({ items: [], raw_response: "t4" }),
  ];
  let call = 0;
  const stub = ((photos: string[], _key: string, detail?: string) => {
    seen.push({ photos, detail });
    return Promise.resolve(results[call++]);
  }) as typeof extractWithRetry;

  const merged = await runGroupedExtraction([["p1"], ["a", "b", "c", "d"]], "key", stub);

  assertEquals(seen[0], { photos: ["p1"], detail: undefined });
  assertEquals(seen.slice(1).map((s) => s.detail), ["high", "high", "high", "high"]);
  // Tile drink filtered, tile duplicate merged, groups merged in order.
  assertEquals(merged.items, [
    menuItem("Sopa", 80),
    menuItem("Roll A", 100),
    menuItem("Roll B", 120),
  ]);
  assertEquals(JSON.parse(merged.raw_response), ["page1", "t1", "t2", "t3", "t4"]);
});

Deno.test("runGroupedExtraction: rejects malformed group sizes", async () => {
  const stub = (() => Promise.resolve(fakeResult())) as typeof extractWithRetry;
  await assertRejects(
    () => runGroupedExtraction([["a", "b"]], "key", stub),
    Error,
    "group",
  );
});
```

- [ ] **Step 2: Run to verify failure**

Run: `deno test supabase/functions/analyze-menu/extract_test.ts`
Expected: FAIL (missing exports + changed behavior).

- [ ] **Step 3: Implement**

In `extract.ts`, replace the body of `runPagedExtraction` and add the new pieces:

```ts
export type PagedExtraction = ExtractionResult | { needs_crops: number[] };

const DENSE_FAILURE = /timed out|finish_reason=length/;

function foldResults(
  results: ExtractionResult[],
  items: ExtractedMenuItem[],
): ExtractionResult {
  return {
    items,
    image_quality: {
      usable: results.every((r) => r.image_quality.usable),
      issues: [...new Set(results.flatMap((r) => r.image_quality.issues))],
    },
    image_layout: results[0].image_layout,
    raw_response: JSON.stringify(results.map((r) => r.raw_response)),
  };
}

// Phase 1 with the dense detector (failure-as-signal, probed 2026-07-10 3/3):
// a page is dense when it reports image_layout.dense OR terminally fails with
// timeout / finish_reason=length after the retry — the two ways a dense page
// presents (garbage items or truncation). Dense pages' items are never
// returned. Non-dense terminal failures still fail the scan.
export async function runPagedExtraction(
  photos: string[],
  apiKey: string,
  extract = extractWithRetry,
): Promise<PagedExtraction> {
  const settled = await Promise.allSettled(
    photos.length === 1
      ? [extract(photos, apiKey)]
      : photos.map((photo) => extract([photo], apiKey, "high")),
  );
  const needsCrops = settled.flatMap((s, index) =>
    (s.status === "fulfilled"
        ? s.value.image_layout.dense
        : DENSE_FAILURE.test(String(s.reason)))
      ? [index]
      : []
  );
  if (needsCrops.length > 0) return { needs_crops: needsCrops };
  const rejected = settled.find((s) => s.status === "rejected");
  if (rejected) throw (rejected as PromiseRejectedResult).reason;
  const results = settled.map((s) => (s as PromiseFulfilledResult<ExtractionResult>).value);
  if (results.length === 1) return results[0];
  return foldResults(results, mergeItemSources(results.map((r) => r.items)));
}

// Phase 2: stateless grouped extraction. A group is one page — either its
// single compressed photo (normal) or its 4 original-resolution 2x2 tiles
// (dense). Tiles run the gate-proven recipe: parallel detail:"high", per-tile
// drink filter (release-scope decision: crop path drops drinks until F5),
// tile merge; then one cross-page merge so the scan yields ONE menu.
export async function runGroupedExtraction(
  groups: string[][],
  apiKey: string,
  extract = extractWithRetry,
): Promise<ExtractionResult> {
  const groupResults = await Promise.all(groups.map(async (group, index) => {
    if (group.length === 1) {
      const result = await extract(group, apiKey);
      return { calls: [result], items: result.items };
    }
    if (group.length !== 4) {
      throw new Error(`extract-pages group ${index} must have 1 or 4 photos`);
    }
    const tiles = await Promise.all(
      group.map((tile) => extract([tile], apiKey, "high")),
    );
    const sources = tiles.map((t) => t.items.filter((i) => i.category !== "drink"));
    return { calls: tiles, items: mergeItemSources(sources) };
  }));
  const allCalls = groupResults.flatMap((g) => g.calls);
  const items = mergeItemSources(groupResults.map((g) => g.items));
  return foldResults(allCalls, items);
}
```

(The merged-path `foldResults` replaces the old inline meta fold in `runPagedExtraction` — the "first dense page's layout" logic is deleted since dense pages now exit via `needs_crops`.)

- [ ] **Step 4: Run all edge tests**

Run: `deno test supabase/functions/analyze-menu/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/analyze-menu/extract.ts supabase/functions/analyze-menu/extract_test.ts
git commit -m "feat: dense detector in runPagedExtraction + stateless runGroupedExtraction"
```

---

### Task 3: Edge handler — `needs_crops` response + `stage:"extract-pages"`

**Files:**
- Modify: `supabase/functions/analyze-menu/index.ts` (import line 8; `stage:"extract"` block; new stage before the final `badRequest`)

**Interfaces:**
- Consumes: `runPagedExtraction` (new return type), `runGroupedExtraction` from Task 2.
- Produces HTTP contract (Task 4's client consumes it):
  - `stage:"extract"` may now respond `{ needs_crops: number[], latency_ms, model_id }` (no `items`).
  - `stage:"extract-pages"` request: `{ pages: string[][], provider: "gpt-vision", stage: "extract-pages" }` — 1–10 groups, each exactly 1 or 4 base64 strings, each ≤ `MAX_BASE64_LEN`. Response: same shape as a successful extract (`image_quality`, `image_layout`, `items`, `raw_response`, `latency_ms`, `model_id`).

- [ ] **Step 1: Implement**

Import: `import { runCropExtractions, runGroupedExtraction, runPagedExtraction } from "./extract.ts";`

Read `pages` from the body where `photos`/`items` are destructured: `const { photos, pages, provider, stage, items: inputItems } = await req.json();` and add `"extract-pages"` to the allowed-stage check. Add the new stage handler BEFORE the generic `photos` validation block (its payload uses `pages`, not `photos`):

```ts
    if (stage === "extract-pages") {
      if (provider !== "gpt-vision") {
        throw new Error(`Unknown extraction provider: ${provider}`);
      }
      if (
        !Array.isArray(pages) || pages.length === 0 || pages.length > MAX_PHOTOS ||
        !pages.every((group: unknown) =>
          Array.isArray(group) &&
          (group.length === 1 || group.length === 4) &&
          group.every((p) => typeof p === "string" && p.length <= MAX_BASE64_LEN)
        )
      ) {
        return badRequest("Invalid 'pages': expected 1-10 groups of 1 or 4 base64 images");
      }
      const start = Date.now();
      const result = await runGroupedExtraction(pages, OPENAI_API_KEY);
      return new Response(
        JSON.stringify({ image_quality: result.image_quality, image_layout: result.image_layout, items: result.items, raw_response: result.raw_response, latency_ms: Date.now() - start, model_id: "gpt-4o" }),
        { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
      );
    }
```

In the `stage === "extract"` block, after `const result = await runPagedExtraction(photos, OPENAI_API_KEY);` insert:

```ts
      if ("needs_crops" in result) {
        // Dense page(s) detected: client must cut originals into 2x2 tiles
        // and re-submit everything via stage:"extract-pages".
        return new Response(
          JSON.stringify({ needs_crops: result.needs_crops, latency_ms: Date.now() - start, model_id: "gpt-4o" }),
          { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
        );
      }
```

- [ ] **Step 2: Typecheck**

Run: `deno check supabase/functions/analyze-menu/index.ts`
Expected: clean. (The `"needs_crops" in result` guard narrows the union for the success response below it.)

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/analyze-menu/index.ts
git commit -m "feat: needs_crops phase-1 response + stage:extract-pages handler"
```

---

### Task 4: Client — tile preparation + two-phase `extractMenu`

**Files:**
- Modify: `src/lib/compressImage.ts` (add `prepareTile`)
- Modify: `src/lib/analyzeMenu.ts` (`extractMenu` two-phase)

**Interfaces:**
- Consumes: `gridCropRects` (Task 1), edge contract (Task 3), existing `prepareImage`/`compressImage`, `ScanPhoto {uri, width, height}`.
- Produces: `extractMenu` signature and return type UNCHANGED (`Promise<ExtractionResult>` from `src/types/scan.ts`) — `review.tsx` needs no edits. `export function prepareTile(uri: string, crop: CropRect): Promise<CompressedImage>`.

- [ ] **Step 1: Add `prepareTile` to `compressImage.ts`**

```ts
const TILE_MAX_DIMENSION = 2048;
const TILE_QUALITY = 0.85;

/** Cuts one dense-menu tile from the ORIGINAL image. Deliberately NOT the
 * 1024px/q0.7 pipeline — production compression is what broke every rejected
 * dense candidate (2026-07-04 spec). 2048px cap keeps phone-camera tiles
 * ~2x the linear resolution of the gate-proven 718x1138 tiles. */
export async function prepareTile(
  uri: string,
  crop: CropRect,
): Promise<CompressedImage> {
  const context = ImageManipulator.manipulate(uri);
  context.crop(crop);
  const longest = Math.max(crop.width, crop.height);
  if (longest > TILE_MAX_DIMENSION) {
    const scale = TILE_MAX_DIMENSION / longest;
    context.resize({
      width: Math.round(crop.width * scale),
      height: Math.round(crop.height * scale),
    });
  }
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    compress: TILE_QUALITY,
    format: SaveFormat.JPEG,
  });
  return { uri: result.uri, width: result.width, height: result.height };
}
```

- [ ] **Step 2: Two-phase `extractMenu` in `analyzeMenu.ts`**

Add imports: `import { gridCropRects } from "./adaptiveExtraction";` and `import { prepareTile } from "./compressImage";` (extend the existing compressImage import).

In `extractMenu`, after the successful phase-1 `invoke` (the existing `error`/malformed checks stay), insert the dense branch before the final success mapping:

```ts
  let payload = data;
  if (Array.isArray(data?.needs_crops)) {
    console.log("[extractMenu] dense pages detected", data.needs_crops);
    const dense = new Set<number>(data.needs_crops);
    const pages = await Promise.all(photos.map(async (photo, index) => {
      if (!dense.has(index)) return [base64Photos[index]];
      const tiles = await Promise.all(
        gridCropRects(photo.width, photo.height).map((rect) =>
          prepareTile(photo.uri, rect)
        ),
      );
      return Promise.all(tiles.map((tile) =>
        FileSystem.readAsStringAsync(tile.uri, {
          encoding: FileSystem.EncodingType.Base64,
        })
      ));
    }));
    const phase2 = await supabase.functions.invoke(FUNCTION_NAME, {
      body: { pages, provider, stage: "extract-pages" },
    });
    if (phase2.error) {
      logFunctionInvokeError(debugContext, phase2.error);
      const errMsg = await getFunctionErrorMessage(phase2.error);
      const result: ExtractionResult = { provider, items: [], image_layout: null, latency_ms: 0, model_id: provider, error: errMsg };
      logExtractionResult(result);
      return result;
    }
    payload = phase2.data;
  }
```

Then change the existing malformed-response check and success mapping to read from `payload` instead of `data` (`payload.items`, `payload.image_layout`, `payload.latency_ms`, `payload.model_id`, `payload.error`, `payload.raw_response`). Note: the malformed check (`!data || !Array.isArray(data.items)`) must move BELOW the dense branch, operating on `payload` — a phase-1 `needs_crops` response legitimately has no `items`.

- [ ] **Step 3: Typecheck the app**

Run: `cd /private/tmp/menu-scan-app-extraction-eval-harness && ./node_modules/.bin/tsc --noEmit`
Expected: clean (or only pre-existing errors — capture the baseline with `git stash && tsc --noEmit; git stash pop` if unsure).

- [ ] **Step 4: Commit**

```bash
git add src/lib/compressImage.ts src/lib/analyzeMenu.ts
git commit -m "feat: client two-phase dense flow — original-resolution 2x2 tiles via extract-pages"
```

---

### Task 5: Eval input-fidelity experiment (oracle-scored, decides phase-1 input mode)

**Files:**
- Create: `scripts/probe-fidelity.ts` (throwaway-quality but committed — it documents the evidence)
- Modify: `docs/superpowers/extraction-iteration-ledger.md` (record results + decision, newest last)

**Why:** the eval has always sent ORIGINAL fixture photos; production sends 1024px/q0.7. The detector must be exercised on production-fidelity input for nikkori (probed: compressed nikkori dense-signals 3/3), but switching the 5 frozen menus to compressed input could change their gate behavior. This experiment buys the answer with oracles instead of assumptions (user requirement). Cost ≈ $0.45.

**Decision rule (encoded, run once, ledger the outcome):**
- If compressed phase-1 keeps all 5 non-dense menus green on all 5 dims AND never dense-signals them AND nikkori dense-signals → **eval adopts production compression for every photo** (full production fidelity; preferred).
- Else → eval keeps ORIGINAL photos for phase 1 (status quo, documented fidelity gap) and relies on the original nikkori full-page ALSO dense-signaling (the probe records this); if originals do NOT dense-signal nikkori, STOP and bring the user the data — do not invent a third mode alone.

- [ ] **Step 1: Write `scripts/probe-fidelity.ts`**

```ts
// Fidelity probe (auto-cutter Task 5): for each fixture, run phase-1
// runPagedExtraction twice — on ORIGINAL photos and on production-compressed
// (1024px JPEG q0.7 via sips) photos — record the detector verdict, and for
// non-dense verdicts score all dims against the oracle.
// Run: OPENAI_API_KEY=... deno run --allow-read --allow-write --allow-env \
//   --allow-net --allow-run scripts/probe-fidelity.ts
import { runPagedExtraction } from "../supabase/functions/analyze-menu/extract.ts";
import { scoreMenu } from "./eval-extraction.ts";

type Fixture = Parameters<typeof scoreMenu>[0];
const MENU_DIR = "/Users/santiagoaguirre/Downloads/MenusTesting";
const FIXTURE_DIR = new URL("./fixtures/", import.meta.url);
const apiKey = Deno.env.get("OPENAI_API_KEY")!;
const tmp = await Deno.makeTempDir({ prefix: "fidelity-" });

async function sh(cmd: string[]): Promise<void> {
  const out = await new Deno.Command(cmd[0], { args: cmd.slice(1) }).output();
  if (!out.success) throw new Error(`${cmd.join(" ")} failed`);
}

function mime(name: string): string {
  return name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

async function data(path: string): Promise<string> {
  return `data:${mime(path)};base64,${(await Deno.readFile(path)).toBase64()}`;
}

async function compressed(name: string): Promise<string> {
  const out = `${tmp}/${name.replaceAll("/", "_")}.jpg`;
  await sh(["sips", "-Z", "1024", "-s", "format", "jpeg", "-s", "formatOptions", "70", `${MENU_DIR}/${name}`, "--out", out]);
  return data(out);
}

const fixtures: Fixture[] = [];
for await (const entry of Deno.readDir(FIXTURE_DIR)) {
  if (entry.isFile && entry.name.endsWith(".expected.json")) {
    fixtures.push(JSON.parse(await Deno.readTextFile(new URL(entry.name, FIXTURE_DIR))));
  }
}
fixtures.sort((a, b) => a.menu.localeCompare(b.menu));

for (const mode of ["original", "compressed"] as const) {
  console.log(`\n===== MODE: ${mode} =====`);
  for (const fixture of fixtures) {
    const photos = await Promise.all(fixture.photos.map((p) =>
      mode === "original" ? data(`${MENU_DIR}/${p}`) : compressed(p)
    ));
    try {
      const result = await runPagedExtraction(photos, apiKey);
      if ("needs_crops" in result) {
        console.log(`${fixture.menu}: DENSE-SIGNAL pages=${JSON.stringify(result.needs_crops)}`);
        continue;
      }
      const report = scoreMenu(fixture, { image_quality: result.image_quality, items: result.items });
      const dims = ["items", "options", "section_context", "categories", "grams"] as const;
      const fails = dims.filter((d) => !(report[d] as { pass: boolean }).pass);
      console.log(`${fixture.menu}: normal; ${fails.length === 0 ? "ALL DIMS PASS" : `FAIL ${fails.join(",")}`}`);
    } catch (error) {
      console.log(`${fixture.menu}: TERMINAL ${String(error).slice(0, 80)}`);
    }
  }
}
```

- [ ] **Step 2: Run it (detached; ~12 calls, ~$0.45)**

```bash
cd /private/tmp/menu-scan-app-extraction-eval-harness
export OPENAI_API_KEY=$(grep '^OPENAI_API_KEY=' .env.local | cut -d= -f2-)
nohup deno run --allow-read --allow-write --allow-env --allow-net --allow-run \
  scripts/probe-fidelity.ts > /tmp/probe-fidelity.log 2>&1 &
```

Watch `/tmp/probe-fidelity.log`. Expected shape: 5 menus "normal; ALL DIMS PASS" in at least one mode; nikkori "DENSE-SIGNAL" in compressed mode.

- [ ] **Step 3: Apply the decision rule, ledger the outcome, commit**

Write the mode table + chosen input mode into the ledger (newest last), then:

```bash
git add scripts/probe-fidelity.ts docs/superpowers/extraction-iteration-ledger.md
git commit -m "feat(eval): input-fidelity probe — phase-1 input mode decided by oracle data"
```

---

### Task 6: Eval runner — production-path dense flow, `DENSE_TILES` deleted, detector assertions

**Files:**
- Modify: `scripts/eval-027-live.ts`

**Interfaces:**
- Consumes: `runPagedExtraction` (union return), `runGroupedExtraction`, `gridCropRects`, Task 5's input-mode decision.
- Produces: gate output now includes a per-menu detector line; a run FAILS if any non-nikkori menu dense-signals or nikkori doesn't (assert by fixture-declared expectation, not by menu name in logic — see below).

**No-menu-names rule:** add an optional `dense: true` field to `scripts/fixtures/nikkori.expected.json` (fixture data, not code). The eval asserts `denseSignaled === Boolean(fixture.dense)` for every menu. Update `eval-extraction.ts`'s `ExpectedFixture` with `dense?: boolean`.

- [ ] **Step 1: Rewrite `extractMenu` + assertions in `eval-027-live.ts`**

Delete the `DENSE_TILES` map and its header comment ("GENERALIZATION NOTE" included — it's fulfilled). Replace `extractMenu` with (imports: drop `extractWithRetry`+`mergeItemSources` if now unused, add `runGroupedExtraction` from extract.ts and `gridCropRects` from `../src/lib/adaptiveExtraction.ts`; add `Deno.Command` helper):

```ts
const TILE_DIR = await Deno.makeTempDir({ prefix: "eval-tiles-" });

async function sh(args: string[]): Promise<void> {
  const out = await new Deno.Command(args[0], { args: args.slice(1) }).output();
  if (!out.success) {
    throw new Error(`${args.join(" ")} failed: ${new TextDecoder().decode(out.stderr)}`);
  }
}

async function dims(path: string): Promise<{ w: number; h: number }> {
  const out = await new Deno.Command("sips", {
    args: ["-g", "pixelWidth", "-g", "pixelHeight", path],
  }).output();
  const text = new TextDecoder().decode(out.stdout);
  return {
    w: Number(text.match(/pixelWidth: (\d+)/)?.[1]),
    h: Number(text.match(/pixelHeight: (\d+)/)?.[1]),
  };
}

// Runtime tile cutting from the ORIGINAL photo — the production recipe.
// sips crop is pixel-identical to the retired pre-cut tiles (verified
// 2026-07-10: tile-4 TIFF hash match). Format per the Task-7 tile A/B.
async function cutTiles(name: string): Promise<string[]> {
  const src = `${MENU_DIR}/${name}`;
  const { w, h } = await dims(src);
  const tiles: string[] = [];
  for (const [i, rect] of gridCropRects(w, h).entries()) {
    const out = `${TILE_DIR}/${name.replaceAll("/", "_")}.tile${i}.png`;
    await sh([
      "sips", "-s", "format", "png",
      "--cropOffset", String(rect.originY), String(rect.originX),
      "-c", String(rect.height), String(rect.width),
      src, "--out", out,
    ]);
    tiles.push(`data:image/png;base64,${(await Deno.readFile(out)).toBase64()}`);
  }
  return tiles;
}

async function extractMenu(
  fixture: Fixture,
): Promise<Actual & { denseSignaled: boolean }> {
  // Phase-1 input mode per the Task-5 fidelity decision (see ledger).
  const photos = await Promise.all(fixture.photos.map(photoData));
  const phase1 = await runPagedExtraction(photos, apiKey);
  if (!("needs_crops" in phase1)) {
    return {
      image_quality: phase1.image_quality,
      items: phase1.items,
      denseSignaled: false,
    };
  }
  const denseSet = new Set(phase1.needs_crops);
  const groups = await Promise.all(fixture.photos.map(async (name, index) =>
    denseSet.has(index) ? await cutTiles(name) : [await photoData(name)]
  ));
  const result = await runGroupedExtraction(groups, apiKey);
  return {
    image_quality: result.image_quality,
    items: result.items,
    denseSignaled: true,
  };
}
```

(If Task 5 chose compressed phase-1 input, `photoData` gains the sips compression step for phase 1 only — tiles ALWAYS cut from originals.)

In the run loop, after `const actual = await extractMenu(fixture);` add the detector assertion feeding the gate:

```ts
    const detectorOk = actual.denseSignaled === Boolean(fixture.dense);
    console.log(
      `  ${detectorOk ? "PASS" : "FAIL"} ${fixture.menu} detector: ${
        actual.denseSignaled ? "dense-signaled" : "normal"
      } (expected ${fixture.dense ? "dense" : "normal"})`,
    );
    if (!detectorOk) detectorFailures.push(fixture.menu);
```

Declare `const detectorFailures: string[] = [];` at the top of each run's scope and fold it into the verdict: `if (failures.length === 0 && detectorFailures.length === 0)` → pass, else print `GATE FAIL: ... detector: <menus>`.

Also add `"dense": true` to `scripts/fixtures/nikkori.expected.json` and `dense?: boolean;` to `ExpectedFixture` in `scripts/eval-extraction.ts`.

- [ ] **Step 2: Typecheck + `--allow-run`**

Run: `deno check scripts/eval-027-live.ts`. Note the run command now needs `--allow-run` (sips): update the header comment's run line.

- [ ] **Step 3: Single-run smoke (~$0.55)**

```bash
EVAL_RUNS=1 OPENAI_API_KEY=... deno run --allow-read --allow-write --allow-env --allow-net --allow-run scripts/eval-027-live.ts
```
Expected: 5 menus `detector: normal`, nikkori `detector: dense-signaled`, all dims PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/eval-027-live.ts scripts/eval-extraction.ts scripts/fixtures/nikkori.expected.json
git commit -m "feat(eval): production-faithful dense flow — detector + runtime sips tiles; DENSE_TILES deleted"
```

---

### Task 7: Tile-format A/B — PNG vs JPEG q0.85 (oracle-scored)

**Files:**
- Modify: `docs/superpowers/extraction-iteration-ledger.md` (results + decision)
- Possibly modify: `scripts/eval-027-live.ts` `cutTiles` (if JPEG wins/ties) — production tiles are JPEG q0.85, so eval-tile format should match production UNLESS PNG is materially better (then the CLIENT switches to `SaveFormat.PNG` instead — decide from data).

**Why:** the proven recipe used PNG (lossless) tiles; the client saves JPEG q0.85. If q0.85 loses oracle points, we must know now, not on a phone. User's variation-testing mandate covers this. Cost ≈ $0.75 (nikkori only: (1 phase1 + 4 tiles) × 3 runs × 2 variants ≈ 30 calls — reuse phase-1 verdicts if stable).

- [ ] **Step 1: Run the A/B**

Temporarily parameterize `cutTiles` format via `Deno.env.get("TILE_FORMAT")` (png | jpeg85: `sips -s format jpeg -s formatOptions 85`), then:

```bash
for fmt in png jpeg85; do
  TILE_FORMAT=$fmt EVAL_RUNS=3 EVAL_MENUS=nikkori OPENAI_API_KEY=... \
    nohup deno run --allow-read --allow-write --allow-env --allow-net --allow-run \
    scripts/eval-027-live.ts > /tmp/tile-ab-$fmt.log 2>&1
done
```

- [ ] **Step 2: Decide by oracle results**

Both formats scored by `scoreMenu` against `nikkori.expected.json` (items 48±3, sections, categories, grams). Decision: if jpeg85 matches png 3/3 → keep client JPEG q0.85 and make the eval cut jpeg85 (production-identical). If png wins → switch client `prepareTile` to `SaveFormat.PNG` (and keep eval png). Ledger the table + choice; make the chosen format the non-env default in `cutTiles` and delete the env knob.

- [ ] **Step 3: Commit**

```bash
git add scripts/eval-027-live.ts docs/superpowers/extraction-iteration-ledger.md
git commit -m "feat(eval): tile-format A/B decided by oracle — eval tiles match production format"
```

---

### Task 8: Full 3/3 exit gate

**Files:**
- Modify: `docs/superpowers/extraction-iteration-ledger.md`

- [ ] **Step 1: Run the gate (detached + monitored; ~36 calls ≈ $1.10)**

```bash
cd /private/tmp/menu-scan-app-extraction-eval-harness
export OPENAI_API_KEY=$(grep '^OPENAI_API_KEY=' .env.local | cut -d= -f2-)
nohup deno run --allow-read --allow-write --allow-env --allow-net --allow-run \
  scripts/eval-027-live.ts > /tmp/gate-cutter.log 2>&1 &
```

Expected: `3/3 consecutive all-menu passing runs` — five dims green on all 6 menus AND detector line green on all 6 (5 normal / nikkori dense) in every run.

- [ ] **Step 2: On failure**

Known watch item: nikkori items 52/48 (crop-count edge, 2× on 2026-07-10). If it fires: diagnose from the failure dump (which tile contributed the extras — merge the per-tile raw_response array), ledger the finding, and bring options to the user (tile-merge tweak vs ±3 band ruling) rather than re-rolling silently. Any other failure: roadmap Lessons apply (probe the failing menu solo before burning gates).

- [ ] **Step 3: Ledger + commit**

```bash
git add docs/superpowers/extraction-iteration-ledger.md
git commit -m "docs: ledger — auto-cutter exit gate 3/3"
```

---

### Task 9: Device verification on physical iPhone

**Files:**
- Modify: `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app/AGENTS.md` (main checkout — Status/Pending Blockers: replace the "NOT YET PAID" Apple Developer line with `- **Apple Developer Program — PAID ✅ (2026-07-10).** Device testing unblocked.`)
- No code files.

**Precondition:** deploy the CURRENT worktree function to the test project (allowed: deploy-to-TEST only): `cd /private/tmp/menu-scan-app-extraction-eval-harness && supabase functions deploy analyze-menu` (needs project link + `OPENAI_API_KEY` secret already set; verify with `supabase secrets list`). The deployed fn was an F2-era snapshot — this deploy brings F1–F4 + wiring + cutter to the test endpoint for the first time; note it in the ledger.

- [ ] **Step 1: Build to device**

`./node_modules/.bin/expo run:ios --device` (user assists with device selection/signing).

- [ ] **Step 2: Manual checklist (user-driven, agent watches logs)**

1. Gallery-scan the ORIGINAL Nikkori photo → expect: console `[extractMenu] dense pages detected [0]`, second stage call, results screen showing ~48 food items (rolls present), no drinks from the crop path.
2. Camera- or gallery-scan brasero (normal) → expect: single phase, no `dense pages detected` log, normal results.
3. Multi-page scan (both brasero-two pages) → expect: one unified results list, no duplicate Taco Loiro.
4. Note latency feel for the dense flow (5 calls; parallel tiles ≈ one call wall-clock + phase 1).

- [ ] **Step 3: Record + commit ledger note (worktree); AGENTS.md edit stays uncommitted in main checkout (doc-batch precedent)**

---

### Task 10: Close-out — diagram, roadmap, memory

**Files:**
- Modify (MAIN checkout): `docs/superpowers/diagrams/menu-extraction-pipeline.md` — dense branch 🔴→🟢: replace the old `extract-crops` dense branch in the sequence diagram with the two-phase flow (phase-1 detector → `needs_crops` → client cuts originals via `gridCropRects` → `stage:"extract-pages"` → grouped extraction → one menu); update Call order + Status table (auto-cutter row 🟢 CLOSED with date + gate eval number); note the legacy `extract-crops` stage as unused/cleanup-flagged. Re-copy to `~/Downloads/menu-extraction-pipeline.md`.
- Modify (MAIN checkout): `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md` — tick critical-path #2 with a summary line (detector, stateless two-phase, tile A/B outcome, DENSE_TILES deleted, device-verified).
- Memory: update `project_prerelease_wiring_status.md` (or a new `project_autocutter_status.md` + MEMORY.md line): #2 closed, next = #3 Stage-2 enrichment benchmark; note the deployed-fn drift is now partially resolved (test deploy in Task 9).
- Verify: `git status --short` clean in worktree; main checkout shows only doc edits.

- [ ] **Step 1: Diagram + Downloads copy**
- [ ] **Step 2: Roadmap tick**
- [ ] **Step 3: Memory update**
- [ ] **Step 4: Final verification** — `deno test supabase/functions/analyze-menu/ src/lib/adaptiveExtraction_test.ts && deno run --allow-read --allow-write --allow-env scripts/eval-extraction.ts --self-check && deno check scripts/eval-027-live.ts supabase/functions/analyze-menu/index.ts && ./node_modules/.bin/tsc --noEmit` — all green; report.
