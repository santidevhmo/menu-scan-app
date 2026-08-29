# Model findings — app-wide, outlives any phase

Durable findings about **which LLM to use and why**, kept outside any single workstream's
folder so they are not lost when that workstream closes. A phase log records what a phase did;
this file records what the project now believes about models.

**Scope:** model choice, model behaviour, and the measurement traps that distort model
comparisons. Not prompts, not pipeline design.

**Rule for adding here:** only findings backed by a measurement someone actually ran, with the
run IDs named so a future session can re-check them. A claim without a run ID is an opinion and
belongs somewhere else.

---

## 2026-08-09 — GPT-5.5 beats GPT-4o on macro estimation, and our own fixture hid it

**Status: measured, and the switch was CONSIDERED AND DECLINED (Santiago, 2026-08-09).** Production
runs `gpt-4o-2024-08-06` for Stage-2 macro enrichment and will continue to. GPT-5.5 wins on macro
accuracy — that finding stands and is not retracted — but it is **~2.4× slower** on Stage 2 and gets
drinks wrong, and the latency lost the trade. **Do not re-open this as a measurement question; the
measurement is done and the decision was made on product grounds.** See the integrity findings at
the end of this file.

### What was run

The Stage-2 macro benchmark, unchanged, against two models on the same 8 dishes, same prompt,
same schema, same tolerance bands. 4 runs × 3 draws each. Run IDs `iter-b4-w1…w4` (GPT-4o) and
`b9-gpt55-w1…w4` (GPT-5.5), archived in `scripts/fixtures/caches/`.

| model | failed field/draws of 96 | mean absolute error |
|---|---|---:|
| `gpt-4o-2024-08-06` | 12–13 | 16.8–17.3% |
| `gpt-5.5-2026-04-23` | **5–9** | **13.1–15.6%** |

Non-overlapping ranges on both metrics, consistent across all four runs. These are the
2026-08-09 figures, on the RESEARCHED oracle (two French Fries re-freezes were made and reverted
the same day) and under the new small-absolute-miss scoring rule. Mean |error| is unchanged from the
pre-rule figures by design, so those percentages stay comparable across the whole history; only the
failed-field counts moved. Production remains B4/v28. GPT-5.5 still leads on macros and is still
DECLINED on latency (~2.4x slower on Stage 2).

### The finding that matters most: we nearly concluded the opposite

Scored against the oracle **as it stood before 2026-08-09**, the same archives read GPT-4o
22–24 and GPT-5.5 17–22 — overlapping, and the session concluded *"the ceiling is the task, not
the model; do not switch."*

That conclusion was an artifact of one fixture. PASTEL AZTECA is a layered tortilla casserole
whose menu never prints the word tortilla, and the oracle excluded unprinted ingredients. GPT-5.5
listed the tortillas; GPT-4o did not. **The fixture scored the better-reasoning model as wrong,
and it did so by enough to reverse the comparison.** Adding the tortilla to the oracle moved
GPT-5.5 from a tie to a clear win.

**Transferable lesson, and the reason this file exists:** *a model comparison is only as good as
the ground truth underneath it, and a flawed fixture does not fail loudly — it silently flatters
whichever model shares its flaw.* Before believing any model comparison on this project, check
whether the losing model is being punished for being right. See lesson 28 in the extraction
roadmap for the same failure mode in measurement code.

### Practical notes for anyone wiring GPT-5.5

- **It rejects `temperature: 0`** — *"Only the default (1) value is supported."* `seed` is
  accepted. Any comparison against a temperature-0 baseline is therefore not at parity, and the
  newer model's results carry more sampling spread. Record it; do not quietly equalise it.
  🔴 **This is also a production landmine, found 2026-08-09.** `enrichBatch` hardcoded
  `temperature: 0`, so changing `ENRICH_MODEL` alone would have **400'd every scan**. The benchmark
  could not catch it — the harness drops the parameter for an overridden model, so every measured
  GPT-5.5 number came from a request shape production cannot send. Fixed in `a9fce10`. **General
  lesson: a benchmark that reaches the model by its own path is not evidence that the deployed path
  works.**
- **Token usage is comparable to GPT-4o** on this task — 2839 vs 2689 completion tokens on the
  same request — and `reasoning_tokens` was **0**. It is not a hidden-cost reasoning model here.
  The 4-run arm cost ~$0.47.
- **Strict `json_schema` structured output works** unchanged.
- **Pin a dated snapshot.** The account also lists `gpt-5.6-*` entries with no dated snapshot
  form. Those are floating aliases and must not be used for anything measured — a floating alias
  is what made this project's `baseline-001` unreproducible.

### What it does NOT say

- Not that GPT-5.5 is better at **extraction** (Stage 1). That pipeline is Mistral OCR →
  `gpt-4.1` structuring and was not touched by this comparison.
- Not a cost or latency recommendation for production traffic; the benchmark is text-only Stage 2
  on 8 dishes.
- Not a deployment decision.

## 2026-08-09 — what a macro score does NOT tell you about a model switch

The macro benchmark sends 8 fixture items in one call. Production sends whole menus through
`callGptEnrich` in **batches of 10**. A pipeline-integrity arm (2 real menus, 91 items, both models,
archived at `scripts/fixtures/caches/pipeline.*`) measured what the macro score never touches:

| property | gpt-4o-2024-08-06 | gpt-5.5-2026-04-23 |
|---|---|---|
| items returned / order preserved | 36→36, 55→55, ok | 36→36, 55→55, ok |
| dropped or truncated | none | none |
| **Stage-2 latency, 55-item menu** | **41 s** | **101 s (~2.4×)** |
| items given allergens (of 55) | 37 | 39, and adds `egg` to breaded items GPT-4o left **blank** |
| mineral water | 0 kcal ✅ | **252 kcal** ❌ |

**Both models are pipeline-safe.** The switch trades better macros and safer allergen coverage
against 2.4× Stage-2 latency and a worse answer on drinks (which no benchmark covers — Feature 5 is
deferred). **Check integrity and latency before any model switch; a macro score alone cannot see
either.**

### Where the detail lives

`docs/superpowers/stage2-macro-benchmark.md` — the **B9** run entry and the PASTEL re-freeze
ruling, with the per-dish tables and the raw archives.

---

## 2026-08-23 — Every frontier model systematically UNDERESTIMATES large food portions. This is a model-class property, not a prompt defect.

**Status: peer-reviewed externally, and confirmed four independent ways inside this project. Do not
try to fix it with a prompt — four arms have already died trying.**

**Fridolfsson et al. 2025**, *Current Developments in Nutrition* (PMC12513282), tested **GPT-4o,
Claude 3.5 and Gemini 1.5** against weighed food photos. All three **systematically underestimate
large portions**, with high macro variance. So the bias does not belong to our prompt, our schema,
our model pin, or our fixtures — **it belongs to the model class.**

Our four independent confirmations, all on the same side:

| evidence | what it read |
|---|---|
| eval 175 — asked what a thin-crust pizza weighs *in general* | **300 g** against a ruled 400–450 |
| eval 162 — our own `dual` pipeline, Salmón Roll | **0.65×** the oracle's mass |
| eval 178 — a *different company's* shipped app, same 28 cm pizza | **217 g = 0.35×** the USDA anchor |
| eval 178 — our v33 with `FORM` sizing, same pizza | **425 g = 0.69×** the USDA anchor |

🔑 **THE ARCHITECTURAL CONSEQUENCE, AND IT IS THE MOST IMPORTANT MODEL FINDING IN THIS FILE: never ask
a model for grams. Ask it for a CATEGORY and supply the grams from a published table.** Arm A
(36 of 108), MASSCALL (50 of 108), the eval-175 `grams` probe, and a global fitted calibration
(223 of 684)
all failed the same way for the same reason. `FORM` works *because* it stops asking.

**Peer-reviewed support for the replacement:** Menu-Match (Beijbom et al., Microsoft Research, WACV
2015) — restaurant plates are nutritionally consistent across servings, so **identify-then-look-up
beats volume estimation** (32 ± 7.2 kcal absolute error). DietAI24 (*Nature Communications Medicine*
2025, s43856-025-01159-0) grounds an MLLM in FNDDS by retrieval — a published architecture for
supplying the grams rather than generating them.

**And the human baseline, which reframes what "accurate enough" means:** Nutrition5k (Thames et al.,
Google, CVPR 2021) measured people estimating portions visually — **non-nutritionists 53% error,
professional nutritionists 41%.** Their best model reached 16.5% calorie MAE, and depth data cut mass
error 18.7% → 13.7%. **Our band is ±20%, so a credentialed professional eyeballing a plate is worse
than our band width.** A published portion weight beats any expert's estimate; that is the whole case
for anchoring to FNDDS rather than to a ruling.

⚠️ **Treat vendor accuracy claims as marketing.** PlateLens's "±1.2% MAPE" and SnapCalorie's "~15%"
are not credible next to Nutrition5k's 16.5% under controlled conditions **with depth data**.

Full detail: `docs/superpowers/competitor-analysis-2026-08-23.md` and eval 178 of the ledger.
