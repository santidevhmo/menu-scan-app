# Competitor onboarding walkthroughs

Primary evidence, captured by Santiago on **2026-08-30** by installing the apps and walking each
onboarding to the paywall. Mexican App Store, iPhone.

This closes the last open question from the teardown (`../competitor-profiles/_summary.md`) and
supplies the reference material phases 4–5 will need.

| App | Screens to paywall | Folder |
|---|---:|---|
| MenuFit (category leader, 54k ratings) | **27** | `menufit/` |
| Menu Order AI (closest scan-first competitor, 69 ratings) | **6** | `menu-order-ai/` |

Files are numbered in flow order.

---

## The headline: 27 screens versus 6

The two apps take opposite bets, and the published evidence in `../web-research-2026-08-30.md`
(Q6) says one of them is on the wrong side of it.

| | MenuFit | Menu Order AI |
|---|---|---|
| Screens before paywall | 27 | 6 |
| Personal data demanded | goal, eat-out frequency, attribution, 2 psychographic multi-selects, gender, birthdate, height, current weight, goal weight, timeline, activity level, eating style, healthiness slider, favourite restaurants, foods liked, foods disliked | health goals only (max 3) |
| Skippable? | **No skip on any screen** | **"Skip" on every screen** |
| Real product use before paying | **None.** A generated *teaser* card only | **Yes — you can scan a real menu** (screen 03) |
| Free trial | 7 days | 1 week |

**MenuFit's flow:** 22 questions → "generating" progress bar → one teaser meal card →
"Try for $0.00" → paywall. You never use the product. The App Store complaint the research
surfaced — *"You go through all these customization questions only to find out there's a
subscription requirement… false advertising, misleading, and all around a scam"* — is a precise
description of this exact flow.

**Menu Order AI's flow:** value proposition → 3 goals → **scan a real menu** → permissions →
paywall. This is the "hard paywall *after* a value moment" pattern that Adapty's 2026 data
associates with **2.1× higher trial-start rates**.

**So: the app with worse design has the better-evidenced funnel, and the app with better design
has the funnel its own users call a scam.** Neither is a model to copy whole.

---

## Santiago's notes

### MenuFit — what's worth stealing

> "Haptic feedback / vibrates on loading progress and when clicking buttons."

Haptics on the progress bar (screen 23) is doing real work: it makes a wait feel like the machine
is working rather than stalling. Cheap to implement, and Menu Scan has a genuine wait — the OCR
round-trip — where it would land the same way.

> "The question for if you're a hard gainer creates a closer relationship with the user by asking
> him that issue and acknowledging it and having it stored."

This is screen 05, *"When you eat out, what's the hardest part?"*, where one option is
**"Finding high-calorie affordable meals"** — the hard-gainer's problem, which almost no nutrition
app names out loud. The move is: name a problem the user thought was theirs alone, then store it
and reflect it back. MenuFit does reflect it — screen 19 is *"The Key to gaining muscle/weight is
Calories and Protein"*, shown only because the user said they were bulking.

**The transferable pattern is not the question, it's the loop:** ask about a specific frustration →
store it → visibly act on it later in the same session. That is what turns a form into a
conversation.

### Menu Order AI

> "Too weak / effortless design."

Agreed, and it shows: generic stock photography, a washed-out sage-green palette, low-contrast
buttons, an inconsistent icon set (emoji next to flat vector). It reads as a template. Its
**structure** is right and its **surface** is not — which is the opposite failure from MenuFit.

---

## Other observations

**Screens worth studying individually**

| Screen | Why |
|---|---|
| `menufit/05-hardest-part.png` | The empathy question. See Santiago's note above. |
| `menufit/13-validation-smart-choices.png` | Mid-flow reassurance: *"This is a realistic goal and definitely achievable!"* Keeps a 27-screen form from feeling endless. |
| `menufit/16-how-healthy-slider.png` | A vertical colour-graded slider instead of a radio list — the only screen in 27 with real visual personality. |
| `menufit/23-progress-18pct-disclaimer.png` | The medical disclaimer lives *here*, inside a progress screen no one reads. Menu Scan's allergen disclaimer must not be buried this way — `AGENTS.md` makes it non-negotiable and permanently visible. |
| `menu-order-ai/03-try-scan-a-menu.png` | Pre-paywall scan, plus **"Try these menus"** with Cheesecake Factory and Chipotle for users who aren't in a restaurant right now. Solves the cold-start problem elegantly. |
| `menu-order-ai/04-arrival-alerts.png` | Geofenced notifications: *"Arrive hungry, know what to order."* A retention mechanic neither the teardown nor the web research had found. |

**MenuFit asks "How did you hear about us?" with TikTok listed first** (screen 04). Consistent with
the research's finding that its growth came from a creator-led short-form video engine.

**MenuFit claims "over 22.13 million restaurants"** (screen 17) — the first hard coverage number
found anywhere. The web research states it publishes **no restaurant count** on the App Store,
website, Instagram, press or in founder statements. **It does — but only inside onboarding, after
you have already invested 16 screens.** A precise-looking figure (22.13M) placed where no
prospective user or journalist can see it is a claim it does not want checked. Weigh it against the
review evidence in the same document: missing Starbucks hot drinks, local restaurants without full
menus, a Chinese restaurant serving a Mexican menu, *"useless in the UK."*

**Pricing — read with care.** The paywalls show:

| App | Monthly | Yearly |
|---|---|---|
| MenuFit | $299.00 | $999.00 |
| Menu Order AI | $299.00 | $1,299.00 |

These were captured on the **Mexican** App Store, so they are almost certainly **MXN, not USD**
(≈ $16 and ≈ $54 USD for MenuFit). The research reports MenuFit at **$9.99/mo and $19.99/yr USD**.
**Unverified either way** — the screens show a bare `$` with no currency code. If MXN, MenuFit's
Mexican annual price is roughly 2.7× its US annual price, which would be worth knowing before
pricing for Spanish-speaking markets. Confirm before anyone quotes these numbers.

---

## What this does not tell us

These are onboarding funnels, not products. Nothing here shows scan accuracy, result quality,
coverage at a real independent restaurant, or what either app does on day 30. The accuracy
question — the most-punished failure in the category — is untouched by this capture.
