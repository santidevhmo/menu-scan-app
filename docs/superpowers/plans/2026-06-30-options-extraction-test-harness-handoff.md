# Handoff: Build a Test Harness for Menu-Options Extraction

**Date:** 2026-06-30
**Branch to work on:** `feat/selectable-options` (currently clean/reverted — see below)
**Read first:** `docs/post-mortems/2026-06-29-selectable-options-investigation.md` on commit `d88b178` (not on this branch — see "Where the old work lives")

## Your task

Build a script that runs the menu **extraction** stage (Stage 1, GPT-4o Vision) against 5–10 real menu photos, where I've manually written down ground truth for which items have selectable extras/add-ons/choices, and checks whether the model's `options[]` output matches what I wrote down. This is a **measurement tool**, not a UI feature. No client-side rendering work. Output is a pass/fail report per menu, run repeatably so we can compare prompt revisions.

Do not touch `MenuItemRow.tsx` or any client code. Do not wire this into the app. This is a standalone Deno/Node script (or test file) that POSTs to the extraction endpoint and diffs the result against my ground-truth JSON.

## Why this exists (context you need)

We tried to ship structured "selectable options" (e.g. a steak with choice-of-cut sub-items, or an add-on like "+ guacamole $30") in one pass: prompt change + schema + client UI, all at once, gated only by static checks (tests pass, types clean, lint clean). It shipped, then degraded real extraction quality, and got reverted. Post-mortem root cause: **a prompt-only change to a vision model is probabilistic, not deterministic — static green checks don't prove it actually works on real menu photos.** Nobody had run the new prompt against real menus before merging it next to the UI.

The fix isn't "try again" — it's "build the missing evaluation step first." That's this task. Once we have a script that tells us extraction accuracy on real menus, we either confirm a prompt revision is good enough and *then* do client UI work, or we conclude prompt-only is unreliable and switch to a deterministic post-extraction parser instead. Either way, this harness is required before touching UI again.

## Current branch state (clean — nothing to revert)

`feat/selectable-options` HEAD has **no** options field anywhere. Extraction returns `{name, description, price, category}` only — no `options[]`, no schema branch for it, no client types for it. This is intentional, not a bug. Verify with:

```bash
git log --oneline -1                          # should NOT show "options" commits
grep -n "options" supabase/functions/analyze-menu/index.ts   # no matches expected
```

## Where the old work lives

All 9 commits from the failed attempt are preserved, untouched, on:

```
feat/selectable-options-investigation-backup
```

That branch has: `src/lib/options.ts` (`computeOptionPrice` helper, TDD'd, considered sound), `MenuItemRow.tsx` option-pill UI, edge function schema/prompt changes for `options[]`, and the post-mortem doc itself (`docs/post-mortems/2026-06-29-selectable-options-investigation.md`, commit `d88b178`).

**Do not merge or cherry-pick that branch's UI/client commits.** The two prompt revisions below are worth reusing as *starting points* for what you test — but treat them as unproven hypotheses, not working code.

## The two prompt revisions that were tried (for reference, not to copy blindly)

Current production `EXTRACT_PROMPT` (in `supabase/functions/analyze-menu/index.ts:17`) has none of this. The attempt added an `options[]` field to the schema (`{name, price, kind: "choice"|"addon"}`) and went through two prompt iterations:

**v1** (commit `388cd0b`) — single layout rule: detect a bold protein header (e.g. "RES") above a list of cuts each carrying their own price (e.g. "SIRLOIN (60gr) $135  PICAÑA (60gr) $140"), fold them into one item's `options[]`.

**v2 / final** (commit `684ecdd`) — added a second layout rule on top of v1: detect price-tagged alternatives named *inside the description prose* (e.g. base item "TACO LOIRO (sirloin) $165" with description text "picaña $165 pollo $150" → those become `options[]` entries, default stays the title's variant). This is the version that shipped and degraded results. Full diffs:

```bash
git show 388cd0b -- supabase/functions/analyze-menu/index.ts
git show 684ecdd -- supabase/functions/analyze-menu/index.ts
```

The post-mortem doesn't record *which specific items broke* — that detail was never filled in (manual re-scan happened too late, during context compaction, and was never written down). That's the gap this harness closes: this time, failures get logged per-item, not discovered after the fact.

## What "ground truth" means here

I will manually scan 5–10 real menu photos (the same ones used for prior extraction testing, e.g. Brasero, churrasquería menus — ask me which images if you need paths) and write down, per menu, every item that has extras/add-ons/choices that should appear as a structured option, e.g.:

```json
{
  "menu": "brasero-1.jpg",
  "expected_options_items": [
    { "item_name_contains": "Res", "options": [
      { "name": "Sirloin", "kind": "choice" },
      { "name": "Picaña", "kind": "choice" }
    ]},
    { "item_name_contains": "Taco Loiro", "options": [
      { "name": "Pollo", "kind": "choice" }
    ]}
  ]
}
```

Design this ground-truth schema yourself (keep it simple — name substring match is fine, we don't need exact id matching). Store it as fixture files, e.g. `supabase/functions/analyze-menu/__fixtures__/options-eval/<menu-name>.expected.json`, next to the corresponding photo.

## What the harness needs to do

1. Take N menu photos (base64-encode, same shape the client sends) + their ground-truth JSON.
2. Call the extraction endpoint (`stage: "extract"`, `provider: "gpt-vision"`) — either by hitting the deployed Supabase edge function or by importing/invoking the extraction logic directly if that's easier to run locally. Check `supabase/functions/analyze-menu/index.ts` for the request shape (`POST` body: `{ photos: string[], provider: "gpt-vision", stage: "extract" }`).
3. For each menu, diff the returned `items[].options[]` against ground truth:
   - Did each expected "has options" item actually get `options[].length > 0`?
   - Do the option names/kinds roughly match what I wrote down?
   - False positives matter too: did the model fabricate `options[]` on an item that shouldn't have any?
4. Run this **5–10 times per menu** (temperature/seed are currently pinned to 0/17 for stability — note if that masks real-world variance; consider testing with seed unset too) and report consistency, not just one-shot pass/fail.
5. Print a clear per-menu, per-item pass/fail report. Exit non-zero if below some threshold (you decide a reasonable bar, e.g. propose one rather than guessing silently).

## Explicit failure criteria (the post-mortem's #1 lesson)

Before you run anything, write down — and tell me — what result means "prompt-only extraction works" vs "abandon it, go deterministic." The post-mortem's proposed bar was something like *"if >20% of target items still show priced variants as prose instead of structured options after re-scan, the prompt approach has failed."* Pick a concrete number and state it in your output/report. Don't let this become another unmeasured "seems fine."

## Relevant files

- `supabase/functions/analyze-menu/index.ts` — current extraction prompt/schema/handler (lines 17–46 for extraction stage)
- `supabase/functions/analyze-menu/enrich.ts`, `enrich_test.ts` — enrichment stage, batching/reassembly (not in scope for this task, options only affects extraction)
- `docs/post-mortems/2026-06-29-selectable-options-investigation.md` (on `d88b178`, backup branch) — full post-mortem, read this first
- `docs/superpowers/plans/2026-06-29-selectable-item-options.md` (backup branch) — original Phase 10 plan that was implemented
- `docs/superpowers/plans/2026-06-29-option-price-and-prose-choice.md` (this branch, still present) — the 3-task plan that produced the price-recompute work; superseded by this handoff
- No existing `scripts/` test harness exists yet — you're creating the first one. No menu fixture images currently checked into the repo; ask me for them or for paths to where I store scan test photos.
- Env: edge function needs `OPENAI_API_KEY` (and `GEMINI_API_KEY`, unused for extraction). Check `.npmrc`/`deno.json` in `supabase/functions/analyze-menu/` for the Deno run config if invoking locally via `deno run`.

## Out of scope for this task

- Any `MenuItemRow.tsx` / client UI changes
- Any `options.ts` helper / `computeOptionPrice` work (already done, untouched, on the backup branch — not the bottleneck)
- Enrichment-stage changes
- Shipping anything to `main` — this stays on `feat/selectable-options` (or a fresh branch off it) until the harness produces a real accuracy number
