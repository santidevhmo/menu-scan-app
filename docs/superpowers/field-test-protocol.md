# Real-restaurant field test — protocol

**Why this exists:** every scan in this project's history is a photo of a screen or a gallery import.
Paper, lighting, angle, glare and curvature are **completely untested**. This is the highest-value
unknown left, and it is the one thing no amount of benchmarking can substitute for.

**What is live when you run this:** edge function `analyze-menu` **v29** — the B15 + B21 + B24b
pipeline. On the 8-dish benchmark it scores 0–3 failed of 96 against a naive baseline's 24.

---

## Before you leave

- [ ] TestFlight build installed and opened once on wifi (so the first scan is not also the first launch)
- [ ] Phone has signal — a scan needs the network
- [ ] Nothing else to prepare. Do not tell the restaurant; scan as a normal diner would

## At the table — 6 photos, in this order

Take them of the **same menu page** wherever possible, so differences are the *condition*, not the menu.

| # | Condition | Why it matters |
|---|---|---|
| 1 | **Straight on, flat, good light** | The control. If this fails, nothing else matters |
| 2 | **At an angle** (~30°, as you would actually hold it) | Nobody photographs a menu square-on |
| 3 | **Dim / warm restaurant light** | The commonest real condition, and the one screens never reproduce |
| 4 | **With glare** — let a light or window hit the page | Laminated menus are everywhere |
| 5 | **Curved / creased page** — a bound or folded menu, not held flat | Text distorts near the spine |
| 6 | **A dense page** — the most items you can find on one page | Density is where extraction has historically dropped items |

**For each one, after the scan finishes:**

- [ ] Screenshot the results screen
- [ ] Note anything obviously wrong, in your own words. "It missed the whole right column" is more
      useful than a score

If a scan fails outright, **keep the photo** and note which number it was. A failure is a result.

## What to look for, in plain terms

Three different things can go wrong and they need different fixes, so it helps to say which:

| What you see | Which part | Example |
|---|---|---|
| **Dishes missing, or text read wrong** | Reading the menu (extraction) | A whole column absent; "ENSALADA" as "ENSALADO" |
| **Dish is there but the numbers look wrong** | The macros (enrichment) | A salad at 1200 calories |
| **A dish shows "—" instead of numbers** | Working as designed | The app could not identify ingredients and is saying so rather than guessing |

**The last one is not a bug.** It is a change shipped in this build: an item with no identifiable
ingredients now shows a dash rather than a confident, false `0`.

## Also worth trying, if the menu allows

- [ ] **A dish sold in pieces** (`3 pzas`, `6 PZ`, a set of tacos). Tap the **+/−** buttons — it should
      step by piece and read `2/6`, not `x0.5`. New in this build
- [ ] **A pizza.** The stepper will still move in halves — **this is a known gap**, not a new bug. The
      model only reads piece counts the menu prints
- [ ] **Drinks.** Deliberately unhandled and post-launch. Alcohol calories are known to be understated

## After

Send the screenshots and your notes. Nothing needs to be formal — the photos and a sentence each are
enough to work from.

**The one thing to avoid:** do not re-shoot a bad photo until it works and only report that one. A
photo that failed is the most valuable thing you can bring back.
