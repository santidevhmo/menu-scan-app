# Design — the portion control

**Date:** 2026-08-11 · **Branch:** `feat/forced-serving-pieces` · **Status:** ✅ IMPLEMENTED — historical record
(`src/lib/portions.ts`, `src/components/results/PortionEditor.tsx`; see §10b for the shipped behaviour).
⚠️ Shipped in the app CODE, not yet in a TestFlight build — build 6 predates it.
**Supersedes:** the bare piece-counter label decided earlier the same day (written in `src/lib/portions.ts`, never shipped to a build)

---

## 1. The problem

A diner needs to say how much of a dish they will eat, and dishes divide in incompatible ways. A pizza
comes in slices, a sushi order in pieces, a soup in one bowl, a steak on one plate. Today the app has
one stepper that moves in half-items, so "three of eight slices" cannot be expressed at all, and the
model's `serving_pieces` — the field meant to fix that — is wrong often enough that the UI cannot
depend on it: **all 26 Bistro pizzas came back as 1** in the 2026-08-11 generalisation run.

**The app is used BEFORE ordering** (Santiago, 2026-08-11). It is a what-if while choosing from a
menu, not a food log. Two consequences run through this design: the diner has never seen the dish, so
any piece count is a plan rather than a memory; and the screen's main job is ranking 40+ items against
the diner's goals, so rows must stay scannable.

## 2. What this is NOT

- **Not** a change to how macros are estimated. Nothing here touches the edge function, the model, or
  the ingredient maths.
- **Not** a fix for the model's piece-count defect. That stays a known open defect; this design stops
  it blocking anyone.
- **Not** a free-text input. Every value is a number in a numeric field, so nothing the diner types
  reaches a model and there is no prompt-injection surface.
- **Not** a food log, and **not** networked — no backend, no schema, no telemetry. Logging divisor
  corrections is deliberately a separate spec.

## 3. State

Two values per item, both client-side, both reset when a new scan produces new results — exactly how
`portions` already resets in `src/app/results.tsx`.

```text
portion         number   how much of ONE ORDER the diner will eat.  Default 1.
piecesPerOrder  integer  what one order is cut into.                Default from the model.
```

`piecesPerOrder` seeds from `item.serving_pieces`, guarded: a value that is not an integer, is below
1, or above 50 becomes **1**. The model can return anything; the UI must not.

**Macros are always `itemMacros × portion`.** `piecesPerOrder` never enters the calculation. This is
the single most important line in the design — it is what makes §6's guarantees arithmetic rather
than aspiration.

## 4. Display

| `piecesPerOrder` | the row shows | one step |
|---|---|---|
| `1` | `1` · `0.5` · `2` | 0.5 |
| `> 1` | `8 / 8` · `4 / 12` · `1.5 / 3` | one piece (`1/N`) |

The numerator is `portion × piecesPerOrder`, shown as a whole number when it is one and to one decimal
otherwise. **No ceiling in either form** — `16 / 8` is two pizzas, `2` is two soups.

The floor differs by route, deliberately: the **stepper** stops at one step, because stepping to zero
is meaningless, while a **typed** value may be any number above zero, so a diner who wants a quarter
of a soup can have it. Zero itself is rejected in both.

The `N / M` form carries its own meaning, so no unit word is shipped: `8 / 8` cannot be misread as
eight platters the way a bare `8` could. If testing shows otherwise, `pieces` can be appended later,
and only then is it worth deciding whether `slices` justifies a model field.

## 5. Editing

Tapping the value opens one small editor with both fields, whatever form the row is in:

```text
   I'll have   ⊖   4   ⊕
   comes in    ⊖   8   ⊕
```

One affordance and one mental model. It is also the only route by which a dish showing `1` can be cut
into 8, which is the Margherita case. Both fields accept typed numbers: `I'll have` takes decimals
(0.5 of a soup), `comes in` takes integers 1–50.

The value on the row must **look** editable — it is the only way anyone discovers they can correct a
wrong count.

## 6. The two invariants

1. **Changing `comes in` never changes the macros.** `portion` is untouched; only the displayed
   numerator recomputes.
2. **Changing `I'll have` is the only thing that moves macros.**

Worked through, with the pizza the model failed to count:

| action | `portion` | row | kcal |
|---|---|---|---|
| arrives, model said 1 | 1.0 | `1` | 1043 |
| diner sets comes-in 8 | **1.0** | `8 / 8` | **1043** |
| taps down four times | 0.5 | `4 / 8` | 522 |
| corrects comes-in to 12 | **0.5** | `6 / 12` | **522** |
| sets comes-in back to 1 | **0.5** | `0.5` | **522** |

Because the app is used before ordering, a change to `comes in` **preserves the share**, not the
count: `8/8` → 12 gives `12/12`, and `4/8` → 12 gives `6/12`. A diner reconciling against slices they
have already eaten would want the count preserved instead — that user does not exist here, and the
single rule is the simpler one.

## 7. When the model gets the count wrong

Both directions are the same control, and neither corrupts nutrition:

| error | shown | actually wrong | diner's fix |
|---|---|---|---|
| Steak as `3 / 3` | 892 kcal — **correct** | steps in thirds, not halves | comes-in → 1 |
| Margherita as `1` | 1043 kcal — **correct** | cannot think in slices | comes-in → 8 |

A misclassification costs granularity, never accuracy, because the macros were always for the whole
order. This is why the model's piece-count defect is an ergonomics problem rather than a data one, and
why no feedback loop is needed for the diner to get an answer they can trust.

## 8. Generality

| dish | model gives | row | diner can |
|---|---|---|---|
| Soup, steak, burrito, salad, cheesecake | 1 | `1` | 0.5, or 2 |
| California roll | 8 | `8 / 8` | `6 / 8`, or correct max to 12 |
| ENFRIJOLADAS (*Tres tortillas*) | 3 | `3 / 3` | `2 / 3` |
| Margherita | 1 ✗ | `1` | comes-in 8 → `4 / 8` |
| Wings (`6 PZ`) | 6 | `6 / 6` | `4 / 6` |
| Hot dog, entrée, dessert | 1 | `1` | 0.5 |

Every dish gets the same control. `piecesPerOrder` is 1 for most of the world's menu items, and 1
behaves exactly as the app does today.

## 9. Files

- `src/lib/portions.ts` — replace the label function with the conversions: numerator from
  `portion × piecesPerOrder`, step from `piecesPerOrder`, and the guard on a model-supplied count.
  Pure functions, no React.
- `src/components/results/MenuItemRow.tsx` — render `N / M` or the single number; open the editor on
  tap.
- `src/app/results.tsx` — hold `piecesPerOrder` per item beside the existing `portions` map, reset on
  a new result the same way.

## 10. Testing

`portions.ts` is pure, so its tests carry the design:

- numerator and step for `piecesPerOrder` of 1, 3, 8, 12
- a model count that is null, 0, 1.5, −3, 51, NaN or Infinity all become 1
- floating point: `1/3 + 1/3 + 1/3` must read `3 / 3`, never `2.9999 / 3`
- **invariant 1 as a test**: for a set of portions and divisors, changing the divisor leaves
  `itemMacros × portion` byte-identical
- no ceiling: `16 / 8` and `2` both render
- floor: the stepper stops at one step; a typed 0.25 is accepted; zero is rejected by both

## 10b. As built — where the shipped control differs from this spec

Written after device testing on 2026-08-11. The spec above is the design; this
section is what exists, and it wins where the two disagree.

| this spec said | what shipped | why |
|---|---|---|
| the numerator shows to one decimal (§4) | **two** decimals | one decimal displays a typed `0.25` as `0.3` beside calories computed from `0.25`, which the diner can catch. Two makes the number shown always the number used. |
| §5's editor was silent on what its quantity counts | it counts the **dish's own unit** — rolls for a roll, plates for a steak | Santiago typed `18` on a 12-roll plate meaning eighteen rolls and got eighteen plates. The row counts pieces, so the editor must too, or one screen holds two units. `unitCount` / `portionFromUnitCount` own the conversion. |
| one step = `1/N` of an order everywhere (§4) | the **row** steps by one piece; the **editor** steps by one piece where a dish has them and half an order where it does not | in a field counting orders, one piece of a 6-piece dish reads `0.17`. In a field counting pieces it reads `1`. |
| nothing about per-piece feedback | the editor shows `Whole order 592 cal — each piece about 49 cal`, live off the draft divisor | §6's guarantee made the divisor look inert: correcting it changed nothing visible, which reads as a broken control rather than a working one. |
| numeric fields, unspecified how | both fields sanitise input to digits (plus one dot for the quantity), and the divisor gets a digits-only pad | a decimal pad cannot produce letters, but a hardware keyboard, a paste and dictation all can. |

**One implementation constraint, not a design choice:** the quantity `TextInput`
sets `textAlign` through `style`, never `className`. `nativewind@5.0.0-preview.4`
ships a `TextInput` whose `nativeStyleMapping` is `{ textAlign: true }` while the
code consuming it calls `path.split(".")`, so any text-align class crashes the
render. Revisit when nativewind leaves preview.

## 11. Out of scope

- Logging divisor corrections to `scan_log` — its own spec, agreed 2026-08-11.
- Improving the model's piece count (the pizza gap).
- The unweighted-dish portion anchor, parked on `feat/unweighted-portion-anchor`.
- Any unit word (`pieces`, `slices`) and any model field to supply one.
