# Adaptive Dense-Menu Extraction Design

**Date:** 2026-07-04  
**Status:** 2×2 benchmark rejected; production redesign required

## Goal

Reliably extract menu items from both ordinary and dense menu photos without
requiring users to understand image orientation, density, rows, columns, or
backend processing.

Users may submit up to 10 photos. They take or select menu photos, wait once,
and receive the resulting menu list.

## Evidence

The Nikkori fixture established the current failure mode:

- Full-page GPT-4o extraction returned 44 of 48 food items.
- Explicit high-detail mode over-extracted 181 entries.
- A food-only full-page prompt returned 37 of 48 food items.
- Two overlapping crops in one call exceeded the model output limit.
- A top crop returned 37 of 42 rolls.
- Separate overlapping left/right crop calls recovered all 42 rolls after
  merging two overlap duplicates.
- Full-height production-compressed crops did not preserve that result. Two
  crops recovered only 10–11 of 42 exact roll names across three runs.
- Three full-height crops truncated or timed out on the middle crop in every
  run.
- The production-compressed full image timed out after 120 seconds.
- Four production-compressed 2×2 crops completed reliably but recovered only
  32/42, 33/42, and 32/42 exact roll names across three runs.

The existing app already compresses every selected image to a maximum 1024px
side at JPEG quality 0.7. The evaluation harness has used original,
uncompressed fixtures, so its results may overstate production readability.
For example, Nikkori shrinks from 1196×1896 to approximately 646×1024 before
the current production request.

The crop direction must follow the content layout, not the photo orientation.
Nikkori is a portrait photo whose menu content is arranged in side-by-side
columns, so left/right crops were the successful split.

## Decisions

- Dense-menu retry is automatic and invisible to the user.
- Normal-photo call count remains unchanged while crop geometry is evaluated.
- Two- and three-crop full-height retries are rejected. Production orchestration
  must not be wired until the approved four-region 2×2 benchmark passes.
- The app, not the Edge Function, crops images with the already-installed
  `expo-image-manipulator`.
- Camera and gallery selection preserve the original local URI and dimensions
  until extraction finishes. Compression moves from capture/import time to
  extraction time so dense crops are created from the original pixels.
- No new image-processing dependency is introduced.
- Each selected photo is processed independently.
- At most two photos are processed concurrently.
- The scan limit is 10 photos.
- Any failed page fails the scan clearly; partial menus are not silently
  presented as complete.

## First-Pass Layout Contract

The extraction schema gains:

```ts
type ImageLayout = {
  dense: boolean;
  crop_direction: "none" | "left_right" | "top_bottom";
};
```

The model determines density from the visible menu content:

- `dense: false` means the full image is sufficiently readable in one pass.
- `dense: true` means small text or a crowded layout risks incomplete
  extraction.
- `left_right` means the menu is arranged primarily in side-by-side groups.
- `top_bottom` means the menu is arranged primarily in stacked groups.

The backend makes this decision during the existing full-image extraction. The
app does not ask users about orientation or density.

Invalid combinations, such as `dense: true` with `crop_direction: "none"`,
fail the page instead of guessing a crop direction.

## Data Flow

For each photo:

1. Keep the original local photo URI and dimensions from capture/import.
2. Compress the full photo with the existing 1024px/JPEG 0.7 policy.
3. Send one `stage: "extract"` request containing that photo.
4. If `dense` is false, accept the full-image items.
5. If `dense` is true:
   1. Crop the original local photo into the benchmark-selected number of
      overlapping regions.
   2. Compress each crop after cropping.
   3. Send the crops with `stage: "extract-crops"`.
   4. The Edge Function invokes GPT-4o once per crop.
   5. Return every region result to the client.
   6. Deterministically merge the region results.
   7. Discard the incomplete full-image items.
6. Merge the finalized photo result with prior photos in selection order.

Original photos remain local-only and are never uploaded uncompressed. The
review screen continues to display the local original. Generated compressed
files and crops use Expo's cache directory.

The server processes crop images separately so one dense crop cannot exhaust
another crop's output budget. The current route accepts two or three crops; it
must accept four only if the 2×2 benchmark passes.

## Crop Geometry

Cropping uses the original image dimensions and happens before compression.

For `left_right`:

- Left crop: `originX = 0`, `width = 60%` of the image.
- Right crop: `originX = 40%`, `width = 60%` of the image.
- Both use the full image height.

For `top_bottom`:

- Top crop: `originY = 0`, `height = 60%` of the image.
- Bottom crop: `originY = 40%`, `height = 60%` of the image.
- Both use the full image width.

This creates 20% overlap. Coordinates are rounded and clamped within the source
image.

The three-crop candidate uses regions covering 45% of the split dimension with
origins at 0%, 27.5%, and 55%. Adjacent regions overlap by 17.5%. The same
geometry applies horizontally for `left_right` and vertically for
`top_bottom`.

The approved 2×2 benchmark candidate applies the tested 60%/40% geometry on
both axes:

- Crop 1: `originX = 0`, `originY = 0`.
- Crop 2: `originX = 40%`, `originY = 0`.
- Crop 3: `originX = 0`, `originY = 40%`.
- Crop 4: `originX = 40%`, `originY = 40%`.
- Every crop uses 60% of the source width and 60% of the source height.

For Nikkori's 1196×1896 source, each crop is 718×1138 with origins at X
`0/478` and Y `0/758`. Each crop is independently resized to a maximum 1024px
edge and encoded as JPEG quality 0.7 after cropping.

Expo Image Manipulator's contextual API supports crop rectangles containing
`originX`, `originY`, `width`, and `height`. Crops are rendered and saved to the
local cache before base64 encoding. See the
[official Expo Image Manipulator API](https://docs.expo.dev/versions/latest/sdk/imagemanipulator/).

## Initial Compression and Crop-Count Benchmark

The completed two-versus-three Nikkori matrix was:

| Input | Compression | Purpose |
|---|---|---|
| Full image | none | Existing evaluation baseline |
| Full image | 1024px / JPEG 0.7 | Measure current production degradation |
| Two crops | none | Isolate crop benefit |
| Two crops | 1024px / JPEG 0.7 | Two-crop production candidate |
| Three crops | none | Measure additional crop benefit |
| Three crops | 1024px / JPEG 0.7 | Three-crop production candidate |

The benchmark scores item completeness, duplicates, printed-name accuracy,
truncation, latency, and actual API usage. Cropping always happens before
compression.

The original decision rule preferred two crops unless three produced a
repeatable improvement. Neither candidate passed production compression, so
that rule did not select a viable production strategy.

### 2026-07-05 benchmark refinement

The initial production-like matrix rejected both candidates:

- Two raw full-height crops: 38/42 exact roll names with one unresolved
  duplicate.
- Two compressed full-height crops: 11/42, 11/42, and 10/42 exact names.
- Three raw/compressed crops: the middle crop truncated or timed out in every
  run.
- Full compressed image: timed out after 120 seconds.

The failure is geometric: a full-height left/right crop retains the 1896px
height, so longest-edge resizing does not enlarge the food text like the
successful 1050px-high diagnostic crop.

Benchmark four compressed 2×2 crops three times. Accept the candidate only if
at least two of three runs:

1. recover all 42 exact printed roll names;
2. contain no unresolved normalized duplicates;
3. complete all four calls without timeout or truncation.

This benchmark costs 12 GPT-4o calls, approximately `$0.36` at the current
assumption. Do not modify production crop routing before this gate passes.

The benchmark completed on 2026-07-05 and failed 0/3 runs. All 12 calls
completed, but exact-name recall was 32/42, 33/42, and 32/42; the third run
also retained one normalized duplicate. The 2×2 candidate is rejected.

Even if the 2×2 candidate passes, production orchestration needs a separate
design decision before implementation because the full-image extraction timed
out before returning layout metadata. The current “full extraction, then crop”
flow is therefore not an accepted detector for Nikkori.

## Client-Side Placement

Client-side cropping is the approved implementation because:

- Expo Image Manipulator is already installed and supports the required crop
  rectangles.
- The original local image is available, allowing crop-before-compression.
- No new Edge Function image dependency, native binary, or WASM runtime is
  introduced.
- Server memory and cold-start risk remain unchanged.

The tradeoff is a second client/server round trip for dense photos and more
client orchestration.

Server-side cropping is deferred. It would centralize behavior and avoid the
second round trip, but the current Edge Function receives compressed base64
images and has no established raster-processing dependency. Uploading original
photos would increase payload size, while adding an image library would add
runtime compatibility, memory, cold-start, and maintenance risk. Reconsider
server-side processing if original photos later move to object storage and a
dedicated image worker is introduced.

## Deterministic Merge

Merging is client-side pure TypeScript so crop results and adjacent photo
results share one implementation.

Rules:

1. Preserve the first source's menu order.
2. Only compare items from different sources; never deduplicate two items from
   the same crop.
3. Normalize names with Unicode normalization, lowercase, punctuation removal,
   and collapsed whitespace.
4. Merge exact normalized names when prices are compatible.
5. Merge near names only when price, category, and section context are
   compatible and name edit distance is within a conservative threshold.
6. Prefer the more complete record and union non-duplicate options.
7. If a duplicate decision is uncertain, keep both items rather than deleting
   a potentially real dish.
8. Remove a section-header pseudo-item only when it has neither a price nor a
   description and its normalized name matches another item's `section_title`.

The merger must handle the observed overlap pairs `Lomo Salteado` /
`Lomo Salteado` and `Mangud` / `Manguo` without collapsing distinct items such
as `Cosmo Roll` and `Cosmo de Pollo`.

## Multiple Photos

- The client rejects scans above 10 photos.
- Photos are processed in user-selected order.
- Two photos run concurrently; this is implemented with a small batching loop,
  not a new concurrency dependency.
- Finalized page results use the same deterministic merger to remove likely
  duplicates caused by overlapping adjacent photos.
- Failure of any page fails the whole extraction and identifies the page number
  in diagnostic logging.

## Failure Handling

The extraction caller must reject model responses whose `finish_reason` is not
`"stop"` before attempting JSON parsing.

A dense retry fails when:

- any crop request times out;
- any response truncates or returns malformed JSON;
- any response reports an unusable image;
- layout metadata is internally inconsistent.

The client returns one clear extraction error. It does not fall back to the
known-incomplete full-image result.

## Cost and Latency

Using the project's current `$0.03` extraction-call assumption:

| Photos | All normal | All dense, 2 crops | All dense, 3 crops | All dense, 4 crops |
|---:|---:|---:|---:|---:|
| 1 | $0.03 | $0.09 | $0.12 | $0.15 |
| 10 | $0.30 | $0.90 | $1.20 | $1.50 |

These figures exclude enrichment. Actual billing varies with image and output
tokens and must be measured from live usage before pricing decisions.

The completed two-versus-three-crop comparison used 21 calls, approximately
`$0.63`. The approved 2×2 follow-up adds 12 calls, approximately `$0.36`.

## Testing

### Deterministic tests

- Crop rectangles for left/right and top/bottom layouts.
- Two-region and three-region crop geometry.
- Four-region 2×2 crop geometry.
- Rounding and bounds for odd image dimensions.
- No crop plan for normal images.
- Reject invalid layout combinations.
- Exact overlap duplicate merge.
- Conservative OCR-alias merge (`Mangud` / `Manguo`).
- Distinct similar items remain separate.
- Options are unioned without duplication.
- Empty section-header pseudo-items are removed.
- Items within one source are never deduplicated.
- Adjacent-photo duplicates use the same merge rules.
- More than 10 photos is rejected.
- Non-`stop` model responses produce a clear error.

### Integration and live evaluation

- Existing extraction and enrichment contracts remain type-safe.
- Run the complete compression/crop-count matrix above on Nikkori.
- Record actual item recall, duplicate count, name errors, latency, and usage
  for every matrix entry.
- Reject the completed two/three full-height crop candidates.
- Freeze four 2×2 crops only if at least two of three compressed runs satisfy
  the exact-name, duplicate, and completion gate.
- Normal fixtures remain one-call extractions.
- Do not wire automatic dense retries until the full-image timeout path has an
  approved detector/fallback design.
- Nikkori crop results recover the 42-roll inventory without duplicates.
- Test Brasero, Brasero Two, Casa Nostra, El Marcos, Mochomos, and Nikkori.
- All six food-item fixtures pass the frozen `items` gate in three consecutive
  live runs using production compression.
- Evaluation reports duplicate names and expected-name misses in addition to
  count tolerance so a numerically passing but structurally wrong result cannot
  close the feature.

## Known Limitation

Uncompressed diagnostic cropping solved item completeness, but production
compression invalidated the full-height crop strategy. Name-quality
diagnostics remain required; count alone is not evidence that every printed
item was extracted correctly.

## Out of Scope

- Asking users to identify orientation or density.
- New image-processing libraries.
- More than four crop regions per dense photo.
- More than 10 photos per scan.
- Server-side cropping in the current Edge Function runtime.
- UI redesign beyond showing the existing loading and error states.
- Subscription or pricing enforcement.
