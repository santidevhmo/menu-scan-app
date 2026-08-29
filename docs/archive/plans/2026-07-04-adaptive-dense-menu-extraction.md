# Adaptive Dense-Menu Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically detect dense menu photos, retry them as separately processed overlapping crops, and merge complete results for scans of up to 10 photos.

**Architecture:** Each photo receives a normal full-image extraction that also reports density and crop direction. Dense photos are cropped on-device from original pixels with Expo Image Manipulator, each crop is extracted in its own GPT-4o call, and pure TypeScript merge logic reconciles overlaps. A Nikkori benchmark freezes two or three crops before the production orchestration constant is committed.

**Tech Stack:** Expo SDK 56, TypeScript, Expo Image Manipulator, Supabase Edge Functions (Deno), GPT-4o Vision, Deno tests, fixture-driven live evaluation.

---

## Global Constraints

- Work in `/private/tmp/menu-scan-app-extraction-eval-harness` on branch `feat/extraction-eval-harness`.
- Run every shell command through `rtk`.
- Do not add dependencies.
- Keep original menu photos local; upload only compressed full images or compressed crops.
- Maximum 10 selected photos.
- At most two photos process concurrently.
- Do not accept `finish_reason !== "stop"`.
- Do not silently fall back to incomplete full-image items after a dense retry fails.
- Preserve the current GPT-4o model decision.
- Every behavior change follows red-green-refactor.

## File Structure

- Create `src/lib/adaptiveExtraction.ts` — pure crop planning, layout validation, bounded batching, and deterministic item merging.
- Create `src/lib/adaptiveExtraction_test.ts` — Deno tests for all pure adaptive behavior.
- Modify `src/lib/compressImage.ts` — crop from original pixels, then resize/compress in one image-manipulation context.
- Modify `src/lib/analyzeMenu.ts` — per-photo extraction, automatic dense retry, two-at-a-time processing, and final page merge.
- Modify `src/types/scan.ts` — align extraction item types with the Edge Function and add layout/result contracts.
- Modify `src/app/(tabs)/index.tsx` — retain original camera photo instead of precompressing it; enforce the 10-photo cap.
- Modify `src/components/scan/GalleryButton.tsx` — retain original gallery photos and cap imports at 10.
- Modify `src/store/scan.store.ts` — enforce the cap defensively.
- Modify `supabase/functions/analyze-menu/extract.ts` — return layout metadata and reject truncated model output.
- Modify `supabase/functions/analyze-menu/extract_test.ts` — test layout schema and truncation behavior.
- Modify `supabase/functions/analyze-menu/index.ts` — add `extract-crops`, with one GPT call per crop.
- Create `scripts/eval-adaptive-crops.ts` — score saved crop outputs against Nikkori’s printed roll inventory.
- Create `scripts/fixtures/nikkori-food-names.json` — printed 42-roll and 6-dessert name oracle.
- Modify `scripts/run-elmarcos.ts` — retain the diagnostic image override/output label interface.
- Modify `scripts/eval-extraction.ts` — report expected-name misses and duplicates so count-only false passes cannot close Feature 1.
- Modify `docs/superpowers/extraction-iteration-ledger.md` and `docs/superpowers/extraction-eval-log.md` — record benchmark and final 3/3 evidence.

---

### Task 1: Add layout metadata and reject truncated extraction responses

**Files:**
- Modify: `supabase/functions/analyze-menu/extract.ts`
- Modify: `supabase/functions/analyze-menu/extract_test.ts`
- Modify: `src/types/scan.ts`

- [ ] **Step 1: Write failing Edge tests**

Replace the existing assertions import and add these tests:

```ts
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";

Deno.test("extraction schema requires image_layout", () => {
  const schema = EXTRACT_SCHEMA as {
    required: string[];
    properties: {
      image_layout: {
        required: string[];
        properties: {
          dense: { type: string };
          crop_direction: { enum: string[] };
        };
      };
    };
  };

  assertEquals(schema.required, ["image_quality", "image_layout", "items"]);
  assertEquals(schema.properties.image_layout.required, [
    "dense",
    "crop_direction",
  ]);
  assertEquals(schema.properties.image_layout.properties.dense.type, "boolean");
  assertEquals(
    schema.properties.image_layout.properties.crop_direction.enum,
    ["none", "left_right", "top_bottom"],
  );
});

Deno.test("runExtraction rejects truncated model output before JSON parsing", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({
      choices: [{
        finish_reason: "length",
        message: { content: '{"image_quality":' },
      }],
    })))) as typeof fetch;

  try {
    await assertRejects(
      () => runExtraction(["photo"], "test-key"),
      Error,
      "OpenAI extraction stopped with finish_reason=length",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
```

Update the existing successful mock JSON to include:

```json
"image_layout":{"dense":false,"crop_direction":"none"}
```

Also add the same `image_layout` object to that test's expected result.

- [ ] **Step 2: Run tests and verify red**

Run:

```bash
rtk proxy deno test --allow-env --allow-net supabase/functions/analyze-menu/extract_test.ts
```

Expected: FAIL because `image_layout` is absent from the schema and truncated output reaches `JSON.parse`.

- [ ] **Step 3: Implement the layout contract**

In `extract.ts`, add:

```ts
export type CropDirection = "none" | "left_right" | "top_bottom";

export interface ImageLayout {
  dense: boolean;
  crop_direction: CropDirection;
}
```

Add this prompt paragraph:

```ts
Assess the visible menu layout. Set image_layout.dense=true only when small text,
many tightly packed items, or a crowded multi-group layout risks incomplete
extraction from the full image. For side-by-side content use crop_direction
"left_right"; for vertically stacked content use "top_bottom". For a normal
menu set dense=false and crop_direction="none".
```

Add `image_layout` to `EXTRACT_SCHEMA.properties`:

```ts
image_layout: {
  type: "object",
  properties: {
    dense: { type: "boolean" },
    crop_direction: {
      type: "string",
      enum: ["none", "left_right", "top_bottom"],
    },
  },
  required: ["dense", "crop_direction"],
  additionalProperties: false,
},
```

Change the root required fields to:

```ts
required: ["image_quality", "image_layout", "items"],
```

Add `image_layout: ImageLayout` to `ExtractionResult`. Before parsing:

```ts
const choice = json.choices?.[0];
if (!choice) throw new Error("OpenAI returned no extraction choice");
if (choice.finish_reason !== "stop") {
  throw new Error(
    `OpenAI extraction stopped with finish_reason=${choice.finish_reason}`,
  );
}
const text = choice.message.content;
if (!text) throw new Error("OpenAI returned no extraction content");
```

In `src/types/scan.ts`, align extraction types:

```ts
export type MenuCategory = "food" | "side" | "dessert" | "drink" | "other";
export type CropDirection = "none" | "left_right" | "top_bottom";

export interface ImageLayout {
  dense: boolean;
  crop_direction: CropDirection;
}

export interface ExtractedItem {
  name: string;
  description: string;
  price: number | null;
  category: MenuCategory;
  section_title: string | null;
  options: { name: string; price: number | null; grams: number | null }[];
}
```

Add `image_layout: ImageLayout | null` to the client `ExtractionResult`.

- [ ] **Step 4: Verify green**

Run:

```bash
rtk proxy deno test --allow-env --allow-net supabase/functions/analyze-menu/extract_test.ts
rtk tsc --noEmit
```

Expected: all extraction tests pass and TypeScript reports no errors.

- [ ] **Step 5: Commit**

```bash
rtk git add supabase/functions/analyze-menu/extract.ts supabase/functions/analyze-menu/extract_test.ts src/types/scan.ts
rtk git commit -m "feat(extract): report dense-menu crop direction"
```

---

### Task 2: Add tested crop planning and photo limits

**Files:**
- Create: `src/lib/adaptiveExtraction.ts`
- Create: `src/lib/adaptiveExtraction_test.ts`

- [ ] **Step 1: Write failing crop-plan tests**

Create `adaptiveExtraction_test.ts`:

```ts
import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  cropRects,
  limitPhotos,
  validateLayout,
} from "./adaptiveExtraction.ts";

Deno.test("two left-right crops overlap by 20 percent", () => {
  assertEquals(cropRects(1000, 800, "left_right", 2), [
    { originX: 0, originY: 0, width: 600, height: 800 },
    { originX: 400, originY: 0, width: 600, height: 800 },
  ]);
});

Deno.test("two top-bottom crops overlap by 20 percent", () => {
  assertEquals(cropRects(800, 1000, "top_bottom", 2), [
    { originX: 0, originY: 0, width: 800, height: 600 },
    { originX: 0, originY: 400, width: 800, height: 600 },
  ]);
});

Deno.test("three crops use 45 percent regions", () => {
  assertEquals(cropRects(1000, 800, "left_right", 3), [
    { originX: 0, originY: 0, width: 450, height: 800 },
    { originX: 275, originY: 0, width: 450, height: 800 },
    { originX: 550, originY: 0, width: 450, height: 800 },
  ]);
});

Deno.test("dense layout requires a crop direction", () => {
  assertThrows(
    () => validateLayout({ dense: true, crop_direction: "none" }),
    Error,
    "Dense image is missing a crop direction",
  );
});

Deno.test("photo list is capped at ten", () => {
  assertEquals(limitPhotos(Array.from({ length: 12 }, (_, id) => id)).length, 10);
});
```

- [ ] **Step 2: Run tests and verify red**

```bash
rtk proxy deno test src/lib/adaptiveExtraction_test.ts
```

Expected: FAIL because `adaptiveExtraction.ts` does not exist.

- [ ] **Step 3: Implement minimal pure helpers**

Create `adaptiveExtraction.ts`:

```ts
import type {
  CropDirection,
  ImageLayout,
} from "../types/scan.ts";

export const MAX_SCAN_PHOTOS = 10;
export type CropCount = 2 | 3;
export const DENSE_CROP_COUNT: CropCount = 2;

export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export function validateLayout(layout: ImageLayout): void {
  if (layout.dense && layout.crop_direction === "none") {
    throw new Error("Dense image is missing a crop direction");
  }
  if (!layout.dense && layout.crop_direction !== "none") {
    throw new Error("Normal image must not request cropping");
  }
}

export function cropRects(
  width: number,
  height: number,
  direction: Exclude<CropDirection, "none">,
  count: CropCount,
): CropRect[] {
  const sizeRatio = count === 2 ? 0.6 : 0.45;
  const offsets = count === 2 ? [0, 0.4] : [0, 0.275, 0.55];
  const total = direction === "left_right" ? width : height;
  const size = Math.round(total * sizeRatio);

  return offsets.map((offset) => {
    const origin = Math.round(total * offset);
    const boundedSize = Math.min(size, total - origin);
    return direction === "left_right"
      ? { originX: origin, originY: 0, width: boundedSize, height }
      : { originX: 0, originY: origin, width, height: boundedSize };
  });
}

export function limitPhotos<T>(photos: T[]): T[] {
  return photos.slice(0, MAX_SCAN_PHOTOS);
}
```

- [ ] **Step 4: Verify green**

```bash
rtk proxy deno test src/lib/adaptiveExtraction_test.ts
rtk tsc --noEmit
```

Expected: all crop-plan tests pass.

- [ ] **Step 5: Commit**

```bash
rtk git add src/lib/adaptiveExtraction.ts src/lib/adaptiveExtraction_test.ts
rtk git commit -m "feat(scan): add dense-menu crop planning"
```

---

### Task 3: Add deterministic cross-source merging

**Files:**
- Modify: `src/lib/adaptiveExtraction.ts`
- Modify: `src/lib/adaptiveExtraction_test.ts`

- [ ] **Step 1: Write failing merge tests**

Add tests using this item helper:

```ts
import type { ExtractedItem } from "../types/scan.ts";
import { mergeItemSources } from "./adaptiveExtraction.ts";

const item = (
  name: string,
  price: number | null,
  description = "",
): ExtractedItem => ({
  name,
  description,
  price,
  category: "food",
  section_title: "Rollos",
  options: [],
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
    mergeItemSources([[item("Revueltos", 78), item("Revueltos", 84)]]).length,
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

- [ ] **Step 2: Run and verify red**

```bash
rtk proxy deno test src/lib/adaptiveExtraction_test.ts
```

Expected: FAIL because `mergeItemSources` is undefined.

- [ ] **Step 3: Implement the conservative merger**

Add to `adaptiveExtraction.ts`:

```ts
import type { ExtractedItem } from "../types/scan.ts";

function normalize(value: string): string {
  return value.normalize("NFD")
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

function duplicate(a: ExtractedItem, b: ExtractedItem): boolean {
  const left = normalize(a.name);
  const right = normalize(b.name);
  const compatiblePrice = a.price === b.price || a.price === null || b.price === null;
  if (left === right) return compatiblePrice;
  if (
    a.price === null ||
    b.price === null ||
    a.price !== b.price ||
    a.category !== b.category ||
    normalize(a.section_title ?? "") !== normalize(b.section_title ?? "")
  ) return false;
  return editDistance(left, right) <= Math.max(1, Math.floor(Math.max(left.length, right.length) * 0.2));
}

function mergeOptions(
  first: ExtractedItem["options"],
  second: ExtractedItem["options"],
): ExtractedItem["options"] {
  return [...first, ...second].filter((option, index, all) =>
    all.findIndex((candidate) =>
      normalize(candidate.name) === normalize(option.name) &&
      candidate.price === option.price
    ) === index
  );
}

function richer(a: ExtractedItem, b: ExtractedItem): ExtractedItem {
  const best = b.description.length + b.options.length > a.description.length + a.options.length ? b : a;
  return { ...best, options: mergeOptions(a.options, b.options) };
}

export function mergeItemSources(sources: ExtractedItem[][]): ExtractedItem[] {
  const sectionTitles = new Set(
    sources.flat().flatMap((entry) =>
      entry.section_title ? [normalize(entry.section_title)] : []
    ),
  );
  const kept: { item: ExtractedItem; sources: Set<number> }[] = [];

  sources.forEach((source, sourceIndex) => {
    for (const entry of source) {
      if (
        entry.price === null &&
        entry.description.trim() === "" &&
        entry.options.length === 0 &&
        sectionTitles.has(normalize(entry.name))
      ) continue;

      const match = kept.find((candidate) =>
        !candidate.sources.has(sourceIndex) && duplicate(candidate.item, entry)
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

- [ ] **Step 4: Verify green**

```bash
rtk proxy deno test src/lib/adaptiveExtraction_test.ts
rtk tsc --noEmit
```

Expected: all merge tests pass.

- [ ] **Step 5: Commit**

```bash
rtk git add src/lib/adaptiveExtraction.ts src/lib/adaptiveExtraction_test.ts
rtk git commit -m "feat(scan): merge overlapping extraction results"
```

---

### Task 4: Preserve originals and crop before compression

**Files:**
- Modify: `src/lib/compressImage.ts`
- Modify: `src/app/(tabs)/index.tsx`
- Modify: `src/components/scan/GalleryButton.tsx`
- Modify: `src/store/scan.store.ts`

- [ ] **Step 1: Extend image preparation**

Replace `compressImage` internals with a shared crop-aware function:

```ts
import type { CropRect } from "./adaptiveExtraction";

export async function prepareImage(
  uri: string,
  sourceWidth: number,
  sourceHeight: number,
  crop?: CropRect,
): Promise<CompressedImage> {
  const context = ImageManipulator.manipulate(uri);
  if (crop) context.crop(crop);

  const width = crop?.width ?? sourceWidth;
  const height = crop?.height ?? sourceHeight;
  const longest = Math.max(width, height);
  if (longest > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / longest;
    context.resize({
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    });
  }

  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    compress: QUALITY,
    format: SaveFormat.JPEG,
  });
  return { uri: result.uri, width: result.width, height: result.height };
}

export function compressImage(
  uri: string,
  sourceWidth: number,
  sourceHeight: number,
): Promise<CompressedImage> {
  return prepareImage(uri, sourceWidth, sourceHeight);
}
```

- [ ] **Step 2: Preserve original capture and gallery assets**

In the camera screen, remove the `compressImage` call and store:

```ts
addPhoto({
  id: randomId(),
  uri: photo.uri,
  width: photo.width,
  height: photo.height,
  source: "camera",
});
```

Guard capture and shutter state with:

```ts
if (!cameraRef.current || capturing || photos.length >= MAX_SCAN_PHOTOS) return;
```

and:

```tsx
<ShutterButton
  onPress={capture}
  disabled={capturing || photos.length >= MAX_SCAN_PHOTOS}
/>
```

In `GalleryButton`, read current photos and only add remaining assets:

```ts
const photos = useScanStore((state) => state.photos);
const remaining = MAX_SCAN_PHOTOS - photos.length;
if (remaining <= 0) return;

for (const asset of result.assets.slice(0, remaining)) {
  addPhoto({
    id: randomId(),
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    source: "gallery",
  });
}
```

Remove now-unused `compressImage` imports.

In the store:

```ts
addPhoto: (photo) =>
  set((state) =>
    state.photos.length >= MAX_SCAN_PHOTOS
      ? state
      : { photos: [...state.photos, photo] }
  ),
```

- [ ] **Step 3: Verify**

```bash
rtk tsc --noEmit
rtk lint
```

Expected: both pass.

Manual check: capture/import photos retain their original dimensions on the review screen; the eleventh photo is not added.

- [ ] **Step 4: Commit**

```bash
rtk git add src/lib/compressImage.ts src/app/'(tabs)'/index.tsx src/components/scan/GalleryButton.tsx src/store/scan.store.ts
rtk git commit -m "feat(scan): preserve originals for adaptive cropping"
```

---

### Task 5: Add separate crop extraction to the Edge Function

**Files:**
- Modify: `supabase/functions/analyze-menu/extract.ts`
- Modify: `supabase/functions/analyze-menu/extract_test.ts`
- Modify: `supabase/functions/analyze-menu/index.ts`

- [ ] **Step 1: Write failing separate-call test**

Add:

```ts
import { runCropExtractions } from "./extract.ts";

Deno.test("crop extraction invokes one model call per crop", async () => {
  const calls: string[][] = [];
  const regions = await runCropExtractions(
    ["left", "right"],
    "key",
    async (photos) => {
      calls.push(photos);
      return {
        image_quality: { usable: true, issues: [] },
        image_layout: { dense: false, crop_direction: "none" },
        items: [],
        raw_response: "{}",
      };
    },
  );
  assertEquals(calls, [["left"], ["right"]]);
  assertEquals(regions.length, 2);
});
```

- [ ] **Step 2: Verify red**

```bash
rtk proxy deno test --allow-env --allow-net supabase/functions/analyze-menu/extract_test.ts
```

Expected: FAIL because `runCropExtractions` is undefined.

- [ ] **Step 3: Implement and route crop extraction**

Add to `extract.ts`:

```ts
export async function runCropExtractions(
  photos: string[],
  apiKey: string,
  extract = runExtraction,
): Promise<ExtractionResult[]> {
  if (photos.length !== 2 && photos.length !== 3) {
    throw new Error("extract-crops requires 2 or 3 photos");
  }
  return await Promise.all(
    photos.map((photo) => extract([photo], apiKey)),
  );
}
```

In `index.ts`, accept `"extract-crops"` in stage validation. Before the normal
extract block:

```ts
if (stage === "extract-crops") {
  if (
    provider !== "gpt-vision" ||
    !Array.isArray(photos) ||
    (photos.length !== 2 && photos.length !== 3)
  ) {
    return badRequest("Invalid crop extraction request");
  }
  const regions = await runCropExtractions(photos, OPENAI_API_KEY);
  return new Response(
    JSON.stringify({
      regions: regions.map((region) => ({
        image_quality: region.image_quality,
        items: region.items,
      })),
      latency_ms: Date.now() - start,
      model_id: "gpt-4o",
    }),
    { headers: { ...CORS_HEADERS, "Content-Type": "application/json" } },
  );
}
```

- [ ] **Step 4: Verify green**

```bash
rtk proxy deno test --allow-env --allow-net supabase/functions/analyze-menu/extract_test.ts
rtk proxy deno check supabase/functions/analyze-menu/index.ts
```

Expected: tests and type-check pass.

- [ ] **Step 5: Commit**

```bash
rtk git add supabase/functions/analyze-menu/extract.ts supabase/functions/analyze-menu/extract_test.ts supabase/functions/analyze-menu/index.ts
rtk git commit -m "feat(extract): process dense-menu crops separately"
```

---

### Task 6: Benchmark compression and two versus three crops

**Files:**
- Create: `scripts/fixtures/nikkori-food-names.json`
- Create: `scripts/eval-adaptive-crops.ts`
- Modify: `scripts/run-elmarcos.ts`
- Modify: `docs/superpowers/extraction-iteration-ledger.md`

- [ ] **Step 1: Add the printed-name oracle**

Create an object containing the 42 roll names and six desserts:

```json
{
  "rolls": [
    "Salmón Roll", "Duplex", "Ipanema Roll", "Filadelfia", "Vegan Roll",
    "Spicy Tuna Roll", "Avocado", "Tuna Especial", "Nikkori Maki",
    "Salmón Samba", "Rainbow", "Boga", "Roca Roll", "Ko Ebi Roll",
    "Van Hallen", "Nevada", "Dinamita", "Kani Krunch", "Lomo Salteado",
    "Roiz", "Mangudo", "Pico Roll", "Unagui Masago", "Amazonas Top",
    "California", "Orange Roll", "Kurimi Roll", "Salmón Crunch",
    "Cosmo Roll", "Cosmo de Pollo", "Cosmo Camarón", "Maíz Roll",
    "Tricolor", "Nico", "Fire Dragon", "Spicy Salmón", "Salmón Especial",
    "Nikkori Dynamite", "Sama Roll", "Chipo", "Isla Roll", "Marco Roll"
  ],
  "desserts": [
    "Pastel de zanahoria", "Red velvet", "Banana Tempura",
    "Pastel chocolate alemán", "Cheesecake fresa", "Copa de nieve"
  ]
}
```

- [ ] **Step 2: Add a scorer**

Create `eval-adaptive-crops.ts`:

```ts
import { mergeItemSources } from "../src/lib/adaptiveExtraction.ts";
import type { ExtractedItem } from "../src/types/scan.ts";

const [label, ...paths] = Deno.args;
if (!label || paths.length === 0) {
  throw new Error("Usage: eval-adaptive-crops.ts <label> <actual.json>...");
}

const oracle = JSON.parse(
  await Deno.readTextFile(
    new URL("./fixtures/nikkori-food-names.json", import.meta.url),
  ),
) as { rolls: string[]; desserts: string[] };
const normalize = (value: string) =>
  value.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, " ").trim();
const sources = await Promise.all(paths.map(async (path) => {
  const value = JSON.parse(await Deno.readTextFile(path)) as {
    items: ExtractedItem[];
  };
  return value.items.filter((item) => item.category !== "drink");
}));
const items = mergeItemSources(sources);
const expected = oracle.rolls;
const actualNames = items.map((item) => normalize(item.name));
const expectedNames = expected.map(normalize);
const missing = expected.filter((_, index) =>
  !actualNames.includes(expectedNames[index])
);
const extras = items
  .filter((item) => !expectedNames.includes(normalize(item.name)))
  .map((item) => item.name);
const duplicates = actualNames.filter((name, index) =>
  actualNames.indexOf(name) !== index
);

console.log(JSON.stringify({
  label,
  expected: expected.length,
  actual: items.length,
  missing,
  extras,
  duplicates: [...new Set(duplicates)],
}, null, 2));
if (missing.length > 0 || duplicates.length > 0) Deno.exitCode = 1;
```

Its CLI is:

```bash
rtk proxy deno run --allow-read scripts/eval-adaptive-crops.ts \
  <label> <actual.json> [<actual.json> ...]
```

The script must exit non-zero when expected names are missing or normalized
duplicates remain.

- [ ] **Step 3: Generate the benchmark images**

Use `ffmpeg` for geometry and `sips` for the production-like 1024px/JPEG 70
variants. Generate:

- full compressed;
- two uncompressed crops;
- two compressed crops;
- three uncompressed crops;
- three compressed crops.

Use the exact two-crop geometry from Task 2. For three left/right crops use
width 538 and origins 0, 329, and 658 for the 1196px Nikkori source.

- [ ] **Step 4: Run the matrix**

Load `.env.local`, run every image through `scripts/run-elmarcos.ts` with a
unique label, then score:

```bash
rtk proxy deno run --allow-read scripts/eval-adaptive-crops.ts two-raw \
  /Users/santiagoaguirre/Downloads/MenusTesting/nikkori.two-raw-1.actual.json \
  /Users/santiagoaguirre/Downloads/MenusTesting/nikkori.two-raw-2.actual.json
```

Repeat for `two-compressed`, `three-raw`, and `three-compressed`. Record full
compressed separately.

Expected: a five-row comparison containing recall, misses, extras, duplicates,
latency, and call count.

- [ ] **Step 5: Freeze the crop count**

Keep `DENSE_CROP_COUNT = 2` unless three compressed crops:

1. recover more exact expected names in at least two of three repeated runs;
2. do not increase unresolved duplicates;
3. do not truncate;
4. justify the additional `$0.03` per dense photo.

If all four hold, change `DENSE_CROP_COUNT` in
`src/lib/adaptiveExtraction.ts` to `3`; otherwise leave its tested default at
`2`. Record the decision and raw results in the iteration ledger.

- [ ] **Step 6: Commit**

```bash
rtk git add scripts/fixtures/nikkori-food-names.json scripts/eval-adaptive-crops.ts scripts/run-elmarcos.ts docs/superpowers/extraction-iteration-ledger.md
rtk git commit -m "test(extract): benchmark compressed dense-menu crops"
```

---

### Task 6B: Benchmark four overlapping 2×2 compressed crops

**Status:** Completed 2026-07-05 — rejected 0/3 runs. Exact roll recall was
32/42, 33/42, and 32/42; Tasks 7–9 remain on hold.

**Files:**
- Modify: `docs/superpowers/extraction-iteration-ledger.md`

- [ ] **Step 1: Generate four crops from original pixels**

For the 1196×1896 Nikkori source, create 718×1138 crops at X origins `0/478`
and Y origins `0/758`, then compress each crop to a maximum 1024px edge and
JPEG quality 70:

```bash
MENU="$HOME/Downloads/MenusTesting"

rtk proxy ffmpeg -loglevel error -y -i "$MENU/NikkoriMenu.png" -vf "crop=718:1138:0:0" "$MENU/NikkoriMenu.grid-raw-1.png"
rtk proxy ffmpeg -loglevel error -y -i "$MENU/NikkoriMenu.png" -vf "crop=718:1138:478:0" "$MENU/NikkoriMenu.grid-raw-2.png"
rtk proxy ffmpeg -loglevel error -y -i "$MENU/NikkoriMenu.png" -vf "crop=718:1138:0:758" "$MENU/NikkoriMenu.grid-raw-3.png"
rtk proxy ffmpeg -loglevel error -y -i "$MENU/NikkoriMenu.png" -vf "crop=718:1138:478:758" "$MENU/NikkoriMenu.grid-raw-4.png"

for crop in 1 2 3 4; do
  rtk proxy sips -Z 1024 -s format jpeg -s formatOptions 70 \
    "$MENU/NikkoriMenu.grid-raw-${crop}.png" \
    --out "$MENU/NikkoriMenu.grid-compressed-${crop}.jpg"
done
```

Expected: four 718×1138 raw crops and four production-compressed JPEG crops.

- [ ] **Step 2: Run three repeated compressed-grid extractions**

Load the existing API key without printing it, then run each crop through one
separate GPT-4o extraction call:

```bash
set -a
source .env.local
set +a

for run in 1 2 3; do
  for crop in 1 2 3 4; do
    label="grid-compressed-r${run}-${crop}"
    rtk proxy deno run --allow-read --allow-write --allow-env --allow-net \
      scripts/run-elmarcos.ts nikkori \
      "NikkoriMenu.grid-compressed-${crop}.jpg" "$label"
  done
done
```

Expected: 12 successful calls and 12
`nikkori.grid-compressed-r<run>-<crop>.actual.json` files. Any timeout or
non-`stop` finish reason fails that run.

- [ ] **Step 3: Score all three runs**

```bash
MENU="$HOME/Downloads/MenusTesting"

for run in 1 2 3; do
  rtk proxy deno run --allow-read scripts/eval-adaptive-crops.ts \
    "grid-compressed-r${run}" \
    "$MENU/nikkori.grid-compressed-r${run}-1.actual.json" \
    "$MENU/nikkori.grid-compressed-r${run}-2.actual.json" \
    "$MENU/nikkori.grid-compressed-r${run}-3.actual.json" \
    "$MENU/nikkori.grid-compressed-r${run}-4.actual.json"
done
```

Expected for a passing run:

```json
{
  "expected": 42,
  "missing": [],
  "duplicates": []
}
```

Extras remain diagnostic and do not fail this roll-only benchmark.

- [ ] **Step 4: Apply the acceptance gate**

Accept the 2×2 candidate only when at least two of three runs:

1. recover all 42 exact expected roll names;
2. contain zero unresolved normalized duplicates;
3. complete all four calls without timeout or truncation.

If fewer than two runs pass, stop this plan and do not implement Task 7.
If the candidate passes, record recall, misses, extras, duplicates, summed
latency, call count, and `$0.36` benchmark cost in the iteration ledger.

- [ ] **Step 5: Commit the evidence**

```bash
rtk git add docs/superpowers/extraction-iteration-ledger.md
rtk git commit -m "test(extract): benchmark compressed 2x2 crops"
```

---

> **Execution hold:** Tasks 7–9 below describe the rejected full-image
> detector plus two/three full-height crops. Do not execute them unchanged.
> Even if Task 6B passes, first revise the production orchestration design and
> these tasks because Nikkori's full compressed extraction timed out before
> returning `image_layout`.

### Task 7: Wire automatic per-photo dense retries

**Files:**
- Modify: `src/lib/analyzeMenu.ts`
- Modify: `src/lib/adaptiveExtraction.ts`
- Modify: `src/lib/adaptiveExtraction_test.ts`

- [ ] **Step 1: Test two-at-a-time batching**

Add:

```ts
import { mapInBatches } from "./adaptiveExtraction.ts";

Deno.test("processes at most two photos at once and preserves order", async () => {
  let active = 0;
  let peak = 0;
  const result = await mapInBatches([1, 2, 3, 4, 5], 2, async (value) => {
    active++;
    peak = Math.max(peak, active);
    await Promise.resolve();
    active--;
    return value * 2;
  });
  assertEquals(result, [2, 4, 6, 8, 10]);
  assertEquals(peak, 2);
});
```

- [ ] **Step 2: Verify red**

```bash
rtk proxy deno test src/lib/adaptiveExtraction_test.ts
```

Expected: FAIL because `mapInBatches` is undefined.

- [ ] **Step 3: Implement batching**

```ts
export async function mapInBatches<T, R>(
  values: T[],
  size: number,
  worker: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
  const result: R[] = [];
  for (let start = 0; start < values.length; start += size) {
    const batch = values.slice(start, start + size);
    result.push(...await Promise.all(
      batch.map((value, offset) => worker(value, start + offset)),
    ));
  }
  return result;
}
```

- [ ] **Step 4: Refactor `extractMenu`**

Add private helpers in `analyzeMenu.ts`:

```ts
async function imageBase64(uri: string): Promise<string> {
  return FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

async function invokeExtractionStage(
  photos: string[],
  stage: "extract" | "extract-crops",
) {
  const response = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { photos, goals: [], provider: "gpt-vision", stage },
  });
  if (response.error) throw new Error(await getFunctionErrorMessage(response.error));
  return response.data;
}
```

Implement `extractPhoto`:

```ts
async function extractPhoto(photo: ScanPhoto): Promise<{
  items: ExtractedItem[];
  layout: ImageLayout;
  latency_ms: number;
}> {
  const full = await prepareImage(photo.uri, photo.width, photo.height);
  const first = await invokeExtractionStage(
    [await imageBase64(full.uri)],
    "extract",
  );
  validateLayout(first.image_layout);
  if (!first.image_layout.dense) {
    return {
      items: first.items,
      layout: first.image_layout,
      latency_ms: first.latency_ms,
    };
  }

  const direction = first.image_layout.crop_direction;
  if (direction === "none") {
    throw new Error("Dense image is missing a crop direction");
  }
  const rects = cropRects(
    photo.width,
    photo.height,
    direction,
    DENSE_CROP_COUNT,
  );
  const crops = await Promise.all(rects.map((rect) =>
    prepareImage(photo.uri, photo.width, photo.height, rect)
  ));
  const retry = await invokeExtractionStage(
    await Promise.all(crops.map((crop) => imageBase64(crop.uri))),
    "extract-crops",
  );
  if (
    !Array.isArray(retry.regions) ||
    retry.regions.length !== DENSE_CROP_COUNT ||
    retry.regions.some((region: { image_quality?: { usable?: boolean } }) =>
      region.image_quality?.usable !== true
    )
  ) throw new Error("Dense menu crop extraction failed");

  return {
    items: mergeItemSources(
      retry.regions.map((region: { items: ExtractedItem[] }) => region.items),
    ),
    layout: first.image_layout,
    latency_ms: first.latency_ms + retry.latency_ms,
  };
}
```

Replace the current combined-photo extraction with:

```ts
if (photos.length === 0 || photos.length > MAX_SCAN_PHOTOS) {
  return {
    provider,
    items: [],
    image_layout: null,
    latency_ms: 0,
    model_id: provider,
    error: "Select between 1 and 10 menu photos",
  };
}

try {
  const pages = await mapInBatches(photos, 2, extractPhoto);
  return {
    provider,
    items: mergeItemSources(pages.map((page) => page.items)),
    image_layout: null,
    latency_ms: pages.reduce((sum, page) => sum + page.latency_ms, 0),
    model_id: "gpt-4o",
    error: null,
  };
} catch (error) {
  return {
    provider,
    items: [],
    image_layout: null,
    latency_ms: 0,
    model_id: provider,
    error: error instanceof Error ? error.message : "Menu extraction failed",
  };
}
```

Update every existing `ExtractionResult` construction with `image_layout`.

- [ ] **Step 5: Verify**

```bash
rtk proxy deno test src/lib/adaptiveExtraction_test.ts
rtk tsc --noEmit
rtk lint
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
rtk git add src/lib/analyzeMenu.ts src/lib/adaptiveExtraction.ts src/lib/adaptiveExtraction_test.ts
rtk git commit -m "feat(scan): retry dense photos with adaptive crops"
```

---

### Task 8: Strengthen the food gate and run final verification

**Files:**
- Modify: `scripts/eval-extraction.ts`
- Modify: `scripts/fixtures/nikkori.expected.json`
- Modify: `docs/superpowers/extraction-eval-log.md`
- Modify: `docs/superpowers/extraction-iteration-ledger.md`

- [ ] **Step 1: Add failing expected-name and duplicate self-checks**

Extend `ExpectedFixture` with optional `expected_food_names: string[]`, load the
Nikkori name oracle into its fixture, and assert:

```ts
assert(
  !scoreMenu(
    { ...fixture, expected_food_names: ["House Burger", "Fries"] },
    { ...actual, items: [actual.items[0], actual.items[0]] },
  ).items.pass,
  "matching count with a duplicate and missing expected name must fail",
);
```

- [ ] **Step 2: Verify red**

```bash
rtk proxy deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-extraction.ts --self-check
```

Expected: FAIL because count-only scoring accepts the structurally wrong result.

- [ ] **Step 3: Add structural scoring**

For food items, calculate:

```ts
const normalizedFoodNames = foodItems.map((item) => normalize(item.name));
const duplicateNames = [...new Set(
  normalizedFoodNames.filter((name, index) =>
    normalizedFoodNames.indexOf(name) !== index
  ),
)];
const missingExpectedNames = (fixture.expected_food_names ?? []).filter(
  (expected) => !normalizedFoodNames.includes(normalize(expected)),
);
```

Require no configured-name misses and no exact duplicates unless the duplicate
records have different non-null prices. Include misses and duplicates in the
detail string.

Add an `--adaptive` live path to the harness. It must:

1. generate a production-like 1024px/JPEG 70 full image with `sips`;
2. run the full extraction and validate `image_layout`;
3. for dense images, generate the selected two or three crops with `ffmpeg`,
   compress each crop with `sips`, and call `runCropExtractions`;
4. merge region items with `mergeItemSources`;
5. score the merged result;
6. delete only its own generated temporary images.

Keep the existing non-adaptive path unchanged for historical archive
re-scoring.

- [ ] **Step 4: Verify deterministic checks**

```bash
rtk proxy deno check scripts/eval-extraction.ts
rtk proxy deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-extraction.ts --self-check
rtk proxy deno test src/lib/adaptiveExtraction_test.ts
rtk proxy deno test --allow-env --allow-net supabase/functions/analyze-menu/extract_test.ts
rtk tsc --noEmit
rtk lint
```

Expected: all pass.

- [ ] **Step 5: Run the six-menu production-compression gate**

Run all six fixtures through the adaptive path using production compression:

```bash
rtk proxy deno run --allow-read --allow-write --allow-run --allow-env --allow-net scripts/eval-extraction.ts --adaptive --gate items
```

Reject any change that regresses a previously passing menu.

- [ ] **Step 6: Run the exit gate three consecutive times**

With no code changes between runs, execute the same adaptive command three
times.

Expected every time:

```text
GATE PASS: items on all 6 menus
```

Also require zero configured expected-name misses and zero unresolved
duplicates. Record per-menu food counts, name misses, duplicates, latency, and
crop decisions in both logs.

- [ ] **Step 7: Commit**

```bash
rtk git add scripts/eval-extraction.ts scripts/fixtures/nikkori.expected.json docs/superpowers/extraction-eval-log.md docs/superpowers/extraction-iteration-ledger.md
rtk git commit -m "feat(extract): pass adaptive food-item gate on all menus"
```

---

### Task 9: Close Feature 1 documentation

**Files:**
- Modify: `docs/superpowers/plans/2026-07-04-feature-1-extract-food-items.md`
- Modify: `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md`
- Modify: `docs/superpowers/specs/2026-07-04-adaptive-dense-menu-extraction-design.md`

- [ ] **Step 1: Record final evidence**

Document:

- selected crop count and benchmark reason;
- compressed versus uncompressed results;
- dense-layout decisions for all six menus;
- all rejected iterations 016–019;
- adaptive iteration 020 and production implementation results;
- final three consecutive gate runs;
- measured extraction call counts and costs.

- [ ] **Step 2: Close checklists**

Mark Feature 1 complete in its plan and the master roadmap only if Task 8 passed
all three runs with no name misses or unresolved duplicates.

- [ ] **Step 3: Record the Feature 2 frozen gate**

Keep:

```bash
deno run --allow-read --allow-write --allow-env --allow-net scripts/eval-extraction.ts --gate items,options
```

- [ ] **Step 4: Verify documentation**

```bash
rtk grep -n \"_tbd_\\|_fill_\\|Status: _in progress_\" \
  docs/superpowers/plans/2026-07-04-feature-1-extract-food-items.md \
  docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md
```

Expected: no Feature 1 placeholders remain.

- [ ] **Step 5: Commit**

```bash
rtk git add docs/superpowers/plans/2026-07-04-feature-1-extract-food-items.md docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md docs/superpowers/specs/2026-07-04-adaptive-dense-menu-extraction-design.md
rtk git commit -m "docs: close adaptive food-item extraction feature"
```

---

## Self-Review

- **Spec coverage:** Layout detection is Task 1; crop geometry and limits Task 2; merge Task 3; crop-before-compression Task 4; separate server calls Task 5; compression/two-versus-three benchmark Task 6; automatic per-photo orchestration Task 7; trustworthy structural and 3/3 live gates Task 8; durable handoff Task 9.
- **No new dependencies:** Production cropping uses installed Expo Image Manipulator. Benchmark tooling uses existing host commands only.
- **Type consistency:** `CropDirection`, `ImageLayout`, `ExtractedItem`, `CropCount`, `CropRect`, and `image_layout` use the same names in tests, Edge output, and client orchestration.
- **No unresolved implementation choice:** Task 6 defaults to two crops and changes to three only under four explicit empirical conditions.
- **Failure behavior:** Truncation, malformed layout, unusable crops, and page failures return no partial menu.
