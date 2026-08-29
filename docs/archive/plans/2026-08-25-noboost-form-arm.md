# `NOBOOST-FORM` — the unrouted stack — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure whether the best prompt we have (`NOBOOST`) stacked directly under the shipped gram table (`FORM`) beats `FORM` alone — with no router in between.

**Architecture:** One new ~5-line arm function that mirrors `armCombo` but replaces `armHybrid` with a single `NOBOOST` pass. Register it, run it 4 times against the existing archived `FORM` runs, and settle it with the repo's own paired bootstrap. No production code changes.

**Tech Stack:** Deno, TypeScript, OpenAI `gpt-4o-2024-08-06`, the existing `bench-unweighted.ts` harness.

**Spec:** This plan. The design argument is recorded in **eval 186 ④** of `docs/superpowers/extraction-iteration-ledger.md` — read that entry before starting.

**Cost:** ~**$2–3** total. `bench-unweighted.ts` in its default focused mode is ~$0.50 per arm-run (see its own comment at `scripts/bench-unweighted.ts:148`); this arm makes 2 model calls per batch where `FORM` makes 3, so 4 runs land at the low end. **The `FORM` control is free** — 5 runs are already archived.

---

## Global Constraints

- **Production must not change.** Nothing in `supabase/functions/` is touched by this plan. This is a benchmark arm only.
- **The bar is 4 runs**, matching what `HYBRID` and `FORM` were each held to. A single run is not a result.
- **Always pass `--run <label>` on runs 2-4.** Without it each run overwrites its predecessor's archives and the range is destroyed. This has happened twice in this project.
- **`--env-file=.env.local` is required on every command**, including `--replay` ones. `probe-plate-arms.ts:43` throws on a missing `OPENAI_API_KEY` at *import* time, so a replay dies without it.
- **Never quote a single run.** Report the range across 4 runs and the paired-bootstrap CI.
- **The control is `FORM`, not `dual`.** This arm is one variable away from `FORM`: which pass-2 question produced the recipe that `applyFormMass` then rescales.
- **Do not deploy anything.** Deploying is Santiago's call and is out of scope here.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `scripts/probe-plate-arms.ts` | Holds every arm runner. Add `armNoBoostForm` beside `armCombo`. | Modify (~12 lines) |
| `scripts/bench-unweighted.ts` | Arm registry + harness. Add one entry to `ARM_RUNNERS`. | Modify (~3 lines) |
| `scripts/probe-plate-arms_test.ts` | Existing test file for arm wiring. Add one test. | Modify (~20 lines) |
| `scripts/fixtures/caches/unweighted.NOBOOST-FORM-f*.raw.json` | The paid archives. 15 files per run. | Generated |
| `docs/superpowers/extraction-iteration-ledger.md` | Eval 187 write-up. | Append |
| `docs/superpowers/START-HERE.md` | Arm table row + handoff pointer. | Modify |

---

### Task 1: Add the arm and prove it is wired correctly

**Files:**
- Modify: `scripts/probe-plate-arms.ts` (add `armNoBoostForm` immediately after `armCombo`, which ends around line 833)
- Modify: `scripts/bench-unweighted.ts:210-241` (the `ARM_RUNNERS` record)
- Test: `scripts/probe-plate-arms_test.ts`

**Interfaces:**
- Consumes: `runOrderArm(items, armSpec, false)`, `ARM_NOBOOST`, `labelForms(items, apiKey)`, `applyFormMass(enriched, labels)` — all already exported and already used by `armCombo` and `armNoBoost`.
- Produces: `export async function armNoBoostForm(items: Item[]): Promise<unknown[]>`, registered under the arm name **`NOBOOST-FORM`**.

- [ ] **Step 1: Read the two functions this one is built from**

Run:
```bash
sed -n '705,835p' scripts/probe-plate-arms.ts
```
Expected: you can see `armNoBoost` (a one-liner calling `runOrderArm` with `ARM_NOBOOST`) and `armCombo` (calls `armHybrid`, then `labelForms`, then `applyFormMass`). The new arm is `armCombo` with `armHybrid` swapped for `armNoBoost`'s body.

- [ ] **Step 2: Write the failing test**

Add to the end of `scripts/probe-plate-arms_test.ts`:

```ts
Deno.test("NOBOOST-FORM is registered and is NOBOOST's prompt, not the shipped one", async () => {
  const bench = await import("./bench-unweighted.ts");
  const arms = (bench as unknown as { ARM_RUNNERS?: Record<string, unknown> })
    .ARM_RUNNERS;
  assertExists(arms, "bench-unweighted.ts must export ARM_RUNNERS for this test");
  assertExists(arms["NOBOOST-FORM"], "arm NOBOOST-FORM is not registered");

  // The whole point of the arm: NOBOOST's prompt, which is the shipped pass-2
  // sentence with the PUSH half removed and the RESTRAINT half kept.
  const { ARM_NOBOOST } = await import("./arm-order-schemas.ts");
  assert(
    !ARM_NOBOOST.prompt.includes("considerably greater quantity"),
    "the push clause survived — this would measure the shipped arm, not NOBOOST",
  );
  assert(
    ARM_NOBOOST.prompt.includes("served in on its own"),
    "the restraint clause is missing — this would measure NOPUSH, not NOBOOST",
  );
});
```

Make sure `assert` and `assertExists` are imported at the top of that file; if only `assertEquals` is imported, extend the import:

```ts
import {
  assert,
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
deno test --allow-all --env-file=.env.local scripts/probe-plate-arms_test.ts
```
Expected: FAIL. Either `bench-unweighted.ts must export ARM_RUNNERS for this test` or `arm NOBOOST-FORM is not registered`.

- [ ] **Step 4: Add the arm function**

Insert into `scripts/probe-plate-arms.ts`, immediately after the closing brace of `armCombo`:

```ts
/**
 * ARM NOBOOST-FORM — the PLAIN stack. Eval 187.
 *
 * `COMBO` is `HYBRID` + `FORM`, and `HYBRID` uses NOBOOST's answer only when
 * NOBOOST's OWN plate mass is under 300 g, re-asking the shipped question above
 * that. This arm deletes the router: NOBOOST always, then the form table.
 *
 * WHY IT MIGHT WIN. `applyFormMass` OVERWRITES the plate mass, so the half of
 * HYBRID's job that is about mass is redundant once the table runs. If the router
 * is only carrying mass, it is now dead weight and this scores the same for one
 * fewer model call on the routed dishes.
 *
 * WHY IT MIGHT LOSE. HYBRID's re-ask changes the whole RECIPE, not just the mass -
 * different ingredients and different per-100 g values survive the rescale. If the
 * router's gain lives in composition rather than mass, deleting it costs points.
 *
 * That is the question, and it cannot be answered by reasoning - only by the run.
 * Its control is `FORM` (434-453 over 5 runs), one variable: which pass-2 question
 * produced the recipe the table then rescales.
 */
export async function armNoBoostForm(items: Item[]) {
  const noBoost = await runOrderArm(items, ARM_NOBOOST, false);
  const labels = await labelForms(items, apiKey!);
  // deno-lint-ignore no-explicit-any
  return applyFormMass(noBoost as any, labels) as any;
}
```

- [ ] **Step 5: Register the arm**

In `scripts/bench-unweighted.ts`, add `armNoBoostForm` to the import block that already brings in `armCombo` from `./probe-plate-arms.ts`, then add this entry to `ARM_RUNNERS` immediately after the `COMBO: armCombo,` line (~line 240):

```ts
  // eval 187. COMBO with the ROUTER DELETED: NOBOOST always, then the form table.
  // Its control is FORM, not COMBO - one variable, the routing.
  "NOBOOST-FORM": armNoBoostForm,
```

Then export the registry so the test can see it. Change line 210 from:

```ts
const ARM_RUNNERS: Record<string, (batch: never) => Promise<unknown[]>> = {
```

to:

```ts
export const ARM_RUNNERS: Record<string, (batch: never) => Promise<unknown[]>> = {
```

- [ ] **Step 6: Run the test to verify it passes**

Run:
```bash
deno test --allow-all --env-file=.env.local scripts/probe-plate-arms_test.ts
```
Expected: PASS.

- [ ] **Step 7: Type-check and run the whole suite**

Run:
```bash
deno check scripts/probe-plate-arms.ts scripts/bench-unweighted.ts
deno test --allow-all --env-file=.env.local scripts/ supabase/
```
Expected: `deno check` clean. The suite should show **exactly 2 failures**, both pre-existing and named in `START-HERE.md`. 3+ means one is yours.

⚠️ If you see ~7 failures all reporting `EPERM` on `/Users/santiagoaguirre/Downloads/MenusTesting/*`, that is a macOS privacy restriction on the running process, not a regression — `tile-cut_test.ts`, `replay-edge-c3_test.ts`, `score-c-dumps_test.ts` and `macro-measure_test.ts` read fixture images from `~/Downloads`. Confirm every failure mentions `Downloads` before continuing.

- [ ] **Step 8: Commit**

```bash
git add scripts/probe-plate-arms.ts scripts/bench-unweighted.ts scripts/probe-plate-arms_test.ts
git commit -m "eval 187: add NOBOOST-FORM arm — COMBO with the router deleted"
```

---

### Task 2: Run it four times

**Files:**
- Generated: `scripts/fixtures/caches/unweighted.NOBOOST-FORM-f.<menu>-d{0,1,2}.raw.json` and the `-r2`/`-r3`/`-r4` variants

**Interfaces:**
- Consumes: the arm registered in Task 1.
- Produces: 4 labelled sets of archives that `--replay`, `sim-arm-significance.ts` and `verify-form-fired.ts` all read by arm name.

⚠️ **This is the paid task.** Each command below spends real money. Run them one at a time and read the output before starting the next — if run 1 comes back wildly outside `FORM`'s 434-453 range in either direction, stop and report rather than spending three more.

- [ ] **Step 1: Run 1**

Run:
```bash
deno run --allow-read --allow-write --allow-net --allow-env --env-file=.env.local \
  scripts/bench-unweighted.ts 3 NOBOOST-FORM
```
Expected: a `TOTAL n/684 points in band` line, and 15 new archive files. Record the total.

- [ ] **Step 2: Confirm the table actually fired before paying for three more runs**

Run:
```bash
deno run --allow-read scripts/verify-form-fired.ts NOBOOST-FORM
```
Expected: mostly `EXACT`, with `OTHERROW` where the model's live label differs from the hand label, and `NOFIRE` only on dishes labelled `other`.

🔴 **If this reports `NOFIRE` on nearly everything, `applyFormMass` did not run — stop and fix Task 1 before spending more.** A dish sized as `pizza_thin_meat_veg` must resolve to exactly 488 g; that invariant lives inside a single archive, so drift cannot fake it.

- [ ] **Step 3: Runs 2, 3 and 4**

Run each separately, reading the total after each:
```bash
deno run --allow-read --allow-write --allow-net --allow-env --env-file=.env.local \
  scripts/bench-unweighted.ts 3 NOBOOST-FORM --run r2
```
```bash
deno run --allow-read --allow-write --allow-net --allow-env --env-file=.env.local \
  scripts/bench-unweighted.ts 3 NOBOOST-FORM --run r3
```
```bash
deno run --allow-read --allow-write --allow-net --allow-env --env-file=.env.local \
  scripts/bench-unweighted.ts 3 NOBOOST-FORM --run r4
```
Expected: four totals. Write down the range.

- [ ] **Step 4: Commit the archives**

```bash
git add scripts/fixtures/caches/unweighted.NOBOOST-FORM-f*.raw.json
git commit -m "eval 187: NOBOOST-FORM archives, 4 runs x 3 draws"
```

---

### Task 3: Settle it against `FORM`, and against `COMBO`

**Files:**
- Read only. No files change in this task.

**Interfaces:**
- Consumes: the archives from Task 2 plus the already-archived `FORM` (5 runs) and `COMBO` (4 runs).

- [ ] **Step 1: Re-derive the two controls on today's ruler**

Run:
```bash
deno run --allow-read --allow-env --env-file=.env.local scripts/bench-unweighted.ts 3 FORM --replay
```
```bash
deno run --allow-read --allow-env --env-file=.env.local scripts/bench-unweighted.ts 3 COMBO --replay
```
Expected: `FORM` **417/684**, `COMBO` **458/684** as of 2026-08-25. If either differs, the oracle moved since this plan was written — say so in the write-up and use the fresh numbers, never the ones printed here.

- [ ] **Step 2: The primary comparison — is it better than `FORM`?**

Run:
```bash
deno run --allow-read scripts/sim-arm-significance.ts \
  "FORM+FORM@r2+FORM@r3+FORM@r4" \
  "NOBOOST-FORM+NOBOOST-FORM@r2+NOBOOST-FORM@r3+NOBOOST-FORM@r4"
```
Expected: section `①` prints an observed difference and a 95% CI on the /684 scale.

⚠️ **Pool the runs exactly as written.** The script defaults to run 1 only, and on 2026-08-23 that manufactured a clean CI out of noise — `COMBO`'s best run against `FORM`'s second-worst read +34 excluding zero, where the pooled figure was +18 including zero.

- [ ] **Step 3: The secondary comparison — did deleting the router cost anything?**

Run:
```bash
deno run --allow-read scripts/sim-arm-significance.ts \
  "COMBO+COMBO@r2+COMBO@r3+COMBO@r4" \
  "NOBOOST-FORM+NOBOOST-FORM@r2+NOBOOST-FORM@r3+NOBOOST-FORM@r4"
```
Expected: a CI for the routing question specifically. A CI comfortably containing zero here is the interesting result — it means the router is dead weight and can be deleted for one fewer model call.

- [ ] **Step 4: Read the sample-size line**

In both outputs, find the `DISHES NEEDED to resolve an effect THIS SIZE` line. Record it.

🔑 **If the effect needs more than 57 dishes, more runs will not settle it** — the oracle is the binding constraint, not the number of repeats. Say that plainly in the write-up rather than running a fifth repeat.

---

### Task 4: Write it up

**Files:**
- Modify: `docs/superpowers/extraction-iteration-ledger.md` (append an `## Eval 187` entry)
- Modify: `docs/superpowers/START-HERE.md` (the arm table near the top, and the handoff block)

- [ ] **Step 1: Append the ledger entry**

Use the shape every recent entry uses — a `## Eval 187 — <verdict in the heading itself>` line, then Date / New / Changed, then numbered findings, then a `- **Spend:**` line and a `- **NEXT:**` line. Include, without exception:

- The 4-run **range** and mean, never a single run.
- The observed difference and CI against **`FORM`** and against **`COMBO`**.
- The `verify-form-fired` result from Task 2 Step 2.
- The dishes-needed figure from Task 3 Step 4.
- Actual dollars spent.
- Whichever of these is true: the router is dead weight (CI vs `COMBO` contains zero) / the router earns its call (CI excludes zero, `COMBO` ahead) / unresolvable at 57 dishes.

- [ ] **Step 2: Add the arm to `START-HERE.md`'s table**

Add a row to the arm table near the top of the file, in the same format as the existing `COMBO` row, with the range, the mean, and an explicit status. If the CI includes zero, the status is **"not established — do not ship"**, not "promising".

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/extraction-iteration-ledger.md docs/superpowers/START-HERE.md
git commit -m "docs: eval 187 — NOBOOST-FORM, 4 runs, vs FORM and vs COMBO"
```

- [ ] **Step 4: Report to Santiago**

State, in this order: the range, the comparison to `FORM`, the comparison to `COMBO`, the cost, and what is now unresolved. **Do not recommend deploying anything** — that is his call, and the repo has been burned once by a "pre-committed deploy rule" that was never his.

---

## Self-Review

**Spec coverage.** The spec is eval 186 ④: run the unrouted stack and find out whether the router still earns its place. Task 1 builds it, Task 2 runs it at the 4-run bar, Task 3 answers both the `FORM` and the `COMBO` question, Task 4 records it. Covered.

**Placeholders.** None — every code block is complete, every command is runnable, every expected output is stated.

**Type consistency.** `armNoBoostForm` uses `Item[]` (the type `armCombo` and `armNoBoost` already take), `runOrderArm(items, ARM_NOBOOST, false)` matches `armNoBoost:714` exactly, and `labelForms` / `applyFormMass` are called with the same argument shapes as `armCombo:829-832`. The registry key `"NOBOOST-FORM"` is quoted because it contains a hyphen, matching `"ORDER-nopush"` and `"A-cond"`.

**One risk worth naming.** Task 1 Step 5 changes `ARM_RUNNERS` from `const` to `export const`. That is the only edit reaching beyond the new arm, and it exists solely so the test can assert registration. If a reviewer objects, delete the test's registration assertion and keep the prompt-shape assertions — do not leave the arm untested.
