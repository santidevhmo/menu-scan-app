# Spec / EXECUTOR TASK BLOCK — C3: port the (c) text path into the edge function

**Date:** 2026-08-01 · **Status:** ✅ IMPLEMENTED 2026-08-01 (eval 114, commits `3946c6e` + `22239f7`)
**Correction after implementation:** §4's claim that keeping the old per-page cleanup order would move dims is FALSE — measured, it is a strict no-op on today's fixtures (8 single-page menus; brasero-two has no cross-page fold). The order is pinned by the synthetic unit test only, not by the gate. See ledger eval 114.
**Predecessor pattern:** `docs/superpowers/specs/2026-07-29-m3-1-mistral-edge-port-design.md`
**Scope:** production edge code `supabase/functions/analyze-menu/` + the harness scripts that mirror it.
**Cost:** checkpoints 1–2 are **$0**. Checkpoint 3 is ONE live menu, **under $0.05**, already approved.
NO redeploy — the deployed function stays untouched; deploy is a separate explicit step after C4.

---

## READ THIS FIRST — non-negotiables for the executor

1. **Worktree only.** Everything happens in
   `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app/.worktrees/extraction-eval-harness`
   (branch `feat/extraction-eval-harness`). Use `git -C <that path>` and absolute paths for EVERY
   git/file command — the Bash cwd resets between calls and has already landed a commit on the wrong
   branch. Commit after each checkpoint and `git push` after every commit.
2. **TDD-first.** Test before implementation, and show the RED output before the GREEN one.
3. **Never touch oracle files:** `scripts/fixtures/*.expected.json`, `scripts/fixtures/drafts/*.json`.
   If the gate disagrees with the table below, the PORT is wrong — report, do not adjust truth.
   Never run `deno fmt` over a glob that can reach `scripts/fixtures/`.
4. **Sandbox-blocked ≠ stop.** If `git commit`/`push`/`deno fmt`/network is refused, finish everything
   else, then list the exact blocked commands verbatim under a **"PLANNER-RUN NEEDED"** heading and
   report. Do not end the run early over an environment limitation.
5. **Report RAW output** — full command output, not a summary. Stop at every CHECKPOINT and wait.

---

## Why this step exists (context, 30 seconds)

The offline harness scores **40/45** across 9 menus using the "(c)" reading method (ruling 30):
Mistral OCR turns the photo into text, then a PINNED `gpt-4.1-2025-04-14` turns that text into menu
items. The production edge function still runs the OLD method (Mistral's own
`document_annotation_format`), which was measured at 30/45 and which broke once already when the
vendor silently swapped the model behind it (evals 101/102).

C3 makes production run what we actually measured. It is plumbing: **no new rules, no new tuning.**
The acceptance test is that the edge code reproduces the harness's 40/45 exactly, menu for menu.

---

## Design

### 1. `mistral-extract.ts` — Stage-1a becomes OCR TEXT only

Replace the annotation call with a text call. **Pin the model** (Santiago's ruling, 2026-08-01):

```ts
export const MISTRAL_OCR_MODEL = "mistral-ocr-4-0";
export interface MistralOcr { markdown: string; raw_response: string; }
export async function ocrMistral(photo: string, apiKey: string): Promise<MistralOcr>
export async function ocrMistralWithRetry(photo, apiKey, ocr = ocrMistral): Promise<MistralOcr>
```

- POST `https://api.mistral.ai/v1/ocr`, body `{ model: MISTRAL_OCR_MODEL, document: {type:"image_url",
  image_url: <data URL, same `startsWith("data:")` handling as today>} }`.
  **`document_annotation_format` is DELETED** — we want text, not the vendor's structuring.
- Keep the existing `MODEL_TIMEOUT_MS` + `AbortController` + error handling verbatim.
- `markdown` = **`ocrMarkdown(parsedResponse)`**, the helper MOVED here from
  `scripts/probe-c-textstructure.ts` verbatim (see §3). Do not re-implement the page join — the gate
  and production must use the same function (master-roadmap lesson 23).
- `ocrMistralWithRetry`: one retry on timeout only, then throw. No fallback.

**Before writing any of this, run the free model-list check** and paste the raw result:

```bash
cd /Users/santiagoaguirre/Desktop/CODING/menu-scan-app/.worktrees/extraction-eval-harness
set -a; . ./.env.local; set +a
curl -s https://api.mistral.ai/v1/models -H "Authorization: Bearer $MISTRAL_API_KEY" \
  | grep -o '"id":"mistral-ocr[^"]*"' | sort -u
```

This call is free (no inference). **If `mistral-ocr-4-0` is NOT in the list, STOP and report** — do
not silently substitute another name.

**DELETE (dead once the annotation call is gone):** `MENU_ANNOTATION_SCHEMA`, `reshapeMistral`,
`mistralPage`, `MistralExtraction`, `extractMistral`, `extractMistralWithRetry`, and the file
`scripts/replay-edge-mistral.ts` (the retired M3.1 gate — it measures the architecture this step
replaces; ruling 30 retired it and the brief already records that its number stopped being
meaningful). Nothing else imports them: `scripts/probe-bakeoff-mistral-b1.ts` carries its own private
copy of the schema and its own fetch, so it is unaffected — verify that with `grep -rn` and report.

### 2. `extract.ts` — Stage-1b, the pinned structuring call

Move the three pieces that currently live in `scripts/probe-c-textstructure.ts` into `extract.ts`,
**byte-for-byte**, beside `EXTRACT_PROMPT`/`EXTRACT_SCHEMA` which they already use:

```ts
export const TEXT_PROMPT_SUFFIX = /* verbatim from probe-c-textstructure.ts */;
export const STRUCTURE_MODEL = "gpt-4.1-2025-04-14";
export function buildStructureRequest(markdown: string, model = STRUCTURE_MODEL): unknown  // = buildRequest
export function parseStructureResponse(json: unknown): { image_quality: unknown; image_layout: unknown; items: unknown[] }  // = parseResponse
export async function structureMenuText(markdown, apiKey): Promise<{ items: unknown[]; raw_response: string }>
export async function structureMenuTextWithRetry(markdown, apiKey, structure = structureMenuText)
```

- `temperature: 0`, `seed: 17`, `max_tokens: 16384` — **exactly as in `buildRequest` today.** Every
  number in the 40/45 was measured with these. Changing any of them invalidates the gate.
- `structureMenuText` POSTs `https://api.openai.com/v1/chat/completions` with that body, keeps the
  raw response text, and returns `{ items: parseStructureResponse(json).items, raw_response }`.
  Reuse the 120s `AbortController` pattern.
- `structureMenuTextWithRetry`: retry once on `"timed out"` or `"finish_reason=length"` (same intent
  as the existing `extractWithRetry`), then propagate.

### 3. `scripts/probe-c-textstructure.ts` — re-export, do not duplicate

The script keeps its CLI `main`, `ocrSourcePaths`, and `archivePayloads`, and **re-exports**
`ocrMarkdown`, `TEXT_PROMPT_SUFFIX`, `buildRequest` (= `buildStructureRequest`) and `parseResponse`
(= `parseStructureResponse`) from the edge modules. One source of truth — the same move M3.1 made for
`mistral-cleanup.ts`. `scripts/probe-c-textstructure_test.ts` and `scripts/score-c-dumps.ts` must keep
passing **unchanged**; if either needs an edit, stop and report why.

### 4. `runPagedExtraction` — the chain, in the harness's exact order

```ts
export async function runPagedExtraction(
  photos: string[],
  mistralKey: string,
  openaiKey: string,
  ocr = ocrMistralWithRetry,
  structure = structureMenuTextWithRetry,
): Promise<PagedExtraction>
```

Per photo, in parallel: `ocr()` → markdown → `structure()` → `postprocessItems(parsed.items)`.
Then across photos:

```
items = pages.length > 1 ? mergeItemSources(pages.map(p => p.items)) : pages[0].items
items = textStructureCleanup(items, pages.map(p => p.markdown).join("\n"))
```

**This order is load-bearing and is the single most likely place to get C3 wrong.** The 40/45 was
produced by `scripts/score-c-dumps.ts`, which postprocesses PER PAGE, merges, and then runs
`textStructureCleanup` ONCE over the `"\n"`-joined markdown of all pages. The current edge code
instead cleans per page (correct for the old path, where the cleanup keyed on per-photo `blocks`).
Copy the harness order exactly, including the `"\n"` separator.

- `mistralCleanup(items, page)` is no longer called; `blocks` are not fetched or used at all. Leave
  `mistralCleanup`/`dropMisattachedOptions`/`Page` in `mistral-cleanup.ts` untouched (prove-then-remove).
- Keep the synthesized `image_quality: { usable: true, issues: [] }` and
  `image_layout: { dense: false, crop_direction: "none" }` **exactly as today**.
- `raw_response` becomes `JSON.stringify(pages.map(p => ({ ocr: <ocr raw>, structure: <structure raw> })))`
  for one page as well as many — deliberate: both stages must be archived so a future session can diff
  raw model output against our postprocessed output (master-roadmap lesson 21).
- `PagedExtraction`, `needs_crops`, `foldResults`, the tile path, `index.ts`'s other stages and the
  whole client stay untouched. `needs_crops` simply never occurs.

### 5. Call sites (2)

- `supabase/functions/analyze-menu/index.ts:363` → `runPagedExtraction(photos, MISTRAL_API_KEY, OPENAI_API_KEY)`.
  Both constants already exist in that file. Update the two `model_id: "mistral-ocr-latest"` strings
  (lines ~371, ~384) to `"mistral-ocr-4-0+gpt-4.1-2025-04-14"`.
- `scripts/eval-027-live.ts:122` → `runPagedExtraction(photos, mistralApiKey, apiKey)`. Both keys are
  already required and in scope at the top of that file.

### 6. Unit tests (`extract_test.ts`, `runPagedExtraction` block only)

Rewrite ONLY that block; every other test in the file (`runGroupedExtraction`, tile merge, verify,
crops) must stay green and untouched. All stubs, no network:

1. 1 photo → one OCR call and one structure call; the structure call receives the OCR markdown.
2. N photos → one call pair per photo, in parallel; items are the cross-page merge.
3. The markdown handed to `textStructureCleanup` is all pages joined with `"\n"` (assert via a
   markdown-dependent fold firing only when both pages' text is present).
4. `postprocessItems` runs before the merge (assert a known postprocess effect survives).
5. No `needs_crops` is ever returned — including for a landscape-shaped photo.
6. Each stage retries once on timeout, then propagates.

---

## CHECKPOINT 1 — code + unit tests ($0). STOP AND REPORT.

Run and paste raw output:

```bash
cd /Users/santiagoaguirre/Desktop/CODING/menu-scan-app/.worktrees/extraction-eval-harness
deno check supabase/functions/analyze-menu/*.ts scripts/*.ts
deno test --allow-read --allow-env --allow-write
```

Expected: everything green **except** the one pre-existing unrelated failure in
`scripts/tile-cut_test.ts` (a dimension assertion; it imports nothing this step touches). Report the
exact pass/fail counts. Any OTHER failure = stop.

---

## CHECKPOINT 2 — the $0 gate. STOP AND REPORT.

### 2a. New `scripts/replay-edge-c3.ts`

Feeds **cached raw responses of both stages** through the REAL edge `runPagedExtraction` and scores
the result. It must read ONLY `*.raw.json` — never `.dump.json` / `.actual.json` / `.clean.dump`
(master-roadmap lesson 20; `scripts/gate-artifacts_test.ts` enforces it structurally, so do not even
mention those suffixes in the file).

- Stage-1a stub: for each photo, read `~/Downloads/MenusTesting/<menu>.b1-r1[.p<N>].raw.json`
  (paths via the existing `ocrSourcePaths`) and return `{ markdown: ocrMarkdown(parsed), raw_response }`.
- Stage-1b stub: for each page, read `~/Downloads/MenusTesting/<menu>.eval103c-m41-r1[.p<N>].raw.json`
  and return it as the raw response string, so the edge's own `parseStructureResponse` parses it.
- Key both stubs **by photo/page identity, not by call order** (copy the `byPhoto` map pattern from
  the deleted `replay-edge-mistral.ts` — that detail exists so the gate cannot depend on the order
  `Promise.all` happens to resolve in).
- Score each menu with `scoreMenu` against `scripts/fixtures/<menu>.expected.json`, over the 5 dims
  `items, options, section_context, categories, grams`. Print per-dim PASS/FAIL, per-menu `n/5`, and
  a TOTAL.

**Required result — the planner measured this baseline in-session on 2026-08-01 with
`deno run --allow-read --allow-env scripts/score-c-dumps.ts`. Any deviation is a port defect:**

| menu | expected |
|---|---|
| bistro | 5/5 |
| brasero | 5/5 |
| casa-nostra | 5/5 |
| brasero-two | 5/5 |
| el-marcos | 5/5 |
| nikkori | 4/5 |
| mochomos | 4/5 |
| polloteria | 4/5 |
| guest-house | 3/5 |
| **TOTAL** | **40/45** |

### 2b. Its sensitivity guard, `scripts/replay-edge-c3_test.ts`

A gate nobody has watched fail is not a gate. Two tests, and **both must be seen RED before they are
accepted** — deliberately break the thing each one guards, paste the RED output, then restore:

1. **The chain really runs.** The replay output for `brasero-two` must NOT equal the raw parsed model
   items of its two pages concatenated. (Breaks if the port ever short-circuits postprocess/cleanup.)
   Verify RED by temporarily making `postprocessItems` and `textStructureCleanup` identity in the
   edge chain.
2. **The edge matches the measured harness.** For at least `brasero-two` and `polloteria`, the
   replay's items must be JSON-identical to
   `cleanForScore(await itemsFromRaw(menu, "eval103c-m41"), <"\n"-joined markdown>).items` from
   `scripts/score-c-dumps.ts`. This is what pins the per-page-vs-post-merge ORDER of §4 forever.
   Verify RED by temporarily moving `textStructureCleanup` back to per-page in the edge.

Then:

```bash
deno run --allow-read --allow-env scripts/replay-edge-c3.ts
deno test --allow-read --allow-env --allow-write scripts/gate-artifacts_test.ts scripts/drafts_test.ts scripts/score-c-dumps_test.ts scripts/replay-edge-c3_test.ts
deno run --allow-read --allow-env scripts/score-c-dumps.ts | tail -3
```

Report all raw output. `score-c-dumps.ts` must still print `TOTAL 40/45` — it is the independent
second implementation and must not have moved. Commit + push, then STOP.

### ⛔ Abort conditions for checkpoint 2

- Any menu's dim count differs from the table → **STOP.** Do not touch a rule, a constant, a fixture
  or a draft to close the gap. Report the per-dim diff; the port is what is wrong.
- Either guard test cannot be made to go RED → **STOP** and report; the guard is not real.
- Any change to a file under `scripts/fixtures/` → forbidden, revert immediately.

---

## CHECKPOINT 3 — one LIVE menu (~$0.03, approved). STOP AND REPORT.

Only after checkpoint 2 is green and pushed. This proves the code talks to the two real APIs; it is a
WIRING test, not a quality gate.

```bash
cd /Users/santiagoaguirre/Desktop/CODING/menu-scan-app/.worktrees/extraction-eval-harness
set -a; . ./.env.local; set +a
nohup deno run --allow-read --allow-write --allow-env --allow-net --allow-run \
  scripts/eval-027-live.ts > /tmp/c3-smoke.log 2>&1 &
```
with `EVAL_MENUS=bistro EVAL_RUNS=1` exported first. **Never foreground a live run** (the 10-minute
tool timeout kills it); poll `/tmp/c3-smoke.log`.

- Expected: one Mistral OCR call + one OpenAI call, no exception, bistro **5/5** (4/5 acceptable —
  live text may differ slightly from the July cache; the point is that the wiring works).
- **STOP and report if:** any exception, any HTTP error, `needs_crops` appears, or bistro scores < 4/5.
  Do not retry, do not patch, do not run a second menu.
- Report the raw log, the two model ids that appear in it, and the token usage if printed.

---

## Deliberately NOT in this step

- Deploying the edge function (separate explicit step, after C4, back up first).
- The all-9 ×3 live gate (**C4**, ~$0.22/run ⇒ ~$0.66 for ×3) — needs its own approval.
- Any client change; any `index.ts` change beyond the two lines in §5.
- Deleting the tile path / colocation / `extract-pages` (prove-then-remove, after C4).
- Chasing the 5 remaining failed dims. C2 is closed at 40/45; those are OCR misreads and Santiago
  tolerance calls, not code.
- Evaluating the older `mistral-ocr-2512` (v3) OCR model — a separate ~$0.10 experiment, deferred.

---

## Planner's prediction, recorded before the run (master-roadmap lesson 16)

The gate reproduces **exactly 40/45** with the per-menu split above, because C3 moves code without
changing a rule. I predict **zero dim movement**. If a dim moves — in either direction — that is a
defect in the port, not a result. There is no score improvement available in this step.
