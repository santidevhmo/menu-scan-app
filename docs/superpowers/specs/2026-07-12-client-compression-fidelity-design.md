# Client Compression Fidelity Fix — Design (pre-release critical-path #3)

**Date:** 2026-07-12 · **Status:** approved by user (brainstorm session)
**Roadmap:** `docs/superpowers/plans/2026-07-04-ocr-extraction-master-roadmap.md` → "Release scope decision" item 3.

## Problem

Two measured facts:

1. **T5 fidelity probe (ledger eval 049, 2026-07-11):** the client's phase-1 compression (1024px / JPEG q0.7, `prepareImage` in `src/lib/compressImage.ts`) loses gated dimensions vs originals — brasero FAIL options+grams, el-marcos FAIL options+grams, mochomos FAIL section_context. The real app underperforms the eval on phase-1 quality.
2. **T9 device verification (ledger 2026-07-12):** device scans show price drift (126 vs 120), 60gr→650gr misreads, and dense results below the eval band with name distortions. NEW suspect beyond compression: **iOS ImagePicker may re-encode the picked asset even at `quality: 1`** — degrading the "original" that dense tiles are cut from, upstream of `prepareImage`.

Cost analysis (roadmap, 2026-07-12): API cost increase of a higher ceiling ≈ **zero** — GPT-4o rescales high-detail images to 768px shortest-side before tokenizing. The only real cost is upload size/latency (~0.2MB → ~0.5–1MB per photo). Hard constraint: uploads must stay under the edge fn's 10M-char base64 cap (`MAX_BASE64_LEN`, index.ts).

## User decisions (this session)

- **Sequencing:** eval-side compression ladder FIRST; ImagePicker instrumentation (scope a) folds into the exit-gate device build — one build, one device session.
- **Probe scope:** full ladder, ~$1.35 approved — control (originals) + 1024/q0.7 + 1536/q0.8 + 2048/q0.85, same window, all 6 menus.
- **Harness input post-close:** eval harness phase-1 input SWITCHES permanently from originals to the production compression setting once it passes its 3/3 gate — future frozen gates measure the real client path (same principle as critical-path #1: the gate proves the real code). Tiles keep cutting from originals, exactly like the client.

## Approach (chosen: A)

Raise the two constants in `prepareImage` (`MAX_DIMENSION`, `QUALITY`) to the ladder's winning setting. No new code paths.

Rejected: **B** upload picked asset unresized (3–5MB uploads near the base64 cap on 12MP photos; the control arm already measures whether full-res buys anything over 2048). **C** PNG phase-1 (full-page 12MP PNG blows the base64 cap; T5's failure mode was resolution + aggressive JPEG, not JPEG itself; tiles are PNG because they're crops).

## Post-approval discovery (2026-07-12, user-approved fold-in)

Tracing the real client flow found the intake layer, not just the ceiling, at fault — and a checkout drift:

- **This worktree's intake code is already correct**: `GalleryButton.tsx`, `(tabs)/index.tsx`, and `scan.store.ts` on `feat/extraction-eval-harness` store the ORIGINAL asset uri/dims (no intake compression; the store enforces `MAX_SCAN_PHOTOS`). `extractMenu` compresses once at upload; tiles cut from `photo.uri` = true originals.
- **The MAIN checkout's copies are stale** (old intake-compression code): they compress at intake (1024/q0.7), store the compressed uri, so `extractMenu` double-compresses uploads AND `prepareTile` cuts dense tiles from a 1024px q0.7 JPEG. The T9 device build synced only part of the client slice (analyzeMenu/compressImage/adaptiveExtraction/scan.ts/review.tsx — NOT these three files), so **the T9 device quality delta is largely explained by the stale intake files**, with ImagePicker re-encode a secondary open question (instrumentation still rides in the device build).
- **Fix (user ruling: fold into ticket #3):** raise the ceiling constants in the worktree's `compressImage.ts`, then sync the FULL client slice (8 files) into the main checkout for the device build. No new client code paths needed beyond temporary instrumentation logs.

## Step 1 — Ladder probe (~$1.35)

Extend `scripts/probe-fidelity.ts` from 2 modes to 4:

| Arm | Setting | Role |
|---|---|---|
| `original` | untouched files | control (also = approach B's data point) |
| `1024/q0.7` | sips -Z 1024, q70 | production floor — the indicted arm, kept for a same-window curve |
| `1536/q0.8` | sips -Z 1536, q80 | middle point (upload-size headroom / curiosity data) |
| `2048/q0.85` | sips -Z 2048, q85 | target — same ceiling family as tiles |

All arms: all 6 menus, phase-1 `runPagedExtraction`, oracle-scored via `scoreMenu` (5 dims).

**Detector assertions per arm:** nikkori MUST dense-signal; the 5 normal menus must NOT dense-signal (detector false-positive discipline, same as the dense detector campaign).

**Ambiguity rule (lesson #1 — one run proves nothing):** a dim failing in a compressed arm AND in control = model flake, ignore. A dim failing ONLY in a compressed arm = re-probe that menu×arm ×3 before ruling it a compression loss.

**Run discipline (lesson #8):** launch with `nohup … > log 2>&1 &`, monitor the log file; never pipe live output.

## Step 2 — Pick the setting

Decision rule: prefer **2048/q0.85** if ALL PASS on every scoreable menu (fidelity headroom for the device-photo gap this ticket chases; ~1MB upload acceptable). **1536/q0.8** is the fallback if 2048 hits payload/latency problems. Any surprise (e.g. 1536 passes where 2048 fails) → STOP, hand the user the dumps and the decision.

Payload check: assert the base64 length of every compressed fixture photo (and the multi-page brasero-two pair) stays under `MAX_BASE64_LEN` at the winning setting; extrapolate for a 12MP device photo.

## Step 3 — Implement

- **Client (worktree first, then synced to main checkout for the device build):** `MAX_DIMENSION` / `QUALITY` constants in `src/lib/compressImage.ts` → winning setting. `prepareTile` untouched.
- **Harness:** `scripts/eval-027-live.ts` phase-1 input switches from original photos to production-setting compression (small sips helper, shared with probe-fidelity where sensible). Dense tiles keep being cut from ORIGINALS (matches client behavior).
- **Tests first (project rule):** deno tests / self-checks for any harness helper; `deno check` in the worktree; `npx tsc --noEmit` in the main checkout for the client slice. No prompt or schema changes anywhere in this ticket.

## Step 4 — Exit gate (roadmap scope c)

1. Winning arm ALL PASS on all 6 menus in the ladder probe (Step 1/2).
2. Standard `eval-027-live` gate: **3/3 consecutive all-green runs, all 6 menus × GATE_DIMS [items, options, section_context, categories, grams] + detector assertions**, running on production-compressed phase-1 input (~$0.90/attempt — user cost approval before launching).
3. **Device re-scan Nikkori + brasero-two** on a build carrying the new setting AND temporary ImagePicker instrumentation (scope a): log picked-asset width/height/fileSize/format vs the known raw file, at the picker callsite in the client. Gap-closure check is objective: capture the device extraction JSON and score it offline against the fixtures ($0) — no eyeballing item counts.

**Contingency:** if device logs prove ImagePicker re-encodes destructively even after the ceiling raise, that is a NEW finding → back to the user with options (it affects tile sourcing too; likely its own mini-ticket).

## Close-out discipline

- Ledger entry per probe/gate (`docs/superpowers/extraction-iteration-ledger.md`, worktree), same format as evals 049–055.
- On close: pipeline diagram compression notes (≤1024px q0.7 → new setting, harness-input note) + re-copy to ~/Downloads; roadmap #3 marked done; memory update.
- Commit early and often on `feat/extraction-eval-harness`.

## Reference Block (verbatim from roadmap)

**Working directory:** eval work happens in the worktree `/private/tmp/menu-scan-app-extraction-eval-harness` on branch `feat/extraction-eval-harness`.

Menu photos + archived dumps: `/Users/santiagoaguirre/Downloads/MenusTesting/` (NikkoriMenu.png = dense; BraseroMenu.png; BraseroMenuTwo.png + BraseroMenuTwo_TWo.png = multi-page; CasaNostraMenu.png; ElMarcosMenu.png; MochomosMenu.png). `*.actual.json` dumps are free offline validation material — reuse before spending on live calls.

Edge Function (menu scanning):

```bash
curl -s -X POST "https://uonuiadueykynbetxxrw.supabase.co/functions/v1/analyze-menu" \
  -H "Authorization: Bearer <EXPO_PUBLIC_SUPABASE_ANON_KEY from .env>" \
  -H "Content-Type: application/json" \
  -d '{"photos":["<base64 img1>","<base64 img2>"],"goals":[],"provider":"gpt-vision","stage":"extract"}'
```

`OPENAI_API_KEY` is in the worktree's `.env.local` (gpt-4o, Tier-1: 30k TPM / 90k TPD — campaigns can exhaust the daily window). The deployed test fn (project uonuiadueykynbetxxrw) runs the gate-passing code since 2026-07-12; back up via `supabase functions download` before any redeploy.
