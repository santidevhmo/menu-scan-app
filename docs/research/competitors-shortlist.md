# Competitor shortlist — App Store sweep

Phase 1, step 1 of `docs/mobile-app-design-phase-order.md` ("App-store market scan").

**Method:** automated via the free iTunes Search API (no key, no cost, no scraping) — 19 keywords
in English and Spanish × US and MX storefronts × 15 results each. Script:
`scratchpad/sweep.py`. Raw output: `sweep.json`.
**276 apps found → 231 still maintained → 80 on-topic.** Run 2026-08-30.

**Ranking signal is keyword-hit count, not review count.** Review count alone floats McDonald's,
OpenTable and QR scanners to the top — they surface for "menu" but are not competitors. How many
of our 19 keywords an app matches is a far better relevance proxy.

**This is not the teardown.** It only decides who is worth studying. Step 1.2 (`competitor-profiling`)
does the actual analysis.

---

## The headline finding

**Menu Scan's exact product already exists — at least six times — and almost none of it has
traction. The one app with real traction doesn't scan menus at all.**

| App | Reviews | How it works |
|---|---|---|
| **MenuFit — Healthy Eating Out** | **54,084** | **No scanning.** Pre-built restaurant database. "We tell you exactly what to order at every restaurant — fast food, dine-in, or even bars." |
| Menu Order AI | 69 | Scans any menu photo, ranks every dish by how you eat. **Our mechanic.** |
| MenuPal | 98 | Same pitch as MenuFit, database-style |
| CalorieCap | 97 | Fast-food macros, database |
| MenuScore | 16 | Restaurant nutrition, compare before ordering |
| MenuRank AI (MX) | 0 | Photo *or photo library* → AI ranks dishes. **Our exact feature list.** |
| WellMenu (MX, Spanish) | 0 | AI menu scanner, personalised recommendations |
| Forq (MX, Spanish) | 0 | Menu scan → image, calories, allergens, price per dish. **Our feature list including allergens and price.** |

**The strategic question this raises** (for step 1.6, positioning — do not answer it here):
the market leader solved "what do I order?" with a **database of chain restaurants**, not a camera.
Scanning is harder to build and they beat us to traction without it.

The counter-argument worth testing: a chain database only works where chains dominate. It cannot
read the menu of an independent restaurant, which is most restaurants outside the US — and is the
entire Spanish-language market we target. MenuFit's approach may simply not be portable to where
we're aiming.

**Do not treat either side of that as settled.** It's the central positioning question of phase 1.

## Also worth knowing

- **The giants are not menu apps.** Cal AI (359k reviews), MyFitnessPal, Yazio, Lose It,
  Carb Manager all rank for menu keywords but photograph *plated food*, not menus. They are the
  design/UX reference (`AGENTS.md` targets Cal AI) and the adjacent threat — any of them could add
  menu scanning — but they are not solving our problem today.
- **The direct category is crowded with new, tiny entrants.** Many launched in 2026 with under 100
  reviews. Low barrier, no winner yet, nobody defensible.
- **The Spanish-language slice is wide open.** Forq, WellMenu and MenuRank AI are all in the MX
  store at 0 reviews.

---

## Proposed shortlist for the teardown (needs Santiago's sign-off)

| # | App | Ring | Why | Store URL |
|---|---|---|---|---|
| 1 | **MenuFit** | direct | Category leader by 500×. Understand why the database approach won. | `apps.apple.com/us/app/menufit-healthy-eating-out/id6746144481` |
| 2 | **Menu Order AI** | direct | Our exact mechanic with actual users. Closest true competitor. | `apps.apple.com/us/app/menu-order-ai-find-glp1-meals/id6753690910` |
| 3 | **Forq** | direct/ES | Our feature list *including allergens and price sorting*, in Spanish. | `apps.apple.com/mx/app/forq-traductor-de-menús-ia/id6771612436` |
| 4 | **FoodieFit** | direct | 725 reviews — the one mid-tier scanner between MenuFit and the zeroes. | `apps.apple.com/us/app/foodiefit-healthy-eating-out/id6760638090` |
| 5 | **Cal AI** | adjacent | The stated UX benchmark, and the most likely app to eat this category. | (in `sweep.json`) |
| 6 | **Carb Manager** | goal-sorting | 734k reviews. How a serious app does goal-based food filtering. | (in `sweep.json`) |

Swap MenuRank AI or WellMenu in for #4 if the Spanish market matters more than mid-tier US traction.

---

## Gaps this method does not cover

| Gap | Why | Fix |
|---|---|---|
| Google Play | No free search API | Manual spot-check, or skip — iOS is the priority platform |
| What users actually complain about | API returns ratings, not review text | Claude web research (prompt drafted) |
| Pricing / paywall design | Not in the API | Claude web research, or install the apps |
| Downloads and revenue | Paid tools only | **Deliberately skipped.** Answers a market-entry question already settled. |
