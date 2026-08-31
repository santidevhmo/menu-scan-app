# Competitor shortlist — App Store / Play sweep

Phase 1, step 1 of `docs/mobile-app-design-phase-order.md` ("App-store market scan").
Manual sweep, run by Santiago. **Output is a shortlist of ≤6 apps and their store URLs** — those
URLs are the input to step 1.2, which runs the `competitor-profiling` skill.

**This is not the research.** Do not form opinions about these apps here. This file only decides
who is worth tearing down.

---

## Search these keywords

Run each in **App Store (iOS)** and **Google Play**, in **both the US and Mexico storefronts**
(rankings are per-country, and Menu Scan targets Spanish and English menus alike).

### Ring 1 — direct: menu → nutrition

| English | Spanish |
|---|---|
| menu scanner | escanear menú |
| scan menu | escáner de menú |
| menu nutrition | nutrición menú restaurante |
| restaurant menu calories | calorías menú restaurante |
| menu calorie scanner | calorías de la carta |
| what to order | qué pedir en el restaurante |

### Ring 2 — adjacent: photo → macros (the Cal AI class)

Shares our camera→macros mechanic and the design language `AGENTS.md` targets.

| English | Spanish |
|---|---|
| AI calorie counter | contador de calorías con foto |
| photo calorie counter | escáner de comida |
| snap calories | calorías por foto |
| food scanner | analizar comida con IA |
| macro scanner | contador de macros |

### Ring 3 — goal-sorting: eating out on a diet

| English | Spanish |
|---|---|
| restaurant nutrition | comer fuera dieta |
| eating out calories | restaurante keto |
| keto restaurant | menú saludable |
| low carb menu | alto en proteína restaurante |
| high protein restaurant | — |

---

## Procedure

1. **Sweep.** For each keyword, record the top 10 results in the table below. Both stores, both
   storefronts.
2. **Mine Apple's own competitor graph.** On the top 3 apps, scroll to
   "You Might Also Like" / "Similar apps". This is free and surfaces apps no keyword finds.
3. **Cull.**
   - Drop anything not updated in 12+ months (dead app).
   - Drop under ~100 reviews **unless** it is a direct Ring-1 mechanic match.
4. **Rank by review count.** Review count is the free traction proxy. It is **not** revenue —
   we deliberately dropped paid market-intel (AppKittie) as not worth the money for a market
   we are already in.
5. **Cut to ≤6**, aiming for roughly **3 direct / 2 adjacent / 1 goal-sorting**.
6. **Copy each survivor's store URL** into the shortlist at the bottom. That's the handoff.

---

## Raw sweep

| App | Store | Country | Dev | Rating | Reviews | Last update | Price / IAP | Ring | Found via |
|---|---|---|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |  |  |  |

---

## Shortlist (≤6) → input to `competitor-profiling`

| # | App | Ring | Store URL | Why it made the cut |
|---|---|---|---|---|
| 1 |  |  |  |  |
| 2 |  |  |  |  |
| 3 |  |  |  |  |
| 4 |  |  |  |  |
| 5 |  |  |  |  |
| 6 |  |  |  |  |
