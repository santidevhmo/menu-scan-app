# Context — Menu Scan

The shared language of this project. Glossary only: no status, no implementation detail, no plans.
When a term here conflicts with how a doc or a variable name uses it, this file wins and the other
should be corrected.

---

## Scan

One user action: photographing or importing between 1 and 10 images of a single menu, and the
analysis that follows. A scan covers **one menu**, not one photo.

## Item

A single line of the menu as printed — its name, its description if it has one, and its price if it
has one. An item is what the user orders and what the results list ranks.

## Page

One of the images in a scan. The user photographs **pages**, not files — so the interface counts
pages ("3 of 10 pages"), never "photos" or "images". A scan is 1 to 10 pages of one menu.

## Goal

A direction the user wants a macro to go: `high protein`, `low fat`, and so on. Goals come in
opposed pairs; selecting one side clears the other. A user selects **one or more** goals and is
never required to select all of them.

## Alignment

How well an item matches the user's selected goals, **relative to the other items on the same
menu**. Alignment is the ordering principle of the results list. It is a comparison between dishes
on one menu, never an absolute quality judgement — 30 g of protein is excellent on a taco menu and
unremarkable on a steakhouse menu.

⚠️ **Alignment is not confidence.** They are different numbers answering different questions and
have been confused before.

## Confidence

How much the menu line itself gave us to work with — a richly described dish is high, a bare
promotional name is low. It is a property of the **input**, not of our answer, and it is decided
before portion size is ever considered.

**Confidence is internal and is not shown to the user.** (Ruling: Santiago, 2026-09-01.)

## Estimate

Our answer for one macro on one item. An estimate is published to the user as a **range**, with a
single **point value** available as secondary detail. The range is the primary figure; the point
value is never presented alone.

⚠️ **An estimate is never expressed as a percentage or an accuracy claim anywhere in the interface.**

## Portion

What the user intends to eat, expressed against what the kitchen serves — "the order comes in 8
pieces, I will eat 4". Portion scales the estimate shown for that item. It is the user's statement
of intent, not a correction of our answer.

## Ingredients to avoid

Things the user does not want on their plate, whether for medical reasons (an allergen) or personal
taste (a disliked ingredient). One list covering both.

⚠️ **The two halves are not equally serious.** Whenever a genuine allergen is among them, the
results screen must carry the standing warning that our reading is AI-estimated and must be
confirmed with restaurant staff. That warning is non-negotiable.

## The menu's own words

An item's name, description and price are shown to the user exactly as the menu printed them, in
the menu's own language. That is the default and it is never changed silently — the user has to be
able to read the dish's name aloud to a waiter.

Any English rendering produced for internal lookup is never displayed.

## Translation

A translation the user **asks for**, by turning it on. It renders an item's **description** in the
user's own language while the **dish name stays exactly as the menu printed it**, because the name
is what they have to order by.

⚠️ **Translation is opt-in and off by default.** Silently replacing the menu's words is a different
thing entirely, and it is not something this product does. (Ruling: Santiago, 2026-09-01.)
