# C2 — deterministic cleanup for the (c) text-structuring extractor

**Status:** DESIGN — 2 Santiago fixture decisions block part of it (§5). No code written yet.
**Context:** ruling 30 adopted option (c): Stage-1a = Mistral OCR `markdown`, Stage-1b = pinned
`gpt-4.1-2025-04-14` with `EXTRACT_PROMPT`/`EXTRACT_SCHEMA` verbatim. C1 (evals 103, 104, 104b, 104c)
measured all 9 menus: **29/45 dims, zero unprinted items suite-wide, 97.4% printed-price coverage.**
This spec closes the remaining deterministic classes.

## 1. Validation method — $0, and it is the point

Every rule here is validated by **re-scoring the 9 cached (c) dumps** (`*.eval103c-m41-r1.dump.json`),
exactly as eval 099 validated the M1/M2 constants. No API calls. Method, per eval 099:

1. Implement the rule with its **constants EXPOSED**, not baked.
2. Sweep each constant across its full range over all 9 menus / 12 photos.
3. **The deliverable is the width of the stable plateau, not a passing value.** A narrow plateau =
   a constant fitted to our 9 menus = a ruling-7 generalization risk. Adopt mid-plateau or not at all.
4. A faithfulness self-check FIRST: the harness at baseline settings must reproduce today's
   numbers EXACTLY (29/45, per-menu as in eval 104b) before any sweep result is believed.

A live confirmation run is **not** part of C2 — it belongs to C4's ×3 gate (~$0.22/run for all 9).

## 2. Two structural findings that constrain every rule below

**(a) `promoteSections` runs in the OPPOSITE direction and must not be fought.** It takes a
null-price item carrying options and EXPLODES the options into items with `section_title = item.name`
(`postprocess.ts:131`). Rules C2-2/C2-3 below COLLAPSE children back into a section-named item. If
both fire on the same input they oscillate. **Measured: `promoteSections` is NOT the cause of any
C1 class** — polloteria's AGUA/CREMA region is byte-identical before and after postprocess (eval 104c).
Every new rule must therefore be predicated on shapes `promoteSections` provably does not produce,
and the sweep must report **zero interaction** (no item touched by both).

**(b) The parent heading is GONE from the model's output, by instruction.** The print nests
`# Paletas Heladas` → `# AGUA $20` → 6 flavors. `EXTRACT_PROMPT` says *"each item belongs to its
nearest subheading, never the parent"*, so the model emits `section_title: "AGUA"` and
`Paletas Heladas` is discarded — correctly. The oracle keys on `name_contains: "Paletas Heladas"`
(M1 fixture ruling C). **No postprocess rule operating on the model's output can recover that name.**
The information survives only in the Stage-1a OCR text. This is the master-roadmap "fix at the layer
where the information still exists" lesson, and it forces a Santiago decision (§5.1).

## 3. Rules, ordered safest-first

### C2-1 — letter-spaced section titles (Class C) · no constant · LOWEST risk
`brasero-two` emits `P O S T R E S`, so `Postres` is reported missing and `BROWNIE` maps to the
spaced form. Extend `normalizeSectionTitle` (already the home of the camelCase split): collapse a run
of **≥3 consecutive single-character tokens** into one word. Language-neutral, no keyword list.
Risk: a title legitimately containing single letters (`A LA CARTE`, `GH MAC | N | CHEESE` — note
guest-house prints exactly that shape). **Sweep the minimum-run-length constant 2..6** and require
zero changes to any other menu's titles.

### C2-2 — a section title that duplicates an item name (Class B1) · guest-house ×2
`SEAFOOD PLATEAU*` and `PRIME TOMAHAWK* GF, DF` appear BOTH as items (correctly, with Shape-A
options) AND as `section_title` on themselves — a spurious section. `dropHeaderEchoes`
(`postprocess.ts:161`) targets this family but requires `price === null`, and these items are priced,
so it cannot fire. **Do not loosen `dropHeaderEchoes`** — it is shared with the incumbent GPT path
and its null-price predicate is what keeps it safe. Instead add a rule in the (c) chain: when a
section title normalizes equal to the name of an item **that is itself in that section**, null that
item's `section_title` (the item is its own card, not a group). Affects the section dimension only;
never deletes an item. Risk: a real section legitimately sharing a dish's name (a `Tacos` section
containing a `Tacos` dish). Sweep: none needed (exact-match predicate) — but the sweep must report
**every** affected item across the 9 so Santiago can eyeball collateral.

### C2-3 — a `#` heading that is really a dish card, children are its options (Classes B2 **and D, now UNIFIED**) · brasero-two + polloteria

**UNIFICATION (eval 105):** Class D (polloteria Paletas) and Class B2 (brasero-two Taco Loiro) are ONE
class — `#` markup in the OCR markdown turns a priced dish card into a section. GPT-4o **vision** never
had this failure because it saw the cards visually; its eval-093 passing dump is the worked target:
`Paletas Heladas Agua $20 | sec=Paletas Heladas | opts=[Uva, Piña, Melón, Nuez, Tamarindo, Fresa, Limón]`
— i.e. **name synthesized from PARENT + child heading**, price from the child heading, flavors as
null-price options, `section_title` = the PARENT (which technically violates the prompt's
"nearest subheading, never the parent" rule, yet is what passed the gate ×3).

OCR prints `# TACO LOIRO (sirloin)` then `picaña $165` / `pollo $150`. The `#` markup overrides
`EXTRACT_PROMPT`'s semantic rule (*"a heading … must also group menu items beneath it"*), so the
model emits two standalone items under a `TACO LOIRO (sirloin)` section. The fixture wants ONE item
`Taco Loiro` with `[Picaña@165, Pollo@150]` as options — the pin eval 098's colocation guard once
false-dropped. **Predicate:** a section whose title is claimed by NO item's name, all of whose items
are description-less, and which holds ≥2 items ⇒ collapse into one item named from the title, children
as priced options with their grams. **This is the highest-risk rule in the spec** — it deletes items
(converts them to options), so a false positive silently removes dishes. Constants to sweep: minimum
child count (2..5), and whether to require all children description-less vs a fraction. **Predeclared
abort condition: if the plateau is narrower than 2× on either side, do NOT adopt — report and stop.**

### C2-4 — combo grams SUM (Class F) · known M1 bug · polloteria ×1
**Eval-105 context: NO extractor has ever met this expectation.** GPT-4o vision's own eval-093
passing dump also reads `Megacharra Boneless … g=1200`, identical to (c) — the 1800 value entered the
fixture during M1 (Santiago re-adjudicated it as boneless 1200 + fries 600) AFTER eval 093 had passed
against 1200. So this is NEW work required of any extractor, **not a (c) regression.**

`Megacharola Boneless` scores 1200 where the oracle says 1800: `parseItemGrams` takes the FIRST
weight in a combo description (`boneless(1200gr) … papas(600gr)`) instead of summing. M1 hit this
from the other side and removed `parseItemGrams` from the Mistral chain entirely; under (c) it is
load-bearing and correct almost everywhere (`TostiBoneless`→450, `El Tendedero`→750, eval 103).
**Narrow fix:** when the item's NAME carries no weight and its DESCRIPTION carries ≥2 weights, sum
them. Risk: double-counting a description that restates one weight two ways. Sweep: the
minimum-weight-count trigger (2..4) and require every other grams expectation across all 9 unchanged.

### C2-5 — welded composite names (Class E) · el-marcos ×5 · DEFER unless C2-1..4 land clean
`CHILAQUILES (70gr.) Regionales` = base card + its variant text welded into one name; the fold should
have produced `Chilaquiles` + option `Regionales`. **Hard constraint discovered in eval 104b:** the
same model CORRECTLY REJOINS headings the OCR wraps across lines (`TACOS LECHUGA DE FILETE` +
`DE PUERCO` → one dish, mochomos). A naive splitter breaks that. Any rule must separate "base +
variant" from "one name across two lines", and the only signal that distinguishes them in our data is
whether sibling items share the same base prefix at the same price. **This is the class most likely
to need a prompt experiment instead** (§4) — recommend deciding after C2-1..4 are measured.

## 4. On prompt experiments (Santiago authorized them 2026-07-29)

Authorized, but nothing here has earned one yet. Both prompt hypotheses raised so far died at $0:
the "sizes are NOT options" conflict was refuted (polloteria keeps M/G, Grandes/Jumbo, 6/12/20 PZ),
and the "data loss" it was meant to explain did not exist (eval 104c). The remaining candidates are
Class B2 and Class E, and for B2 a prompt fix would be a **layout** instruction ("a heading followed
only by priced lines is a dish"), which master-roadmap lesson 3(b) records as the exact shape that
caused a past regression — *instruct WHAT to preserve, never WHERE/HOW to lay it out.*

**If a prompt experiment does run, the protocol is fixed in advance:** ONE sentence, appended to
`TEXT_PROMPT_SUFFIX` (never edited into `EXTRACT_PROMPT`, which is shared with the incumbent path);
tested first on the target menu **plus the three menus currently at ALL-5** (bistro, brasero,
casa-nostra — what a global lever would break) ≈ **$0.12**; promoted to all 9 (~$0.22) only if the
ALL-5 three are untouched. Eval 096 is the standing precedent: a single schema field description
regressed polloteria 5/5→2/5 while correctly fixing its target.

## 5. Santiago decisions that block part of C2

### 5.1 Paletas Heladas — RESOLVED IN SHAPE by eval 105; only the mechanism is open
Print nests `Paletas Heladas` → `AGUA $20` (6-7 flavors) / `CREMA $30`. (c) emits 12 flavor ITEMS under
sections `AGUA`/`CREMA`. **~~(a) ORACLE-CHANGE the pins~~ — WITHDRAWN, it fixes nothing:** the fixture's
two Paletas pins are `unchecked: true`, so they TOLERATE the items rather than require them. polloteria's
`items` 51/40 failure is caused by the **12 extra items**, not by a pin missing its target. Only the
12 → 2 collapse fixes the count, and the same collapse also removes the 2 spurious `AGUA`/`CREMA`
sections. **So the mechanism is settled: reproduce GPT-vision's eval-093 shape** (§C2-3) — collapse the
priced `#` sub-heading into ONE item, name it `<parent heading> <child heading>`, price from the child
heading, flavors as null-price options, `section_title` = the parent. **The parent heading is present in
the Stage-1a OCR text** (`# Paletas Heladas`), so cleanup gains an OCR-text input — a new coupling, and
the only way to recover a name the model discards by instruction. Santiago's remaining call is just
whether that coupling is acceptable (planner: yes — the text is already in the same pipeline, and it
generalizes to every nested subheading rather than to this menu).

### 5.2 Promote the Shape-A pins (rulings 1 + 17) — affects brasero-two + guest-house
(c) natively emits ruling-1 Shape A: `CHURRASQUERÍA $495 → [SENCILLA (300gr)@495, DOBLE (600gr)@950]`,
`SEAFOOD PLATEAU* → [FOR TWO@150, FOR THREE OR MORE@280]`, `HALF MAINE LOBSTER TAIL → [chilled, grilled]`,
`MEXICAN WHITE SHRIMP → [EA@7]`, and on polloteria `Ensalada Boneless → [M (150gr)@158, G (300gr)@179]`,
`Crispy Chicken → [Grandes (300gr), Jumbo (600gr)]`, `Alitas → [6 PZ, 12PZ, 20PZ]`. The fixtures still
encode the pre-Shape-A **two-item** shape (`Churrasquería sencilla` + `Churrasquería doble`), which is
what GPT-vision and Mistral both produced. Ruling 17 deferred promoting these pins to "Phase-2 close".
**Consequence: part of (c)'s 29/45 is FIXTURE DEBT, not model error**, and promoting the pins raises
the score with zero code. It may also mean **(c) has already closed Phase 2's size-variant convention
gap** — the ROADMAP's "MANDATORY RESTORE" list. Needs Santiago's ruling on whether Phase-2 promotion
happens now, as part of C2, rather than later.

## 6. Sequencing

1. Santiago rules §5.1 and §5.2.
2. Executor implements **C2-1** (trivial) and **C2-2** (exact-match) TDD-first; planner sweeps + audits.
3. **C2-4** (grams sum) next — narrow, single menu affected, easy to bound.
4. **C2-3** last of the code rules, with its abort condition honored — it is the only rule that can
   silently remove dishes.
5. **C2-5** decided on evidence after the above, prompt-experiment protocol per §4 if chosen.
6. Then **C3** edge port, **C4** all-9 ×3 live gate, deploy as a separate explicit step.

Every step's exit is the same: the 9 cached dumps re-scored, per-menu numbers reported, plus a
ruling-6 audit that no printed dish was lost and no unprinted item introduced. A numeric scorer pass
is never a gate by itself (ruling 6).
