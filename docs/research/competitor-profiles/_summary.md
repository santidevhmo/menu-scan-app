# Competitor teardown — summary

Phase 1, step 1.2 of `docs/mobile-app-design-phase-order.md`. Generated **2026-08-30**.
Six apps, approved by Santiago from `../competitors-shortlist.md`.

**Method and its limits.** The `competitor-profiling` skill assumes SaaS websites and needs
Firecrawl + DataForSEO, neither installed. Adapted: for a consumer mobile app the **App Store
listing is the homepage and the pricing page**, so that's what was scraped (iTunes lookup API +
WebFetch), plus each app's marketing site where one exists. The SEO/backlinks phase was dropped as
inapplicable — see "What this teardown cannot see" at the bottom.

---

## Correction to the shortlist's headline finding

The shortlist claimed *"the one app with real traction doesn't scan menus at all."*
**That is wrong.** MenuFit does scan menus with the camera, confirmed in secondary coverage of the
app. It also has a restaurant database, an AI chat assistant, and a "Smart Tweaks" feature.

The corrected finding is more uncomfortable: **the category leader already does everything Menu
Scan does, plus more, and got 54,000 ratings in 13 months doing it.** `../competitors-shortlist.md`
has been fixed.

---

## The field

| App | Ratings | Age | Ratings/mo | Mechanic | Languages | Category |
|---|---:|---|---:|---|---|---|
| **Cal AI** | 359,755 | 2y 5m | ~12,400 | Photo of **plated food** | **15 incl. ES** | Health & Fitness |
| **Carb Manager** | 734,055 | 15y 8m | ~3,900 | Barcode + plate photo | EN | Health & Fitness |
| **MenuFit** | 54,084 | 1y 0m | **~4,160** | **Menu scan + restaurant DB + AI chat** | EN | Health & Fitness |
| **FoodieFit** | 725 | 4m | ~181 | **Menu photo → calories/macros** | EN | Health & Fitness |
| **Menu Order AI** | 69 | 9m | ~7 | **Menu scan, explicitly no database** | EN | Health & Fitness |
| **Forq** | 1 | 2m | ~0.5 | **Menu scan → visual menu** | **11 incl. ES** | Food & Drink |

*Ratings/month is a crude traction proxy, not downloads or revenue. Rating counts are cumulative
and Apple resets them on major versions, so treat older apps' rates as understated.*

## What this tells us

**1. Menu scanning is not a moat. It's table stakes, and it's crowded.**
Four of the six scan menus. The mechanic Menu Scan is built around is now the *default* approach in
this category, executed by at least eight apps found in the sweep. Nobody is winning on having it.

**2. MenuFit's traction is the outlier and the thing to explain.**
~4,160 ratings/month against FoodieFit's ~181 and Menu Order AI's ~7 — for products that describe
themselves almost identically. A 20–500× gap between similar products is rarely the product. The
likely explanations, in order of probability: paid acquisition spend, App Store search dominance,
or an onboarding funnel that harvests ratings before the paywall. **Nothing in a store listing can
distinguish these** — see the open questions.

**3. Everyone is hard-paywalled, and users are angry about it.**
MenuFit states it plainly in its own listing: *"Our app requires a subscription to access the
complete experience... Before subscribing, you'll get a limited selection of meals."*
Secondary coverage of its reviews reports *"a significant number of users express frustration over
the mandatory subscription model, often feeling misled after extensive onboarding."*

Price ladders (App Store IAP, USD):

| App | Advertised IAP price points |
|---|---|
| MenuFit | $9.99 · $14.99 · $23.90 · $30.00 · $32.00 · $48.00 · Omni Plan $34.99 |
| FoodieFit | $3.99 · $19.99 · $29.99 · $39.99 |
| Carb Manager | $8.49/mo · $16.49/3mo · $29.99–$59.99/yr |

MenuFit showing seven price points suggests active price testing or regional pricing. **This is the
clearest opening in the teardown:** the incumbent's own users say the paywall feels like a
bait-and-switch after a long onboarding.

**4. Calorie accuracy is the reported failure mode — and it's our hardest problem.**
Secondary coverage of MenuFit's reviews: *"some users have reported that calorie counts were
completely off."* This lands directly on the work already done in this repo (Stage-2 macro
enrichment, plate-mass estimation). It cuts both ways: users **do** notice and punish bad numbers,
which is an opportunity if our accuracy is genuinely better — and a warning that it's the thing
that gets you one-starred. Accuracy claims need evidence before they become marketing.

**5. The Spanish gap is real but narrower than the shortlist implied.**
Correction: Forq ships **11 languages including Spanish**, and Cal AI ships **15 including
Spanish**. So Spanish is not unserved in the category overall. But among apps that **scan menus and
have any traction** — MenuFit, FoodieFit, Menu Order AI — **all three are English-only.** Forq is
the only localized menu scanner and it has one rating.

The opening is specific: *a menu scanner that works properly in Spanish.* Not "nobody serves
Spanish."

**6. Two apps position against the database, not with it.**
Menu Order AI's listing: *"No logging. No searching a database. Just your best options."*
Forq sits in **Food & Drink**, not Health & Fitness, and sells a *visual* menu — dish photos first,
calories second. Two different escapes from competing with MenuFit head-on.

---

## Positioning map

```
                    scan any menu (works anywhere)
                              ▲
              Menu Order AI   │   Forq
              (GLP-1 niche)   │   (visual menu, 11 langs)
                              │
     nutrition ◄──────────────┼──────────────► experience
      focus                   │                  focus
                    MenuFit   │   FoodieFit
                  (scan + DB + chat)
                              │
                              ▼
                    pre-built database / logging
                    Cal AI · Carb Manager
                    (photograph the plate, not the menu)
```

Menu Scan's current feature list — scan, goal sort, allergens, price sort, profiles, history —
puts it **on top of MenuFit**, the most contested spot on the map, in English. Its differentiated
territory is the upper-right and the Spanish axis, neither of which is where the product currently
aims.

## Likes and dislikes (the playbook's actual ask)

**Worth stealing**

- **Menu Order AI's "Smart Tweaks"** — suggests modifications that preserve the dish ("dressing on
  the side," "grilled not fried"). Turns a ranking into an action. MenuFit copied it.
- **Menu Order AI's speed promise** — *"Know what to order in about 10 seconds."* Concrete,
  falsifiable, and it names the real anxiety: the server is coming back.
- **Forq's dish photos** — solves *"branzino al cartoccio tells you nothing,"* a problem nutrition
  framing misses entirely. Strong for foreign-language and unfamiliar menus.
- **FoodieFit's before/after framing** — *"Most nutrition apps track what you already ate.
  FoodieFit helps you choose before you order."* One sentence that separates the category from
  MyFitnessPal.
- **MenuFit's "works even if the menu has no calories or macros listed"** — names the objection
  before the user thinks of it.

**Worth avoiding**

- **Long onboarding into a hard paywall.** The incumbent's most-reported complaint. Its own listing
  admits you only get "a limited selection" before paying.
- **Unhedged accuracy.** Reported wrong calorie counts are the second complaint theme.
- **English-only.** Three of the four menu scanners; the reason the Spanish slot is open.
- **Category confusion.** Forq's Food & Drink placement may explain why a well-built app has one
  rating — it isn't where people search for this.

---

## Open questions this teardown cannot answer

| Question | Why it matters | Where it gets answered |
|---|---|---|
| **Why is MenuFit 20–500× ahead of near-identical apps?** | Determines whether this is a product fight or a spend fight | Research brief Q1/Q3 |
| What do users actually complain about, in their own words? | Only secondary summaries so far — not primary review text | Research brief Q1 |
| How accurate are competitors' calorie numbers really? | Decides whether accuracy is a viable wedge | Research brief Q1, or install and test |
| What does MenuFit's onboarding→paywall funnel look like? | The clearest reported weakness | **Install it and walk through** |
| How deep is the restaurant database, and does it work abroad? | Decides if scanning is a real advantage | Research brief Q4 |

**Recommended next action, cheap and high-value:** install MenuFit, FoodieFit and Menu Order AI and
walk each onboarding to the paywall, photographing every screen. That produces primary evidence for
the funnel question *and* the reference material phase 4 and 5 will need, in about an hour.

## What this teardown cannot see

App Store listings show what a company *says*, never what its users do. Missing: downloads,
revenue, retention, conversion, ad spend, and primary review text (Apple's public review RSS feed
returns zero entries for every app tested, including WhatsApp — it is retired, not app-specific).
Every traction statement here rests on cumulative rating counts, which is a proxy and nothing more.

## Raw data sources

- iTunes lookup API, US + MX, pulled 2026-08-30 → `raw/<slug>/2026-08-30/itunes-{us,mx}.json`
- App Store listing pages via WebFetch, 2026-08-30 (MenuFit, FoodieFit, Carb Manager)
- Marketing sites: `menuorderai.com`, `fforq.vercel.app`, 2026-08-30
- Secondary coverage of MenuFit reviews via web search, 2026-08-30 — **secondary, not primary**
- Discovery sweep: `../competitors-shortlist.md`, `../sweep.json`
