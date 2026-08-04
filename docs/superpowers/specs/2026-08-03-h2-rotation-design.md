# H2.2 — Rotation: straighten a sideways menu before it costs the diner its prices

**Status:** approved by Santiago 2026-08-03 · supersedes nothing · implements ROADMAP H2.2/H2.3
**Evidence:** evals 094 (detector mechanism), 131 (the defect), and the $0 measurements in this document.

## Why

A diner turns the phone to photograph a wide menu, so the capture arrives with the
text on its side. Eval 131 measured what the deployed (c) pipeline does with that:

| photo | dish names | printed numbers lost |
|---|---|---|
| bistro turned 90° | **all 8 read perfectly** | **17 of 28 — every pizza price** |
| polloteria turned 90° | mostly right | 9 of 93, plus real dish words |
| polloteria upside-down | mostly right | 2 of 93 |

**The names survive and the prices vanish.** That is the dangerous shape: an
item-count check passes, the scan looks healthy, and the diner is shown a menu
where nothing has a price. Same silent class as the guest-house short read, and
the reason ruling 6 forbids a numeric pass from being a gate by itself.

Rotation is launch scope (ruling 27). Nothing in `src/` or
`supabase/functions/` rotates anything today.

## Santiago's hard requirement

> "ensure we are correctly identifying rotated menus and not wrongly identifying
> correct upright menus and rotating them by accident/as a bug"

This design answers it twice: once with a refusal band, and once with a
verification step that makes a wrong guess produce **no change at all**.

## The signal, measured on every response we own ($0)

Mistral returns the pixel box of every text block. We stopped asking for them at
C3; they are free and still present under the pinned `mistral-ocr-4-0`.

`wide-frac` = fraction of non-empty blocks that are wider than tall.

| set | pages | wide-frac |
|---|---|---|
| **upright** — all 10 fixtures, 11 pages | 53–162 blocks | **0.988 – 1.000** |
| bistro / guest-house / polloteria turned 90° | 67–201 blocks | **0.000** |
| polloteria turned 270° | 156 blocks | **0.000** |
| polloteria upside-down | 161 blocks | 1.000 |

**Worst upright reading 0.988; best sideways reading 0.000. Fifteen samples, not
one in between.** Upside-down keeps horizontal lines, so wide-frac cannot see it —
reading order can.

`cyCorr` = correlation between OCR reading order and block centre-Y.
`cxCorr` = the same against centre-X.

| set | cxCorr | cyCorr |
|---|---|---|
| upright (10 menus) | +0.35 … +0.96 | **+0.32 … +0.96** |
| turned clockwise (3 samples) | −0.30 … −0.49 | **+0.86 … +0.96** |
| turned counter-clockwise (1 sample) | +0.33 | **−0.96** |
| upside-down (1 sample) | −0.96 | **−0.34** |

`cyCorr` carries the larger margin and is the primary discriminator; `cxCorr` must
carry the opposite sign as a consistency check, and disagreement is a refusal.

## Direction, pinned by geometry rather than assumed

Eval 094 recorded that a previous session's assumed degrees were **inverted**. So
the mapping is derived from the archived boxes, not from anyone's mental model.

bistro is 2384×1844 upright and 1844×2384 rotated. Its header block
`"Bistro Restaurante"` sits at x[79,286] y[30,57] upright and x[1787,1814]
y[79,286] rotated. The clockwise model `(x,y) → (H−y, x)` with H=1844 predicts
x[1787,1814] y[79,286] — **exact, to the pixel**. `sips -r 90` is therefore
CLOCKWISE, and the fixtures tagged `rot90` are menus turned clockwise.

### The decision table

| wide-frac | cyCorr | cxCorr | verdict | correction (clockwise°) |
|---|---|---|---|---|
| ≥ 0.80 | + | + | `upright` | 0 |
| ≥ 0.80 | − | − | `upside_down` | 180 |
| ≤ 0.20 | + | − | `turned_clockwise` | 270 |
| ≤ 0.20 | − | + | `turned_counter_clockwise` | 90 |
| anything else | | | **`upright` (refused)** | 0 |

Thresholds sit at 0.20/0.80 against a measured 0.000/0.988 — the band is four
times wider than any observation demands, and everything inside it refuses.

**Refusals are the deliverable, not the detections.** Two more, both free:

- **Fewer than `MIN_BLOCKS` (20) non-empty blocks ⇒ `upright`.** A page with three
  blocks of text has no reliable geometry, and guessing there is exactly how an
  upright menu gets rotated by accident.
- **Any disagreement between the two correlation signs ⇒ `upright`.**

## Components

### `supabase/functions/analyze-menu/orientation.ts` — NEW, pure

```ts
export type Orientation =
  | "upright" | "upside_down" | "turned_clockwise" | "turned_counter_clockwise";

/** Which way up a page is, from OCR block geometry alone. Refuses (→ "upright")
 *  whenever the evidence is not decisive. */
export function detectOrientation(blocks: OcrBlock[]): Orientation;

/** Clockwise degrees that bring `orientation` back upright; 0 for "upright". */
export function correctionDegrees(orientation: Orientation): number;

/** Printed money/weight tokens in an OCR text — the acceptance measure, because
 *  eval 131 proved sideways loses NUMBERS while keeping names. */
export function printedNumbers(markdown: string): number;
```

No I/O, no dependencies. Every threshold is a named exported constant carrying its
measured value in a comment, so a future session can see what the number is made of.

### `mistral-extract.ts` — expose what we already receive

`ocrMistral` returns `{ markdown, raw_response }` today. **The blocks are already in
`raw_response`** — verified on the production-mirror caches, which were produced by
this exact function: `bistro.mistral-pt-r1.raw.json` carries 83 blocks with pixel
boxes. C3 stopped *using* them, not *receiving* them, so nothing about the OCR
request, its cost, or its response changes. The only work is a `pageBlocks(raw)`
reader beside the existing `ocrMarkdown(raw)`, so `runPagedExtraction` can reach
the geometry without re-parsing JSON in two places (lesson 12: one reader).

### `extract.ts` — the protocol

`runPagedExtraction` already returns `{ needs_crops }` to ask the client for tiles.
Rotation reuses that shape exactly:

```ts
{ needs_rotation: { page: number; degrees: number }[]; prior: string[] }
```

`prior` is the first pass's per-page OCR markdown, echoed back untouched by the
client. It exists so the second pass can compare without a third API call — the
edge function is stateless and cannot remember the first read.

Ordering: **orientation is checked BEFORE the dense-page check**, so a sideways
dense menu is straightened before it is cut into tiles.

### `src/lib/analyzeMenu.ts` — the client

Mirrors the existing `needs_crops` branch: rotate the named pages with
`expo-image-manipulator` (already a dependency, already used by `compressImage`),
re-invoke with `rotated: true` and `prior` returned verbatim.

## Flow

```
app                              edge
 |-- photo(s) ------------------->|  Stage-1a OCR  (1 call)
 |                                |  detectOrientation(blocks)
 |                                |    upright  -> continue exactly as today
 |<-- needs_rotation + prior ------|    otherwise
 |  rotate locally                |
 |-- rotated photo(s), prior ----->|  Stage-1a OCR  (1 call)
 |                                |  keep whichever read has more printedNumbers
 |<-- items -----------------------|  then Stage-1b as usual
```

**Upright menus — every menu in the suite — take exactly one OCR call. No extra
cost, no extra latency, no behaviour change.**

## Why a false positive cannot ship a wrong menu

| detector says | truth | second read | outcome |
|---|---|---|---|
| sideways | sideways | upright, prices recovered | rotated read wins ✅ |
| sideways | **upright (wrong)** | now genuinely sideways, **fewer** numbers | **rotated read discarded, original kept** ✅ |

The verification is the detector's own failure mode turned against it: wrongly
rotating an upright page produces a sideways page, which reads worse by the exact
measure the defect is made of. A false positive costs ~$0.001 and one round trip
and changes nothing the diner sees.

**`rotated: true` is a hard stop — the server may request rotation at most once per
scan** (Santiago's standing "≤2 tries, never 4"). No loop is reachable.

## Error handling

| case | behaviour |
|---|---|
| `blocks` absent or empty | `upright` — no geometry, no verdict |
| client cannot rotate | re-submits with `rotated: true` and the original; server proceeds on the first read |
| second OCR fails | fall back to the first read, carried in `prior` |
| multi-page, mixed orientation | per-page verdicts; only the flagged pages are rotated |

## Testing

**Unit** (`orientation_test.ts`, $0, from `scripts/fixtures/caches/`):

1. All 11 upright fixture pages → `upright`. **This is the false-positive test and
   the one that must never be weakened.**
2. `rot90` (×3 menus) → `turned_clockwise`; `rot270` → `turned_counter_clockwise`;
   `rot180` → `upside_down`.
3. `correctionDegrees` round-trip pinned against the measured clockwise model.
4. A synthetic 5-block page → `upright` (below `MIN_BLOCKS`).
5. Conflicting correlation signs → `upright`.

**Protocol** (`extract_test.ts`): a stubbed sideways read returns `needs_rotation`;
a stubbed read with `rotated: true` never does; the better-numbers comparison picks
the original when the rotated read is worse.

**Gate H2.3** (~$0.06 live, needs Santiago's approval at the time):

- Each of the 3 wide menus, photographed sideways, scores **the same dims as its
  upright twin** — one oracle serves both, no new fixture.
- The 10 existing menus still score 50/50 pinned, 49–50 range, 50/50 replay.
- A ruling-6 raw-dump audit on every rotated run.

## Known limits, recorded rather than hidden

- **The counter-clockwise direction rests on ONE observation** (polloteria @270°).
  Three more counter-clockwise reads cost ~$0.003 and should be taken before the
  H2.3 gate, not after.
- Only the four right-angle orientations are handled. A menu photographed at 45°
  falls in the refusal band and is left alone — correct behaviour, not a fix.
- `printedNumbers` counts money and weight tokens; a menu that prints no numbers
  at all makes the comparison a tie, and a tie keeps the ORIGINAL read.
- The detector reads Mistral's block geometry. If a future OCR model stops
  returning `blocks`, `detectOrientation` refuses everything and the pipeline
  degrades to today's behaviour rather than breaking.
