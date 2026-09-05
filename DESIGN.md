# Design the Menu Scan app

Menu Scan turns a photo of a paper menu into the same menu, sorted by how well each dish matches the
goals the user picked. This file is the authority on what its interface shows and how it looks. Read
it before any UI work; `AGENTS.md` points here.

Design for someone standing in a restaurant, holding a menu, deciding in under a minute. They are
not browsing. They already have the menu — the only thing this app adds is the numbers, so the
numbers are the product and everything else is scaffolding around them.

> ### 🔁 This file is one half of a sync pair
> The **UI binding rules** section is mirrored in the knowledge-base repo at
> `menu-scan-kb/docs/design-system/ui-binding-rules.md`. **Change one, change the other in the same
> session** — the two copies must stay byte-identical inside their `SYNC-BLOCK` markers. Verify with
> `python3 ../menu-scan-kb/check-sync.py`. Everything outside that block lives only here.

> ⚠️ **This file is ahead of the code.** The values below come from the Phase-1b low-fidelity screens
> (2026-09-01). `global.css` and `src/constants/theme.ts` still carry the previous system. See
> **The code does not match this yet** at the end for the exact deltas. When they disagree, this file
> is the target and the code is the backlog — do not "fix" this file to match the code.

## Use this priority order

When two instructions collide, the lower number wins.

1. **The UI binding rules below.** Product rules about what may be shown at all. Ruled against
   plausible alternatives; several are counter-intuitive on purpose.
2. **The mandatory allergen disclaimer**, whose wording `AGENTS.md` fixes and this file cannot
   shorten, collapse, or hide.
3. **The measured facts.** Where a number in this file was measured, do not replace it with taste.
4. **The visual system.** Tokens, type, spacing. Renegotiable — update this file first, then the code.

## Placeholders — read the marker, do not guess past it

Two markers appear throughout this file. They are not decoration; they mean the value does not exist
yet and inventing one is worse than leaving it blank.

- **⬜ UNDECIDED** — no decision has been made. There may be a recommendation attached; a
  recommendation is not a ruling. **Do not resolve one of these by picking the option that reads
  best.** Every open item is collected in *Decisions not yet made* at the end of this file.
- **🟡 PROPOSED** — a specific value exists and is drawn somewhere, but Santiago has not accepted it.
  Build against the value it replaces until he does, and the marker names that value.

An unmarked value in this file is settled. A constraint with no named author is not a constraint:
if you cannot find who ruled something, it is ⬜, not a rule.

## Frame the screen's job before styling it

Ask what the user is deciding on this screen, then give the answer the most weight.

- **Results** — *which dish should I order?* The macro ranges and the ordering answer it. The dish
  name is how they order it out loud. Everything else is context.
- **Goals** — *what am I optimising for?* Every control must be reachable without scrolling past the
  primary action, because analysis is running behind this screen and the button is the status light.
- **Excluded** — *why is this dish not in my list?* State the reason as a fact about the menu, never
  as a statement about our certainty.
- **A sheet or modal** — *change one thing and get back.* One decision, a live preview of its effect,
  one way out.

Do not add a screen. Six navigable screens is the ceiling; sheets and dev routes do not count. If a
new state needs somewhere to live, it is a sheet.

<!-- SYNC-BLOCK:ui-binding-rules START -->
<!-- Two copies of this block exist, one per repo. They must stay byte-identical. -->
<!-- Verify with:  python3 menu-scan-kb/check-sync.py -->

## UI binding rules

> **Ruled by Santiago, 2026-09-01**, in the requirements session that preceded the Phase-1b low-fi
> screens. These are **product** rules — what the interface may and may not show — and they sit
> above the visual tokens in this file. A token can be renegotiated; these were each decided
> against a plausible alternative, and several are counter-intuitive on purpose.

1. **Macros are always visible on the card.** Never behind a tap. His words: *"Wouldn't make sense
   if I was just staring at menu items and their title and description and price. It's the same as
   if I was staring at the menu itself that I just took a picture of."* The macros are the only
   thing the app adds over the paper menu.
2. **No confidence anywhere in the UI.** The field still exists and still routes items to Excluded —
   it is simply never rendered, never a badge, never a banner.
3. **No accuracy percentage anywhere.** Long-standing binding rule.
4. **Ranges, flat ±10%, symmetric.** ⚠️ Narrower than the measured ±20% band. This is deliberate and
   Santiago knows; it is recorded in `menu-scan-app/docs/backend-changes-required.md` so nobody later reads ±10%
   as a measured figure.
5. **No point value on the card.** Under a flat symmetric band the point value *is* the midpoint of
   the range, so printing both shows the same number twice.
6. **No rank numerals** (`#1`, `#2`). Overlapping ranges make them false precision. Order is
   conveyed by position only.
7. **Equal goal weights.** The shipped code weights by source-file order (Protein > Carbs > Fat >
   Calories), which nobody chose — it ranks a 30 g-fat carbonara #2 under a *low fat* goal. Design
   for equal weights. Drag-to-reorder priority is a later phase; do **not** design it now.
8. **Dish names are never translated.** Descriptions are, and only when the user turns the toggle
   on. Default OFF. The user has to say the dish name to a waiter.
9. **Portion editing does not re-rank.** It changes the card's numbers only; `portions` stays out of
   the sort.
10. **The portion denominator is presented as ours** — *"we assumed it comes in 8"*, never *"comes in
    8"*. Our piece counts are contested: oracle 11 / model 8 / USDA 6 on the same roll.
11. **The Excluded tab holds exactly two things**: allergen matches, and "not enough detail to
    estimate". Disliked ingredients stay in Results with a muted flag — they do **not** hide.
12. **Price shows on the card. Sorting by price is out of scope.**
13. **Flat list, no grouping by menu section.** The section name is a quiet label on each card.
    Grouping would make the app look like the paper menu it replaces.
14. **Goals include calories** — four pairs, not three: protein, carbs, fat, calories × high / low.

### Two consequences worth stating separately

- **Green (`#157F3D`) marks which macros you are sorting on. It never means "good".** Non-goal macro
  values render muted. This is the same position the KB rationale takes — rank already communicates
  alignment, so colour must not restate it.
- **The allergen disclaimer's wording is fixed by `AGENTS.md`** and cannot be shortened, collapsed or
  hidden. It occupies two lines at 12 px in a 350 px column; any density work has to route around it
  rather than through it.

<!-- SYNC-BLOCK:ui-binding-rules END -->

## Work in three passes

Do not style and structure at the same time. Each pass has a different question.

### Pass 1 — Decide what the screen owes the user

Name the one decision the screen serves, then rank everything on it against that decision. On a
Results card the ranking is: macro ranges, dish name, price, description, portion. If a block cannot
be placed in that ranking, it does not belong on the card.

Check the binding rules before drawing. Four of them forbid things a competent designer would
otherwise add — a rank numeral, a point value, a confidence cue, a section group header.

### Pass 2 — Lay it out

- Build repeated rows with **fixed-width lanes**, not gaps. Icons, steppers and macro slots get an
  explicit width and `flexShrink: 0`, even where a lane is empty in some rows.
- Chips and inline labels need `flexShrink: 0` and `whiteSpace: nowrap`, or a stretched flex row
  breaks words mid-syllable.
- Spacing groups; rules separate. Use a `10 px` gap inside a group and a hairline between registers.
  Equidistant spacing everywhere reads as one flat stack.
- Everything on a 4 px grid.
- Assume the longest string, not the average one. Spanish chrome runs 30–40 % longer than English:
  `Ordenado por` + two goal chips + `Cambiar` leaves 2 px of slack on a 390 px screen, so a third
  chip collides. Design the row that survives, then check it in both languages.

### Pass 3 — Inspect before you call it done

Six checks. Every one gets a verdict, including the ones that pass.

- **Hierarchy** — squint. Does the thing the screen is *for* win? On a card, macros must beat the
  dish name and the price, not tie with them.
- **Balance** — how much of the screen is chrome before content starts? Above ~35 % on a phone,
  the layout is serving itself.
- **Contrast** — read every gray at its real size against white. Anything under 4.5:1 for text
  below 16 px is a defect, not a mood.
- **Repetition** — same role, same treatment. One button shape, one card shape, one chip shape.
- **Alignment** — trace a vertical line through the same element on three consecutive rows. If it
  moves, the lane is not fixed.
- **Proximity** — do the gaps group the right things, or has a uniform gap flattened three registers
  into one?

Then check the language pass and the state pass: every screen has a pending, empty, and failed
version, and the failed one has to explain itself in words a diner understands.

## Authoritative visual system

Neutral, typographic, flat. Two colours carry meaning and nothing else does. The interface should
read as an instrument, not a wellness app — the user is acting on an estimate in front of a waiter.

#### Surface and colour

| Role | Value | Use |
|---|---|---|
| ground | `#FFFFFF` | every screen background |
| ink | `#111111` | primary text, selected control fill |
| muted | `#6E6E6E` | descriptions, secondary labels, non-goal macro values |
| dim | `#9A9A9A` | section eyebrows, assumption captions, disabled labels |
| hairline | `#E6E6E6` | dividers, card borders, unselected control borders |
| fill | `#F5F5F5` | quiet chips, segmented-control troughs, callout panels |
| goal green | `#157F3D` | **only** a 2 px rule under a macro label |
| disclaimer red | `#B3261E` | **only** the allergen disclaimer |
| primary action fill | ⬜ **UNDECIDED** | drawn as `ink`; the KB rationale says yellow. See *Decisions not yet made*. |
| photo-count badge | `#D9F26B` | live in `ThumbStack.tsx`. 🟡 **PROPOSED for removal** — the only survivor of the previous palette, kept until that badge is redesigned. |

Green marks *which macros you are sorting on*. It never means "good", "healthy", or "recommended" —
rank already communicates alignment, and a green number invites the user to read a value judgement
we have not made. Red is reserved so that when it appears the user knows it is the allergen warning
and not decoration.

Do not add a third accent. Do not tint the grays. Nothing on a card carries a background colour.

**`#8A8A8A` is retired.** On white it is ≈3.4:1 at 15 px and fails AA. It was used for non-goal macro
values on the drawn screens; use `muted` instead. This one is not a taste call and is not marked
pending — accessibility floors are not negotiated.

#### Typography and rhythm

⬜ **UNDECIDED — the font family.** No value is selected. Three sources disagree and none of them
wins by default. Everything below specifies *sizes and weights only*; they hold whichever family is
chosen. See *Decisions not yet made*.

Sizes in px, and only these:

| Size | Weight | Use |
|---|---|---|
| 24 | 600 | screen title, sheet title |
| 17 | 600 | dish name |
| 15 | 600 | button labels, macro value |
| 15 | 500 | control labels, row titles |
| 13 | 400 | descriptions |
| 13 | 500 | price, quiet captions |
| 11 | 600 | section eyebrows (caps, `0.08em`) |
| 11 | 500 | preference flags, helper captions |
| 9 | 600 | macro labels (caps, `0.08em`) |

Body copy never goes below 13 px. All-caps micro-labels carry tracking, always.

🟡 **PROPOSED — a two-step change to the macro row's type**, drawn on artboard `7d`, not accepted:
macro value **15 → 17 px** and macro label **9 → 10 px**. The reason is that the audit found the card
has a flat hierarchy — dish name, price and macro value all read as peers, so the one thing the app
adds does not win the squint test. Until it is accepted, build **15 px / 9 px**. If it is accepted,
9 px stops being used anywhere and 10 px becomes the floor.

#### The macro row

This is the product. Get it wrong and nothing else matters.

- Four slots — protein, carbs, fat, calories — in that order, always all four, always on the card.
- Each slot is a **fixed 80 px lane** with `flexShrink: 0`. Fixed lanes are what make values line up
  vertically across cards of different heights; a `gap`-only row drifts and the list stops being
  scannable.
- Value in `ink` when the macro is one the user is sorting on, `muted` when it is not.
- Label below the value, with a 2 px `#157F3D` rule under it when it is a sort macro.
- Values are ranges, `21–25g`, en dash, no spaces. Calories carry no unit.

**Macro labels must survive Spanish.** `CARBOHIDRATOS` wraps to two lines in an 80 px lane and pushes
the whole card taller; `CARBOS` fits. Keep every macro label to **8 characters or fewer in every
language**, or widen the lane — do not let it wrap.

#### The card

- `14 px` radius, `14 px` padding, `10 px` internal gap, `1 px` `hairline` border, `ground` fill.
- Order: section eyebrow + price · dish name · description · flags · macro row · portion row.
- Hairline rules above the macro row and above the portion row. Three registers, separated by rules
  rather than by extra space — spacing alone leaves the card reading as one undifferentiated stack.
- The section name is a quiet eyebrow, never a group header. See binding rule 13.
- Price: `15 px` `ink` as drawn. 🟡 **PROPOSED — `13 px` `muted`** (artboard `7d`), so the price stops
  competing with the dish name and the macros. Not accepted.

#### Sheets, modals and buttons

- A sheet is `position: absolute` with an explicit top and height, a `20 px` top radius, a grab handle
  centred at the top, and a scrim sized to exactly the sheet's top edge. Never lay an absolute
  element over the whole screen — it swallows every interaction beneath it.
- Every primary action is a **`999 px` pill**, full width, `16 px` semibold label, filled with the
  primary action colour (⬜ above). One shape for one role, in sheets and on screens alike. A rounded
  rectangle in a sheet and a pill on a screen is the same button wearing two costumes.
- Secondary action is the same pill with a `hairline` border and an `ink` label.
- Disabled and pending states use `fill` with a `dim` label. A pending primary action states what is
  happening — *"Reading the menu…"* — and a caption below it says the user need not wait.

#### Assumptions are labelled, always

Anywhere the app supplies a number the menu did not print, say so in the user's words: *"we assumed
it comes in 3 · tap to change"*. Our piece counts are contested — oracle 11, model 8, USDA 6 on the
same roll — so presenting one as fact is a claim we cannot support. See binding rule 10.

#### Motion

⬜ **UNDECIDED — the motion system.** No durations, easings or transitions have been specified. The
low-fi screens are static and nothing has been drawn in motion.

Two things *are* ruled and hold regardless: the analysis state is carried by the primary button's
label, never by a spinner, shimmer or progress ring (binding-rule-adjacent, see *Reject these
reflexes*); and editing a portion updates the card's numbers in place with no toast.

#### Dark mode

⬜ **UNDECIDED — whether the app has one at all.** Never discussed. Every artboard is light-only and
no dark palette exists. Do not derive one by inverting the table above; `#157F3D` and `#B3261E` were
both chosen against white.

## Measured facts — do not re-eyeball these

Measured on the Phase-1b artboards, 390 × 844. Visible list area is the artboard height minus the
chrome above the first card.

| | card | pitch | items visible per screen |
|---|---|---|---|
| everything on the card | 260 px | 270 px | **1.97** |
| compact card, detail in a sheet or expansion | 141 px | 151 px | **3.52** |
| compact card carrying a preference flag | 173 px | 183 px | — |

Chrome above the first card is **312 px — 37 % of the screen** (status 62 + header 82 + tabs 46 + goal
bar 52 + disclaimer 56 + padding 14). Only ~46 px is recoverable without touching a binding rule,
because the disclaimer's wording is fixed. **The density lever is the card, not the chrome.**

🟡 **PROPOSED — merge the translate toggle into the nav row** (artboard `7d`), which drops the header
from 82 px to 46 px, chrome to 266 px, and lifts the everything-on-the-card variant from 1.97 to
**2.13** items per screen. Not accepted.

## Reject these reflexes

Generated interfaces default to these. None of them belong here.

- A confidence badge, a certainty meter, or a "low confidence" banner ✗ — binding rule 2. The field
  exists and routes items to Excluded; it is never rendered.
- An accuracy percentage anywhere ✗ — binding rule 3.
- `#1`, `#2`, `#3` beside the top results ✗ — overlapping ranges make numerals false precision.
  Position conveys order ✓.
- A green "healthy" pill or a red "avoid" pill on a dish ✗ — colour never grades a dish ✓.
- Grouping the list under menu-section headers ✗ — it recreates the paper menu the app replaces.
  A quiet eyebrow on each card ✓.
- Hiding macros behind a tap, an accordion, or a "details" link ✗ — binding rule 1, without
  exception, in every variant.
- Translating the dish name ✗ — the user has to say it to a waiter. Translate the description, opt-in,
  default off ✓.
- A progress ring, skeleton shimmer, or animated gradient while analysis runs ✗ — the primary button
  is the status indicator ✓.
- Shadows, gradients, glassmorphism, or a card inside a card ✗ — one hairline separates surfaces ✓.
- Emoji as icons ✗ — line SVG at 16/20/22 px, `lucide-react-native` ✓.
- A toast confirming that a portion changed ✗ — the numbers on the card change in place ✓.

## The code does not match this yet

`global.css` and `src/constants/theme.ts` still carry the pre-Phase-1b system. Both files agree with
each other, so this is a clean, mechanical migration — not a bug hunt. **Do not start it while the
font family is ⬜**, or the type tokens will be rewritten twice.

| Token | Code today | This file |
|---|---|---|
| `--color-foreground` | `#0A0A0A` | `#111111` |
| `--color-muted-foreground` | `#6B6B6B` | `#6E6E6E` |
| `--color-border` | `#E5E5E5` | `#E6E6E6` |
| `--color-danger` | `#EF4444` | `#B3261E` |
| goal green | absent | `#157F3D` — new token needed |
| dim | absent | `#9A9A9A` — new token needed |
| `--radius-card` | `16px` | `14px` |
| `--font-display` / `--font-sans` | `Montserrat_700Bold` / `Inter_400Regular` | ⬜ **UNDECIDED** |
| type scale | 32/26/20/16/14/12 | 24/17/15/13/11/9 |

`--color-accent-lime` (`#D9F26B`) is live in `src/components/scan/ThumbStack.tsx` as the photo-count
badge and is the one token from the old system still doing a job. Keep it until that badge is
redesigned. `--color-accent-rose` and `--color-success` are unused — delete them when the palette is
migrated.

Icons are `lucide-react-native` with `react-native-svg`, already installed. That does not change.

## Decisions not yet made

Every ⬜ and 🟡 in this file, collected. **Do not resolve one by picking the option that reads best.**

| # | Open item | State | What exists | Recommendation |
|---|---|---|---|---|
| 1 | **Font family** | ⬜ | `theme.ts` loads Montserrat + Inter; the KB rationale says one family, two weights; the low-fi screens rendered in `system-ui` | One family (Inter). The drawn hierarchy is two steps deep and needs no display face; Montserrat appears nowhere in the Phase-1b work. **Blocks the token migration.** |
| 2 | **Primary CTA colour** | ⬜ | This file and every drawn screen use near-black `#111111`; `menu-scan-kb/docs/design-system/rationale.md` says yellow is the primary CTA | Near-black, and correct the KB rationale — but one of the two documents is wrong and it is not this one by default |
| 3 | **Screen horizontal padding** | ⬜ | `24 px` in code and on the scan, review and goals artboards; `20 px` on the Results artboards, giving the list a 350 px column | State both deliberately: `20 px` on list screens, `24 px` elsewhere. Two chosen values beat one accidental drift |
| 4 | **Which Results variant ships** | ⬜ | Three drawn: everything on the card (1.97/screen), compact + sheet, compact + expand in place (3.52/screen) | None — this is Santiago's call. The density table is the evidence |
| 5 | **Motion system** | ⬜ | Nothing specified. No durations, easings or transitions anywhere | Defer until a variant is chosen; the sheet-vs-expand decision changes what needs animating |
| 6 | **Dark mode** | ⬜ | Never discussed. Light-only artboards, no dark palette | Defer, and do not invert the light palette to fake one |
| 7 | **Macro type bump** (15→17 px value, 9→10 px label) | 🟡 | Drawn on artboard `7d`. Answers the audit's flat-hierarchy finding | Accept — the macros are the product and currently tie with the price |
| 8 | **Price demotion** (15 px ink → 13 px muted) | 🟡 | Drawn on artboard `7d` | Accept, with #7; they are one change |
| 9 | **Translate toggle into the nav row** | 🟡 | Drawn on artboard `7d`. Header 82→46 px, chrome 312→266 px, +8 % list | Accept — it is the only chrome saving available that touches no binding rule |
| 10 | **Lime photo-count badge** | 🟡 | `#D9F26B` in `ThumbStack.tsx`, the last token from the old palette | Keep until the badge is redesigned, then delete the token |
| 11 | **Empty and zero-result states** | ⬜ | Not drawn. "Unusable menu" and "unreadable photo" exist; "readable, but nothing matched your filters" does not | Draw it before shipping any variant — an allergen filter can empty the Results tab entirely |

Items 7, 8 and 9 are all artboard `7d` and can be accepted or rejected as one decision.
