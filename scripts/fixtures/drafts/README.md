# Corrected draft truths — THE single source of truth

These are Santiago's hand-corrected, photo-adjudicated truths for the three
landscape menus. They are the **name-level truth** referenced by ruling 6 and
by every ledger entry that says "adjudicate from the corrected draft".

**This directory is canonical.** Do not keep or edit a second copy in
`~/Downloads/MenusTesting/` — that is where the *photos* live, and where these
files used to live untracked. Eval 109 found 12 internal contradictions that had
sat undetected in `PolloteriaMenu.png.draft.json` precisely because it had no
history and no automated check.

## Rules

1. **Never edit these without an explicit Santiago adjudication from the PHOTO**
   (master-roadmap lesson 4). They are oracle files, exactly like
   `../*.expected.json`.
2. **Every fixture edit must be re-verified against these**, because a pin has
   TWO oracles, not one (lesson 18):

   ```
   deno run --allow-read scripts/score-dump.ts <menu> scripts/fixtures/drafts/<Photo>.png.draft.json
   ```

   `drafts_test.ts` runs exactly this for all three, so `deno test` catches it.
3. **Never run `deno fmt` over a glob that can reach this directory** — it has
   silently reformatted oracle files before (lesson 15).

## What the test guards

`../../drafts_test.ts`:

- **internal consistency** — when a name embeds `$N` or `(Ngr)`, the item's
  `price`/`grams` fields must agree with it. This is the check that would have
  caught `Boneless - FIT` carrying Tender Cordon Bleu's price and weight.
- **fixture agreement** — each draft must score ALL 5 DIMS PASS against its own
  `*.expected.json`. This is what stops a fixture change that satisfies the
  extractor but contradicts the truth.
