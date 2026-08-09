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

**Status: measured, NOT deployed.** Production still runs `gpt-4o-2024-08-06` for Stage-2 macro
enrichment. Switching is a separate decision that has not been taken.

### What was run

The Stage-2 macro benchmark, unchanged, against two models on the same 8 dishes, same prompt,
same schema, same tolerance bands. 4 runs × 3 draws each. Run IDs `iter-b4-w1…w4` (GPT-4o) and
`b9-gpt55-w1…w4` (GPT-5.5), archived in `scripts/fixtures/caches/`.

| model | failed field/draws of 96 | mean absolute error |
|---|---|---:|
| `gpt-4o-2024-08-06` | 24–27 | 21.0–21.2% |
| `gpt-5.5-2026-04-23` | **14–19** | **15.5–17.2%** |

Non-overlapping ranges on both metrics, consistent across all four runs.

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

### Where the detail lives

`docs/superpowers/stage2-macro-benchmark.md` — the **B9** run entry and the PASTEL re-freeze
ruling, with the per-dish tables and the raw archives.
