# Handoff — implement the per-page re-scan flow

**Written** 2026-09-05 · **For** the session implementing the low-fi screens in code
**Design status** All artboards below are APPROVED by Santiago. Nothing here is a proposal.

You are already building the screens from this Paper file. This document covers **one flow that
did not exist when you started**: what happens when the scan could not read one or more pages of
the menu, and how the user replaces just those pages.

The whole flow exists to say one thing and make one thing easy:
> *"Page 2 came out wrong. Re-scan it."*

---

## 1 · The artboards

File `01M1FPTC22RXXNMCSB0TKZ6133`, page `1-0`.

| # | Artboard | URL |
|---|---|---|
| **26** | Review — 3 pages, 1 flagged (grouped) | [`58V-0`](https://app.paper.design/file/01M1FPTC22RXXNMCSB0TKZ6133/1-0/58V-0) |
| **26b** | Review — 8 pages, 3 flagged (grouped, stress case) | [`5LK-0`](https://app.paper.design/file/01M1FPTC22RXXNMCSB0TKZ6133/1-0/5LK-0) |
| **28** | Analyze anyway — confirm sheet | [`5Q3-0`](https://app.paper.design/file/01M1FPTC22RXXNMCSB0TKZ6133/1-0/5Q3-0) |
| **29** | Exit — page replaced, others still flagged | [`5RR-0`](https://app.paper.design/file/01M1FPTC22RXXNMCSB0TKZ6133/1-0/5RR-0) |
| **30** | Review — page menu open (Retake / Remove) | [`5V9-0`](https://app.paper.design/file/01M1FPTC22RXXNMCSB0TKZ6133/1-0/5V9-0) |
| **31a** | Review — 1 page, all read | [`60L-0`](https://app.paper.design/file/01M1FPTC22RXXNMCSB0TKZ6133/1-0/60L-0) |
| **31b** | Review — 3 pages, all read | [`61I-0`](https://app.paper.design/file/01M1FPTC22RXXNMCSB0TKZ6133/1-0/61I-0) |
| **31c** | Review — 6 pages, all read | [`633-0`](https://app.paper.design/file/01M1FPTC22RXXNMCSB0TKZ6133/1-0/633-0) |
| **24** | Camera — replacing page 2 | [`4YC-0`](https://app.paper.design/file/01M1FPTC22RXXNMCSB0TKZ6133/1-0/4YC-0) |
| **27** | Camera — peek at the page you're replacing | [`5DQ-0`](https://app.paper.design/file/01M1FPTC22RXXNMCSB0TKZ6133/1-0/5DQ-0) |
| **25b** | Goals — last page fixed, analysis already running | [`52N-0`](https://app.paper.design/file/01M1FPTC22RXXNMCSB0TKZ6133/1-0/52N-0) |

Every one of them has a yellow post-it beside it on the canvas recording *why* it looks that way.
Read the post-it before you argue with the pixels.

**Superseded — do not implement:** `22a`, `22b`, `22c`, `22d`, `23`, `25a`. They are kept on the
canvas as the record of rejected treatments, each with a post-it saying why it lost. They still
carry retired copy (`"Too blurry to read"`) and the old trash-icon control.

---

## 2 · The one rule that drives everything: which layout, when

The Review screen has **four** layouts. Pick with page count and whether anything is flagged.
Nothing else decides it.

| Condition | Layout | Artboard |
|---|---|---|
| **Any** page flagged | Two groups, each **one horizontally-scrolling row**, 165 × 200 tiles | `26`, `26b` |
| 0 flagged, **1** page | One 260 × 364 tile, centred | `31a` |
| 0 flagged, **2–3** pages | 260 × 364 tiles, horizontal scroll | `31b` |
| 0 flagged, **4+** pages | 165 × 220 tiles, **2 columns, vertical scroll** | `31c` |

Two things to internalise:

1. **The flagged layout wins at any page count.** A scan of 2 pages with 1 flagged uses the grouped
   layout, not the big-tile strip. Reason: at 260 px wide, barely one tile is on screen at a time,
   so a flagged page could sit entirely off-screen — the user retakes the one he can see, hits the
   primary button thinking he is done, and the confirm sheet ambushes him. That failure mode is the
   reason the grouped layout was chosen over marking pages in place.
2. **In the flagged layout nothing scrolls vertically.** Both group headings, both rows, and the
   primary button are on screen simultaneously at 8 pages. Rows grow sideways, never down. If your
   implementation ever pushes the primary button off screen, the layout is wrong.

```
                       pages.some(p => p.outcome === 'unreadable')
                                        │
                    ┌───────────────────┴───────────────────┐
                   yes                                      no
                    │                                        │
            grouped, 2 rows,                    ┌────────────┼────────────┐
          horizontal scroll each              n=1          n=2–3        n≥4
             (26 / 26b)                        │             │            │
                                            centred     h-scroll    2-col v-scroll
                                              (31a)        (31b)        (31c)
```

---

## 3 · The data contract

Types already exist in `src/types/scan.ts` — `PageOutcome`, `PageVerdict`, `ScanOutcome`, and
`ExtractionResult.pages`. You do not need to add them. What follows is how to *use* them.

### 3.1 Per-page verdicts

```ts
type PageOutcome = "ok" | "unreadable" | "readable_no_items";
interface PageVerdict { page: number; outcome: PageOutcome; reason: string | null; ocr_chars: number }
```

| outcome | what the Review screen does |
|---|---|
| `ok` | Normal tile, goes in the READY TO USE group |
| `readable_no_items` | **Also a normal tile.** A wine-list cover or a page of prose is not a failure — never ask for a re-scan |
| `unreadable` | Flagged tile, goes in the NEEDS A NEW PHOTO group |

`page` is **1-based** so it renders as-is. `ocr_chars` is diagnostic — never render it.

### 3.2 There is exactly ONE reason string

The backend cannot tell blur from darkness from glare: Mistral returns no quality signal and the
structuring model never sees the photo (`docs/backend-changes-required.md` §5). So:

- **Never render copy that names a cause.** `"too blurry"`, `"too dark"`, `"glare"` are all banned.
- The user-facing sentence is `"We couldn't read this page."` / plural `"…these pages."`
- Do not build per-page reason rendering. The reason is a group-level sentence, shown once under
  the NEEDS A NEW PHOTO heading, not once per tile.

If `reason` arrives non-null you may still ignore it and render the fixed string. Treat the field
as reserved for a future model that actually knows the cause.

### 3.3 Empty `pages` is NOT "everything is fine"

```ts
// dense-crop path: one page becomes four tiles, attribution unsolved → pages: []
// a thrown extraction call: pages: [] (see the catch block in review.tsx today)
```

`pages.length === 0` means **"no per-page re-scan is available"**. Fall back to the all-read layout
family (§2, right-hand branch) and the existing scan-level error handling. Do not treat it as
"0 unreadable pages" in a way that implies the pages were checked.

### 3.4 Scan-level outcome is DERIVED on the client, never sent

```ts
function deriveScanOutcome(pages: PageVerdict[], itemCount: number): ScanOutcome {
  if (itemCount > 0 && pages.some(p => p.outcome === "unreadable")) return "partial";
  if (itemCount > 0) return "ok";
  return "unusable";  // every page unreadable, or nothing found anywhere
}
```

| outcome | destination |
|---|---|
| `ok` | Results |
| `partial` | The Review screen in its flagged state (`26`) |
| `unusable` | `6 · Unusable menu` — dead end, no per-page offer |

### 3.5 Replace, never append — this is the whole point of the feature

Re-scanning page 2 must **overwrite slot 2** in `useScanStore.photos`. An append-only camera makes
the per-page verdict worthless.

`src/store/scan.store.ts` today has `addPhoto` / `removePhoto` / `clear`. Add:

```ts
replacePhoto: (index: number, photo: ScanPhoto) => void;   // 0-based index into photos[]
```

and a small piece of state for the mode the camera is in:

```ts
// null = normal capture (append). A number = "replacing page N" (0-based).
replacingIndex: number | null;
setReplacingIndex: (i: number | null) => void;
```

`addPhoto`'s `MAX_SCAN_PHOTOS` guard must **not** apply to a replace — swapping page 2 of 10 is
still 10 pages.

### 3.6 A replaced page re-runs ONLY that page

**Ruled by Santiago, 2026-09-05.** Recorded in `docs/backend-changes-required.md` open-questions.

Re-scanning page 2 re-extracts page 2 alone and merges the result into the existing extraction. It
does not re-run the whole scan. The only place this shows on screen is the pending button label on
`25b`, which reads **"Reading page 2…"** — not "Reading the menu…".

Merge semantics: replace that page's items and that page's verdict; leave every other page's items
and verdicts untouched.

---

## 4 · Screen specs

Palette names below are `DESIGN.md`'s. All type is on the 4 px grid; screen padding is 24 px, the
bottom safe pad is 34 px.

### 4.1 Review — flagged layout (`26`, `26b`)

Header: back chevron + `Review` (24 / 600 / -0.01em / lh 30). **No caption line** in this state —
the two group headings carry the counts.

Grid container: `flex-column`, `gap 12`, `paddingTop 20`, `flexGrow 1`, **`minHeight: 0`**, `overflow: clip`.
The `minHeight: 0` is load-bearing — without it an 8-page grid pushes the docked bottom block off
the artboard.

**Group 1 — flagged** (`flex-column`, `gap 8`):

| element | spec |
|---|---|
| Heading | `NEEDS A NEW PHOTO · 3 PAGES` — 11 / 600 / 0.08em / lh 14, **`#B3261E`**, padding-inline 24 |
| Sentence | `We couldn't read this page. Tap it to take a new photo.` — 13 / 400 / lh 18, `#6E6E6E`, padding-inline 24, padding-bottom 4. Pluralise to `…these pages. Tap one to…` |
| Row | `flex-row`, `gap 12`, `paddingInline 24`, horizontal scroll, `overflow: clip` |

**Group 2 — read** (`flex-column`, `gap 10`, `paddingTop 8`):

| element | spec |
|---|---|
| Heading | `READY TO USE · 5 PAGES` — same type, **`#6E6E6E`** |
| Row | identical to group 1's row |

The heading counts are what tell the user how many tiles are off-screen to the right. They are not
decoration — always render the count.

**Flagged tile** — 165 × 200, radius 14, bg `#DDDDDD`, **border 2 px `#B3261E`**, `overflow: clip`,
`position: relative`, contents centred:

- Retake affordance: 44 × 44 circle, `#111111`, centred, holding a 20 px white camera glyph.
  **The whole tile is the tap target**, not just the circle.
- Remove: absolute `top 8 / right 8`, 32 × 32, radius 16, bg `#FFFFFF` @ 88 % (`#FFFFFFE0`),
  16 px trash glyph stroked `#111111`. **A plain button, not a menu** — retake already lives on the
  tile, so a menu offering "Retake" twice is noise.
- Badge: absolute `left 8 / bottom 8`, bg **`#B3261E`**, radius 6, padding 3 / 8,
  text `Page 2` white 11 / 600 / lh 14.

**Read tile** — same 165 × 200 box, no border, no camera circle:

- Menu button: same 32 × 32 position, but **three 3 × 3 dots**, `gap 3`, `#111111`.
- Badge: bg `#FFFFFFE0`, text `#111111`.

**Bottom block** (docked, unchanged from `2b`): `+ Add another page` outline pill (border `#E6E6E6`,
radius 999, padding-block 11) → primary pill `Analyze anyway` (`#111111`, radius 999, padding-block 16,
label 16 / 600 white) → caption `Page 2 won't be included` (12 / 400 / `#9A9A9A`, centred).

**The primary button stays ENABLED while pages are flagged.** It says `Analyze anyway`, not
`Analyze menu`. The confirm sheet is what protects against a mis-tap.

### 4.2 All-read layouts (`31a`, `31b`, `31c`)

Header carries a caption again: `6 pages · one menu, one scan` (13 / 400 / `#6E6E6E`).
No group headings. No bottom skip caption — there is nothing to skip. Primary reads `Analyze menu`.

| | tile | row |
|---|---|---|
| `31a` — 1 page | 260 × 364 | centred |
| `31b` — 2–3 pages | 260 × 364 | `flex-start`, `gap 12`, `paddingInline 24`, h-scroll (next tile peeks ~94 px) |
| `31c` — 4+ pages | 165 × 220 | wrap, 2 per row, `gap 12` / `rowGap 12`, `alignContent: flex-start`, v-scroll |

Every tile in these three carries the **3-dot menu**, never the trash. `31a`/`31b` are the existing
`PhotoThumb` at its current size — the only change is the control.

### 4.3 Page menu (`30`)

Opened from the 3-dot on a **read** tile. Flagged tiles never open it.

- Scrim: full-bleed `#11111166`.
- The tapped tile is **lifted above the scrim** at full brightness with `boxShadow #0A0A0A40 0 10px 30px`,
  so the user can see which page he is acting on. This is not decoration — throwing away that
  confirmation is what killed the "empty slot" treatment.
- Menu: absolute, **anchored directly below the 3-dot button** (`top` = button bottom + 6), not below
  the card. Width 200, radius 14, bg `#FFFFFF`, `boxShadow #0A0A0A26 0 8px 24px`, `overflow: clip`.
- Rows: 50 px tall, `paddingInline 16`, `gap 12`, 18 px icon + 15 / 500 label.
  Divider between them: 1 px `#F0F0F0`.

| order | label | colour | action |
|---|---|---|---|
| 1 | `Retake` | `#111111` | enter camera in replace mode for this page |
| 2 | `Remove` | **`#B3261E`** | drop the page from the scan |

Destructive last and in red — a mis-tap lands on the safe one.

### 4.4 Confirm sheet (`28`)

Fires when the primary button is tapped while any page is flagged.

- Scrim: `#11111140`, height **exactly 544** — it stops at the sheet's top edge, it does not run
  behind it.
- Sheet: absolute `top 544`, 390 × 300, radius 20 / 20 / 0 / 0, bg `#FFFFFF`,
  `paddingTop 10`, `paddingInline 24`, `paddingBottom 34`.
- Grab handle: 36 × 4, radius 999, `#E6E6E6`, self-centred.

| element | copy | type |
|---|---|---|
| Eyebrow | `BEFORE WE ANALYZE` | 11 / 600 / 0.08em caps |
| Title | `Leave page 2 out?` | 24 / 600 / -0.01em / lh 30, `#111111` |
| Body | `We couldn't read page 2, so its dishes won't be in your results. Retaking it takes one photo.` | 13 / 400 / lh 19, `#6E6E6E` |
| Secondary | `Retake page 2` — outline pill, border `#E6E6E6`, camera glyph + 14 / 600 label | padding-block 11 |
| Primary | `Analyze without it` — `#111111` pill, 16 / 600 white | padding-block 16 |

Pluralise for multiple flagged pages (`Leave 3 pages out?`). This is a **bottom sheet, not a native
`Alert`** — `DESIGN.md` defines exactly one modal pattern and this is it.

### 4.5 Camera in replace mode (`24`, `27`)

`24` is the existing camera with one change: a **mode pill centred at the top**.

- Mode bar: `flex-row`, `justifyContent: space-between`, `paddingInline 14`, `paddingBlock 6`.
  Close button 40 × 40 on the left, mode pill in the middle, and a **40 × 40 empty spacer on the
  right** so the pill stays optically centred regardless of label length.
- Mode pill: bg `#FFFFFF`, radius 999, padding 7 / 14, `gap 7`. Contents: 14 px camera glyph,
  `Replacing page 2` at 13 / 600 / `#111111`, then a **12 px chevron-down `#6E6E6E`**.
  The chevron is the only thing telling the user the pill is tappable — do not drop it.
- The gallery button stays bottom-right permanently. Page count lives in the top bar. (Already
  ruled; draw against the fixed layout, not the old one where the count replaced the gallery button.)

`27` is the pill's tapped state — a **lightbox, not a sheet**, because the surface underneath is the
dark camera and the photo wants the full width:

- Overlay: full-bleed `#000000CC`, `flex-column`, centred, `gap 20`, `paddingInline 32`.
- Caption block (`gap 6`, centred): eyebrow `THE PAGE YOU'RE REPLACING` 11 / 600 / 0.08em white;
  sub `Page 2 of 3 — take a new photo of this one.` 13 / 400 / `#FFFFFFB8`.
- The old photo: 326 × 435, radius 14.
- Dismiss: white pill, radius 999, padding 14 / 28, `Back to camera` 16 / 600 `#111111`.

Tapping the scrim dismisses too.

### 4.6 The exit rule — one rule, two destinations

After the shutter fires in replace mode:

```ts
const stillFlagged = pages.filter(p => p.outcome === "unreadable" && p.page !== replacedPage);
stillFlagged.length > 0
  ? router.replace("/review")   // 29 — the replaced page has moved into READY TO USE
  : router.replace("/results"); // 25b — Goals, analysis already running
```

`29` shows the state: page 2 has moved down into READY TO USE (at its correct ordinal position, not
appended at the end), pages 5 and 6 stay at the top, counts and the skip caption update.

`25b` is the Goals screen with the pending primary button reading **`Reading page 2…`** and the
caption `New photo received · this finishes on its own`. Fixing the last page costs **no extra tap** —
do not send the user back to Review just to press Analyze again.

---

## 5 · Token changes you must apply app-wide

Two colours changed meaning on 2026-09-05. `DESIGN.md`'s palette table is already updated; the code
is not.

| token | before | after | used by |
|---|---|---|---|
| `#B3261E` | allergen disclaimer only | **failed page only** | flagged tile border, its badge, the NEEDS A NEW PHOTO heading, `Remove` in the page menu |
| allergen disclaimer | `#B3261E` on `#FDF0EF`, border `#F3D6D3` | **`#8A6100` on `#FDF6E3`, border `#EBDCAE`** | every results / portion / excluded screen — 16 instances on the canvas |

The disclaimer's icon strokes and fills move to `#8A6100` too.

Pure yellow is illegible on white at 12 px; `#8A6100` is the darkest legible member of that family
and is what the artboards use. Do not "correct" it to a brighter yellow — that requires moving the
text onto a filled band, which is a different design.

`src/constants/theme.ts` has neither colour. Add them as named tokens rather than inlining hexes:

```ts
danger: "#EF4444",        // existing, unrelated — leave it
pageFailed: "#B3261E",
warningInk: "#8A6100",
warningFill: "#FDF6E3",
warningBorder: "#EBDCAE",
```

---

## 6 · Copy strings, verbatim

| key | English |
|---|---|
| flagged group heading | `NEEDS A NEW PHOTO · {n} PAGE` / `PAGES` |
| flagged group sentence (1) | `We couldn't read this page. Tap it to take a new photo.` |
| flagged group sentence (n) | `We couldn't read these pages. Tap one to take a new photo.` |
| read group heading | `READY TO USE · {n} PAGES` |
| skip caption (1) | `Page {n} won't be included` |
| skip caption (n) | `{n} pages won't be included` |
| primary, flagged | `Analyze anyway` |
| primary, all read | `Analyze menu` |
| header caption, all read | `{n} pages · one menu, one scan` |
| sheet eyebrow | `BEFORE WE ANALYZE` |
| sheet title | `Leave page {n} out?` |
| sheet body | `We couldn't read page {n}, so its dishes won't be in your results. Retaking it takes one photo.` |
| sheet secondary | `Retake page {n}` |
| sheet primary | `Analyze without it` |
| camera mode pill | `Replacing page {n}` |
| peek eyebrow | `THE PAGE YOU'RE REPLACING` |
| peek sub | `Page {n} of {total} — take a new photo of this one.` |
| peek dismiss | `Back to camera` |
| menu items | `Retake` · `Remove` |
| goals pending, after replace | `Reading page {n}…` |
| goals pending caption | `New photo received · this finishes on its own` |

**Spanish was checked on the canvas and every one of these survives.** The longest string,
`NECESITAN UNA FOTO NUEVA · 3 PÁGINAS`, fits one line at 342 px. Two things this cost us, so don't
undo them:

- The badge is a **two-value column** (page number over reason) in the retired treatments precisely
  because `Página 2 · Demasiado borrosa` overflowed a single line. The approved design sidesteps
  this by putting the reason at group level — keep it there.
- The camera mode pill's centring uses a spacer, not a fixed offset, so a longer Spanish label
  cannot push it off-centre.

The user's menu language and the UI language are independent. English is only ever an internal
lookup key — never translate the menu's own words in the UI.

---

## 7 · Files this touches

| file | change |
|---|---|
| `src/app/review.tsx` | The four-layout branch, both groups, the confirm sheet, the flagged/read split |
| `src/components/review/PhotoThumb.tsx` | Add a `variant: "flagged" \| "ok"` and a `size` — currently hard-codes 260 × 364 and a single `X` remove button |
| *new* `src/components/review/PageMenu.tsx` | The scrim + lifted tile + anchored Retake/Remove menu |
| *new* `src/components/review/ConfirmAnalyze.tsx` | The bottom sheet |
| `src/store/scan.store.ts` | `replacePhoto`, `replacingIndex`, `setReplacingIndex`; exempt replace from `MAX_SCAN_PHOTOS` |
| `src/app/(tabs)/index.tsx` | Replace mode: the mode pill, the peek overlay, and the exit branch after capture |
| `src/constants/theme.ts` | The five tokens in §5 |
| results / portion / excluded screens | Allergen disclaimer → amber |

`PhotoThumb` today uses `X` from lucide for remove; the artboards draw a **trash** glyph. Use
`Trash2`. The 3-dot is `MoreHorizontal`.

---

## 8 · Things that will look like improvements and are not

- **No confidence badge, no accuracy %, no spinner or progress ring for the analysis.** The primary
  button's own label carries the state. This is a standing rule in `DESIGN.md` → *Reject these reflexes*.
- **No toast** after a page is replaced. The tile moving from one group to the other is the feedback.
- **No native `Alert`.** The bottom sheet is the only modal pattern.
- **Do not name a cause for a failed page.** See §3.2. This is the single most likely mistake.
- **Do not disable the primary button while pages are flagged.** Analysing without a page is a
  legitimate choice; the sheet is what makes it deliberate.
- **Do not append a re-scanned page.** See §3.5.
- **Do not use emoji as icons.** Lucide via `lucide-react-native`.

---

## 9 · Still open

Nothing in this flow. Every question raised during the design was closed by Santiago on 2026-09-05.

Two items elsewhere in `DESIGN.md`'s *Decisions not yet made* table remain open and this work did
**not** resolve them — do not let an implementation detail silently decide them:

- The font family (the artboards render in `system-ui`; the app ships Inter + Montserrat).
- The primary-CTA colour (the artboards use near-black `#111111`).

If you hit something this document does not answer, the post-it beside the artboard almost certainly
answers it. If it doesn't, it is Santiago's call, not yours.
