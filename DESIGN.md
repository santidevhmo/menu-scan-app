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

> ⚠️ **This file is ahead of the code.** Every value in the visual system was read off the artboards
> Santiago approved, with Paper's `get_computed_styles` / `get_jsx`, on **2026-09-05** — not
> eyeballed from a screenshot and not carried forward from an earlier revision. `global.css` and
> `src/constants/theme.ts` still carry the pre-Phase-1b system. See **The code does not match this
> yet** at the end for the exact deltas. When they disagree, this file is the target and the code is
> the backlog — do not "fix" this file to match the code.

> 🎨 **The Paper file is the visual source, this file is its transcription.** Where the two
> disagree, **re-read the artboard** — but note the two exceptions, both recorded rather than
> silently adopted: three artboards were drawn in the retired palette and must be normalised
> (see *Surface and colour*), and two approved details contradict *Reject these reflexes*
> (see *Decisions not yet made* #12 and #13). An artboard is a ruling for what it **draws**, never
> for what it is **named**.

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

> **Every value below was read off the approved artboards on 2026-09-05** with Paper's
> `get_computed_styles` / `get_jsx`, not eyeballed from a screenshot. The approved set is:
> `16 · Camera`, `2b · Review`, `15 · Settings`, `3 · Goals — reading`, `5 · Goals — unreadable`,
> `6 · Unusable menu`, `18 · Results`, and the two cards `Card A · macros ledger` in its
> **1 serving** and **n servings** states. Where an artboard and this file disagreed, the artboard
> won and this file was corrected — *except* for two conflicts with the binding rules and the
> reject-list, which are recorded in **Decisions not yet made** (#12, #13) rather than resolved.

#### Surface and colour

| Role | Value | Use |
|---|---|---|
| ground | `#FFFFFF` | every screen background; card fill; nav-pill fill; the active tab |
| ink | `#111111` | primary text, dish name, selected control fill, primary button fill, goal-macro label and value |
| muted | `#6E6E6E` | descriptions, price, non-goal macro values, unselected control labels, the quiet half of a sentence |
| dim | `#9A9A9A` | card eyebrow, macro labels that are not goals, `CALORIES` label, captions under a button, the pending button's label |
| hairline | `#E6E6E6` | card border, chip border, stepper border, the inactive tab's count badge |
| rule | `#F0F0F0` | **the card's internal rules and its vertical macro divider — and the pending button's fill.** Lighter than `hairline` on purpose: a rule *inside* a bordered card must not compete with the border around it |
| fill | `#F5F5F5` | segmented-control troughs, the tab trough, goal-bar chips, callout panels, the nav pill's active item |
| dash | `#C9C9C9` | **only** the dashed border of the `+ Add` chip. Nothing else in the interface is dashed |
| goal green | `#157F3D` | **only** the 5 px dot before a macro the user is sorting on |
| disclaimer red | `#B3261E` | **only** the allergen disclaimer |

Green marks *which macros you are sorting on*. It never means "good", "healthy", or "recommended" —
rank already communicates alignment, and a green number invites the user to read a value judgement
we have not made. Red is reserved so that when it appears the user knows it is the allergen warning
and not decoration.

⚠️ **Three artboards were drawn in the PRE-Phase-1b palette and must be normalised, not copied.**
The floating nav pill, the results goal-bar chips and the back chevron use `#0A0A0A` / `#6B6B6B` /
`#E5E5E5` — the values still sitting in `theme.ts`. They are two or three units off the current
tokens and the difference is invisible, which is exactly why it would survive forever. **Build them
with `ink` / `muted` / `hairline`.** This is a mechanical correction, not a taste call.

**`#8A8A8A` is retired.** On white it is ≈3.4:1 at 15 px and fails AA. Use `muted` instead. This one
is not a taste call and is not marked pending — accessibility floors are not negotiated.

#### Typography and rhythm

⬜ **UNDECIDED — the font family.** Every artboard renders in `system-ui, sans-serif`, which is
Paper's default, not a choice. The scale below specifies *sizes, weights, tracking and line-height
only*; they hold whichever family is chosen. See *Decisions not yet made* #1.

| px | Weight | Tracking | Line-height | Use |
|---|---|---|---|---|
| 30 | 700 | `-0.02em` | 28 | **the menu's own title**, centred — results screen only |
| 24 | 600 | `-0.01em` | 30 | screen title, beside the back chevron |
| 22 | 600 | `-0.015em` | 26 | the calorie figure on a card |
| 17 | 600 | `-0.01em` | 22 | dish name |
| 16 | 600 | — | 20 | primary / pending button label |
| 16 | 500 | — | 20 | goal row label (`Protein`) |
| 15 | 600 | `-0.01em` | 18 | goal-macro value; callout title |
| 15 | 500 | `-0.01em` | 18 | non-goal macro value |
| 14 | 600 | — | 18 | active tab label; stepper value |
| 14 | 500 | — | 18 | chip label; inactive tab label |
| 14 | 400 | — | 18 | the portion sentence (`I'll eat … of the order`) |
| 13 | 600 | — | 16 | selected segmented-control label (`High`) |
| 13 | 500 | — | 16 | unselected segmented-control label; **card price** |
| 13 | 400 | — | 18–19 | dish description; callout body |
| 12 | 600 | — | 16 | tab count badge; results goal-bar chip |
| 12 | 500 | — | 16 | `Sorted by` |
| 12 | 400 | — | 16 | caption under a button; a section's sub-caption |
| 11 | 600 | `0.08em` | 14 | screen section eyebrow, caps (`INGREDIENTS TO AVOID`) |
| 11 | 400 | — | 14 | nav pill label |
| 10 | 600 | `0.08em` | 12 | macro labels, caps |
| 10 | 600 | `0.09em` | 12 | card section eyebrow, caps |

**10 px is the floor, and it is caps-only.** The previous floor of 9 px appears nowhere on the
approved artboards; **9 px is retired.** Body copy never goes below 13 px. All-caps micro-labels
always carry tracking.

- Everything on a **4 px grid**.
- Build repeated rows with **fixed-width lanes**, not gaps. Icons, steppers and macro slots get an
  explicit width and `flexShrink: 0`, even where a lane is empty in some rows.
- Chips and inline labels need `flexShrink: 0` and `whiteSpace: nowrap`, or a stretched flex row
  breaks words mid-syllable.
- Spacing groups; rules separate. Equidistant spacing everywhere reads as one flat stack.
- **Assume the longest string, not the average one.** Spanish chrome runs 30–40 % longer than
  English. Design the row that survives, then check it in both languages.

#### Screen padding, and the two columns

| | Value | Screens |
|---|---|---|
| horizontal padding | **24 px** | camera, review, goals, settings — anything that is not a list |
| horizontal padding | **20 px** | results: the goal bar, the tabs and the list, giving a **350 px** column |
| bottom safe pad | **34 px** | under the last element of any bottom-docked block |
| list bottom pad | **96 px** | under the last card, to clear the floating nav |

Two chosen values, not one accidental drift. *(Resolves the former open item #3.)*

#### Radii

`999 px` for anything pill-shaped · `14 px` card · `12 px` callout panel · `6 px` results goal-bar
chip. Nothing else has a radius.

#### The macro ledger

⚠️ **This replaces the four-80 px-lane macro row described in earlier revisions of this file.** The
approved card lays the macros out as a **ledger with the calories broken out**, not as four equal
slots. The reason is the squint test: four peers made nothing win, and calories is the figure users
scan for.

The block sits under a `1 px` `rule` top border with `10 px` of padding above it, is `320 px` wide,
and has a `16 px` gap between its two columns.

**Left column — `157 px` fixed, `7 px` between rows.** Three rows, protein then carbs then fat,
always in that order, always all three. Each row is a `8 px`-gap flex line of exactly three lanes:

| lane | goal macro | non-goal macro |
|---|---|---|
| dot | `5 px` circle, `goal green` | same box, **no fill** — the lane still occupies its width |
| label | 10/600 caps `0.08em`, `ink` | same, `dim` |
| value | 15/600, `ink` | 15/**500**, `muted` |

**A `1 px` `rule` vertical divider**, `alignSelf: stretch`, separates the columns.

**Right column — `111 px` fixed, right-aligned, vertically centred, `3 px` gap.** The calorie figure
at **22/600 `-0.015em`** in `ink`, and `CALORIES` at 10/600 caps `0.08em` in `dim` beneath it.

- Values are ranges — `21–25g`, en dash, no spaces. **Calories carry no unit.**
- **Macro labels must survive Spanish.** `CARBOHIDRATOS` does not fit; `CARBOS` does. Keep every
  macro label to **8 characters or fewer in every language**, or widen the lane — never let it wrap.

#### The portion row, and its one conditional

Under a second `1 px` `rule` top border with `12 px` of padding, a `9 px`-gap line reading as a
sentence. **This is the only conditional rendering on the card**, and it turns on whether the order
comes in countable pieces:

| | **1 serving** | **more than 1** |
|---|---|---|
| glyph | `30 px` — outer circle `r14` stroked `hairline`, inner `r12` filled `ink` | the same, **plus 8 radial spokes** stroked `#FFFFFF` at `1.4` — a plate cut into pieces |
| sentence | `I'll eat` · **[stepper]** · `of the order` | `I'll eat` · **[stepper]** · `of` · **[stepper]** · `pieces` |
| steppers | one, value `minWidth: 26 px` | **two**, each value `minWidth: 22 px` |

The **second stepper is the denominator, and it is ours** — the count we assumed the order comes in.
It is editable for exactly the reason binding rule 10 gives: oracle 11, model 8, USDA 6 on the same
roll. Never present it as fact.

`I'll eat` and the stepper values are `ink`; `of` / `of the order` / `pieces` are `muted`. All at
14 px, the sentence words at 400 and the stepper values at 600.

#### The card

`350 px` wide · `14 px` radius · `14 px` padding · `10 px` gap between blocks · `1 px` `hairline`
border · `ground` fill. **No shadow.**

Order, top to bottom:

1. **Meta row** — section eyebrow (10/600 caps `0.09em`, `dim`, takes the remaining width) and the
   price (13/500, `muted`, `flexShrink: 0`) on one `8 px`-gap line. The section name is a quiet
   eyebrow, never a group header — binding rule 13.
2. **Dish name** — 17/600 `-0.01em`, `ink`.
3. **Description** — 13/400 lh 18, `muted`.
4. **The macro ledger** (above).
5. **The portion row** (above).

*The price at 13/500 `muted` — rather than 15 px `ink` — is what stops it competing with the dish
name and the macros. (Resolves the former open item #8.)*

#### Controls

| Control | Spec |
|---|---|
| **Primary button** | full-width `999 px` pill, `ink` fill, `paddingBlock: 16`, label 16/600 `#FFFFFF`. One shape for one role, in sheets and on screens alike |
| **Pending button** | the same pill, `rule` (`#F0F0F0`) fill, label 16/600 `dim`, an `18 px` glyph at `gap: 10` before it. **It states what is happening** — *"Reading the menu…"* — and a 12/400 `dim` caption below says the user need not wait |
| **Secondary button** | the same pill with a `1 px` `hairline` border and an `ink` label, no fill |
| **Segmented control** | `fill` trough, `999 px`, `3 px` padding, `3 px` gap; each segment `62 × 30`. Selected: `ink` fill, 13/600 `#FFFFFF`. Unselected: no fill, 13/500 `muted` |
| **Chip** | `999 px`, `paddingBlock: 7`, `paddingInline: 13`, label 14/500. Selected: `ink` fill, `#FFFFFF` label, an `11 px` check at `gap: 6`. Unselected: `1 px` `hairline` border, `muted` label. `+ Add`: `1 px` **dashed** `dash` border, `11 px` plus glyph, `muted` label, `gap: 5` |
| **Stepper** | `999 px`, `1 px` `hairline` border, `3 px` padding, `2 px` gap; `22 × 22` circular buttons; value 14/600 `ink`, centred, `minWidth` 22 or 26 |
| **Tabs** | `fill` trough, `999 px`, `4 px` padding, `6 px` gap, `350 px` wide, centred. Each tab `flexGrow: 1`, `paddingBlock: 9`, `gap: 7`. Active: `ground` fill, label 14/600 `ink`, count badge `ink` fill with `#FFFFFF` 12/600. Inactive: no fill, label 14/500 `muted`, badge `hairline` fill with `muted` 12/600. Badges are `999 px`, `minWidth: 22`, padding `2 / 6` |
| **Callout panel** | `fill`, `12 px` radius, `16 px` padding, `7 px` gap. A `16 px` glyph at `gap: 8` beside a 15/600 `ink` title, then 13/400 lh 19 `muted` body |
| **Back affordance** | a `40 × 40` hit area holding a `chevron-left` at `2` stroke weight. On the results screen it sits alone in a `390 px` rail, `paddingInline: 14`. On a titled screen it sits beside the 24/600 title with a `-8 px` left margin so the glyph optically aligns to the text column |
| **Floating nav pill** | centred, `ground` fill, `1 px` `hairline` border, `999 px`, `6 px` padding, `6 px` gap. Each item is a `999 px` column, `paddingBlock: 6`, `paddingInline: 20`, `gap: 2`, holding a `20 px` icon over an 11/400 label. Active: `fill` background, `ink` icon and label. Inactive: no fill, `muted` icon and label. ⚠️ It carries `box-shadow: 0 6px 20px rgba(10,10,10,0.10)` — see **Decisions not yet made #12** |
| **Sheet** | `position: absolute` with an explicit top and height, a `20 px` top radius, a grab handle centred at the top, and a scrim sized to exactly the sheet's top edge. **Never lay an absolute element over the whole screen** — it swallows every interaction beneath it |

#### Assumptions are labelled, always

Anywhere the app supplies a number the menu did not print, say so in the user's words. On the card
that is the second stepper (above); in prose it is *"we assumed it comes in 3 · tap to change"*.
Our piece counts are contested — oracle 11, model 8, USDA 6 on the same roll — so presenting one as
fact is a claim we cannot support. See binding rule 10.

#### Motion

⬜ **UNDECIDED — the motion system.** No durations, easings or transitions have been specified. The
artboards are static and nothing has been drawn in motion.

Two things *are* ruled and hold regardless: the analysis state is carried by the primary button's
label, never by a spinner, shimmer or progress ring (see *Reject these reflexes* — and
**Decisions not yet made #13**, where the approved pending button appears to contradict this); and
editing a portion updates the card's numbers in place with no toast.

#### Dark mode

⬜ **UNDECIDED — whether the app has one at all.** Never discussed. Every artboard is light-only and
no dark palette exists. Do not derive one by inverting the table above; `#157F3D` and `#B3261E` were
both chosen against white.
## Measured facts — do not re-eyeball these

Measured off the approved artboards on 2026-09-05, 390 × 844. Visible list area is the artboard
height minus the chrome above the first card.

**The everything-on-the-card variant is the one that ships** — `18 · Results` with `Card A`.
*(Resolves the former open item #4. The two compact variants stay on the canvas as the record of
what was rejected; do not build them.)*

| | card | pitch | items visible per screen |
|---|---|---|---|
| **everything on the card — SHIPPING** | **296 px** | **306 px** | **1.87** |
| compact card, detail in a sheet or expansion — rejected | 141 px | 151 px | 3.52 |
| compact card carrying a preference flag — rejected | 173 px | 183 px | — |

Chrome above the first card is **272 px — 32 % of the screen** (status 62 + nav rail 42 + title
block 58 + goal bar 32 + tabs 46 + list padding 14 + gaps). That is **down from 312 px** in the
earlier revision, because the title block replaced a taller header.

⚠️ **But the card grew 260 → 296 px, so density went DOWN, 1.97 → 1.87.** The chrome saving was
spent on the card and then some. The macro ledger and the two-stepper portion row are what bought
it, and both were accepted deliberately — this is recorded so nobody reads 1.87 as a regression to
be optimised away. **The density lever remains the card, not the chrome.**

⚠️ **The chrome figure above does NOT include the allergen disclaimer.** No approved artboard draws
the results screen with an allergen filter active, so the `56 px` the disclaimer occupies is
unmeasured in this layout — it would take chrome to ~328 px and density to roughly **1.68**. The
disclaimer's wording is fixed by `AGENTS.md` and cannot be shortened, so any density work has to
route around it. See *Decisions not yet made* #14.
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
  is the status indicator ✓. ⚠️ **The approved pending button carries an 18 px arc glyph that reads
  as a progress ring.** Unresolved — see *Decisions not yet made* #13. Do not settle it by taste.
- Shadows, gradients, glassmorphism, or a card inside a card ✗ — one hairline separates surfaces ✓.
  ⚠️ **The approved floating nav pill carries a shadow.** Unresolved — see *Decisions not yet made*
  #12. It is the only element in the interface that does; do not extend it to anything else, and do
  not delete it from the nav on the strength of this line alone.
- Emoji as icons ✗ — line SVG, `lucide-react-native` ✓. The approved sizes are **11 px** (chip
  check / plus), **12 px** (titled-screen back chevron), **16 px** (callout glyph), **18 px**
  (pending button), **20 px** (nav pill), **24 px** (results back chevron) and **30 px** (the plate
  glyph on a card). Stroke weight is `2` on navigation glyphs and `1.3`–`1.6` on inline ones.
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
| rule | absent | `#F0F0F0` — new token needed (card rules, pending fill) |
| dash | absent | `#C9C9C9` — new token needed (the `+ Add` chip only) |
| `--radius-card` | `16px` | `14px` |
| callout radius | absent | `12px` — new token needed |
| `--font-display` / `--font-sans` | `Montserrat_700Bold` / `Inter_400Regular` | ⬜ **UNDECIDED** |
| type scale | 32/26/20/16/14/12 | **30/24/22/17/16/15/14/13/12/11/10** |

`--color-accent-lime` (`#D9F26B`) is live in `src/components/scan/ThumbStack.tsx` as the photo-count
badge and is the one token from the old system still doing a job. Keep it until that badge is
redesigned. `--color-accent-rose` and `--color-success` are unused — delete them when the palette is
migrated.

Icons are `lucide-react-native` with `react-native-svg`, already installed. That does not change.

⚠️ **The type scale is now 11 steps, not 6.** That is a consequence of reading real values instead
of proposing round ones, and it is not an invitation to add a 12th. Before introducing a size, check
whether one of these already carries the role — the scale exists to be reused, and every step below
appears on an approved artboard.

## Decisions not yet made

Every ⬜ and 🟡 in this file, collected. **Do not resolve one by picking the option that reads best.**

> **Reconciled 2026-09-05** against the artboards Santiago approved. Four former items are now
> closed **by the approval itself** — an approved artboard *is* a ruling for whatever it draws — and
> are listed under *Closed* below so nobody reopens them. Four new items opened, three of them
> because the approved screens contradict or omit something this file already stated.

| # | Open item | State | What exists | Recommendation |
|---|---|---|---|---|
| 1 | **Font family** | ⬜ | `theme.ts` loads Montserrat + Inter; the KB rationale says one family, two weights; **every artboard renders in `system-ui`, which is Paper's default rather than a choice** | One family (Inter). The drawn hierarchy needs no display face; Montserrat appears nowhere in the approved work. **Blocks the token migration.** |
| 2 | **Primary CTA colour** | ⬜ | Every approved artboard uses near-black `#111111` — the evidence is now unanimous across the whole set, not just one screen; `menu-scan-kb/docs/design-system/rationale.md` still says yellow | Near-black, and correct the KB rationale. **The drawn evidence got stronger, not the decision** — one of the two documents is wrong and it is not this one by default |
| 5 | **Motion system** | ⬜ | Nothing specified. No durations, easings or transitions anywhere. #13 is a precondition | Defer until #13 is settled — whether the pending glyph animates is the first motion question |
| 6 | **Dark mode** | ⬜ | Never discussed. Light-only artboards, no dark palette | Defer, and do not invert the light palette to fake one |
| 7b | **Macro VALUE bump, 15 → 17 px** | 🟡 | The label half of the old #7 shipped (9 → 10 px, on the approved card). **The value half did not** — the approved card keeps 15 px | Leave at 15 px. The ledger's 22 px calorie figure now carries the hierarchy the bump was proposed to fix, so the reason for it is largely spent |
| 9 | **Translate toggle, and return-to-home** | ⬜ | ⚠️ **Neither is drawn.** `18 · Results` is *named* "back + globe" but its nav rail has exactly one child — the back chevron. Home is by the nav pill. Santiago's own note: *"still pending to add a translate toggle / button functionality as well as the return to home button"* | Draw both before the results screen is called done. The nav rail has room for a trailing glyph at `40 × 40`; the rail is already a `space-between` flex row, so it was built for two |
| 10 | **Lime photo-count badge** | 🟡 | `#D9F26B` in `ThumbStack.tsx`, the last token from the old palette. The badge is moving to the top bar beside the zoom control (ruled 2026-09-05), so it is being rebuilt anyway | Drop the lime with the move and use `ink` / `ground`. Confirm at the move, not before |
| 11 | **Empty and zero-result states** | ⬜ | Not drawn. "Unusable menu" and "unreadable photo" exist; "readable, but nothing matched your filters" does not | Draw it before shipping — an allergen filter can empty the Results tab entirely |
| **12** | **The floating nav pill's shadow** | ⬜ **NEW** | The approved nav pill carries `0 6px 20px rgba(10,10,10,0.10)`. *Reject these reflexes* says no shadows, one hairline separates surfaces. **The approved design and the reject-list disagree** | Keep it, and narrow the rule to "no shadows **on static surfaces**". A hairline cannot separate an element that floats over scrolling content — that is the one case the rule did not anticipate. **But it is a rule change, so it is Santiago's** |
| **13** | **The pending button's arc glyph** | ⬜ **NEW** | The approved pending button has an 18 px arc at `2.2` stroke — visually a progress ring. *Reject these reflexes* forbids a progress ring while analysis runs, on the grounds that the button's label is the status indicator | Keep the arc **static** as an icon and never animate it. That satisfies both readings, and the label still does the work. If it is meant to spin, the reject-list entry has to be rewritten instead |
| **14** | **The results screen with an allergen filter active** | ⬜ **NEW** | Undrawn. No approved artboard shows the mandatory disclaimer in place, so its `56 px` is unmeasured in this layout (est. chrome 328 px, density ~1.68) | Draw it. The wording is fixed by `AGENTS.md` and non-negotiable, so the layout has to absorb it — better to find that out on the canvas |
| **15** | **The per-page re-scan flow** | ⬜ **NEW** | Undrawn, and being designed separately — see the handoff written 2026-09-05. `5 · Goals — unreadable` already names the page (*"Page 2 came out too blurry"*) but its `Scan again` button has no destination | Not this file's to answer. Recorded so the gap is visible from here |

### Closed 2026-09-05 — by the approval of the artboards

| was | now | closed by |
|---|---|---|
| #3 **Screen horizontal padding** | **20 px on list screens, 24 px elsewhere** — both deliberate | measured on every approved artboard; matches what this file recommended |
| #4 **Which Results variant ships** | **everything on the card.** The two compact variants are rejected and stay on the canvas as the record | `18 · Results` + `Card A` being approved as *the* results screen |
| #7a **Macro LABEL bump, 9 → 10 px** | **accepted.** 9 px is retired; 10 px is the floor and is caps-only | the approved card's macro labels |
| #8 **Price demotion** | **accepted** — 13 px `muted`, not 15 px `ink` | the approved card's meta row |

⚠️ **An approved artboard is a ruling only for what it actually draws.** It is not a ruling for what
it is *named* — #9 is open precisely because `18 · Results` is named "back + globe" and contains no
globe. Read the nodes, not the label.
