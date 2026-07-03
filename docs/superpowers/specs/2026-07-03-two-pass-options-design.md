# Iteration 009 Two-Pass Options Design

Date: 2026-07-03
Branch: `feat/extraction-eval-harness`
Worktree: `/private/tmp/menu-scan-app-extraction-eval-harness`
Status: approved by user in brainstorming session

## Post-run correction — option ground truth

Iteration 009 ran, regressed section context, and was reverted. Its Pass 2
output also proved that the El Marcos fixture's `items_with_options: []` is
incorrect. The user approved this item/option contract after the run:

- Separate printed rows with separate prices are separate cards, even when
  they repeat the same printed name.
- A choice inside one priced row is structured `options[]`.
- Ingredients combined with `y` are description text, not choices.
- Conditional/nested combos remain description-only until grouped options are
  designed.

Confirmed examples:

- Revueltos produces three cards: Naturales $78; A la mexicana $84; and the
  $90 row. Only the $90 row has Jamón/Chorizo/Tocino options.
- Fritos produces two cards. Only the $90 row has
  Jamón/Chorizo/Tocino options.
- De la Panadería Hot Cakes produces two cards. Only the $78 row has
  Jamón/Tocino/Huevo options.
- Waffles produces two cards with no structured options.
- Plato Surtido produces two cards. The $82 row has Queso cottage/Yogurt
  options.
- Pa' los Bukis remains one $94 combo with its full description and no flat
  options because its main, conditional filling, and drink choices require
  grouped options.

The current fixture cannot encode this safely because option targets match
only `name_contains` and use the first duplicate-name item. The fixture must
not be changed until scoring supports description/price-qualified,
one-to-one target matching.

## Goal

Turn options aggregate-green without adding more option instructions to the
already overloaded item-extraction prompt. Preserve the corrected item,
category, section-context, and image-quality behavior.

## Context

The corrected Iteration 004 baseline is aggregate-green for items, categories,
section context, and image quality; options are red. Iteration 006 reduced some
option false positives by removing variant-folding rules, but regressed items
and section context and was reverted. Iteration 007 added diagnostic item
numbers, produced no section-local gaps, regressed items, and was reverted.
Iteration 008 did not trigger.

Iteration 009 is the planned last-resort architecture change. Testing cost is
not a constraint. Both model calls remain inside the Supabase Edge Function;
provider keys never enter client code.

## Architecture

`runExtraction` makes two sequential GPT-4o Vision calls.

### Pass 1: items

Pass 1 extracts:

- image quality;
- item name;
- description;
- price;
- broad category;
- nearest printed section.

Its prompt and strict JSON schema contain no option instructions or `options`
field. This isolates item extraction from option reasoning and gives the
experiment a clean attribution boundary.

Pass 1 items are normalized by the existing leading-number post-processor
before Pass 2 receives them.

### Pass 2: options

Pass 2 receives:

- every original menu photo; and
- a compact indexed list of Pass 1 items containing index, name, description,
  price, and section title.

It returns only option-bearing items:

```json
{
  "option_sets": [
    {
      "item_index": 12,
      "options": [
        { "name": "Pollo", "price": null, "grams": null }
      ]
    }
  ]
}
```

The prompt defines options as printed choices within one item: protein or
filling choices, paid add-ons, dietary swaps, and flavor choices. Separately
printed variants, serving formats or sizes, and distinct products are not
options.

Items omitted from `option_sets` receive `options: []`.

## Merge contract

`item_index` is the zero-based position in the Pass 1 item list for the current
request. It is internal and never returned as menu data. Index merging avoids
ambiguous duplicate names such as multiple `Revueltos` rows and avoids fuzzy
matching after OCR spelling variation.

Before merging, `runExtraction` validates that every `item_index` is:

- an integer;
- within the Pass 1 item-list bounds; and
- unique within the Pass 2 response.

Invalid or duplicate indices fail the extraction. Valid option sets are merged
by index. The existing deterministic serving-format filter runs after the
merge as a defense against known false positives.

## Model and timeout behavior

Both calls use:

- provider: OpenAI;
- model: `gpt-4o`;
- temperature: `0`;
- seed: `17`;
- original menu photos.

Each call receives an independent 120-second timeout. Pass 2 failure, timeout,
missing content, invalid JSON, or invalid indices fails the full extraction.
The pipeline never silently returns empty options after a failed Pass 2,
because that would produce misleading nutrition results.

## Raw responses

The public `ExtractionResult.raw_response` type remains `string` so existing
callers and database writes do not change. Its value becomes a JSON string
containing both raw model response strings:

```json
{
  "items": "<raw Pass 1 JSON>",
  "options": "<raw Pass 2 JSON>"
}
```

The local harness continues archiving the merged structured output used for
scoring.

## Verification

Unit tests must prove:

1. `runExtraction` makes exactly two calls.
2. Pass 2 receives the original photos and indexed Pass 1 items.
3. Option sets merge into the exact indexed item.
4. Duplicate item names do not cause cross-item option assignment.
5. Omitted item indices receive empty options.
6. Duplicate, non-integer, and out-of-range indices are rejected.
7. Pass 2 transport/schema failure rejects the full extraction.
8. Existing number stripping and serving-format filtering still apply.

Static verification remains:

```bash
deno check supabase/functions/analyze-menu/extract.ts \
  supabase/functions/analyze-menu/postprocess.ts \
  supabase/functions/analyze-menu/index.ts \
  scripts/eval-extraction.ts
deno test supabase/functions/analyze-menu/
deno run --allow-read scripts/eval-extraction.ts --self-check
pnpm lint
```

## Paid benchmark and gate

Commit implementation before the paid run, then execute the five-menu harness
once with the frozen settings and archive merged outputs under:

```text
/Users/santiagoaguirre/Downloads/MenusTesting/iter-009/
```

Append the complete report to the extraction evaluation log. Options must turn
aggregate-green without making a previously green dimension aggregate-red. If
the regression gate fires, revert the Iteration 009 implementation commit,
record the revert, and stop for user input.

## Scope

In scope:

- two strict model-call schemas and prompts in `extract.ts`;
- index validation and option merging;
- focused Deno tests;
- Iteration 009 benchmark archive and log.

Out of scope:

- client changes;
- Stage 2 enrichment changes;
- persistent item identifiers;
- automatic retries;
- Iteration 008 gap filling;
- new dependencies.
