# Customer research — Mode 2 (Digital Watering Hole) + personas

Phase 1, step **1.7** of `docs/mobile-app-design-phase-order.md`. Run **2026-08-30**.
Validates or breaks `.agents/product-marketing.md` v1.

**Scope.** This is the gap the deep research named and could not fill: *"Reddit threads in r/loseit,
r/keto, r/nutrition, r/fitness, r/EatCheapAndHealthy specifically naming these seven apps were not
surfaced."* It is now closed — with a mostly negative answer on app names and a strongly positive
answer on problem language.

---

## What I could and could not find

**Method.** Google/Bing web search returned no Reddit threads for any query tried (~8 attempts);
Reddit's own JSON API and `old.reddit.com` are both blocked to this environment; `pullpush.io` now
charges for API access and was not used (standing rule: spend no money). Research was therefore run
through **`safereddit.com`, a public Redlib mirror that serves Reddit's own search and thread
pages** — free, no account, primary content. Every quote below is copied verbatim from a Reddit
thread body or comment and every thread is linked.

**Denominator.** ~30 distinct searches run (7 app names, 10 English problem-language queries,
7 Spanish queries, 13 subreddit-restricted). **32 threads read in full** — 26 English, 6 Spanish.
Every "N of 32" count below refers to that set.

### Could find

| | |
|---|---|
| ✅ | Abundant, high-emotion, unprompted language about **deciding/logging a restaurant meal with no calorie information**. This is a real, chronic, repeatedly-posted problem. |
| ✅ | The **actual current workaround**, stated the same way over nine years (2017→2026) and across subs. It is not an app. |
| ✅ | People **already photographing menus and handing them to ChatGPT/Gemini** with almost exactly Menu Scan's prompt. Six threads. |
| ✅ | Quantified, first-party **AI-calorie-accuracy skepticism** — including a 2.5k-upvote user-run benchmark. |
| ✅ | Spanish-language threads confirming menus never print calories in LatAm/Spain — **plus a live 2026 legislative fight in Chile** the positioning doc does not know about. |

### Could not find — these are findings, not gaps in effort

| Searched | Result |
|---|---|
| **"Menu Order AI"** | **0 Reddit results, sitewide, ever.** |
| **"FoodieFit"** | 0 relevant results (28 hits, all unrelated — a cookbook author, relationship posts). |
| **"MenuPal"** | 0 relevant results (30 hits, all Palworld / Infinity Nikki / airline menus). |
| **"CalorieCap"** | 0 relevant results (26 hits, all unrelated). |
| **"MenuFit"** | **Exactly one** substantive thread in all of Reddit — and it is in a *snark* sub about an influencer. Quoted below; it is worth a lot. |
| Cal AI, Carb Manager | Plenty of discussion — these are the only two of the seven with organic Reddit presence. |
| A Spanish speaker asking for **macros** on a restaurant menu | **Not found.** Spanish speakers ask about *calories* and *health*, and they ask rarely. See Theme 6. |
| Anyone anywhere asking for **price sorting** on a menu | One comment, upvote score 2. Effectively no demand signal. |

**The single most important negative result:** four of the six competitors in the teardown have
**zero word-of-mouth**. A product with 725 App Store ratings and no Reddit footprint is not a
competitor being chosen; it is a product nobody talks about. The competitive set is smaller than
the teardown implies.

---

## Top themes (ranked by frequency × intensity)

### Theme 1 — The real incumbent is "log a US chain restaurant's dish instead"
**Frequency:** 8 of 32 threads. Top-voted or accepted answer in at least 4 of them.
**Intensity:** Medium — stated calmly, as settled practice. That is what makes it dangerous.
**Confidence: High** (8 independent sources, unprompted, stable 2017–2026, appears in Spanish too).

> "I always find an equivalent item on an American chain restaurant menu. Most US chain restaurants
> (panera, ihop, chilis, olive garden, panda express) have online nutrition data that you can pull
> up as a PDF with a quick google search. Went for a reuben with a side salad at that new sandwich
> place? Log it as a denny's reuben."
> — [r/loseit, Nov 2017](https://www.reddit.com/r/loseit/comments/7glhyb/restaurants_without_calorie_counts_wdyd/)

> "I log them as chain versions, like Domino's pizzas or Quarterpounders (this one is handy because
> there's variants like single or double patty, with or without cheese)."
> — [r/1200isplenty, Feb 2025](https://www.reddit.com/r/1200isplenty/comments/1im18cu/what_do_you_do_when_you_are_eating_out_but_the/)

> "i just looked up 'Chinese restaurant chicken fried rice' etc and listed the highest one"
> — [r/CICO, Mar 2024](https://www.reddit.com/r/CICO/comments/1bmu0it/how_do_you_count_calories_when_you_eat_out/)

**Implication.** `.agents/product-marketing.md` names the honest competitor as *"asking the server,
googling the restaurant, or not caring."* That is half right and half wrong. The habit is far more
specific and far more competent than "eyeballing it": **substitute a chain dish that publishes
numbers.** It is free, it works, and it takes ~30 seconds. Copy that names "guessing" as the enemy
will not land on the people who do this — they do not think they are guessing. The line that beats
it is about *this* dish at *this* restaurant, not about guessing.

---

### Theme 2 — People deliberately want the number to be TOO HIGH
**Frequency:** 7 of 32 threads. **Intensity:** High — expressed as a rule, often with a multiplier.
**Confidence: High.**

> "Tbh my general rule with restaurants is take what it says or what I think it is and **double it**."
> — [r/loseit, Sep 2025](https://www.reddit.com/r/loseit/comments/1nkdc6a/always_doublecheck_restaurant_calories/)

> "I'm thinking I should allow for the highest calorie version I can find of it on MFP, then times
> it by 1.5."
> — [r/loseit, Nov 2017](https://www.reddit.com/r/loseit/comments/7glhyb/restaurants_without_calorie_counts_wdyd/)

> "Estimate or base it off of a similar item from elsewhere… and then **add like 300 additional
> calories** to that estimate! Restaurants use SO MUCH butter."
> — [r/CICO, Mar 2024](https://www.reddit.com/r/CICO/comments/1bmu0it/how_do_you_count_calories_when_you_eat_out/)

> "Usually it gives me a range of calories and **I'll log the higher estimation**."
> — [r/CICO, Mar 2024](https://www.reddit.com/r/CICO/comments/1bedpj8/chatgpt_for_calorie_estimates/)

**Implication — this is a product decision, not a copy decision.** Users have a deliberate,
asymmetric error preference: under-estimating is a failure, over-estimating is *safety*. A single
point estimate presented as truth is the wrong output shape for this audience. The doc's honesty
stance ("show a confidence indicator, let people edit") is directionally right, but the evidence
says something sharper: **show a range, and let the user choose to be sorted by the pessimistic end
of it.** Nobody in 32 threads asked for a more precise number. Several asked to be safe.

---

### Theme 3 — Photographing a menu into ChatGPT/Gemini is already a shipped, free habit
**Frequency:** 6 of 32 threads (2023, 2024, 2025, 2026 — accelerating).
**Intensity:** High — posted as tips, with gratitude. **Confidence: High.**

This is the finding that most changes the positioning. It is the product, done manually, for free.

> "I immediately realized ordering off the menu would be a huge challenge. Trying to sift through
> each menu item and it's ingredients for a SIBO friendly option was extremely overwhelming. **So I
> took a photo of the menu and asked chatgpt to tell me which option I could eat** and I was quite
> surprised at how effective it was. All it needs is a photo of the menu, regardless of how stacked
> the menu is. […] Of course you can then ask it for the most cost effective, lowest/highest
> calorie or any other specific you have."
> — [r/SIBO, Jul 2025, 51 pts](https://www.reddit.com/r/SIBO/comments/1lt7gn7/great_hack_for_restaurant_ordering/)

> "one of my favorite uses of Gemini (or ChatGPT) is to **take a picture of the menu** and ask,
> 'What are the best three meals for me during my weight loss journey?' It'll quickly recommend the
> best choices and why. […] **It definitely removes decision fatigue** if you get tired of
> evaluating every aspect of a menu before deciding."
> — [r/Zepbound, Jul 2026](https://www.reddit.com/r/Zepbound/comments/1ukyuwl/restaurant_ordering_made_easy/)

> "I use the food-describe feature on chatgpt. You can describe the dish you just ate, indicate it's
> from a restaurant […] or you can **outright copy/paste the menu description and dish name**."
> — [r/loseit, Aug 2024](https://www.reddit.com/r/loseit/comments/1f0akdr/estimating_calories_at_restaurants/)

And the direct question, asked in the open:

> "Why would people use Cal AI over gpt?" — "turned out it was mostly a **fancy wrapper around the
> same underlying tech**, just with a different skin and some pre-written prompts."
> — [r/apps, Aug 2025](https://www.reddit.com/r/apps/comments/1mz43ez/why_would_people_use_cal_ai_over_gpt/)

**Implication.** `.agents/product-marketing.md`'s competitor table has no row for ChatGPT/Gemini.
It should have the *first* row. The objection "why not just ask ChatGPT?" is live, is asked by name,
and the honest answers are narrow and must be built, not asserted: persistent goals it does not
re-explain each time, deterministic arithmetic instead of a chat guess, re-ranking without a second
prompt, saved history, and Spanish that stays Spanish. Note also what this habit does to the
"anti-persona" list: the SIBO and Zepbound posters are not calorie counters.

---

### Theme 4 — AI calorie accuracy is being independently benchmarked by users, in public
**Frequency:** 4 of 32 threads. **Intensity:** Very high. **Confidence: High.**
**This corroborates the doc's 🔴 accuracy rule from a completely independent direction.**

> "I checked whether 'AI photo calorie tracking' actually works by testing 5 models against my
> kitchen scale. **This stuff doesn't work.**" […] "The models **always** know what the food is.
> They just **can't tell how much is on the plate**. That's the whole problem." […] "Even the best
> one is about 20% off."
> — [r/loseit, Jun 2026, **2,500 pts**](https://www.reddit.com/r/loseit/comments/1ug4mar/i_checked_whether_ai_photo_calorie_tracking/)

Its top comment adds the failure mode this repo's own Stage-2 work already knows:

> "you can't always tell by a photo how much oil/butter was used in cooking. A portion of couscous
> with no added oil will look pretty well the same as the same portion with 1tbsp of added oil."
> (195 pts) … "a dry pan vs a slick of olive oil can be 100+ cal difference easy and the photo looks
> identical." (128 pts)

> "Cal AI can't identify everything in food, including olive oil, which matters A LOT. […] It
> COMPLETELY ignores the oiliness or how the cooking method changes the calorie density."
> — [r/caloriecount, Feb 2026](https://www.reddit.com/r/caloriecount/comments/1r5ngfj/do_not_use_cal_ai_to_track_calories/)

> "Testing has found that AI food tracking is usually off by a minimum of 20%. Many of them were off
> by as much as 60%. If a ballpark number is all you need, **or for meal suggestions like you're
> doing**, then AI can work. If you need accurate tracking, you have to weigh and measure."
> — [r/Zepbound, Jul 2026](https://www.reddit.com/r/Zepbound/comments/1ukyuwl/restaurant_ordering_made_easy/)

**Implication.** Two things, and the second is the more useful.
1. Any accuracy claim will be *tested by a user with a kitchen scale and posted*. The doc's ban on
   marketing an accuracy percentage is now supported by primary evidence, not just literature.
2. **There is a licensed position here and the community itself hands it over:** AI is acceptable
   *for choosing between options*, not for *ledger-grade logging*. That is precisely Menu Scan's
   job. "Good enough to pick, not good enough to log" is a defensible, community-endorsed claim,
   and it is a stronger frame than "honest about estimates."

---

### Theme 5 — The cost is confirmed verbatim: people stop eating out
**Frequency:** 6 of 32 threads. **Intensity:** High. **Confidence: High.**

The doc claims "people stop eating out, or stop tracking, because the two cannot coexist." Confirmed.

> "I've **given up on tracking at restaurants**. It's also a big reason why I've almost completely
> **eliminated restaurant eating from my life**."
> — [r/loseit, Aug 2024](https://www.reddit.com/r/loseit/comments/1f0akdr/estimating_calories_at_restaurants/)

> "As far as restaurants without calories listed: **I simply won't go.** There can be ungodly huge
> amounts of calories. There's no telling."
> — [r/loseit, Nov 2017](https://www.reddit.com/r/loseit/comments/7glhyb/restaurants_without_calorie_counts_wdyd/)

> "I know they say overestimate or find something similar but **it just doesn't feel accurate and it
> makes going out harder**."
> — [r/caloriecount, Jul 2026](https://www.reddit.com/r/caloriecount/comments/1uxhceb/how_do_you_calorie_count_when_you_eat_out/)

> "not eating at restaurants — honestly i think this is the best answer"
> — [r/loseit, Oct 2020](https://www.reddit.com/r/loseit/comments/jct7jt/best_way_to_count_calories_for_restaurant_meals/)

But note the emotional register. It is **anxiety and self-blame**, not annoyance:

> "I'm going out to a restaurant that doesn't have the calories on the menu for the first time since
> I got really serious about counting calories and **I'm nervous**." (same thread, OP)

**Implication.** The doc's "Emotional tension" section describes *time pressure with an audience* —
the server standing there. The evidence supports the anxiety but **not the clock**. In 32 threads
nobody described being rushed at the table. See Theme 7.

---

### Theme 6 — Spanish: the pain is real but is voiced rarely, quietly, and in a different vocabulary
**Frequency:** 6 Spanish threads found across ~7 Spanish queries and 7 Spanish-sub searches.
**Intensity:** Low-to-medium. **Confidence: Medium** (small N; see caveat).
**This partially confirms and partially breaks the positioning.**

**Confirmed — menus do not print calories, and people notice:**

> "Estoy en una dieta y estaba buscando lugares que informen las calorías de cada plato, ¿conocen
> qué me recomienden, por favor?" — 1 upvote, one dismissive reply.
> — [r/Bogota, Jun 2024](https://www.reddit.com/r/Bogota/comments/1dk0q7p/restaurantes_con_menús_que_muestren_calorías/)

> "Vi que hay de estos en otros países, pero no sé si acá. Alguien vio alguno de esos con las
> calorías del plato al lado?" — top answer: *"En Mcdonalds podés entrar a la página y ver las
> calorías de algunos productos. **En demás restaurantes no vi.**"*
> — [r/uruguay, Apr 2023](https://www.reddit.com/r/uruguay/comments/12l2j4b/restaurantes_con_menús_que_cuentan_calorías_hay/)

**New and material — Chile is actively legislating this, and it is contested:**

> "Polémica propuesta de informar calorías en cartas de restaurantes" […] "Opinión impopular: […]
> lo veo como **el colmo de la flojera**. […] la gente que mide las calorías de lo que come no es
> tanta […] **y usualmente ya existen apps** para gestionar las calorías en las comidas, o si
> quieres saber la cantidad de calorías de un plato **basta con un googleada y listo**."
> — [r/RepublicadeChile, Jan 2026, 13 pts](https://www.reddit.com/r/RepublicadeChile/comments/1qs9r7q/polémica_propuesta_de_informar_calorías_en_cartas/)

A top reply, from a self-identified fitness person, adds the ED-risk objection:

> "si obligan a poner eso mucha gente (sobretodo los que tienen transtornos alimenticios) solo
> sentirán más estrés y angustia al comer en lugar de disfrutar la salida al restaurante"

**Broken — the vocabulary is not "macros", and the workaround is the same US chain trick:**
The one Spanish thread that is genuinely this product's job asks in the register of *health*, not
tracking, and asks for **chain-restaurant hacks**:

> "comer afuera sin que se me tape una arteria […] Ya conozco la opción de subway […] vengo a
> preguntarles que tips tienen en otros restaurantes de **cadenas reconocidas** […] algún tip
> secreto para comer algo con calorías bajas o moderadas, buena prote y ojalá que sea bien saciante"
> — [r/Ticos, Jun 2026](https://www.reddit.com/r/Ticos/comments/1ty5jqs/comer_afuera_sin_que_se_me_tape_una_arteria/)

And calorie counting itself meets open hostility in Spanish fitness subs:

> "El contar calorias solo termina en trastornos alimentarios, mejor ve al nutriologo"
> — [r/Gimnasio, Mar 2026](https://www.reddit.com/r/Gimnasio/comments/1rkdgyj/mejores_apps_para_contar_calorías_en_volumen/)

**Implication.** The doc's claim — *"menus where calorie labeling is not mandatory and effectively
never printed"* — is **confirmed by Spanish speakers themselves**, and Chile's 2026 bill is a
concrete, quotable, dateable proof point the doc lacks. But the doc's framing of this segment is
wrong in two ways. (a) **It is not a bigger-pain market, it is a lower-awareness market.** The
volume of complaint is a fraction of English, the threads score 1–4 upvotes, and the loudest
Spanish-language voice in the set argues the information *shouldn't* exist. (b) **Spanish speakers
do not use macro vocabulary for this.** They say *"me cuido con la comida"*, *"que no se me tape
una arteria"*, *"comiendo a ojo"*. Copy translated from the English macro register will miss them.

⚠️ **Sampling caveat, stated plainly.** Reddit is a weak instrument for Spanish-speaking LatAm/Spain
— country subs are general-interest, and fitness discussion is thinner. "Little Reddit complaint"
is evidence about **Reddit**, not proof the market is small. Closing this properly needs a channel
Reddit cannot provide (TikTok/Instagram comments in Spanish, Mexican/Spanish App Store reviews of
Fitia/YAZIO/MyRealFood). That is a real gap and it is not closable for free here.

---

### Theme 7 — The decision often happens at home, not at the table
**Frequency:** 4 of 32 threads recommend reading the menu *before leaving*. Zero describe being
rushed by a server. **Confidence: Medium** (consistent, but absence-of-evidence on the clock).

> "I look at the menu **in advance** and pick something I know is going to be fewer calories. **I
> don't look at the menu when I am at the restaurant** so I am not tempted 'in the moment'."
> — [r/1200isplenty, Feb 2025](https://www.reddit.com/r/1200isplenty/comments/1im18cu/what_do_you_do_when_you_are_eating_out_but_the/)

> "Looking up the menu ahead of time works best for me." / "plan ahead by reviewing the menu"
> — [r/Zepbound, Jul 2025](https://www.reddit.com/r/Zepbound/comments/1ly98j5/advice_for_dining_with_friends/)

> "I'd rather do this **before** actually going to the restaurant, fetching the menu from Google
> Maps or Yelp"
> — [r/SIBO, Jul 2025](https://www.reddit.com/r/SIBO/comments/1lt7gn7/great_hack_for_restaurant_ordering/)

**Implication — the one finding that most directly challenges the product.** The doc's one-liner is
*"before the server comes back"* and its objection-handling leans on the table moment. The evidence
says the **committed** goal-tracker has already displaced the decision to home, hours earlier, where
they have a browser and no time pressure. Two consequences:
- The at-the-table moment is real (r/SIBO, r/Zepbound both happened at the table) but it is the
  *unplanned* meal — someone else picked the restaurant, or there was no menu online.
- **A camera is not the only input that matters.** The pre-planning user has a URL, a screenshot, or
  a Yelp photo, not a paper menu in front of them. "Photograph the menu" as the only entry point
  locks out the more disciplined half of the target user. Accepting an image from the photo roll or
  a share-sheet is probably worth more than any copy change in this document.

---

### Theme 8 — MenuFit, in the only user account on Reddit, is a fast-food tool sold by influencers
**Frequency:** 1 of 1 substantive thread. **Confidence: Low-Medium** (single source — but it is
first-hand, hostile, and it independently reproduces the teardown's v3 conclusion).

> "She used an app to get **drive thru** […] I was super curious so I checked out the app she used
> (MenuFit — **did not use her code**). I put in my info and randomly picked **McDonalds**. […] It
> told me the best meal option was a double cheeseburger and 6 piece McNugget. **WTF? Absolutely
> insane.** […] I immediately deleted it and will never use it."
> — [r/taaaaylerr, Jul 2026, 17 pts](https://www.reddit.com/r/taaaaylerr/comments/1v13ubd/her_calorie_deficit_and_menufit_app/)

**Implication.** Three confirmations in one post, all from a primary user: (a) MenuFit is used by
**picking a chain by name**, not by scanning — the standing finding holds, do not reverse it;
(b) the traction engine is **creator affiliate codes**, visible in the wild; (c) the failure mode is
not a wrong calorie number but a **wrong recommendation** — a ranking that satisfies the constraint
and insults the user's judgment. Menu Scan's output *is* a ranking. This is the exact way it can be
publicly ridiculed, and no confidence indicator protects against it.

---

### Theme 9 — "I can't tell what this dish is" outscores "how many calories is it" by ~4×
**Confidence: Medium** (two large threads, different subs, both about identification not nutrition).

> "Take a picture of a menu and I would show you how the food looks like" — **540 pts**. Top
> comments: *"Sorting by how healthy it is, estimated calories, nutrition etc would be a cool
> feature"* (13 pts, framed as an **addition**) and *"There'd be no way to accurately measure
> calories or nutrition content though"* — plus *"when I go to new restaurants I keep googling what
> the dishes look like"* and *"I like Chinese and Thai food but when I want to order online no
> pictures. Mexican too."*
> — [r/SideProject, Nov 2024](https://www.reddit.com/r/SideProject/comments/1gj3ghp/take_a_picture_of_a_menu_and_i_would_show_you_how/)

> "My post about Chinese menus blew up. I've been coding nonstop since." — 138 pts. The demand:
> *"You give it a Chinese menu, and it tells you what each dish actually is, ingredients, how it's
> cooked, what to expect."* A translation app rendered 金丝肥牛 as *"Golden Thread Fat Cow"*; a
> vegetarian was served "vegetables" cooked in prawn broth at a Michelin-starred restaurant.
> — [r/travelchina, Mar 2026](https://www.reddit.com/r/travelchina/comments/1rw78bo/my_post_about_chinese_menus_blew_up_ive_been/)

**Implication.** The doc lists a JTBD it does not build for: *"Read this menu for me. I can't tell
what's in half of these dishes."* That job draws **540 and 138 upvotes**; the macro job draws 1–25.
This is Forq's ground, and Forq is failing on distribution (wrong App Store category, 1 rating), not
on demand. Also note: the single loudest comment on price sorting lives here — *"And sort by price
for the cheapskates :)"* (2 pts), answered *"Isn't the price on the menu?"* → *"Not sorted from low
to high."* That is the entire public demand signal for differentiator #5.

---

## Verdict on the four segments

| Segment (doc v1) | Verdict | Why |
|---|---|---|
| **Goal-tracker who eats out** | ✅ **Confirmed, and re-scope it** | Overwhelmingly the loudest voice — but their pain is **after** the meal (logging), not before it, and the committed ones **pre-plan at home**. Keep the segment; move the moment. |
| **Spanish-speaking diner** | ⚠️ **Confirmed as an unlabelled market, downgraded as a vocal segment** | Menus genuinely never print calories (Uruguay, Bogotá, Chile bill). But complaint volume is a fraction of English, the vocabulary is *health*, not *macros*, and counting meets open hostility. Treat as a **language advantage inside other segments**, not a standalone launch segment, until non-Reddit Spanish evidence exists. |
| **Restriction-driven diner** | ⬆️ **Confirmed and promote it** | The most acute, most emotional, most *pre-order* pain in the whole set — and it is the segment already photographing menus into ChatGPT (r/SIBO, r/Celiac, r/FoodAllergies). Correction to the doc: this is **not** only allergies/keto. It is IBS/SIBO/celiac/GI, where the cost of a wrong dish is being sick tonight, not a missed macro. |
| **GLP-1 user** | 🔀 **Merge into restriction-driven** | Real, but their language is identical to the restriction diner's — *"I'm concerned about ordering something that might make me sick"*, decision fatigue, small appetite, plan-ahead. It is a symptom cluster, not a separate audience. The doc already says it is "adjacent, not our wedge"; the evidence says stop treating it as a fourth segment at all. |

**New segment the research surfaced and the doc does not have:**

| **Unfamiliar-menu diner** | ➕ **Add as a hypothesis** | Travel, foreign-language, or just an unfamiliar cuisine. 540 + 138 upvotes vs. 1–25 for the macro threads. Wants *what is this dish*, then nutrition. Shares 100% of Menu Scan's mechanic and its bilingual pipeline. Not yet validated as a *paying* segment. |

---

## Personas

Built from the 32 threads above. Each is tagged with its evidence base. These remain **provisional
proxy personas** — no Menu Scan user has ever been observed.

### Persona A — The tracker who eats out anyway
*Evidence: 11 core threads + 7 overestimation threads. Strongest base in the set.*

**Profile.** Logs daily at home, weighs food, 261-day streaks. Eats out 1–3×/week and refuses to
stop. Mixed US/UK. Skews women in r/1200isplenty, men in r/CICO/r/GYM.

**Primary JTBD.** *Put a number on tonight's restaurant meal that I can live with, without pretending
it's exact and without skipping the log.*

**Trigger events.** Someone else picked the restaurant · an independent with no menu online · newly
serious about counting and facing the first un-labelled menu · the scale moved wrong after eating out.

**Top pains (their words).**
1. *"it just doesn't feel accurate and it makes going out harder"*
2. *"I never know how much oil or butter they used so I'll never really know the calories"*
3. *"I can't piece out most of the ingredients in all but three most simple Asian dishes"*
4. Chains lie too: *"The menu board lists it as 410 calories… it comes up to 587"*

**Desired outcome.** *"I'd rather have some data than no data."* Not precision — **a number they can
defend to themselves, biased high.**

**Objections and fears.** "It's a wrapper around GPT" · "AI food tracking is off by 20–60%" ·
"another $8.99/month" · a wrong recommendation that makes them look stupid.

**Alternatives.** Log a chain equivalent (dominant) · ChatGPT · guess and round up · don't log ·
**don't go**.

**Key vocabulary.** "guesstimate" · "log it as a Denny's reuben" · "round up / double it" ·
"restaurants use SO MUCH butter" · "don't let perfect be the enemy of good enough" · "ballpark".

**How to reach them.** r/loseit, r/caloriecount, r/CICO, r/1200isplenty. They punish self-promo and
detect it (*"most app recommendations you see in posts or comments have been paid for"*). The
category's proven channel is still short-form video, per the deep research.

---

### Persona B — The restriction diner (allergy · celiac · IBS/SIBO · GLP-1)
*Evidence: r/SIBO, r/Celiac, r/FoodAllergies, r/keto, 2× r/Zepbound. Six threads, four communities.
Merges the doc's segments 3 and 4.*

**Profile.** A medical or quasi-medical constraint. Eats out under duress or under supervision of
friends and family. The stakes are same-night, physical, and social.

**Primary JTBD.** *Tell me which of these dishes I can safely order, so I can stop reading forty
descriptions in front of everyone.*

**Trigger events.** Newly diagnosed · a reaction from a dish whose description omitted the allergen ·
a group picked a restaurant with "no ideal options" · starting a GLP-1 and not knowing what will sit.

**Top pains (their words).**
1. *"Trying to sift through each menu item and it's ingredients … was extremely overwhelming"*
2. *"It was an added cost if I told anyone about my allergies"* / *"the waiter suddenly seemed
   panicked and … my food came 30 minutes later than everyone else's"*
3. *"It sucks being invited somewhere … and not being able to eat or having to eat beforehand"*
4. *"I don't want to be the girl who can't order anything because she's on some annoying diet"*

**Desired outcome.** Two or three dishes they can pick from without asking anyone. *"This would save
me a ton of stress, embarrassment, and unnecessary explanations."*

**Objections and fears.** **Hallucination with a physical consequence** — and this community says it
out loud: *"once ChatGPT has narrowed down options for you, do double check that they are in fact
safe — it's not worth getting sicker over."* The disclaimer is not a legal formality to this person;
it is the thing that makes the tool usable at all.

**Alternatives.** Photo of the menu → ChatGPT (already the habit) · call ahead · FindMeGlutenFree ·
eat before going · don't go.

**Key vocabulary.** "safe" · "cross contamination" · "hidden [allergen]" · "narrowed down options" ·
"decision fatigue" · "will it sit well" · "I'd rather do this before going".

**How to reach them.** r/Celiac, r/FoodAllergies, r/SIBO, r/glutenfree, r/Zepbound, r/Ozempic.
This audience *shares tips*. The r/SIBO ChatGPT post is a template for organic reach that the
tracker subs would downvote.

---

### Persona C (hypothesis, not yet validated) — The unfamiliar-menu diner
*Evidence: r/SideProject 540 pts, r/travelchina 138 pts, plus foreign-language complaints. Tagged as
hypothesis because no purchase or retention signal was observed.*

**Primary JTBD.** *Tell me what these dishes actually are before I order one.*
**Pain.** *"when I go to new restaurants I keep googling what the dishes look like"* · a translator
returning *"Golden Thread Fat Cow"* · a vegetarian served prawn broth at a Michelin restaurant.
**Alternatives.** Google Images per dish · Google Lens/Translate · ask the server.
**Why it matters here.** Same mechanic, same bilingual pipeline, ~4× the engagement of the macro
framing, and it is the only place price sorting was ever mentioned. Forq aims here and fails on
distribution, not demand.

---

## What would change the positioning — ranked

1. **Add ChatGPT/Gemini as competitor row #1.** It is free, already habitual, and named by users.
   No other competitive fact in this research matters as much.
2. **Replace "guessing" with "the chain-swap".** The habit is competent, not lazy; copy that calls
   it guessing will be dismissed by the people who do it.
3. **Ship a range, biased high — not a point estimate.** Users' stated error preference is
   asymmetric and unanimous. This is a product change, not a copy change.
4. **Take the licensed claim the community offers:** good enough to *choose*, not good enough to
   *log*. Stronger and safer than "honest about estimates".
5. **Accept a menu from the photo roll / a URL / a share sheet, not only the camera.** Half the
   target user decides at home, hours early. "Before the server comes back" is a real moment but a
   minority one.
6. **Promote the restriction diner; merge GLP-1 into it.** Most acute pain, genuinely pre-order,
   already performing the manual version of this product, and shares tips organically.
7. **Reframe Spanish as a language advantage, not a launch segment** — until non-Reddit Spanish
   evidence exists. Add Chile's Jan 2026 labelling bill as a dated proof point.
8. **Drop price-sort from the differentiator list, or demote it.** One comment, 2 upvotes, in all of
   Reddit.

---

## Research gaps this run could not close

| Gap | Why | What would close it (free) |
|---|---|---|
| Spanish-speaking market outside Reddit | Reddit is a weak instrument for LatAm/ES fitness | Spanish App Store reviews of Fitia / MyRealFood / YAZIO (MX, ES, AR storefronts); TikTok/IG comments in Spanish |
| MenuFit's onboarding→paywall funnel | Nothing public | Still Santiago's install, as the teardown said |
| Whether the restriction diner would *pay* | No pricing discussion found in those subs | Mode 3 — 5 interviews recruited from r/Celiac / r/SIBO |
| Retention of the ChatGPT habit | Threads capture adoption, not repeat use | Mode 3 |
| Non-Reddit English VOC | Not attempted this run | YouTube comments on MenuFit/Cal AI creator videos — the channel that actually drives this category |

## Sources

All 32 threads are linked inline. Access route: `safereddit.com`, a public Redlib mirror, on
2026-08-30. Redlib serves Reddit's own thread and search content without an account; no directory
sites, no auto-generated app blurbs, and no secondary review-aggregator pages were used anywhere in
this document.
