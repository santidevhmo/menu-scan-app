# Production Co-location Stage — Design Spec

**Date:** 2026-07-17 · **Status:** APPROVED scope (user green-light 2026-07-17) — implementation next
**Owner:** horizontal-menus container (critical-path #4, Phase 1 step 1c-production)
**Evidence base:** ledger evals 070 (research), 071 (14/14 replay pass, ruling 9), 072 (nested rejected; $0 cross-audits + sibling polarity simulation). Dedos De Queso adjudication (user, 2026-07-17): printed price **$199** — GPT-4o misread $119, Mistral OCR read the print correctly.

## Goal

Add a deterministic post-merge cleanup stage to the dense/tile extraction path: a cheap layout-OCR pass supplies printed line-blocks with coordinates; every extracted item is checked for printed evidence (eval-071 v3 matcher); items proven to be corrupted duplicates of a real card are dropped. No prompt changes, no geometry changes, no model swap.

## Scope guards (non-negotiable)

- **Tile path only.** The stage runs inside `runGroupedExtraction` for 4-tile groups. The single-photo portrait path is byte-identical to today — unit-pinned (architecture decision 2026-07-13).
- **Fail-open.** Any OCR API error/timeout (20s cap per call) → skip the stage entirely, log `[colocation] skipped: <reason>`, return items unchanged. The scan must never fail or degrade because Mistral is down.
- **Delete only with proof of duplication** (polarity v1, below). Zero field mutation in v1.
- **No menu-specific values.** All thresholds are structural (token ratios, edit distance), same worldwide.

## Architecture

New module `supabase/functions/analyze-menu/colocation.ts`:

1. **OCR fetch — per tile, no client/protocol change.** For each dense page's 4 tiles (already in the edge request), POST `https://api.mistral.ai/v1/ocr` with `model: "mistral-ocr-latest"`, `document: {type:"image_url", image_url: <tile data-url>}`, `include_blocks: true`. Union the four tiles' `pages[].blocks[]` (flat `{content, top_left_*, bottom_right_*, type}` lines; overlap duplicates are harmless — any block can anchor). 4 pages ≈ **$0.016/dense scan** (~5% of the scan's GPT cost; accepted per OCR-cost memory). Requires `MISTRAL_API_KEY` edge secret (`supabase secrets set`, test project first).
   - *Why tiles, not the original photo:* phase-2 requests don't carry the original, and adding it risks the 10MB request cap. Tile text is larger → OCR reads equal-or-better. The ×3 confirmation probe measures this mirror.
2. **Matcher — direct port of eval-071 v3** (`scripts/probe-colocation-eval071.ts`): `normTokens` (NFD accent-strip), `nameTokens` (drop numeric/gr/pz field text), `parseGrams`, `tokenMatch` (1-edit fuzz, ≥5-char tokens), **mention-guard anchors** (≥60% of candidate name tokens in block AND ≥50% of the block's own name-like tokens belong to the candidate — prose mentions can never anchor), 3-way verdict per ruling 9 (verified / contradicted-by-priced-anchor-only / unverifiable). Port the probe's 14 tests.
3. **Polarity v1 — sibling-aware (eval-072 baseline audit):** applied to non-drink items after the existing post-merge hygiene chain:
   - `contradicted` **and** a `verified` item anchors to the same block → **DROP** (it is a corrupted duplicate of that card). Log name + anchor + reason.
   - `contradicted` alone (no verified same-anchor sibling) → **KEEP unchanged**, log `[colocation] flag: <name> field conflicts with print <block content>`. These are real cards with one misread field (Tender 350gr→150gr; Dedos $199→$119). **Field repair from print is v2** — deferred until the ×3 probe provides more reader-disagreement evidence (Dedos = 1 data point in OCR's favor).
   - `unverifiable` → **KEEP unchanged** (never delete on absence of evidence — rulings 9 + keep-bias discipline). Covers the ungated name-misread class (El Tenderazo etc.) and unprinted-field embellishments (Alitas grams).
4. **Advisory completeness log (recall, $0):** after polarity, log priced OCR blocks that anchor **no** final item: `[colocation] unmatched priced lines: N — <first few>`. No behavior change in v1; this is the deterministic instrument for the missing-Ensalada recall gap (DoorDash guardrail (b) made concrete). Escalation (retake prompt / targeted re-ask) is a separate future decision on probe evidence.

**Wiring point:** `runGroupedExtraction`, after the existing `dropOptionEchoItems(remapTruncatedSectionTitles(...))` chain, before `foldResults`. The stage receives the per-page tile images (already in scope) + merged items.

## Amendment v1.1 — printed-name existence tier (user-approved 2026-07-17; evidence: ledger eval 075)

After polarity v1, a second tier drops novel-name inventions — items whose names are printed nowhere:

- **Menu readability gate (mandatory):** the tier activates ONLY when ≥50% of the menu's non-drink items are anchored (any mention-guard anchor). Where the OCR cannot read a menu's names (nikkori ≈12% anchored — its real rolls score 0.00 on name similarity and would all be deleted otherwise), the tier is inert. Deletion authority is granted per menu only where the evidence source proves it reads that menu.
- **Existence check:** for each kept non-drink item that is `unverifiable` AND has no anchor: compute best per-block similarity of significant name tokens (≥3 chars, non-numeric/unit; loose edit-distance allowance ≤ min(3, len/3); score = matched / max(candidate, block token counts) — long prose self-penalizes). Score < 0.75 → **drop**, logged `[colocation] drop-invented`. Score ≥ 0.75 → keep (real-but-misread name class: TortiBoneless, El Tenderazo, Cabeza Pollotera all score 1.00; all 6 known inventions score ≤ 0.67).
- Replay expectations with the tier: eval-068 baseline 46 → 40 exact (4 sibling drops + Sour Cream Cheese Fries + Ensalada de Pollo a la Plancha); nikkori 0 drops ×3 unchanged.

## Amendment v1.2 — condiment-panel filter (user-approved 2026-07-17; evidence: ledger eval 076)

The tile path drops items with `category === "other"` in the same per-tile filter that already drops drinks. Rationale: printed sauce/dressing/topping panels are sometimes extracted as items (eval-076 r1: 9 such items, 3 spurious sections); they are printed text, so evidence tiers correctly cannot veto them — but GPT itself labels them `other`. Archive survey (4,037 items, all dumps ever): 42 `other` instances, every one a condiment/topping or banner echo, zero real dishes. Structural, model-supplied signal; single-photo portrait path untouched.

## Amendment v1.3 — evidence source = full-photo OCR via `ocr_photos` (user-approved 2026-07-18, ruling 15; evidence: ledger eval 079)

Per-tile OCR is REPLACED as the evidence source. Eval-079 measurements (3 archived live dumps, OCR deterministic ×3): tile-edge cuts mint merged fragment blocks that spuriously anchor description-minted inventions (defeating the existence tier), and whole tiles can deterministically OCR as ONE mega-block (polloteria tile 2), starving their exclusive region of evidence — on the corrected tile union the existence tier false-drops 9–11 REAL cards per dump; interior-edge exclusion does not save it. A single OCR call on a 2048px/q0.95 JPEG copy of the ORIGINAL photo drops exactly the audited inventions across all three dumps with zero false effects (43→41, 40→39, 44→42) and is 4× cheaper (~$0.004/dense scan).

- **Protocol:** the `extract-pages` request gains optional `ocr_photos: (string|null)[]`, parallel to `pages` — for each dense (4-tile) page the client attaches a full data-URL of the existing `compressImage` output (2048/q0.95 JPEG, the ticket-#3 fallback transform, ~1MB b64); null for single-photo pages. Field absent/empty → stage skipped (fail-open; old builds harmless). Length/size validated in `index.ts`.
- **Stage:** `colocationStage(ocrPhotos, items, key)` — one `fetchOcrBlocks` call per dense page, blocks unioned. Matcher, polarity v1, existence tier v1.1 (readability gate), and the v1.2 cat-other filter are UNCHANGED — all replay gates were always validated against exactly this full-photo input shape. The per-tile OCR path is deleted (it also never worked on-device: production tiles are bare base64 without the `data:` prefix Mistral requires — harness-only behavior to date).
- **Harness mirror:** probes/gate runner pass `ocr_photos` built with `photo-input.ts` `compressedPhotoData(…, 2048, 95)`. Separately, the harness tile CUTTER is fixed (eval 079: `sips --cropOffset` silently no-ops flush-bottom left-aligned crops, so every harness "tile 3" since eval 061 was the full photo; production client unaffected) — a shared verified cutter with dims assertion + lossless rotate-180 fallback.

## Explicitly out of scope

- Nested tile geometry (REJECTED, eval 072 — do not re-probe).
- Salsa/seasoning-panel echo rule — that class appeared ONLY in the rejected nested path; the production 2×2 baseline emits no salsa items (eval-072 audit).
- Field repair from print (v2), twin-folding of misread names (nested-only artifact), Feature-5 drinks, name-spelling gate (post-release bake-off track).

## Verification ladder (gates before any deploy)

1. **Unit tests ($0):** matcher port tests (14 from the probe) + polarity tests (drop-with-sibling, flag-alone, keep-unverifiable, fail-open on OCR error) + portrait-path byte-identical pin.
2. **$0 replays** (harness, cached/archived data): eval-068 baseline dump + cached full-photo OCR → expect exactly the 5 known fakes dropped, 41 items, Tender/Gyro/Dedos kept+flagged, zero real-dish loss. Nested-r1 dump → measure (informational). **Nikkori dump replay** — the vertical dense menu also rides the tile path, so it MUST be false-deletion-checked before any live run: one Mistral OCR call on the nikkori photo (~$0.004, approval at task time) + replay its archived dump → expect **zero drops** (any drop = stop, planner audit).
3. **Live ×3 (step 1e):** polloteria through the full production path (detector still bypassed/forced as in eval 068) with per-tile OCR — mirrors production exactly. ~$0.24/run incl. OCR → **~$0.72 ×3, user approval at launch time**. Gate: scored dims + raw-dump photo audit (eval-067 rule: count bands alone prove nothing) + zero unverified drops.
4. Then bistro/guest-house single probes (non-dense — stage must not fire), detector trigger work (1f), and Phase-1 exit criteria per the container ROADMAP.

## Deploy discipline (from project memories)

Backup the currently deployed fn before any redeploy (`supabase/backups/`); deploy to the TEST project (uonuiadueykynbetxxrw) only — the app is pre-release; edge deploys are for testing, not shipping.

## Failure modes considered

- **OCR misreads, GPT was right** (inverse Dedos): v1 never mutates and only drops with a verified duplicate present, so a wrong OCR line can at worst mis-flag (log noise) or — the real residual risk — supply a false "verified sibling" for a drop. That requires the same block to both verify one item and contradict a near-identical one; the nikkori replay + ×3 photo audits watch exactly this.
- **Stylized fonts / non-Latin text** (nikkori): mention-guard requires name-token coverage, so unreadable OCR yields `unverifiable` (keep) — degradation is toward keeping, by construction.
- **Mistral outage / latency:** fail-open skip; scan unaffected (+20s worst-case latency bound per OCR call, parallel across tiles).
