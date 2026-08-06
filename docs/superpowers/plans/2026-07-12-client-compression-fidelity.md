# Client Compression Fidelity Fix — Implementation Plan (critical-path #3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the measured phase-1 quality gap between the eval harness (original photos) and the real app (1024px/JPEG q0.7 uploads): raise the client compression ceiling to the ladder-probe winner, make the eval gate permanently score production-compressed input, and verify on device.

**Architecture:** Pure measurement-then-constants work. A 4-arm `sips` compression ladder (oracle-scored on all 6 fixture menus) picks the winning setting; the client's `prepareImage` constants change to it; the gate runner `eval-027-live.ts` switches its phase-1 input from originals to a production-mirror compression helper; a device build with temporary instrumentation logs verifies the phone path and answers the open ImagePicker re-encode question. No prompt, schema, or edge-function changes anywhere in this plan.

**Tech Stack:** Deno scripts (eval harness), `sips` (macOS image CLI), Expo/React Native client (expo-image-manipulator, expo-image-picker), GPT-4o via the shared `runPagedExtraction`/`runGroupedExtraction` extraction code.

**Spec:** `docs/superpowers/specs/2026-07-12-client-compression-fidelity-design.md` (this worktree — read it first).

## Context primer (you have zero context — read this)

- **Product:** Menu Scan photographs a restaurant menu → GPT-4o Vision extracts every food item (+options/sections/categories/grams) → a second GPT-4o call enriches macros → items sort by the user's nutritional goals. Extraction quality is gated by a frozen oracle-scored regression suite.
- **Two checkouts, one branch matters:** ALL work in this plan happens in the worktree `/private/tmp/menu-scan-app-extraction-eval-harness` (branch `feat/extraction-eval-harness`) — commit there, early and often. The primary folder (`feat/selectable-options`) `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app` (branch `feat/selectable-options`) is ONLY for device builds; client files are copied there UNCOMMITTED. **Never commit in the primary folder (`feat/selectable-options`).**
- **Key files (worktree-relative):**
  - `src/lib/compressImage.ts` — `prepareImage` (phase-1 upload compression, the constants this plan changes) and `prepareTile` (dense-tile cutter, ≤2048px PNG from originals — DO NOT touch).
  - `src/lib/analyzeMenu.ts` — client `extractMenu`: compresses each photo at upload, calls edge `stage:"extract"`; on `{needs_crops}` cuts 2×2 tiles from `photo.uri` (originals) and re-submits `stage:"extract-pages"`.
  - `scripts/eval-027-live.ts` — THE gate runner: 3/3 consecutive all-green runs on all 6 menus × `GATE_DIMS` [items, options, section_context, categories, grams] + dense-detector assertions. Never use plain `eval-extraction.ts --gate`.
  - `scripts/probe-fidelity.ts` — existing 2-mode fidelity probe this plan extends to a 4-arm ladder.
  - `scripts/eval-extraction.ts` — exports `scoreMenu(fixture, actual)` (scores all 5 dims from one response).
  - `scripts/fixtures/<menu>.expected.json` — hand-counted oracles (`menu`, `photos[]`, optional `dense: true` — only nikkori). NEVER edit fixtures; oracle changes are user-only decisions.
  - `supabase/functions/analyze-menu/extract.ts` — `runPagedExtraction` (phase-1; returns `{needs_crops}` on dense) and `runGroupedExtraction` (extract-pages). DO NOT touch.
- **Menu photos:** `/Users/santiagoaguirre/Downloads/MenusTesting/` — `BraseroMenu.png`, `BraseroMenuTwo.png`+`BraseroMenuTwo_TWo.png` (one 2-page menu), `CasaNostraMenu.png`, `ElMarcosMenu.png`, `MochomosMenu.png`, `NikkoriMenu.png` (the dense one — phase-1 must return `needs_crops` for it).
- **Why this plan exists (measured facts):** production 1024px/q0.7 compression loses options+grams on brasero and el-marcos and sections on mochomos vs originals (ledger eval 049); device scans showed further degradation (ledger T9). The worktree's intake code already stores ORIGINAL photo uri/dims; the primary folder (`feat/selectable-options`)'s stale intake files (`GalleryButton.tsx`, `(tabs)/index.tsx`, `scan.store.ts`) still compress at intake — the full-slice sync in Task 4 fixes that on the next device build.
- **Cost/ops rules (learned the expensive way):**
  - `OPENAI_API_KEY` is in the worktree's `.env.local` (never print or commit it). gpt-4o Tier-1: 30k TPM / 90k TPD — campaigns can exhaust the daily window.
  - Long live runs: `nohup deno run … > log 2>&1 &` then poll the log file. NEVER pipe live output through tail/grep; foreground Bash dies at 10 min and kills the run.
  - Validate offline ($0) before paying for live runs. One live run proves nothing (GPT-4o is nondeterministic at temp 0/seed 17) — the ambiguity rule in Checkpoint A exists for that.
  - Every code change gets its check first (self-check or `deno check`); client files also need `npx tsc --noEmit` in the primary folder (`feat/selectable-options`) after syncing.

## Global Constraints

- Worktree `/private/tmp/menu-scan-app-extraction-eval-harness`, branch `feat/extraction-eval-harness` — all commits go here.
- primary folder (`feat/selectable-options`) `/Users/santiagoaguirre/Desktop/CODING/menu-scan-app` — copy files in, never commit.
- No changes to: P1/P2 prompts, `EXTRACT_SCHEMA`, `extract.ts`, `postprocess.ts`, `merge.ts`, `index.ts` (edge fn), `prepareTile`, any fixture `.expected.json`.
- Uploads must stay under the edge fn's 10,000,000-char base64 cap (`MAX_BASE64_LEN`).
- Winning setting default: **2048px / JPEG q0.85** (`sips` formatOptions 85). If Checkpoint A picks a different winner, substitute it at the exact locations flagged `⟨WINNER⟩` — there are only three: `PROD_MAX_DIMENSION`/`PROD_JPEG_QUALITY` in `scripts/photo-input.ts` (Task 1) and `MAX_DIMENSION`/`QUALITY` in `src/lib/compressImage.ts` (Task 4).
- Live-spend approvals already granted: ladder probe ~$1.35 + one ~$0.05 smoke. The 3/3 gate (~$0.90/attempt) needs fresh user approval at Task 6 — do not launch it without it.
- Ledger discipline: every live probe/gate gets an entry in `docs/superpowers/extraction-iteration-ledger.md` (worktree), same format as evals 049–055 (the orchestrator writes these).

---

### Task 1: Production-mirror compression helper (`scripts/photo-input.ts`)

**Files:**
- Create: `scripts/photo-input.ts`

**Interfaces:**
- Consumes: nothing (leaf module; shells out to `sips`).
- Produces (used by Tasks 2 and 5):
  - `compressedPhotoData(name: string, maxDim: number, quality: number, tmpDir: string): Promise<string>` — data URL of a MenusTesting photo compressed like the client would.
  - `productionPhotoData(name: string, tmpDir: string): Promise<string>` — same, at the production constants.
  - `PROD_MAX_DIMENSION: number`, `PROD_JPEG_QUALITY: number` — MUST mirror `MAX_DIMENSION`/`QUALITY` in `src/lib/compressImage.ts` (quality × 100).

- [ ] **Step 1: Write the module with an assert-based self-check**

```ts
// scripts/photo-input.ts
// Production-mirror photo input (ticket #3, spec 2026-07-12): compresses a
// MenusTesting photo the way the client's prepareImage does before upload —
// longest side capped, JPEG re-encode. sips is the pixel-equivalent CLI stand-in
// for expo-image-manipulator (same recipe the T5 fidelity probe used).
// ⟨WINNER⟩ These constants MUST mirror src/lib/compressImage.ts
// (MAX_DIMENSION, QUALITY × 100). Checkpoint A of the ticket-#3 plan sets them.
export const PROD_MAX_DIMENSION = 2048;
export const PROD_JPEG_QUALITY = 85;

export const MENU_DIR = "/Users/santiagoaguirre/Downloads/MenusTesting";
export const MAX_BASE64_LEN = 10_000_000; // edge fn cap (analyze-menu/index.ts)

async function sh(args: string[]): Promise<void> {
  const out = await new Deno.Command(args[0], { args: args.slice(1) }).output();
  if (!out.success) {
    throw new Error(
      `${args.join(" ")} failed: ${new TextDecoder().decode(out.stderr)}`,
    );
  }
}

/** data: URL of a MenusTesting photo compressed to maxDim / JPEG quality (0-100). */
export async function compressedPhotoData(
  name: string,
  maxDim: number,
  quality: number,
  tmpDir: string,
): Promise<string> {
  const out = `${tmpDir}/${name.replaceAll("/", "_")}.${maxDim}q${quality}.jpg`;
  await sh([
    "sips",
    "-Z",
    String(maxDim),
    "-s",
    "format",
    "jpeg",
    "-s",
    "formatOptions",
    String(quality),
    `${MENU_DIR}/${name}`,
    "--out",
    out,
  ]);
  const b64 = (await Deno.readFile(out)).toBase64();
  if (b64.length >= MAX_BASE64_LEN) {
    throw new Error(`${name} @${maxDim}/q${quality}: base64 ${b64.length} exceeds edge cap`);
  }
  return `data:image/jpeg;base64,${b64}`;
}

/** Production-mirror input: what the client actually uploads for phase-1. */
export function productionPhotoData(
  name: string,
  tmpDir: string,
): Promise<string> {
  return compressedPhotoData(name, PROD_MAX_DIMENSION, PROD_JPEG_QUALITY, tmpDir);
}

// Self-check: deno run --allow-read --allow-write --allow-run scripts/photo-input.ts --self-check
if (import.meta.main && Deno.args.includes("--self-check")) {
  const tmp = await Deno.makeTempDir({ prefix: "photo-input-check-" });
  const url = await compressedPhotoData("NikkoriMenu.png", 1024, 70, tmp);
  const original = await Deno.readFile(`${MENU_DIR}/NikkoriMenu.png`);
  let failed = 0;
  const check = (label: string, ok: boolean) => {
    console.log(`${ok ? "✓" : "✗"} ${label}`);
    if (!ok) failed++;
  };
  check("returns a jpeg data URL", url.startsWith("data:image/jpeg;base64,"));
  check("compressed smaller than original", url.length < original.byteLength * (4 / 3));
  check("under edge base64 cap", url.length < MAX_BASE64_LEN);
  const prod = await productionPhotoData("NikkoriMenu.png", tmp);
  check("production arm under edge cap", prod.length < MAX_BASE64_LEN);
  console.log(failed === 0 ? "SELF-CHECK PASS" : "SELF-CHECK FAIL");
  if (failed > 0) Deno.exitCode = 1;
}
```

- [ ] **Step 2: Run the self-check**

Run (worktree root): `deno run --allow-read --allow-write --allow-run scripts/photo-input.ts --self-check`
Expected: 4 ✓ lines + `SELF-CHECK PASS` (costs $0 — no API calls).

- [ ] **Step 3: Typecheck**

Run: `deno check scripts/photo-input.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/photo-input.ts
git commit -m "feat(eval): production-mirror compression helper for phase-1 input (ticket #3)"
```

---

### Task 2: 4-arm ladder probe (`scripts/probe-fidelity.ts` rewrite) + launch

**Files:**
- Modify: `scripts/probe-fidelity.ts` (full rewrite below — the old file is a 2-mode version of the same idea)

**Interfaces:**
- Consumes: `compressedPhotoData`, `MENU_DIR` from `scripts/photo-input.ts` (Task 1); `runPagedExtraction` from `../supabase/functions/analyze-menu/extract.ts`; `scoreMenu` from `./eval-extraction.ts`.
- Produces: console report per arm×menu + failure dumps `<MENU_DIR>/<menu>.fidelity-<modeKey>.actual.json`. No exports.

- [ ] **Step 1: Rewrite the probe**

```ts
// scripts/probe-fidelity.ts
// Compression ladder probe (ticket #3, spec 2026-07-12): for each fixture, run
// phase-1 runPagedExtraction on 4 input arms — original (control), 1024/q0.70
// (production floor, the indicted arm), 1536/q0.80, 2048/q0.85 (target) — and
// oracle-score every non-dense verdict. Detector assertions per arm: nikkori
// (fixture dense:true) MUST dense-signal; the 5 normal menus must NOT.
// Filters for targeted re-probes (Checkpoint A ambiguity rule):
//   PROBE_MODES=2048q85 PROBE_MENUS=el-marcos deno run ... scripts/probe-fidelity.ts
// Run (detached — NEVER foreground, 10-min tool timeouts kill runs):
//   nohup deno run --allow-read --allow-write --allow-env --allow-net \
//     --allow-run scripts/probe-fidelity.ts > /tmp/probe-ladder.log 2>&1 &
import { runPagedExtraction } from "../supabase/functions/analyze-menu/extract.ts";
import { scoreMenu } from "./eval-extraction.ts";
import { compressedPhotoData, MENU_DIR } from "./photo-input.ts";

type Fixture = Parameters<typeof scoreMenu>[0];
const FIXTURE_DIR = new URL("./fixtures/", import.meta.url);
const apiKey = Deno.env.get("OPENAI_API_KEY")!;
const tmp = await Deno.makeTempDir({ prefix: "fidelity-" });

interface Mode {
  key: string;
  maxDim: number | null; // null = original, untouched bytes
  quality: number | null;
}
const MODES: Mode[] = [
  { key: "original", maxDim: null, quality: null },
  { key: "1024q70", maxDim: 1024, quality: 70 },
  { key: "1536q80", maxDim: 1536, quality: 80 },
  { key: "2048q85", maxDim: 2048, quality: 85 },
];

function mime(name: string): string {
  return name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

async function originalData(name: string): Promise<string> {
  const bytes = await Deno.readFile(`${MENU_DIR}/${name}`);
  return `data:${mime(name)};base64,${bytes.toBase64()}`;
}

const fixtures: Fixture[] = [];
for await (const entry of Deno.readDir(FIXTURE_DIR)) {
  if (entry.isFile && entry.name.endsWith(".expected.json")) {
    fixtures.push(
      JSON.parse(await Deno.readTextFile(new URL(entry.name, FIXTURE_DIR))),
    );
  }
}
fixtures.sort((a, b) => a.menu.localeCompare(b.menu));

const onlyModes = Deno.env.get("PROBE_MODES")?.split(",").map((s) => s.trim());
const onlyMenus = Deno.env.get("PROBE_MENUS")?.split(",").map((s) => s.trim());
const modes = onlyModes ? MODES.filter((m) => onlyModes.includes(m.key)) : MODES;
const menus = onlyMenus
  ? fixtures.filter((f) => onlyMenus.includes(f.menu))
  : fixtures;

const DIMS = ["items", "options", "section_context", "categories", "grams"] as const;
const summary: string[] = [];

for (const mode of modes) {
  console.log(`\n===== MODE: ${mode.key} =====`);
  for (const fixture of menus) {
    const photos = await Promise.all(fixture.photos.map(async (p) => {
      const data = mode.maxDim === null
        ? await originalData(p)
        : await compressedPhotoData(p, mode.maxDim, mode.quality!, tmp);
      console.log(`  [payload] ${p}: ${data.length} chars`);
      return data;
    }));
    let line: string;
    try {
      const result = await runPagedExtraction(photos, apiKey);
      const denseSignaled = "needs_crops" in result;
      const detectorOk = denseSignaled === Boolean(fixture.dense);
      if (denseSignaled) {
        line = `${fixture.menu}: DENSE-SIGNAL — detector ${detectorOk ? "OK" : "WRONG"}`;
      } else {
        const report = scoreMenu(fixture, {
          image_quality: result.image_quality,
          items: result.items,
        });
        const fails = DIMS.filter((d) => !(report[d] as { pass: boolean }).pass);
        line = `${fixture.menu}: detector ${detectorOk ? "OK" : "WRONG"}; ${
          fails.length === 0 ? "ALL DIMS PASS" : `FAIL ${fails.join(",")}`
        }`;
        if (fails.length > 0) {
          await Deno.writeTextFile(
            `${MENU_DIR}/${fixture.menu}.fidelity-${mode.key}.actual.json`,
            `${JSON.stringify({ image_quality: result.image_quality, items: result.items }, null, 2)}\n`,
          );
        }
      }
    } catch (error) {
      line = `${fixture.menu}: TERMINAL ${String(error).slice(0, 80)}`;
    }
    console.log(`${mode.key} ${line}`);
    summary.push(`${mode.key.padEnd(9)} ${line}`);
  }
}

console.log("\n===== LADDER SUMMARY =====");
for (const line of summary) console.log(line);
```

- [ ] **Step 2: Typecheck**

Run: `deno check scripts/probe-fidelity.ts`
Expected: no errors.

- [ ] **Step 3: Commit the probe before spending**

```bash
git add scripts/probe-fidelity.ts
git commit -m "feat(eval): 4-arm compression ladder probe with detector assertions + payload logging (ticket #3)"
```

- [ ] **Step 4: Launch the ladder (~$1.35, user-approved) — detached**

```bash
cd /private/tmp/menu-scan-app-extraction-eval-harness
set -a; source .env.local; set +a
nohup deno run --allow-read --allow-write --allow-env --allow-net --allow-run \
  scripts/probe-fidelity.ts > /tmp/probe-ladder.log 2>&1 &
```

- [ ] **Step 5: Monitor until the LADDER SUMMARY block appears**

Poll (do NOT stream): `grep -c "MODE:" /tmp/probe-ladder.log` then `sed -n '/LADDER SUMMARY/,$p' /tmp/probe-ladder.log`
Expected finished state: 4 MODE headers; summary has one line per mode×menu (24 lines); `original` arm: 5 menus ALL DIMS PASS + nikkori DENSE-SIGNAL detector OK. Takes ~15–30 min. If the run dies on quota (gpt-4o TPD), report the partial summary — the orchestrator decides timing.

- [ ] **Step 6: Report the raw LADDER SUMMARY verbatim**

Return the full summary block + any TERMINAL/WRONG lines + payload char counts for the 2048q85 arm. Do not interpret beyond that — Checkpoint A is the orchestrator's.

---

### CHECKPOINT A — pick the winner (orchestrator + user; NOT a subagent task)

- Decision rule (spec): prefer **2048/q0.85** if ALL PASS on every scoreable menu with detector OK everywhere; 1536/q0.8 is the fallback; any surprise (e.g. 1536 passes where 2048 fails) → STOP and hand the user the dumps and the decision.
- Ambiguity rule: a dim failing in a compressed arm AND in `original` = model flake — ignore it. Failing ONLY in a compressed arm = re-probe that menu×arm ×3 (`PROBE_MODES=<key> PROBE_MENUS=<menu>`, ~$0.03–0.10 each) before ruling it a compression loss.
- Record the ruling in the ledger. If the winner ≠ 2048/q0.85, update the `⟨WINNER⟩` constants (`scripts/photo-input.ts` + Task 4's values) before continuing.

---

### Task 3: Gate runner switches phase-1 input to the production mirror

**Files:**
- Modify: `scripts/eval-027-live.ts` (lines ~44–51 `mime`/`photoData`, ~128–155 `extractMenu`)

**Interfaces:**
- Consumes: `productionPhotoData(name, tmpDir)` from `scripts/photo-input.ts` (Task 1).
- Produces: gate runner whose phase-1 pages and non-dense group pages are production-compressed; `cutTiles` (dense tiles from ORIGINALS) untouched — client parity.

- [ ] **Step 1: Replace the original-photo loader**

In `scripts/eval-027-live.ts`, add to the imports:

```ts
import { productionPhotoData } from "./photo-input.ts";
```

Delete the `mime` and `photoData` functions (lines ~44–51) and add:

```ts
const INPUT_TMP = await Deno.makeTempDir({ prefix: "eval-input-" });

// Phase-1 input: PRODUCTION-MIRROR compression (ticket #3, spec 2026-07-12,
// user ruling: the gate proves the real client path). Supersedes the Task-5
// originals decision (ledger eval 049) — the ladder probe proved the raised
// ceiling keeps all frozen dims green. Dense tiles still cut from ORIGINALS
// (cutTiles), exactly like the client's prepareTile.
function photoData(name: string): Promise<string> {
  return productionPhotoData(name, INPUT_TMP);
}
```

Then update the stale comment inside `extractMenu` (the block starting `// Phase-1 input: ORIGINAL photos (Task-5 fidelity probe...`) to:

```ts
  // Phase-1 input: production-mirror compressed (see photoData above).
```

No other change — both `photoData` callsites (phase-1 photos, non-dense group pages) keep their names.

- [ ] **Step 2: Typecheck**

Run: `deno check scripts/eval-027-live.ts`
Expected: no errors.

- [ ] **Step 3: One-menu live smoke (~$0.05, user-approved)**

```bash
cd /private/tmp/menu-scan-app-extraction-eval-harness
set -a; source .env.local; set +a
nohup env EVAL_MENUS=brasero EVAL_RUNS=1 deno run --allow-read --allow-write \
  --allow-env --allow-net --allow-run scripts/eval-027-live.ts > /tmp/smoke-prod-input.log 2>&1 &
```

Poll `/tmp/smoke-prod-input.log` until the final `===== 1/1 consecutive...` line.
Expected: brasero detector PASS (normal) + all 5 dims PASS through the compressed input.

- [ ] **Step 4: Commit**

```bash
git add scripts/eval-027-live.ts
git commit -m "feat(eval): gate phase-1 input switched to production-mirror compression (ticket #3)"
```

---

### Task 4: Client constants + full slice sync to the primary folder (`feat/selectable-options`)

**Files:**
- Modify: `src/lib/compressImage.ts` (worktree — canonical)
- Copy (worktree → primary folder (`feat/selectable-options`), UNCOMMITTED): 8 client files listed in Step 3.

**Interfaces:**
- Consumes: Checkpoint A's winning setting (default 2048 / q0.85).
- Produces: `prepareImage` compressing to `⟨WINNER⟩`; a primary folder (`feat/selectable-options`) whose intake files finally store ORIGINAL photos (they exist on this branch already — the sync carries them over).

- [ ] **Step 1: Raise the constants in the worktree**

In `src/lib/compressImage.ts` replace:

```ts
const MAX_DIMENSION = 1024;
const QUALITY = 0.7;

/** Optionally crops, then compresses an image to a max 1024px side. */
```

with:

```ts
// Ticket #3 (spec 2026-07-12): 1024/q0.7 measurably lost options/grams/sections
// on 3 of 6 gate menus (ledger eval 049). 2048/q0.85 = the ladder-probe winner;
// API cost delta ≈ zero (GPT-4o rescales high-detail to 768px shortest-side),
// upload grows to ~0.5-1MB/photo. Mirrored by scripts/photo-input.ts PROD_*.
const MAX_DIMENSION = 2048;
const QUALITY = 0.85;

/** Optionally crops, then compresses an image to a max 2048px side. */
```

(If Checkpoint A picked a different winner, use those values and matching comment.)

- [ ] **Step 2: Worktree typecheck + commit**

```bash
cd /private/tmp/menu-scan-app-extraction-eval-harness
npx tsc --noEmit
git add src/lib/compressImage.ts
git commit -m "feat(client): phase-1 upload compression ceiling 1024/q0.7 -> 2048/q0.85 (ticket #3 ladder winner)"
```

Expected: tsc exits 0.

- [ ] **Step 3: Sync the FULL client slice into the primary folder (`feat/selectable-options`) (uncommitted)**

The T9 device build missed 3 of these files — the primary folder (`feat/selectable-options`) still compresses at intake and cuts tiles from compressed copies. Copy all 8:

```bash
WT=/private/tmp/menu-scan-app-extraction-eval-harness
MAIN=/Users/santiagoaguirre/Desktop/CODING/menu-scan-app
for f in \
  src/lib/compressImage.ts \
  src/lib/analyzeMenu.ts \
  src/lib/adaptiveExtraction.ts \
  src/types/scan.ts \
  src/app/review.tsx \
  "src/app/(tabs)/index.tsx" \
  src/components/scan/GalleryButton.tsx \
  src/store/scan.store.ts; do
  cp "$WT/$f" "$MAIN/$f"
done
```

- [ ] **Step 4: Main-checkout typecheck**

Run: `cd /Users/santiagoaguirre/Desktop/CODING/menu-scan-app && npx tsc --noEmit`
Expected: exit 0. Do NOT commit anything in the primary folder (`feat/selectable-options`).

---

### Task 5: Device instrumentation logs + offline dump scorer

**Files:**
- Modify: `src/components/scan/GalleryButton.tsx`, `src/app/(tabs)/index.tsx`, `src/lib/analyzeMenu.ts` (worktree — canonical; re-sync after)
- Create: `scripts/score-dump.ts`

**Interfaces:**
- Consumes: `scoreMenu` from `./eval-extraction.ts`; the client files as they exist after Task 4.
- Produces: `[fidelity]`-tagged console logs on device (picked-asset facts vs upload facts — answers the ImagePicker re-encode question); `score-dump.ts <menu> <dump.json>` printing PASS/FAIL per dimension for a device-captured extraction JSON.

- [ ] **Step 1: Instrument the gallery picker (worktree `src/components/scan/GalleryButton.tsx`)**

Inside `handlePress`, the current loop body starts with `addPhoto({`. Change:

```ts
    for (const asset of result.assets.slice(0, remaining)) {
      addPhoto({
```

to:

```ts
    for (const asset of result.assets.slice(0, remaining)) {
      // ponytail: temp instrumentation (ticket #3) — remove after device verification.
      // Answers: does iOS ImagePicker re-encode/downscale even at quality: 1?
      console.log("[fidelity] picked asset", {
        width: asset.width,
        height: asset.height,
        fileSize: asset.fileSize ?? null,
        mimeType: asset.mimeType ?? null,
        uriExt: asset.uri.split(".").pop(),
      });
      addPhoto({
```

- [ ] **Step 2: Instrument the camera capture (worktree `src/app/(tabs)/index.tsx`)**

In `capture()`, after `if (!photo) return;` insert:

```ts
      // ponytail: temp instrumentation (ticket #3) — remove after device verification.
      console.log("[fidelity] camera photo", {
        width: photo.width,
        height: photo.height,
        uriExt: photo.uri.split(".").pop(),
      });
```

- [ ] **Step 3: Instrument the upload compression (worktree `src/lib/analyzeMenu.ts`)**

In `extractMenu`, replace the `base64Photos` mapper:

```ts
  const base64Photos = await Promise.all(
    photos.map(async (p) => {
      const compressed = await compressImage(p.uri, p.width, p.height);
      return FileSystem.readAsStringAsync(compressed.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }),
  );
```

with:

```ts
  const base64Photos = await Promise.all(
    photos.map(async (p) => {
      const compressed = await compressImage(p.uri, p.width, p.height);
      const b64 = await FileSystem.readAsStringAsync(compressed.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      // ponytail: temp instrumentation (ticket #3) — remove after device verification.
      console.log("[fidelity] upload photo", {
        srcW: p.width,
        srcH: p.height,
        outW: compressed.width,
        outH: compressed.height,
        base64Chars: b64.length,
      });
      return b64;
    }),
  );
```

- [ ] **Step 4: Write the offline dump scorer (`scripts/score-dump.ts`)**

```ts
// scripts/score-dump.ts
// Scores an extraction dump (e.g. device console JSON) against a fixture oracle.
// Usage: deno run --allow-read scripts/score-dump.ts <menu> <path-to-dump.json>
//   <menu>: brasero | brasero-two | casa-nostra | el-marcos | mochomos | nikkori
//   <dump.json>: {items: [...]} — the STAGE 1 EXTRACTION RESULT payload, or any
//                object with a final postprocessed items array.
// Deliberately does NOT re-run postprocess: re-postprocessing an already
// postprocessed dump creates artifacts (ledger 2026-07-10, double-postprocess).
import { scoreMenu } from "./eval-extraction.ts";

const [menu, dumpPath] = Deno.args;
if (!menu || !dumpPath) {
  console.error("usage: score-dump.ts <menu> <dump.json>");
  Deno.exit(1);
}
const fixture = JSON.parse(
  await Deno.readTextFile(new URL(`./fixtures/${menu}.expected.json`, import.meta.url)),
);
const dump = JSON.parse(await Deno.readTextFile(dumpPath));
if (!Array.isArray(dump.items)) throw new Error("dump has no items array");
const report = scoreMenu(fixture, {
  image_quality: dump.image_quality ?? { usable: true, issues: [] },
  items: dump.items,
});
let failed = 0;
for (const dim of ["items", "options", "section_context", "categories", "grams"] as const) {
  const r = report[dim] as { pass: boolean; detail: string };
  console.log(`${r.pass ? "PASS" : "FAIL"} ${dim}: ${r.detail}`);
  if (!r.pass) failed++;
}
console.log(failed === 0 ? "ALL DIMS PASS" : `${failed} dims FAIL`);
if (failed > 0) Deno.exitCode = 1;
```

- [ ] **Step 5: Verify the scorer against an archived dump ($0)**

Run: `deno check scripts/score-dump.ts && ls /Users/santiagoaguirre/Downloads/MenusTesting/*.actual.json | head -3`
Pick any archived `<menu>.*.actual.json` dump and run e.g.:
`deno run --allow-read scripts/score-dump.ts el-marcos "/Users/santiagoaguirre/Downloads/MenusTesting/<an el-marcos dump>.actual.json"`
Expected: five PASS/FAIL lines printed (the verdicts themselves depend on which dump — the check is that it scores without error).

- [ ] **Step 6: Typechecks + re-sync + commit**

```bash
cd /private/tmp/menu-scan-app-extraction-eval-harness && npx tsc --noEmit
WT=/private/tmp/menu-scan-app-extraction-eval-harness
MAIN=/Users/santiagoaguirre/Desktop/CODING/menu-scan-app
for f in src/lib/analyzeMenu.ts "src/app/(tabs)/index.tsx" src/components/scan/GalleryButton.tsx; do
  cp "$WT/$f" "$MAIN/$f"
done
cd "$MAIN" && npx tsc --noEmit
cd "$WT"
git add src/components/scan/GalleryButton.tsx "src/app/(tabs)/index.tsx" src/lib/analyzeMenu.ts scripts/score-dump.ts
git commit -m "feat: temp fidelity instrumentation + offline dump scorer (ticket #3 device phase)"
```

Expected: both tsc runs exit 0.

---

### Task 6: 3/3 exit gate on production-compressed input (orchestrator launches; ~$0.90/attempt, USER APPROVAL REQUIRED FIRST)

**Files:** none (pure run).

- [ ] **Step 1: Get user approval for the attempt (~$0.90, ~11 min)**

- [ ] **Step 2: Launch detached**

```bash
cd /private/tmp/menu-scan-app-extraction-eval-harness
set -a; source .env.local; set +a
nohup deno run --allow-read --allow-write --allow-env --allow-net --allow-run \
  scripts/eval-027-live.ts > /tmp/gate-ticket3-attempt1.log 2>&1 &
```

- [ ] **Step 3: Monitor to completion, judge, ledger**

Poll for the final `===== N/3 consecutive all-menu passing runs =====` line.
Expected for close: `3/3`. On failure: diagnose from the run log + failure dumps (`<menu>.eval027-r<N>.actual.json` — check mtimes, they overwrite per attempt); classify vs the known flake pool (ledger eval 055: Churrasquería box recall ~25%, el-marcos jamón price-null, omelette classes) before blaming the compressed input; a dim failing that also fails in archived original-input runs is model flake, not compression. Orchestrator + user decide rerun vs investigate. Ledger every attempt.

---

### Task 7: Device verification (user in the loop) + ImagePicker verdict

**Files:** none (build + scans + offline scoring).

- [ ] **Step 1: User builds and runs on iPhone from the primary folder (`feat/selectable-options`)** (dev build with Metro console visible; the synced slice from Tasks 4–5 is what ships).

- [ ] **Step 2: Scan protocol** — gallery-import (same photos as fixtures, from `/Users/santiagoaguirre/Downloads/MenusTesting/` synced to the phone): (a) NikkoriMenu.png — expect `dense pages detected [0]`, tile flow, one unified menu; (b) BraseroMenuTwo.png + BraseroMenuTwo_TWo.png — expect single-phase 2-page merge. For each, capture from the Metro console: all `[fidelity]` lines + the full `STAGE 1 EXTRACTION RESULT` JSON block, saved to `/tmp/device-nikkori.json` and `/tmp/device-brasero-two.json` (the `items` array payload).

- [ ] **Step 3: Score the device dumps offline ($0)**

```bash
cd /private/tmp/menu-scan-app-extraction-eval-harness
deno run --allow-read scripts/score-dump.ts nikkori /tmp/device-nikkori.json
deno run --allow-read scripts/score-dump.ts brasero-two /tmp/device-brasero-two.json
```

Expected for gap-closure: ALL DIMS PASS on both (same oracle the eval gate uses — no eyeballing).

- [ ] **Step 4: ImagePicker verdict from the `[fidelity]` logs** — compare picked-asset width/height/fileSize/mimeType against the raw files' known facts (get truth with `sips -g pixelWidth -g pixelHeight <file>` and `ls -l`). If dimensions or format differ from the raw file, ImagePicker re-encodes: report to the user with the numbers — per spec this becomes its own follow-up decision (it affects tile sourcing too). If identical, close the suspicion in the ledger.

---

### Task 8: Close-out (orchestrator)

- [ ] **Step 1: Remove the three `[fidelity]` instrumentation blocks** (GalleryButton.tsx, index.tsx, analyzeMenu.ts — worktree), `npx tsc --noEmit` both checkouts after re-syncing those 3 files to main, commit worktree: `chore: drop temp fidelity instrumentation (ticket #3 verified)`.
- [ ] **Step 2: Ledger** — final ticket #3 entry: ladder table, winner, gate result, device verdicts, ImagePicker verdict.
- [ ] **Step 3: Pipeline diagram** (`docs/superpowers/diagrams/menu-extraction-pipeline.md`, MAIN repo) — update the two compression notes (client compress line in the sequence diagram + call order step 1) from `≤1024px, JPEG q0.7` to the winner; add a status-table row/note: client compression fidelity 🟢 CLOSED with date + harness-input switch note. Re-copy to `~/Downloads/menu-extraction-pipeline.md`.
- [ ] **Step 4: Roadmap** (MAIN repo `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md`) — mark critical-path #3 ✅ DONE with a one-line summary; next is #4 horizontal menus.
- [ ] **Step 5: Memory** — update the auto-memory (pre-release wiring/status files): #3 closed, winner setting, harness-input switch, main-checkout sync state, ImagePicker verdict.
- [ ] **Step 6: Commit docs** in both repos (main repo commits allowed for docs only — matches prior close-outs).

---

## Self-review notes (plan author)

- Spec coverage: ladder probe (T2), decision rule + ambiguity rule (Checkpoint A), payload cap (T1 helper throws + probe logs), client constants (T4), full-slice sync incl. stale intake files (T4), harness permanent switch (T3), 3/3 gate (T6), device re-scan + ImagePicker instrumentation + offline scoring (T5/T7), contingency (T7 step 4), close-out discipline (T8). No gaps found.
- Order note: T3 (gate-runner switch) is written before T4 but only its smoke depends on the winner via `photo-input.ts` constants — both come after Checkpoint A; T3 and T4 are independent of each other.
- The winning-setting substitution has exactly three touchpoints, all flagged `⟨WINNER⟩`.
