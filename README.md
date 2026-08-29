# Menu Scan

Point your phone at a restaurant menu. Get the same menu back, sorted by how well each dish
matches your nutritional goals.

An Expo / React Native app. Photos of a menu go to a Supabase edge function, which reads the
items off the page, estimates each dish's macros, and returns them ranked against the goals you
picked.

## Status

**Status lives in Linear, not in this repo:** <https://linear.app/menu-scan-app>

Documents here describe how things work and why they were decided that way. They deliberately do
not claim what is done or what is next — that claim rotted in five places at once, which is the
reason this rule exists.

## Where things are

| What | Where |
|---|---|
| Product roadmap — 16 phases, bootstrap to launch | `docs/sunny-lemon-development-plan.md` |
| Engineering contract — stack, rules, model decisions | `AGENTS.md` |
| Design system | `DESIGN.md` |
| Session entry point for agents | `docs/superpowers/START-HERE.md` |
| Durable product and pipeline knowledge | the `menu-scan-kb` repo — type `/menuscan-product` |
| Closed phases, dead handoffs, historical plans and specs | `docs/archive/` |

## The pipeline, in one line

Menu photo → Mistral OCR → GPT-4.1 structuring → GPT-4o macro enrichment → a form-label call whose
grams **we** supply from a lookup table → goal-ranked results. It runs as the Supabase edge
function `analyze-menu`.

**Never quote a benchmark number out of a document.** Re-derive it through the harness in
`scripts/`. Figures written in prose are snapshots of the day they were written.

## Running it

```sh
pnpm install
./node_modules/.bin/expo start
```

Package installs go through `pnpm` and `./node_modules/.bin/expo install` — never `npm`, never a
bare `expo`. See `AGENTS.md` for why.

## Allergens

When any allergen filter is active the results screen must show, prominently and at all times:
*"AI-estimated. Confirm allergens with restaurant staff before ordering."* This is not optional
and it is not removable.
