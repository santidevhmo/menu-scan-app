# Extraction Options Benchmark Handoff

Date: 2026-07-03

## Repository state

- Repository: `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app`
- Active implementation worktree:
  `/private/tmp/menu-scan-app-extraction-eval-harness`
- Active branch: `feat/extraction-eval-harness`
- Main checkout branch: `feat/selectable-options`
- `feat/selectable-options` was pushed to
  `origin/feat/selectable-options` before this work began.
- Worktree is expected to be clean after the handoff commit.

Read first:

1. `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app/CLAUDE.md`
2. `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app/AGENTS.md`
3. `docs/superpowers/extraction-eval-log.md`
4. `docs/superpowers/specs/2026-07-03-two-pass-options-design.md`
5. `docs/superpowers/plans/2026-07-03-two-pass-options-iteration-009.md`
6. `docs/superpowers/specs/2026-07-02-extraction-iterations-005-009-design.md`
7. `docs/superpowers/plans/2026-07-03-extraction-iterations-correction.md`
8. `supabase/functions/analyze-menu/extract.ts`
9. `supabase/functions/analyze-menu/postprocess.ts`
10. `scripts/eval-extraction.ts`
11. `scripts/fixtures/*.expected.json`

## Active code

The active code is the corrected Iteration 005 baseline:

- Casa Nostra expected count is 23.
- El Marcos expected count is 45.
- Item-count tolerance is ±3 with zero section-header items.
- Deterministic leading-number stripping is active.
- Deterministic serving-format option filtering is active.
- Active extraction still contains the old variant-folding option prompt.
  This conflicts with the newly approved separate-card semantics and is a
  known issue.
- `item_number` diagnostics are not active.
- two-pass options extraction is not active.

## Iteration results

- Iterations 001–004 were re-scored offline after fixture corrections.
- Corrected active Iteration 004 archive:
  - aggregate PASS: items, categories, section context, image quality;
  - aggregate FAIL: options.
- Iteration 006 removed folding rules, regressed items and section context,
  and was reverted (`647c4c7` → `95416c1`).
- Iteration 007 added section-aware item numbers, reported no gaps, regressed
  items, and was reverted (`a5cedb1` → `3cd53ac`).
- Iteration 008 did not trigger because no verified gap existed.
- Iteration 009 split item/options calls, kept items/categories/image quality
  green, but options stayed red and section context regressed. It was reverted
  (`968982b` → `4d0f3b7`).

Archived outputs:

- `/Users/santiagoaguirre/Downloads/MenusTesting/iter-001/`
- `/Users/santiagoaguirre/Downloads/MenusTesting/iter-002/`
- `/Users/santiagoaguirre/Downloads/MenusTesting/iter-003/`
- `/Users/santiagoaguirre/Downloads/MenusTesting/iter-004/`
- `/Users/santiagoaguirre/Downloads/MenusTesting/iter-006/`
- `/Users/santiagoaguirre/Downloads/MenusTesting/iter-007/`
- `/Users/santiagoaguirre/Downloads/MenusTesting/iter-009/`

Never overwrite an archive. Top-level `*.actual.json` files are scratch.

## Approved item/option semantics

- Separate printed rows with separate prices are separate cards.
- Choices within one priced row are structured `options[]`.
- Ingredients joined with `y` are description text.
- Nested conditional combos are description-only until grouped options exist.
- Preserve description and structured options together so enrichment does not
  sum mutually exclusive choices as one plate.

Confirmed El Marcos ground truth:

- Revueltos: three cards. The $90 card has
  Jamón/Chorizo/Tocino options.
- Fritos: two cards. The $90 card has
  Jamón/Chorizo/Tocino options.
- De la Panadería Hot Cakes: two cards. The $78 card has
  Jamón/Tocino/Huevo options.
- Waffles: two cards, no options.
- Plato Surtido: two cards. The $82 card has
  Queso cottage/Yogurt options.
- Pa' los Bukis: one $94 combo; keep its nested choices in description for
  now.

## Immediate blocker

`scripts/eval-extraction.ts` matches option targets using only
`name_contains` and `.find()`. Duplicate-name cards therefore resolve to the
first occurrence. The fixture cannot express “the third Revueltos card whose
description contains jamón and whose price is 90.”

Do not update El Marcos `items_with_options` until the matcher is fixed.

## Recommended next plan

1. Design a backward-compatible fixture target:

```ts
{
  name_contains: string;
  description_contains?: string;
  price?: number;
  options: string[];
}
```

2. Update option scoring to match targets to extracted items one-to-one.
   Consume a matched item so duplicate targets cannot reuse the same card.
3. Add self-check cases with duplicate names and distinct descriptions/prices.
4. Encode the confirmed El Marcos targets above.
5. Review other clear inline alternatives exposed by Iteration 009
   (Machaca huevo/verdura, Té manzanilla/negro, Pan blanco/integral, Avena
   manzana/plátano, and Casa Nostra Cesar lettuce choice) with the user before
   adding them.
6. Offline re-score `iter-009` with corrected ground truth. This measures Pass
   2 without another paid call.
7. Only then decide whether to redesign two-pass Pass 1. Iteration 009's
   option pass may be better than its old score indicates, but its Pass 1
   section-context regression remains real.

## Frozen constraints

- GPT-4o Vision
- temperature `0`
- seed `17`
- model calls only inside the Supabase Edge Function
- `.env.local` contains `OPENAI_API_KEY`; never print or commit it
- append-only evaluation log
- one hypothesis per paid run
- revert and stop when a previously aggregate-green dimension turns red
- package manager: pnpm
- no new dependencies without user approval
