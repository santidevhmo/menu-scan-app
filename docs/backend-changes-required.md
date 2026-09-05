# Backend changes required by the low-fidelity UX

**Written 2026-09-01**, from the design grill that produced the low-fi screens. Every item below is a
decision Santiago made in that session, not a proposal. Vocabulary is defined in `/CONTEXT.md`.

**Amended 2026-09-05:** §1's verdict is **per page**, not per scan. That is the only change; every
other ruling below stands as written on 2026-09-01.

**Nothing here touches extraction or enrichment accuracy.** Phase 5 closed 2026-08-28 and production
stays on edge fn `analyze-menu` **v33 (FORM sizing)**. These are contract and plumbing changes.

Order below is by cost to the user of *not* doing it, not by effort.

---

## ✅ First: three things the UX needs that need NO backend work

Stated explicitly so nobody builds them.

| the UX wants | why it's free |
|---|---|
| **Macro ranges** instead of point numbers | Ruled a **flat ±10%** around the existing point value. It is a pure client-side transform of `protein_g` / `carb_g` / `fat_g` / `estimated_calories` — **do not add range fields to the schema.** ⚠️ **±10% is narrower than the band we are measured against.** The oracle's pass window is the average dish **±20%**, and `FORM` (v33) lands **62% of macro fields** inside *that*. A ±10% strip therefore displays roughly twice the precision the pipeline has demonstrated. Santiago's call, made knowingly on 2026-09-01; recorded here so nobody later reads it as a measured figure. |
| **Section labels** on result cards | `section_title` is already extracted and already on the wire. It is simply never read in `src/`. |
| **Price on the card** | `price: number \| null` already ships and already renders. Sorting by price is explicitly **out of scope for now.** |

⚠️ **If the flat ±20% is ever replaced by a per-item width, this changes** — a derived width needs a
signal from the server. Until then, no.

---

## 1. 🔴 Stage 1 must report a verdict PER PAGE, not per scan

**The single most important change here.** Today the client cannot tell three outcomes apart:
extraction returns HTTP 200 with `items: []` whether the photo was unreadable or simply had no
dishes on it, enrichment is skipped, and the user lands on a screen reading **"No items to rank."**
with no explanation and no way forward but the back button.

🔑 **THE VERDICT IS PER PAGE. (Ruled: Santiago, 2026-09-05.)** A scan is 1–10 pages (`/CONTEXT.md` →
*Page*), and the UX the verdict exists to serve is *"**Page 2** came out wrong. Re-scan it"* — with
re-scanning that one page made as easy as possible. A single scan-level verdict cannot name which
page failed, so it cannot drive that screen. Do not design or build a scan-level `outcome` field.

**Required:** a per-page discriminated outcome on the extraction response.

| outcome | meaning | what the app does with that page |
|---|---|---|
| `ok` | text read on this page | keep it |
| `unreadable` | no usable text — blur, darkness, glare, not a menu | mark the page for re-scan |
| `readable_no_items` | text read, no menu items in it (a wine list cover, a page of prose) | keep it, do not ask for a re-scan |

Each non-`ok` page carries a short **user-safe** reason string (see §5) — e.g. *"too blurry to
read"*, *"too dark"*. The reason drives copy the user actually sees, so it must be written for a
diner, not a developer. It names the page by its **1-based position in the scan**, matching what the
interface counts ("Page 2 of 3").

**The scan-level state is DERIVED on the client, never sent.** One field, three cases:

| every page | the client shows |
|---|---|
| all `ok` (or `ok` + `readable_no_items`, ≥1 item found) | proceed to results |
| **some** pages `unreadable` | the re-scan screen — the failed pages flagged, tap one to replace it |
| **all** pages `unreadable`, or 0 items across a readable scan | the unusable-menu screen, no further action |

### ✅ IMPLEMENTED 2026-09-05 — and one claim in the first draft of this section was wrong

**Corrected.** The 2026-09-05 draft of this section said the per-page character count was *"already
logged on every scan"* and that `image_quality` made the judgement. **Both were false**, and the
correction is worth keeping because each one would have sent the next session looking for data that
is not there:

| the claim | the truth |
|---|---|
| `index.ts:241` logs per-page `ocr_chars` on every scan | It logs them **only on the `needs_rotation` branch.** The success path — every normal scan — recorded no readability signal at all. |
| `image_quality.usable` is the judgement, made per page | `image_quality` is **vestigial and always `true`.** `runPagedExtraction` hardcodes `{ usable: true, issues: [] }`, and `EXTRACT_PROMPT`'s text-structuring variant explicitly instructs the model to set it true because there is no image in front of it. It has never reported anything. |
| the judgement "is currently made nowhere" | Correct, and it remains the reason this ticket existed. |

**What was true:** the per-page *text* does exist on every scan — `runPagedExtraction` OCRs each page
to its own markdown string. It was simply never returned. So the change was local, unpaid, and
touched **no model schema and no prompt**: nothing here can move an eval score.

**What shipped:**

- `pageVerdicts(texts, itemsPerPage)` in `extract.ts` — pure, and computed **before**
  `mergeItemSources`, because the merge is what destroys page attribution.
- `pages: PageVerdict[]` on the extraction response — `{ page, outcome, reason, ocr_chars }`,
  `page` 1-based to match what the interface counts.
- `scanOutcome()` / `pagesToRescan()` in `src/lib/scanOutcome.ts` — the client-side derivation.
- `ocr_chars` and the full `pages` array now recorded in `scan_log` on the **success** path too.

⚠️ **`READABLE_MIN_CHARS = 40` is a JUDGEMENT, not a measurement.** Every fixture menu is readable,
so there is no unreadable page anywhere in the corpus to calibrate a floor against. `ocr_chars` is
returned per page and logged on every scan precisely so production accumulates that distribution
for free. **Do not quote 40 as measured.**

⚠️ **One reason string, because we cannot tell blur from darkness from glare.** Mistral returns
markdown and text-block boxes and no quality signal; the structuring model never sees the photo. So
the copy is *"we couldn't make out any text on this page"*. **The approved artboard's copy — *"Page 2
came out too blurry to make out any text"* — claims a cause we cannot detect**, and naming a specific
false cause on a diner's screen is worse than a vague true one. Either the copy softens, or a model
is asked for the cause (a paid schema change, unmeasured, needing Santiago's approval).

⚠️ **The dense-crop path still returns no verdicts.** One page becomes four tiles there and the
attribution is unsolved, so `pages` comes back absent and the client treats it as "no per-page
re-scan available" rather than "all pages fine". Known gap, not a silent one.

⚠️ **The camera needs a matching write path.** Re-scanning page 2 must **replace slot 2**, not
append an 11th photo. That is client work, but it is the reason this field exists — a per-page
verdict with an append-only camera buys nothing.

---

## 2. 🔴 Pin the language of `ingredients[].name`, or add a normalized key

**This silently breaks a shipped feature.** The allergen and ingredient-avoidance filter matches the
user's selected chips against `ingredients[].name`. Eval 185 recorded the model **switching language
between passes on the same dish** — pass 1 returned `jamón` / `champiñones`, pass 2 returned `ham` /
`mushroom`. Nothing pins it.

So a user avoiding **mushroom** is filtered correctly or not depending on which pass answered, on a
menu they cannot see the language of. It fails silently and looks like the filter simply missed.

**Required, pick one:**

- **(a)** Pin every ingredient name to one language across both passes, or
- **(b)** Add a second field — a normalized English key alongside the display name.

➡️ **(b) is preferred** and is groundwork for the FNDDS lookup already scoped as next-phase work
(`START-HERE.md` §①). It also matches the standing rule: the user sees the menu's own words, English
exists only as an internal key.

⚠️ **Do not solve this by translating the display name.** `/CONTEXT.md` → *The menu's own words*.

---

## 3. 🟡 Extract the menu's own title

**New field.** The results screen leads with the restaurant or menu name, the way the scanned page
does. It is also the field the future history search ("search past scans by place name") will need.

**Required:** `menu_title: string | null` on the extraction response — read from the photo, usually
the largest text on the page.

- **Null is a perfectly good answer.** The client renders a neutral header and does not prompt.
- The user can rename it, but is **never asked to.** Santiago: *"Don't want to show it empty and
  give the user the task to fill it."* It is opportunistic data capture, not a form field.
- Multi-page scans: take it from the page that has one; do not concatenate.

---

## 4. 🟡 On-demand description translation

**New capability.** The results screen carries a **Translate menu** toggle, off by default.

| | translated |
|---|---|
| item **description** | ✅ yes |
| item **name** | ❌ **never** — it is what the user orders by |
| price, section title | ❌ no |

**Required:** a way to translate the descriptions of an already-scanned menu into the user's own
language, on request. Target language comes from the device.

- It fires **after** results are on screen, so it must not be inside the scan path and must not
  re-run enrichment.
- It is per-scan, not per-item — one round trip for the whole list, then cached client-side. A
  per-item call on toggle is the wrong shape.
- ⚠️ Translation must **not** feed back into enrichment, sorting, or ingredient matching. It is a
  display layer over an already-computed result.

---

## 5. 🟡 Error messages are currently developer-facing

`getFunctionErrorMessage` (`src/lib/analyzeMenu.ts:73-92`) surfaces strings like *"Check
EXPO_PUBLIC_SUPABASE_URL, project status, and network reachability"* **directly to the user**, in
red, with no retry affordance.

**Required:** every failure returns a machine-readable `code` plus a user-safe message. The client
maps the code to copy and to an action (retry / rescan / go home). No environment variable, function
name, or provider name reaches a diner's screen.

### ✅ IMPLEMENTED 2026-09-05

- `src/lib/scanError.ts` — five codes (`offline`, `timeout`, `server`, `malformed`, `unknown`), the
  copy table, and the action each maps to. Zero imports, so it is covered by the suite.
- `getScanError()` replaces `getFunctionErrorMessage()` in `analyze-menu.ts` and returns
  `{ code, message }`. **`message` is now log-only** and still carries the env hints on purpose;
  `error_code` is what the UI reads.
- `badRequest()` and the 500 handler both emit a `code`. A 400 is `server`, never `malformed` — a
  400 is always *our* request being wrong, and `malformed`'s action is "rescan", which would send the
  user back to retake photos that were never the problem.
- Both render sites in `results.tsx` now show `scanErrorCopy(error_code).message`.

🔑 **The guard is a test over the whole copy table, not a review of the wording.**
`scripts/scan-error_test.ts` asserts that no entry matches SCREAMING_CASE (case-sensitively — with
`/i` the pattern matches any four lowercase letters and passes on everything), any provider name, or
`http`/`url`/`api`/`status`/`null`. A new code cannot be added with a leaky message and go unnoticed.

⚠️ **`error_code` is optional on the wire.** An older deployed function returns no `code`, so
`scanErrorCopy(null)` falls back to `unknown` rather than rendering an empty string. Do not make it
required without a coordinated deploy.

---

## 6. 🟢 The "Excluded" tab needs no new field, but confirm one behaviour

Results split into **Results** and **Excluded** tabs. Exactly two things land in Excluded:

| reason | source |
|---|---|
| contains an allergen the user selected | `allergens[]` ∩ user selection |
| **we could not estimate macros at all** | `ingredients.length === 0` |

The second is phrased to the user as a fact about *the menu* (*"not enough detail to estimate"*),
never as a statement about our certainty.

⚠️ **`confidence` stays internal and is no longer surfaced anywhere.** The ≥75%-low banner
(`results.tsx:319`) is removed. Do not delete the field — it still drives the near-full-screen
callout when a whole menu comes back unusable — but it is never rendered per item.

⚠️ **Disliked ingredients do NOT go to Excluded.** They stay in Results with a marker. Only genuine
allergens hide, and only genuine allergens trigger the mandatory *"AI-estimated. Confirm allergens
with restaurant staff before ordering."* card — that card is non-negotiable per `AGENTS.md`, and the
rename of the filter to "Ingredients to avoid" must not weaken it. **The chips therefore carry an
internal allergen/preference distinction even though the UI shows one list.**

---

## 7. 🟢 Timing contract the UX now depends on

The goals screen appears **immediately** after the scan; extraction and enrichment run behind it and
drive the state of the primary button. Two properties must hold:

1. **Enrichment stays goal-agnostic.** It must remain safe to start before the user has picked
   anything (it is today — `src/app/review.tsx:36-51`). If enrichment ever needs the goals, the
   whole parallel design collapses back into a blocking wait.
2. **Every page's verdict must arrive before the user can leave the goals screen.** The button is
   the status indicator; it cannot enable on a pending state, and it cannot enable on a *partial*
   set of page verdicts either — the button's destination depends on how many pages failed (§1),
   so one pending page is a pending scan.

---

## 8. ⚪ Known-carried, not to be "fixed" quietly

| | |
|---|---|
| `serving_pieces` | shipped as-is and now **shown to the user as our assumption** (*"we assumed 8"*), because our piece counts are contested — the oracle says 11, our model 8, USDA 6 for the same roll. It must remain editable client-side. Do not present it as fact. |
| `options[]` | on the wire, never rendered. Left alone. |
| `grams` | printed weight only, null when the menu prints none. Still not rendered. |
| Portion re-ranking | **explicitly out of scope.** Editing a portion changes the card's numbers and must not change rank order. `portions` stays out of the sort. |
| "Show raw" toggle | `results.tsx:76-97` ships raw model JSON to production users, ungated by `__DEV__`. Development-only per Santiago — **remove before release.** |

---

## Not decided in that session

Flagged so the next person does not assume silence means "no".

- **Persisting a scan.** `menu_title` is captured partly for the future history feature, but the app
  still writes no `scans` row at all (roadmap Phase 2's last deliverable). History was not designed
  in this session.
- **Which service performs the translation** in §4, and what it costs per scan.
- **Where the per-page `unreadable` verdict in §1 is computed** — OCR stage or structuring stage.
  (That the verdict is per-page rather than per-scan was ruled 2026-09-05 and is no longer open.)
- **How a re-scanned page is re-analysed.** Replacing page 2 could re-run the whole scan or just
  that page. Not designed. It is the second half of §1's client work and is being designed
  separately — see the handoff written 2026-09-05.
