# Per-Page Multi-Photo Extraction Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the gate-proven per-page multi-photo extraction recipe (one GPT-4o call per page → merge) out of the eval runner into one shared function that both the edge `stage:"extract"` handler and the eval runner call, so the 3/3 live gate proves the code production actually runs.

**Architecture:** A new `runPagedExtraction` in `supabase/functions/analyze-menu/extract.ts` routes 1 photo → exactly 1 call, N photos → exactly N parallel `detail:"high"` calls merged by `mergeItemSources` (relocated server-side to `merge.ts`), always returning ONE unified menu payload. `extractWithRetry` (one retry on timeout / `finish_reason=length`) moves from the eval runner into shared code so production inherits the resilience the gate depends on. The eval runner's single/multi-page branches collapse into a call to the shared function; the `DENSE_TILES` branch stays untouched.

**Tech Stack:** Deno (Supabase Edge Function), TypeScript, GPT-4o Vision, existing eval harness (`scripts/eval-027-live.ts`).

**Spec:** `docs/superpowers/specs/2026-07-10-per-page-multi-photo-wiring-design.md` (this worktree).

## Global Constraints

- **Work in the worktree** `/private/tmp/menu-scan-app-extraction-eval-harness`, branch `feat/extraction-eval-harness`. All `cd`/paths below are relative to it unless absolute.
- **No cloud deploy.** Test/perfect phase — validation is the eval harness + `deno check` + code review only.
- **No P1/P2 prompt, `EXTRACT_SCHEMA`, or scorer changes.** This is a wiring refactor; a behavior diff on the gate is a regression.
- **`DENSE_TILES` branch of the eval runner stays untouched** (dense auto-cutter is critical-path #2, not this feature).
- **Efficiency guarantees (hard):** 1 photo ⇒ exactly 1 call, no loop, no merge. N photos ⇒ exactly N calls, run in parallel. No path ever issues >1 call for a single page (retry on transient failure excepted).
- **Unified single-menu output (hard, user 2026-07-10):** N pages are ONE menu — one merged `items` list, one `image_quality`, one `image_layout` (first dense page's layout, else page 1's), so enrichment downstream runs exactly once per scan.
- **Multi-page detail locked to `"high"`** (gate-proven since iter-036); single-page stays default (`auto`). The `auto` A/B is deferred post-release (cost pass).
- **Exit gate:** full 6-menu gate green 3/3 via `scripts/eval-027-live.ts` — all frozen dims (`items`, `options`, `section_context`, `categories`, `grams`). NOT `eval-extraction.ts --gate` (Nikkori needs the crop-merge path).
- **Never hardcode menu-specific values or counts** in solution code.
- **Ledger discipline:** log the wiring + detail-lock decision in `docs/superpowers/extraction-iteration-ledger.md` (worktree), newest last; results in `docs/superpowers/extraction-eval-log.md`.
- **Diagram discipline:** on close, update `docs/superpowers/diagrams/menu-extraction-pipeline.md` **in the primary folder (`feat/selectable-options`)** (`/Users/santiagoaguirre/Desktop/CODING/menu-scan-app`) — Stage-1 per-page note + status flags — and re-copy to `~/Downloads/menu-extraction-pipeline.md`.
- Live evals cost ~$0.03/GPT-4o call and need `OPENAI_API_KEY` in the env. Full 3-run gate ≈ 30 calls ≈ $0.90 (user-approved; cost is not a pre-release concern).

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

### Task 1: Relocate `mergeItemSources` server-side (`merge.ts`)

**Files:**
- Create: `supabase/functions/analyze-menu/merge.ts`
- Create: `supabase/functions/analyze-menu/merge_test.ts`
- Modify: `src/lib/adaptiveExtraction.ts` (remove `mergeItemSources` + its private helpers `normalize`, `editDistance`, `duplicate`, `mergeOptions`, `richer`; keep `MAX_SCAN_PHOTOS`, `CropCount`, `DENSE_CROP_COUNT`, `CropRect`, `validateLayout`, `cropRects`, `limitPhotos`)
- Modify: `src/lib/adaptiveExtraction_test.ts` (remove the 6 merge tests + `item` helper; keep crop/layout/limit tests)
- Modify: `scripts/eval-adaptive-crops.ts:1` and `scripts/run-nikkori-024.ts:2` (repoint the `mergeItemSources` import)

**Interfaces:**
- Consumes: `ExtractedMenuItem` type from `./extract.ts` (structurally identical to `src/types/scan.ts`'s `ExtractedItem` — the retype loses nothing, `options` and `grams` included).
- Produces: `export function mergeItemSources(sources: ExtractedMenuItem[][]): ExtractedMenuItem[]` in `supabase/functions/analyze-menu/merge.ts` — Tasks 2 and 4 import it from there.

- [ ] **Step 1: Write `merge_test.ts` (the 6 merge tests, moved and retyped)**

Create `supabase/functions/analyze-menu/merge_test.ts`:

```ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { mergeItemSources } from "./merge.ts";
import type { ExtractedMenuItem } from "./extract.ts";

const item = (
  name: string,
  price: number | null,
  description = "",
): ExtractedMenuItem => ({
  name,
  description,
  price,
  category: "food",
  section_title: "Rollos",
  options: [],
  grams: null,
});

Deno.test("merges exact overlap duplicates", () => {
  assertEquals(
    mergeItemSources([
      [item("Lomo Salteado", 169)],
      [item("Lomo Salteado", 169, "Filete de res")],
    ]),
    [item("Lomo Salteado", 169, "Filete de res")],
  );
});

Deno.test("merges conservative OCR aliases", () => {
  assertEquals(
    mergeItemSources([[item("Mangud", 159)], [item("Manguo", 159)]]).length,
    1,
  );
});

Deno.test("merges near-name variant when one source omits the section", () => {
  const withSection = item("Kurimu Roll", 169);
  const nullSection = { ...item("Kurimu Roll I", 169), section_title: null };
  assertEquals(
    mergeItemSources([[withSection], [nullSection]]).length,
    1,
  );
});

Deno.test("keeps distinct same-price dishes", () => {
  assertEquals(
    mergeItemSources([[
      item("Cosmo Roll", 159),
      item("Cosmo de Pollo", 159),
    ]]).length,
    2,
  );
});

Deno.test("does not deduplicate within one source", () => {
  assertEquals(
    mergeItemSources([[
      item("Revueltos", 78),
      item("Revueltos", 84),
    ]]).length,
    2,
  );
});

Deno.test("removes empty section header pseudo-items", () => {
  const header = {
    ...item("Rollos", null),
    section_title: "Menu",
  };
  assertEquals(
    mergeItemSources([[header, item("Salmón Roll", 169)]])
      .map((entry) => entry.name),
    ["Salmón Roll"],
  );
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd /private/tmp/menu-scan-app-extraction-eval-harness
deno test supabase/functions/analyze-menu/merge_test.ts
```
Expected: FAIL — `Module not found "./merge.ts"`.

- [ ] **Step 3: Create `merge.ts` (code moved verbatim from `src/lib/adaptiveExtraction.ts:51-163`, retyped)**

Create `supabase/functions/analyze-menu/merge.ts`:

```ts
// Cross-source item merge for per-page / per-tile extraction. Moved here from
// src/lib/adaptiveExtraction.ts (2026-07-10): the deployed edge function
// bundles only its own directory, and the per-page recipe now runs server-side.
import type { ExtractedMenuItem } from "./extract.ts";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + Number(a[i - 1] !== b[j - 1]),
      );
      diagonal = above;
    }
  }
  return row[b.length];
}

function duplicate(a: ExtractedMenuItem, b: ExtractedMenuItem): boolean {
  const left = normalize(a.name);
  const right = normalize(b.name);
  const compatiblePrice =
    a.price === b.price || a.price === null || b.price === null;
  if (left === right) return compatiblePrice;
  // A null/empty section means "unknown", not "a different section": a crop
  // that omits section_title must still merge with a sectioned near-name copy.
  const aSection = normalize(a.section_title ?? "");
  const bSection = normalize(b.section_title ?? "");
  const compatibleSection =
    aSection === bSection || aSection === "" || bSection === "";
  if (
    a.price === null ||
    b.price === null ||
    a.price !== b.price ||
    a.category !== b.category ||
    !compatibleSection
  )
    return false;
  return (
    editDistance(left, right) <=
    Math.max(1, Math.floor(Math.max(left.length, right.length) * 0.2))
  );
}

function mergeOptions(
  first: ExtractedMenuItem["options"],
  second: ExtractedMenuItem["options"],
): ExtractedMenuItem["options"] {
  return [...first, ...second].filter(
    (option, index, all) =>
      all.findIndex(
        (candidate) =>
          normalize(candidate.name) === normalize(option.name) &&
          candidate.price === option.price,
      ) === index,
  );
}

function richer(a: ExtractedMenuItem, b: ExtractedMenuItem): ExtractedMenuItem {
  const best =
    b.description.length + b.options.length >
    a.description.length + a.options.length
      ? b
      : a;
  return { ...best, options: mergeOptions(a.options, b.options) };
}

export function mergeItemSources(
  sources: ExtractedMenuItem[][],
): ExtractedMenuItem[] {
  const sectionTitles = new Set(
    sources
      .flat()
      .flatMap((entry) =>
        entry.section_title ? [normalize(entry.section_title)] : [],
      ),
  );
  const kept: { item: ExtractedMenuItem; sources: Set<number> }[] = [];

  sources.forEach((source, sourceIndex) => {
    for (const entry of source) {
      if (
        entry.price === null &&
        entry.description.trim() === "" &&
        entry.options.length === 0 &&
        sectionTitles.has(normalize(entry.name))
      )
        continue;

      const match = kept.find(
        (candidate) =>
          !candidate.sources.has(sourceIndex) &&
          duplicate(candidate.item, entry),
      );
      if (match) {
        match.item = richer(match.item, entry);
        match.sources.add(sourceIndex);
      } else {
        kept.push({ item: entry, sources: new Set([sourceIndex]) });
      }
    }
  });

  return kept.map(({ item }) => item);
}
```

- [ ] **Step 4: Run merge tests to verify they pass**

```bash
deno test supabase/functions/analyze-menu/merge_test.ts
```
Expected: 6 passed.

- [ ] **Step 5: Remove the moved code from `src/lib/adaptiveExtraction.ts`**

Delete lines 51–163 (everything from `function normalize` through `mergeItemSources` inclusive) and drop `ExtractedItem` from the type import at the top. The file's remaining top import becomes:

```ts
import type { CropDirection, ImageLayout } from "../types/scan.ts";
```

Everything from `MAX_SCAN_PHOTOS` through `limitPhotos` stays as-is.

- [ ] **Step 6: Remove the moved tests from `src/lib/adaptiveExtraction_test.ts`**

Delete the 6 `Deno.test` blocks moved in Step 1 (from `"merges exact overlap duplicates"` through `"removes empty section header pseudo-items"`), the `item` helper (lines 13–25), the `mergeItemSources` name from the import, and the now-unused `import type { ExtractedItem } ...` line. The remaining file keeps the 5 crop/layout/limit tests and imports only `cropRects, limitPhotos, validateLayout` plus `assertEquals, assertThrows`.

- [ ] **Step 7: Repoint the two other eval scripts**

In `scripts/eval-adaptive-crops.ts:1` and `scripts/run-nikkori-024.ts:2`, change:

```ts
import { mergeItemSources } from "../src/lib/adaptiveExtraction.ts";
```
to:
```ts
import { mergeItemSources } from "../supabase/functions/analyze-menu/merge.ts";
```

(Do NOT touch `scripts/eval-027-live.ts` yet — Task 4 rewrites it.)

- [ ] **Step 8: Verify everything still typechecks and passes**

```bash
deno test supabase/functions/analyze-menu/ src/lib/adaptiveExtraction_test.ts
deno check scripts/eval-adaptive-crops.ts scripts/run-nikkori-024.ts
```
Expected: all tests pass (merge 6, adaptive 5, plus existing extract/enrich/postprocess tests); check clean. If the scripts pass `ExtractedItem[][]` (from `src/types/scan.ts`) to the merge, that's fine — the types are structurally identical.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/analyze-menu/merge.ts supabase/functions/analyze-menu/merge_test.ts src/lib/adaptiveExtraction.ts src/lib/adaptiveExtraction_test.ts scripts/eval-adaptive-crops.ts scripts/run-nikkori-024.ts
git commit -m "refactor: move mergeItemSources server-side to analyze-menu/merge.ts"
```

---

### Task 2: `extractWithRetry` + `runPagedExtraction` in shared code

**Files:**
- Modify: `supabase/functions/analyze-menu/extract.ts` (append two functions; `runExtraction` unchanged)
- Modify: `supabase/functions/analyze-menu/extract_test.ts` (append tests)

**Interfaces:**
- Consumes: `runExtraction(photos, apiKey, detail?)` and `ExtractionResult` (both already in `extract.ts`); `mergeItemSources` from `./merge.ts` (Task 1).
- Produces (Tasks 3 and 4 import these from `./extract.ts` / `../supabase/functions/analyze-menu/extract.ts`):
  - `export async function extractWithRetry(photos: string[], apiKey: string, detail?: "auto" | "high" | "low", extract = runExtraction): Promise<ExtractionResult>`
  - `export async function runPagedExtraction(photos: string[], apiKey: string, extract = extractWithRetry): Promise<ExtractionResult>`

The trailing `extract` parameter follows the existing injectable pattern of `runCropExtractions` (`extract.ts:225-228`) so tests stub the model call without network.

- [ ] **Step 1: Write the failing tests**

Append to `supabase/functions/analyze-menu/extract_test.ts` (it already imports `assertEquals, assertRejects` and from `./extract.ts` — extend the `./extract.ts` import with `extractWithRetry, runPagedExtraction` and add `import type { ExtractionResult } from "./extract.ts";` if types aren't already imported):

```ts
const fakeResult = (over: Partial<ExtractionResult> = {}): ExtractionResult => ({
  image_quality: { usable: true, issues: [] },
  image_layout: { dense: false, crop_direction: "none" },
  items: [],
  raw_response: "{}",
  ...over,
});

const menuItem = (
  name: string,
  price: number | null,
  description = "",
): ExtractionResult["items"][number] => ({
  name,
  description,
  price,
  category: "food",
  section_title: null,
  options: [],
  grams: null,
});

Deno.test("extractWithRetry retries exactly once on timeout", async () => {
  let calls = 0;
  const stub = (() => {
    calls++;
    return calls === 1
      ? Promise.reject(new Error("Model request timed out after 120s"))
      : Promise.resolve(fakeResult({ raw_response: "second" }));
  }) as typeof runExtraction;
  const result = await extractWithRetry(["p"], "key", undefined, stub);
  assertEquals(calls, 2);
  assertEquals(result.raw_response, "second");
});

Deno.test("extractWithRetry retries on finish_reason=length", async () => {
  let calls = 0;
  const stub = (() => {
    calls++;
    return calls === 1
      ? Promise.reject(
        new Error("OpenAI extraction stopped with finish_reason=length"),
      )
      : Promise.resolve(fakeResult());
  }) as typeof runExtraction;
  await extractWithRetry(["p"], "key", undefined, stub);
  assertEquals(calls, 2);
});

Deno.test("extractWithRetry does not retry non-transient errors", async () => {
  let calls = 0;
  const stub = (() => {
    calls++;
    return Promise.reject(new Error("OpenAI API error"));
  }) as typeof runExtraction;
  await assertRejects(
    () => extractWithRetry(["p"], "key", undefined, stub),
    Error,
    "OpenAI API error",
  );
  assertEquals(calls, 1);
});

Deno.test("runPagedExtraction: one photo ⇒ exactly one call, default detail, passthrough", async () => {
  const seen: { photos: string[]; detail?: string }[] = [];
  const stub = ((photos: string[], _key: string, detail?: string) => {
    seen.push({ photos, detail });
    return Promise.resolve(fakeResult({ raw_response: "single" }));
  }) as typeof extractWithRetry;
  const result = await runPagedExtraction(["a"], "key", stub);
  assertEquals(seen, [{ photos: ["a"], detail: undefined }]);
  assertEquals(result.raw_response, "single");
});

Deno.test("runPagedExtraction: N photos ⇒ N high-detail single-photo calls, unified menu", async () => {
  const seen: { photos: string[]; detail?: string }[] = [];
  const pages: ExtractionResult[] = [
    fakeResult({
      items: [menuItem("Tacos", 100)],
      image_quality: { usable: true, issues: ["glare"] },
      raw_response: "r1",
    }),
    fakeResult({
      items: [menuItem("Tacos", 100, "de pastor"), menuItem("Sopa", 80)],
      image_quality: { usable: false, issues: ["glare", "blur"] },
      image_layout: { dense: true, crop_direction: "top_bottom" },
      raw_response: "r2",
    }),
  ];
  const stub = ((photos: string[], _key: string, detail?: string) => {
    seen.push({ photos, detail });
    return Promise.resolve(pages[seen.length - 1]);
  }) as typeof extractWithRetry;

  const result = await runPagedExtraction(["a", "b"], "key", stub);

  assertEquals(seen, [
    { photos: ["a"], detail: "high" },
    { photos: ["b"], detail: "high" },
  ]);
  // ONE menu: cross-page duplicate collapsed, richer copy kept.
  assertEquals(result.items, [menuItem("Tacos", 100, "de pastor"), menuItem("Sopa", 80)]);
  // ONE quality verdict: any unusable page ⇒ unusable; issues deduped.
  assertEquals(result.image_quality, { usable: false, issues: ["glare", "blur"] });
  // Layout comes from the first dense page (dense + direction travel together).
  assertEquals(result.image_layout, { dense: true, crop_direction: "top_bottom" });
  // Raw payloads preserved per page as a JSON array string.
  assertEquals(JSON.parse(result.raw_response), ["r1", "r2"]);
});
```

- [ ] **Step 2: Run to verify the new tests fail**

```bash
deno test supabase/functions/analyze-menu/extract_test.ts
```
Expected: FAIL — `extractWithRetry` / `runPagedExtraction` not exported.

- [ ] **Step 3: Implement in `extract.ts`**

Add at the top of `extract.ts` (after the existing `postprocess.ts` import):

```ts
import { mergeItemSources } from "./merge.ts";
```

(`merge.ts` imports only a *type* from `extract.ts`, so the cycle is erased at compile time — no runtime circularity.)

Append at the end of `extract.ts`:

```ts
// One retry on transient model failures — the 120s timeout (nikkori tile,
// eval 031+033 validation) and finish_reason=length (verbosity is
// nondeterministic; a dense page occasionally overruns the completion cap,
// eval 043). Moved from the eval runner (2026-07-10) so production inherits
// the resilience the 3/3 gate was measured with.
export async function extractWithRetry(
  photos: string[],
  apiKey: string,
  detail?: "auto" | "high" | "low",
  extract = runExtraction,
): Promise<ExtractionResult> {
  try {
    return await extract(photos, apiKey, detail);
  } catch (error) {
    const message = String(error);
    if (
      !message.includes("timed out") &&
      !message.includes("finish_reason=length")
    ) throw error;
    console.log("[extract] transient model failure — retrying call once");
    return await extract(photos, apiKey, detail);
  }
}

// The iter-036 per-page recipe as the shared production path: 1 photo ⇒ one
// call (default detail, no merge); N photos ⇒ one high-detail call PER page
// (full completion budget each), in parallel, merged into ONE menu so
// downstream stages (enrichment, ranking) run once per scan, never per page.
// Multi-page detail is locked to "high" (gate-proven); the cheaper "auto"
// A/B is deferred to the post-release cost pass.
export async function runPagedExtraction(
  photos: string[],
  apiKey: string,
  extract = extractWithRetry,
): Promise<ExtractionResult> {
  if (photos.length === 1) return await extract(photos, apiKey);

  const results = await Promise.all(
    photos.map((photo) => extract([photo], apiKey, "high")),
  );
  return {
    items: mergeItemSources(results.map((r) => r.items)),
    image_quality: {
      usable: results.every((r) => r.image_quality.usable),
      issues: [...new Set(results.flatMap((r) => r.image_quality.issues))],
    },
    // First dense page wins so the dense flag survives for the auto-cutter
    // (critical-path #2) WITH its crop_direction (validateLayout forbids
    // dense:true + "none"). No dense page ⇒ page 1's layout.
    image_layout: results.find((r) => r.image_layout.dense)?.image_layout ??
      results[0].image_layout,
    raw_response: JSON.stringify(results.map((r) => r.raw_response)),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
deno test supabase/functions/analyze-menu/
```
Expected: all pass (the 5 new tests plus every pre-existing extract/enrich/postprocess/merge test).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/analyze-menu/extract.ts supabase/functions/analyze-menu/extract_test.ts
git commit -m "feat: shared extractWithRetry + runPagedExtraction (per-page multi-photo recipe)"
```

---

### Task 3: Wire the edge `stage:"extract"` handler

**Files:**
- Modify: `supabase/functions/analyze-menu/index.ts:8` (import) and `index.ts:241-251` (extract stage)

**Interfaces:**
- Consumes: `runPagedExtraction(photos, OPENAI_API_KEY)` from Task 2.
- Produces: unchanged HTTP response shape (`image_quality`, `image_layout`, `items`, `raw_response`, `latency_ms`, `model_id`) — the client (`src/lib/analyzeMenu.ts`) needs no change.

- [ ] **Step 1: Change the import**

`index.ts:8`:
```ts
import { runCropExtractions, runExtraction } from "./extract.ts";
```
becomes:
```ts
import { runCropExtractions, runPagedExtraction } from "./extract.ts";
```
(`runExtraction` has no other use in `index.ts` — verify with a quick grep before removing.)

- [ ] **Step 2: Route the extract stage through the paged orchestrator**

In the `stage === "extract"` block (`index.ts:241-251`), change:
```ts
      const result = await runExtraction(photos, OPENAI_API_KEY);
```
to:
```ts
      // Per-page multi-photo recipe (iter-036): N photos ⇒ N parallel calls
      // merged into ONE menu; 1 photo ⇒ one call. Same path the eval gate proves.
      const result = await runPagedExtraction(photos, OPENAI_API_KEY);
```
The response construction below it stays byte-identical.

- [ ] **Step 3: Typecheck**

```bash
deno check supabase/functions/analyze-menu/index.ts
```
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/analyze-menu/index.ts
git commit -m "feat: edge stage:extract runs per-page multi-photo extraction"
```

---

### Task 4: Eval runner delegates to the shared function

**Files:**
- Modify: `scripts/eval-027-live.ts` (imports, delete local `extractWithRetry` lines 80–99, collapse `extractMenu`'s single/multi branches lines 101–129)

**Interfaces:**
- Consumes: `extractWithRetry`, `runPagedExtraction`, `ExtractedMenuItem` from `../supabase/functions/analyze-menu/extract.ts`; `mergeItemSources` from `../supabase/functions/analyze-menu/merge.ts`.
- Produces: identical eval behavior — this is the "no duplicated per-page logic" success criterion. `DENSE_TILES` branch logic unchanged (only its helpers' import homes change).

- [ ] **Step 1: Rewrite imports and `extractMenu`**

Replace lines 19–20:
```ts
import { runExtraction } from "../supabase/functions/analyze-menu/extract.ts";
import { mergeItemSources } from "../src/lib/adaptiveExtraction.ts";
```
with:
```ts
import {
  extractWithRetry,
  runPagedExtraction,
} from "../supabase/functions/analyze-menu/extract.ts";
import { mergeItemSources } from "../supabase/functions/analyze-menu/merge.ts";
```

Replace line 28:
```ts
import type { ExtractedItem } from "../src/types/scan.ts";
```
with:
```ts
import type { ExtractedMenuItem } from "../supabase/functions/analyze-menu/extract.ts";
```
(fold it into the import block above if preferred — one import statement, type + values).

Delete the local `extractWithRetry` (lines 80–99, including its comment block — the comment moved into `extract.ts` in Task 2).

Replace `extractMenu` (lines 101–129) with:

```ts
async function extractMenu(fixture: Fixture): Promise<Actual> {
  const tiles = DENSE_TILES[fixture.menu];
  if (tiles) {
    const sources: ExtractedMenuItem[][] = [];
    let quality: Actual["image_quality"] | undefined;
    for (const tile of tiles) {
      const result = await extractWithRetry(
        [await photoData(tile)],
        apiKey,
        "high",
      );
      quality ??= result.image_quality;
      sources.push(result.items.filter((item) => item.category !== "drink"));
    }
    return { image_quality: quality!, items: mergeItemSources(sources) };
  }
  // Single- AND multi-page menus now run the exact shared production path the
  // edge handler uses (iter-036 per-page recipe lives in runPagedExtraction),
  // so the gate proves the real code.
  const photos = await Promise.all(fixture.photos.map(photoData));
  const result = await runPagedExtraction(photos, apiKey);
  return { image_quality: result.image_quality, items: result.items };
}
```

Also update the header comment's "Routing" block (lines 6–9) to say non-dense menus route through the shared `runPagedExtraction` (single page = one production-faithful call; multi-page = one high-detail call per page, merged).

- [ ] **Step 2: Typecheck**

```bash
deno check scripts/eval-027-live.ts
```
Expected: clean. (`Actual["items"]` is `ExtractedItem[]` from the scorer — structurally identical to `ExtractedMenuItem[]`, so the assignment typechecks.)

- [ ] **Step 3: Cheap live smoke — the one multi-page menu, single run**

```bash
OPENAI_API_KEY=<key> EVAL_RUNS=1 EVAL_MENUS=brasero-two \
  deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-027-live.ts
```
Expected: `GATE PASS` for brasero-two on all 5 dims (items in-band, Taco Loiro's "A elegir" option present in the breakdown). Cost ≈ $0.06 (2 pages). This validates the parallel-merge path live before spending on the full gate.

- [ ] **Step 4: Commit**

```bash
git add scripts/eval-027-live.ts
git commit -m "refactor: eval runner delegates single/multi-page extraction to runPagedExtraction"
```

---

### Task 5: Full 3/3 live gate + ledger

**Files:**
- Modify: `docs/superpowers/extraction-iteration-ledger.md` (worktree — append entry, newest last)
- Modify: `docs/superpowers/extraction-eval-log.md` (worktree — append run results)

- [ ] **Step 1: Run the full exit gate**

```bash
OPENAI_API_KEY=<key> \
  deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-027-live.ts
```
Expected: `3/3 consecutive all-menu passing runs`, all five dims (`items, options, section_context, categories, grams`) PASS on all 6 menus in every run. Cost ≈ $0.90.

If a run fails: this refactor must be behavior-preserving, so a failed dim means the wiring changed behavior (or hit known nondeterminism — check the failing menu's `.eval027-r<N>.actual.json` dump against the nondeterminism catalogue in the Feature 3 plan before touching code). Fix, then restart the 3-run count from zero.

- [ ] **Step 2: Log to the ledger and eval log (newest last)**

Append to `docs/superpowers/extraction-iteration-ledger.md` a new iteration entry (next number after the current max) recording: per-page recipe moved into `runPagedExtraction` (shared by edge handler + eval runner), `extractWithRetry` now production, `mergeItemSources` relocated to `analyze-menu/merge.ts`, multi-page detail **locked to `high`** (auto A/B deferred to post-release cost pass — user 2026-07-10), unified single-menu output guarantee, and the 3/3 gate result. Append the run outcomes to `docs/superpowers/extraction-eval-log.md` in its existing format.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/extraction-iteration-ledger.md docs/superpowers/extraction-eval-log.md
git commit -m "docs: ledger + eval log for per-page production wiring (3/3 gate)"
```

---

### Task 6: Diagram discipline + roadmap sync

**Files:**
- Modify: `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app/docs/superpowers/diagrams/menu-extraction-pipeline.md` (primary folder (`feat/selectable-options`) — where prior features' diagram edits live, currently uncommitted like theirs)
- Modify: `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app/docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md` (primary folder (`feat/selectable-options`) — tick critical-path #1)
- Copy to: `~/Downloads/menu-extraction-pipeline.md`

- [ ] **Step 1: Update the sequence diagram**

In the primary folder (`feat/selectable-options`)'s `menu-extraction-pipeline.md`: update the Stage-1 extract flow to show `stage:"extract"` → `runPagedExtraction` (1 photo ⇒ 1 call; N photos ⇒ N parallel `detail:"high"` calls → `mergeItemSources` → ONE unified menu), note `extractWithRetry` (one retry on timeout/length) now wraps every production call, note `mergeItemSources`' new home (`analyze-menu/merge.ts`), and flip the "production wiring" status flag to 🟢 in the status legend/table. P1/P2 prompt appendix is untouched (no prompt change).

- [ ] **Step 2: Re-copy to Downloads**

```bash
cp /Users/santiagoaguirre/Desktop/CODING/menu-scan-app/docs/superpowers/diagrams/menu-extraction-pipeline.md ~/Downloads/menu-extraction-pipeline.md
```

- [ ] **Step 3: Tick the roadmap**

In the primary folder (`feat/selectable-options`)'s roadmap, "Release scope decision" → "Pre-release critical path" item 1, mark it done:
`1. **Production wiring of the per-page multi-photo recipe** ✅ DONE 2026-07-10 — shared `runPagedExtraction` in extract.ts, edge + eval both call it; multi-page detail locked to "high" (auto A/B deferred to cost pass); see the worktree plan/spec.`

- [ ] **Step 4: Verify nothing else drifted, report**

```bash
cd /private/tmp/menu-scan-app-extraction-eval-harness && git status --short
cd /Users/santiagoaguirre/Desktop/CODING/menu-scan-app && git status --short
```
Expected: worktree clean (all commits made); primary folder (`feat/selectable-options`) shows only the diagram + roadmap edits (left uncommitted, matching how prior features' doc edits are staged there — the user batches doc commits in the primary folder (`feat/selectable-options`)).

Main-checkout doc edits are NOT committed by this plan (precedent: F1–F4 diagram/roadmap edits sit uncommitted on `feat/selectable-options`). Mention this in the final report.
