// Writes the unweighted oracle from Santiago's APPROVED mass bands and the USDA
// records those bands were read off. Bands are computed by deriveBands, never by
// hand, so calories stay Atwater-consistent with the three macros at BOTH
// endpoints and nobody has to trust an agent's arithmetic.
//
// Mass bands approved by Santiago 2026-08-12. Compositions are per 100 g exactly
// as published by FDC, fetched with scripts/unweighted-portions.ts.
//
//   deno run --allow-write --allow-read scripts/unweighted-oracle-build.ts
import {
  deriveBands,
  type UnweightedEntry,
  validateEntry,
} from "./unweighted-oracle.ts";
import type { MacroBand } from "./macro-band-score.ts";

const OUT = "scripts/fixtures/unweighted-oracle.json";
const RETRIEVED = "2026-08-12";

interface Draft {
  name: string;
  menu: string;
  mass_band_g: MacroBand;
  composition: {
    protein_per_100g: number;
    carb_per_100g: number;
    fat_per_100g: number;
  };
  assumed: string;
  /** Overrides RETRIEVED when this draft's FDC records were fetched on a different day. */
  retrieved_at?: string;
}

const DRAFTS: Draft[] = [
  {
    name: "CAPRICCIOSA",
    menu: "bistro",
    mass_band_g: [400, 450],
    // FDC 2708663, RESTAURANT thin crust - venue matches the dish, crust matches
    // the premise the mass rests on.
    composition: {
      protein_per_100g: 11.6,
      carb_per_100g: 26.6,
      fat_per_100g: 9.87,
    },
    assumed:
      "28 cm stated on the menu. Band [400,450] g is Santiago's ruling (2026-08-13) for a " +
      "THIN-CRUST pizza. " +
      "Area-scaling USDA's 14\" meat-and-vegetable records (FDC 172055 at 1168 g/pie, FDC 172049 " +
      'at 1043 g/pie; 28 cm = 62% of 14" BY AREA) gave [647,724] g, but both are American chain ' +
      "pizza - thick pan-style crust. At 450 g a 28 cm pizza carries ~0.73 g/cm2 against the " +
      "chain's ~1.18, which is the thin-vs-pan difference, so the chain mass does not describe " +
      "this dish. " +
      "RE-SOURCED 2026-08-16 (Santiago's ruling), the FIFTH variant correction on this entry and " +
      "the third on this dish: composition was FDC 2708660 'from FROZEN, thin crust' (P 11.3 / " +
      "C 25.1 / F 14.4). Bistro is a restaurant, so the correct VENUE cell is FDC 2708663 'from " +
      "RESTAURANT OR FAST FOOD, thin crust' (P 11.6 / C 26.6 / F 9.87) - frozen pizza carries 46% " +
      "more fat. Verified against the FDC API 2026-08-16, and the whole FNDDS grid was listed " +
      "before choosing: frozen thin/medium/thick are one identical record (276 kcal), restaurant " +
      "splits by crust (thin 241, medium 248, thick 259). Topping class re-checked against the " +
      "menu: 'Jamon serrano, alcachofa, aceituna negra y champinon' = meat AND vegetables. " +
      "That moves the band from 1101-1238 kcal / F 58-65 to 967-1087 / F 39-44, and the " +
      "pipeline's carb lands IN band. " +
      'Superseded compositions, in order: CHEESE-ONLY 14" (wrong topping class), chain regular ' +
      "crust (wrong crust), thin crust from frozen (wrong venue).",
  },
  {
    name: "CARBONARA",
    menu: "bistro",
    mass_band_g: [250, 450],
    // FDC 2708861 - the WITH MEAT record. See the re-source note below.
    composition: {
      protein_per_100g: 5.67,
      carb_per_100g: 15.4,
      fat_per_100g: 14.1,
    },
    assumed:
      "No printed weight. Low endpoint 250 g = the published restaurant pasta portion (identical " +
      "in FDC 2708855 and 2708861). High endpoint 450 g from Santiago's independent " +
      "restaurant-plate estimate, kept as the upper bound rather than averaged away (design §5.3). " +
      "RE-SOURCED 2026-08-13: composition was FDC 2708855 'Pasta with cream sauce' at 3.72 g " +
      "protein/100 g, which has NO meat. The menu says 'con un toque de tocino', so the correct " +
      "record is FDC 2708861 'Pasta with cream sauce AND MEAT, restaurant' at 5.67 g/100 g. " +
      "The old band's 9-17 g protein failed the pipeline's 21-23 g; the corrected 14-26 g contains " +
      "it. THE ORACLE WAS WRONG, NOT THE PIPELINE - a generic record omitted an ingredient the " +
      "menu names, which is the same error class as the Capricciosa crust.",
  },
  {
    name: "ENSALADA GRIEGA",
    menu: "bistro",
    mass_band_g: [136, 250],
    // 77.2% FDC 2709830 + 22.8% FDC 2710203, the ratio the low endpoint is built from.
    composition: {
      protein_per_100g: 2.22,
      carb_per_100g: 6.12,
      fat_per_100g: 6.56,
    },
    assumed:
      "No printed weight. Low endpoint 136 g = FDC 2709830 'Greek Salad, no dressing' (105 g) + " +
      "dressing (31 g). High endpoint 250 g from Santiago's estimate. Composition is the two " +
      "records BLENDED BY MASS at that same 77.2:22.8 ratio - the blend is a judgement, recorded " +
      "here rather than averaged silently. " +
      "RE-SOURCED 2026-08-13: the dressing was FDC 2710195 'Salad dressing, NFS' at 44.5 g fat/" +
      "100 g, a CREAMY dressing. The menu says 'vinagreta balsamico', so it is now FDC 2710203 " +
      "'Italian dressing, made with vinegar and oil' at 21.1 g - half the fat. That moved the fat " +
      "band from 16-30 g to 9-16 g, and the pipeline's 9-12 g went from FAILING to PASSING. " +
      "THE ORACLE WAS WRONG, NOT THE PIPELINE. " +
      "Checked and NOT changed: 2709830 does contain feta - back-solving its 2.26 g fat and 49 " +
      "kcal per 100 g against plain salad vegetables implies ~10% feta, so the record does match a " +
      "salad naming queso feta and the earlier caveat about it was unfounded. " +
      "STILL FAILING, and believed genuine: the pipeline's 8 g protein against a 3-6 g band. That " +
      "implies ~3.2 g/100 g where USDA's undressed salad is 2.75 - a modest over-estimate of the " +
      "feta, not an oracle defect. It is the narrowest failure in the set; do not act on it alone.",
  },
  {
    name: "TIRAS DE POLLO",
    menu: "andaluz",
    mass_band_g: [234, 333],
    // 61% FDC 170756 + 39% FDC 2709461 (PLAIN fries, not the cheese-fries record).
    composition: {
      protein_per_100g: 15.68,
      carb_per_100g: 19.82,
      fat_per_100g: 13.32,
    },
    assumed:
      "No printed weight, and the menu says 'Acompañadas de papas fritas', so the plate is strips " +
      "PLUS fries. Low endpoint 234 g = FDC 170756 breast without skin (142 g) + fries (92 g); " +
      "high endpoint 333 g = FDC 170756 breast with skin and breading (203 g) + fries (130 g). " +
      "Chicken:fries is 61:39 at both endpoints, and the composition is blended at that ratio. " +
      "Fries composition is FDC 2709461 'Potato, french fries, fast food' - the PLAIN record. " +
      "The candidate list's FDC 2709469 is 'french fries WITH CHEESE', which this menu does not " +
      "print; that substitution is the only change made to an approved input.",
  },
  // ☠️ COLIFLOR ROKA WAS REMOVED HERE (Santiago, 2026-08-20) and PAPAS FRITAS below
  // replaces it - the same menu, the same category, so the set's shape is unchanged.
  //
  // WHY, and it is a rule about what a benchmark may ask: its menu line is only its
  // name. The real dish, from the restaurant's own photos, is battered cauliflower
  // on lettuce under a chipotle mayo, and NONE of that is knowable from the text the
  // pipeline receives. Santiago: an item this thin "shouldn't even be considered" -
  // it is UNANSWERABLE rather than badly answered, so failing it measured the
  // menu's silence, not the pipeline. Four arms were partly judged on it.
  //
  // ⚠️ WHAT ITS REMOVAL COSTS, recorded because the Salmón Roll entry below depends
  // on it: Coliflor guarded the BOTTOM of the set - it was the dish that would catch
  // an arm scaling everything downward, the way Salmón Roll once guarded the top.
  // Nothing guards the bottom now. Weigh that when judging any arm that shrinks a
  // plate. Its evidence stays in the ledger (eval 155) and in
  // scripts/sim-decomposition-ceiling.ts, which used it to prove a missing
  // INGREDIENT cannot be fixed by scaling a MACRO.
  {
    name: "PAPAS FRITAS",
    menu: "andaluz",
    mass_band_g: [160, 200],
    // 155 g FDC 2709462 + 5 g FDC 2705728 + 5 g FDC 2705885, blended over 165 g.
    composition: {
      protein_per_100g: 5.32,
      carb_per_100g: 35.26,
      fat_per_100g: 15.11,
    },
    assumed:
      '"Sazonidas con trufa, parmesano y virutas de bacon crujiente." (The menu itself ' +
      "misspells sazonadas; the oracle matches the MENU, not the dictionary.) " +
      "Ingredients, each from FNDDS: 155 g FDC 2709462 'Potato, french fries, RESTAURANT' - the " +
      "venue axis matters, this is a restaurant and not a frozen or fast-food record - plus 5 g " +
      "FDC 2705728 parmesan and 5 g FDC 2705885 bacon. Band [160,200] g brackets FNDDS's own " +
      "published restaurant-fries portions, which cluster 110-180 g. " +
      "🔑 THE 5 g FIGURES ARE SANTIAGO'S RULING (2026-08-20) AND THEY ARE THE POINT OF THIS ENTRY. " +
      "A first draft priced parmesan and bacon at 15 g each, which read 'bacon' and charged for " +
      "rashers: P 16 / F 31 against the ruled P 10 / F 27. 'Virutas' means SHAVINGS. Pricing a " +
      "topping as a portion is the same error class as the 30 g dipping-container defect, and it " +
      "inflates protein hardest because cured meat and hard cheese are the two most " +
      "protein-dense things on a menu. " +
      "⚠️ THE TRUFFLE IS UNPRICED, deliberately and it is the known gap. Treated as a dry " +
      "seasoning at 0 g. If the kitchen uses truffle OIL, roughly 3-5 g of it is missing - about " +
      "30 kcal and 4 g of fat, which would push fat toward the top of its band. Re-source before " +
      "treating a fat miss on this dish as a pipeline defect.",
  },
  {
    name: "OMELETTE CUBANA",
    menu: "el-marcos",
    mass_band_g: [170, 230],
    // 110 g egg + 15 chorizo + 15 ham + 8 bacon + 15 cheddar + 20 onion + 20 pepper.
    composition: {
      protein_per_100g: 12.33,
      carb_per_100g: 2.77,
      fat_per_100g: 15.50,
    },
    assumed:
      '"Dos huevos con chorizo, jamón, tocino, queso, cebolla y pimiento verde." The first ' +
      "eggs-and-breakfast dish in the set - a whole dish FORM the pipeline had never been " +
      "measured on. " +
      "🔑 DECOMPOSED INTO INGREDIENTS BECAUSE FNDDS HAS NO RECORD FOR THIS DISH (Santiago's " +
      "standing rule, restated 2026-08-20: where FNDDS lacks the composite, use it for each " +
      "individual ingredient). A first draft used FDC 2707223 'omelet with cheese and meat, made " +
      "with oil' as a single record. That was wrong twice over: FNDDS carries the " +
      "cheese+meat+VEGETABLES axis only for egg WHITE and egg SUBSTITUTE, never whole egg, so " +
      "the onion and green pepper had no representation at all and the record ran richer per " +
      "gram than the real dish. " +
      "Ingredients: 110 g FDC 2707158 'Egg, whole, fried with oil' (two eggs, ~55 g each cooked - " +
      "'dos huevos' is the only quantity the menu states), 15 g FDC 746781 chorizo pan-fried, " +
      "15 g FDC 173864 ham sliced regular, 8 g FDC 2705885 bacon, 15 g FDC 2705709 cheddar, " +
      "20 g FDC 2710796 onions cooked, 20 g FDC 2709976 green pepper cooked. " +
      "⚠️ EVERY FILLING GRAM IS A JUDGEMENT, not a published portion. The menu states no " +
      "quantity for anything after 'con', and each is priced as a filling rather than a serving " +
      "of that food - the same ruling as PAPAS FRITAS. The CHEESE is the least certain: 15 g of " +
      "cheddar is 61 kcal, and el-marcos may use a Mexican melting cheese, which is leaner.",
  },
  {
    name: "TACO PORCO",
    menu: "brasero-two",
    mass_band_g: [100, 140],
    // 28 g tortilla + 55 pork loin + 15 beets + 15 pineapple + 5 peanuts.
    composition: {
      protein_per_100g: 15.14,
      carb_per_100g: 14.29,
      fat_per_100g: 7.06,
    },
    assumed:
      '"Taco de bandiola adobada, betabel, cacahuate, piña y cilantro." The first taco in the ' +
      "set, and tacos were 12 of the available described candidates and none of the fixtures. " +
      "It also exercises the implied-tortilla component, which only pizza and sushi tested before. " +
      "🔑 DECOMPOSED, AND THE COMPOSITE RECORD WAS REJECTED FOR A MEASURABLE REASON. FNDDS's only " +
      "pork-taco records all carry CHEESE (FDC 2708517 'Taco, corn tortilla, pork, cheese') and " +
      "this taco has none. Using it read 276 kcal at 16 g fat; the ingredient decomposition reads " +
      "218 kcal at 8 g fat - the phantom cheese was HALF the dish's fat. This is the variant " +
      "error that has bitten this oracle six times, caught before it shipped. " +
      "Ingredients: 28 g FDC 2707823 'Tortilla, corn' - a published FNDDS portion, the only " +
      "sourced weight in this entry - 55 g FDC 167842 pork loin roasted, 15 g FDC 169146 beets " +
      "cooked, 15 g FDC 2709260 pineapple raw, 5 g FDC 2707515 peanuts roasted salted. " +
      "⚠️ TWO JUDGEMENTS. 'Bandiola' is a River Plate cut FNDDS does not carry; roasted pork loin " +
      "stands in, and 55 g is one taco's filling rather than a portion of pork - 'Taco de' is " +
      "singular. Cilantro is unpriced as a herb garnish. " +
      "⚠️ NO PRICE IS PRINTED for this item. It cannot affect macros (price is never evidence of " +
      "grams) but it does mean the item is absent from a price-sorted list.",
  },
  {
    name: "BROWNIE",
    menu: "brasero-two",
    mass_band_g: [150, 200],
    // 80 g FDC 2707904 + 65 g FDC 2705630 + 30 g FDC 2709283, blended over 175 g.
    composition: {
      protein_per_100g: 3.60,
      carb_per_100g: 39.34,
      fat_per_100g: 11.57,
    },
    assumed: '"Brownie de la casa con nieve de vainilla y fresas." ' +
      "🔑 THE ONLY DESCRIBED DESSERT ACROSS ALL TEN ARCHIVED MENUS - measured, 18 of 20 desserts " +
      "carry no description - so it is the only chance to test the dessert category at all. It is " +
      "also the set's only carb-dominant dish: 69 g of carbohydrate against 6 g of protein, the " +
      "opposite balance to every other fixture, which is worth having when judging an arm that " +
      "moves one macro. " +
      "Ingredients: 80 g FDC 2707904 'Cookie, brownie, without icing' (FNDDS publishes 30-90 g " +
      "portions for it; 80 g is a plated dessert square, near the top of that range), 65 g FDC " +
      "2705630 vanilla ice cream for the 'nieve', 30 g FDC 2709283 strawberries raw. " +
      "⚠️ 'Sin icing' was chosen because the description names none; FDC 2707905 'with icing or " +
      "filling' would be the record if the house brownie is glazed. Approved unchanged by " +
      "Santiago on 2026-08-20, the only one of the four that needed no revision.",
  },
  {
    name: "Salmón Roll",
    menu: "nikkori",
    mass_band_g: [300, 400],
    // 85% FDC 2708963 + 15% FDC 2705760.
    composition: {
      protein_per_100g: 6.72,
      carb_per_100g: 13.69,
      fat_per_100g: 6.11,
    },
    assumed:
      "No printed weight. Band [300,400] g is Santiago's ruling (2026-08-13), revised up from " +
      "[250,350] the day before, for a roll that is both filled and topped. Well above FDC " +
      "2708963's published 180 g plain salmon roll for that reason. " +
      "Composition is FDC 2708963 'Sushi roll, salmon' blended 85:15 with FDC 2705760 cream cheese - " +
      "neither FNDDS roll record contains cream cheese and this description names it, which is what " +
      "lifts fat from 1.28 to 6.11 g/100 g. " +
      "⚠️ GUARD DISH, AND THE REVISION WEAKENED IT. At [250,350] the pipeline's 397 g sat ABOVE the " +
      "band and this was the set's only over-estimate. At [300,400] that 397 g is INSIDE, so the " +
      "set now has NO dish guarding against an arm that scales everything upward. Coliflor Roka " +
      "guards the bottom; nothing guards the top. Weigh that when judging any arm that adds a " +
      "plate-weight anchor.",
  },
  // --- Round 2, Task 3: 10 pizzas ruled as classes (class rule approved 2026-08-22,
  // docs/superpowers/specs/2026-08-22-oracle-widening-round-2-rulings.md) ---
  {
    name: "5 FORMAGGI",
    menu: "bistro",
    mass_band_g: [400, 450],
    // FDC 2708615, RESTAURANT thin crust, CHEESE topping class.
    composition: { protein_per_100g: 11.39, carb_per_100g: 33.33, fat_per_100g: 9.69 },
    assumed:
      '"Queso mozzarella, chihuahua, azul, feta y cabra." Class ruling: 28 cm thin-crust Bistro ' +
      "pizza, [400,450] g (Santiago 2026-08-13, carried from CAPRICCIOSA). 28 cm is on the SECTION " +
      "HEADER and is dropped by Stage 1. Five named cheeses, no meat or vegetable -> CHEESE topping " +
      "class per FDC 2708615 'Pizza, cheese, from restaurant or fast food, thin crust'.",
    retrieved_at: "2026-08-22",
  },
  {
    name: "MARGARITA",
    menu: "bistro",
    mass_band_g: [400, 450],
    // FDC 2708615, RESTAURANT thin crust, CHEESE topping class - venue and crust match
    // CAPRICCIOSA's ruling; only the topping class differs.
    composition: { protein_per_100g: 11.39, carb_per_100g: 33.33, fat_per_100g: 9.69 },
    assumed:
      '"Rebanadas de tomate fresco y albahaca deshidratada." Class ruling: 28 cm thin-crust Bistro ' +
      "pizza, [400,450] g (Santiago 2026-08-13, carried from CAPRICCIOSA). 28 cm is on the SECTION " +
      "HEADER and is dropped by Stage 1. Tomato/basil read as a garnish on a plain base, not a bulk " +
      "vegetable topping -> CHEESE topping class per FDC 2708615, same as 5 FORMAGGI. Approved as " +
      "proposed 2026-08-22.",
    retrieved_at: "2026-08-22",
  },
  {
    name: "PEPPERONI",
    menu: "bistro",
    mass_band_g: [400, 450],
    // FDC 2708639, the dedicated pepperoni record - NOT the generic "meat" record
    // (2708650), which is literally titled "meat OTHER THAN pepperoni".
    composition: { protein_per_100g: 11.74, carb_per_100g: 31.98, fat_per_100g: 11.91 },
    assumed:
      "Name-only dish. Ruled here rather than in the answerability task (Task 5) because the class " +
      "ruling supplies the portion (28 cm is on the section header, dropped by Stage 1) and the " +
      "dish name states the topping. Class ruling: 28 cm thin-crust Bistro pizza, [400,450] g " +
      "(Santiago 2026-08-13, carried from CAPRICCIOSA). PEPPERONI topping class per FDC 2708639 " +
      "'Pizza with pepperoni, from restaurant or fast food, thin crust' - the dedicated pepperoni " +
      "record is definitionally correct for a dish named PEPPERONI; the generic 'meat' record " +
      "(FDC 2708650) explicitly excludes pepperoni in its own title. Approved as proposed 2026-08-22.",
    retrieved_at: "2026-08-22",
  },
  {
    name: "4 STAGIONI",
    menu: "bistro",
    mass_band_g: [400, 450],
    // FDC 2708650, RESTAURANT thin crust, MEAT topping class (four meats, no vegetable).
    composition: { protein_per_100g: 11.5, carb_per_100g: 30.6, fat_per_100g: 12.4 },
    assumed:
      '"Pepperoni, jamón, tocino y chistorra." Class ruling: 28 cm thin-crust Bistro pizza, ' +
      "[400,450] g (Santiago 2026-08-13, carried from CAPRICCIOSA). 28 cm is on the SECTION HEADER " +
      "and is dropped by Stage 1. Four named meats, no vegetable -> MEAT topping class per FDC " +
      "2708650 'Pizza with meat other than pepperoni, from restaurant or fast food, thin crust'.",
    retrieved_at: "2026-08-22",
  },
  {
    name: "HAWAIANA",
    menu: "bistro",
    mass_band_g: [400, 450],
    // FDC 2708650, RESTAURANT thin crust, MEAT topping class.
    composition: { protein_per_100g: 11.5, carb_per_100g: 30.6, fat_per_100g: 12.4 },
    assumed:
      '"Jamón y piña." Class ruling: 28 cm thin-crust Bistro pizza, [400,450] g (Santiago ' +
      "2026-08-13, carried from CAPRICCIOSA). 28 cm is on the SECTION HEADER and is dropped by " +
      "Stage 1. No thin-crust 'meat and fruit' FNDDS record matches Bistro's venue/crust " +
      "combination; ham is the dominant named ingredient and pineapple's macro contribution at " +
      "this scale does not move the class -> MEAT topping class per FDC 2708650, approved as " +
      "proposed 2026-08-22 (the meat-and-fruit alternative, FDC 2708669, was offered and declined).",
    retrieved_at: "2026-08-22",
  },
  {
    name: "ITALIANA",
    menu: "bistro",
    mass_band_g: [400, 450],
    // FDC 2708663, RESTAURANT thin crust, MEAT+VEGETABLE topping class - CAPRICCIOSA's
    // already-ruled id.
    composition: { protein_per_100g: 11.55, carb_per_100g: 26.62, fat_per_100g: 9.87 },
    assumed:
      '"Pepperoni, cebolla morada, pimiento verde, aceituna negra y champiñones." Class ruling: ' +
      "28 cm thin-crust Bistro pizza, [400,450] g (Santiago 2026-08-13, carried from CAPRICCIOSA). " +
      "28 cm is on the SECTION HEADER and is dropped by Stage 1. Four vegetable/fruit-adjacent " +
      "ingredients alongside pepperoni -> MEAT+VEGETABLE topping class per FDC 2708663 'Pizza with " +
      "meat and vegetables, from restaurant or fast food, thin crust' - the same record CAPRICCIOSA " +
      "already uses.",
    retrieved_at: "2026-08-22",
  },
  {
    name: "MEXICANA",
    menu: "bistro",
    mass_band_g: [400, 450],
    // FDC 2708663, RESTAURANT thin crust, MEAT+VEGETABLE topping class.
    composition: { protein_per_100g: 11.55, carb_per_100g: 26.62, fat_per_100g: 9.87 },
    assumed:
      '"Cebolla morada, pimiento verde y chistorra." Class ruling: 28 cm thin-crust Bistro pizza, ' +
      "[400,450] g (Santiago 2026-08-13, carried from CAPRICCIOSA). 28 cm is on the SECTION HEADER " +
      "and is dropped by Stage 1. Onion and pepper alongside the sausage -> MEAT+VEGETABLE topping " +
      "class per FDC 2708663, same record as ITALIANA and CAPRICCIOSA.",
    retrieved_at: "2026-08-22",
  },
  {
    name: "CAPRESE",
    menu: "bistro",
    mass_band_g: [400, 450],
    // FDC 2708663, RESTAURANT thin crust, MEAT+VEGETABLE topping class.
    composition: { protein_per_100g: 11.55, carb_per_100g: 26.62, fat_per_100g: 9.87 },
    assumed:
      '"Espinacas, jamón serrano y tomate deshidratado." Class ruling: 28 cm thin-crust Bistro ' +
      "pizza, [400,450] g (Santiago 2026-08-13, carried from CAPRICCIOSA). 28 cm is on the SECTION " +
      "HEADER and is dropped by Stage 1. Two of three named ingredients (spinach, tomato) are " +
      "vegetables, so this is NOT a plain-meat topping despite the ham -> MEAT+VEGETABLE topping " +
      "class per FDC 2708663, approved as proposed 2026-08-22 (moved off the generic MEAT class).",
    retrieved_at: "2026-08-22",
  },
  {
    name: "JAMÓN CON CHAMPIÑONES",
    menu: "bistro",
    mass_band_g: [400, 450],
    // FDC 2708663, RESTAURANT thin crust, MEAT+VEGETABLE topping class.
    composition: { protein_per_100g: 11.55, carb_per_100g: 26.62, fat_per_100g: 9.87 },
    assumed:
      "Name-only dish. Ruled here rather than in the answerability task (Task 5) because the class " +
      "ruling supplies the portion (28 cm is on the section header, dropped by Stage 1) and the " +
      "dish name states the toppings (ham, mushroom). Mushroom is a vegetable, so ham+mushroom is " +
      "not a plain-meat topping -> MEAT+VEGETABLE topping class per FDC 2708663, approved as " +
      "proposed 2026-08-22 (moved off the generic MEAT class).",
    retrieved_at: "2026-08-22",
  },
  {
    name: "VEGETARIANA",
    menu: "bistro",
    mass_band_g: [400, 450],
    // FDC 2708626, RESTAURANT thin crust, VEGETABLE topping class.
    composition: { protein_per_100g: 9.96, carb_per_100g: 29.86, fat_per_100g: 8.37 },
    assumed:
      '"Espinaca, calabaza, champiñón, cebolla morada, pimiento verde y aceituna negra." Class ' +
      "ruling: 28 cm thin-crust Bistro pizza, [400,450] g (Santiago 2026-08-13, carried from " +
      "CAPRICCIOSA). 28 cm is on the SECTION HEADER and is dropped by Stage 1. Six named " +
      "ingredients, no meat -> VEGETABLE topping class per FDC 2708626 'Pizza, cheese, with " +
      "vegetables, from restaurant or fast food, thin crust'.",
    retrieved_at: "2026-08-22",
  },
  // --- Round 2, Task 3: 7 rolls ruled from por-dentro/por-fuera text (rice+nori base
  // approved 2026-08-22, carried from Salmón Roll/Vegan Roll/Nikkori Maki). Compositions
  // are ingredient blends, not a single FDC record - see the rulings doc for the per-
  // ingredient gram breakdown. Mass and macros cross-checked per-piece against FDC
  // 2708963's own published "1 piece = 30 g" portion and against Nikkori Maki's own
  // approved 343 g / 11 pieces =~ 31 g/piece - both land in the same range, and every
  // roll below runs 1.2-2.6 g protein per piece, consistent with the photo Santiago
  // supplied of a cut Nikkori Maki piece (a couple of small shrimp slices, a cube of
  // avocado, a smear of cream cheese - nothing close to a solid protein portion).
  {
    name: "Ipanema Roll",
    menu: "nikkori",
    mass_band_g: [240, 325],
    // Rice 140 g (FDC 2710788) + nori 3 g (FDC 2709988) + tuna ~50 g (FDC 2706308, filled,
    // "spicy" read as a prep style with no separate ingredient) + shrimp ~40 g (FDC 2706449,
    // topped) + avocado ~40 g (FDC 2709223, topped) + eel-sauce glaze ~10 g (FDC 2707442
    // soy sauce, proxy for "salsa anguila" at garnish scale). Totals ~283 g, 24 P / 49 C / 7 F.
    composition: { protein_per_100g: 8.48, carb_per_100g: 17.31, fat_per_100g: 2.47 },
    assumed:
      '"Por dentro: Atún spicy. Por fuera: Camarón y aguacate, bañado en salsa anguila." Rice+nori ' +
      "base per the roll class ruling (2026-08-22), carried from Salmón Roll/Vegan Roll/Nikkori " +
      "Maki. At 11 pieces (Santiago's stated 10-12), this is 25.7 g/piece, 2.18 g protein/piece - " +
      "in the same range as Nikkori Maki's own approved 31.2 g/piece, 1.55 g protein/piece. " +
      "Approved 2026-08-22.",
    retrieved_at: "2026-08-22",
  },
  {
    name: "Fildeflex",
    menu: "nikkori",
    mass_band_g: [235, 320],
    // Rice 150 g (FDC 2710788, filled-only convention per Vegan Roll) + nori 3 g (FDC 2709988)
    // + salmon ~60 g (FDC 2706286 baked/broiled, the dominant filling) + cream cheese 30 g
    // (FDC 2705760) + cucumber 30 g (FDC 2709784) + sesame ~5 g (FDC 2707586, coating).
    // Totals ~278 g, 23 P / 48 C / 25 F.
    composition: { protein_per_100g: 8.27, carb_per_100g: 17.27, fat_per_100g: 8.99 },
    assumed:
      '"Por dentro: Salmón, queso crema y pepino. Por fuera: Ajonjolí." Rice+nori base per the ' +
      "roll class ruling (2026-08-22). Filled-only (sesame is a coating, not a mass-bearing " +
      "topping), so rice uses the [150 g] filled-only convention from Vegan Roll rather than the " +
      "[140 g] filled+topped convention. NAME MISMATCH, RULED: the physical menu prints " +
      '"Fildelfia" (likely a misprint for "Filadelfia" / Philadelphia roll); the extraction ' +
      'archives and pipeline caches use "Fildeflex". Oracle entry uses "Fildeflex" so it matches ' +
      "what the harness actually scores against - approved 2026-08-22. At 11 pieces, 25.3 g/piece, " +
      "2.09 g protein/piece.",
    retrieved_at: "2026-08-22",
  },
  {
    name: "Avocado",
    menu: "nikkori",
    mass_band_g: [250, 335],
    // Rice 140 g (FDC 2710788) + nori 3 g (FDC 2709988) + shrimp ~45 g (FDC 2706449, filled)
    // + cream cheese 30 g (FDC 2705760, filled) + cucumber 30 g (FDC 2709784, filled) +
    // avocado ~45 g (FDC 2709223, topped - the name-driving ingredient). Totals ~293 g,
    // 13 P / 52 C / 18 F.
    composition: { protein_per_100g: 4.44, carb_per_100g: 17.75, fat_per_100g: 6.14 },
    assumed:
      '"Por dentro: Camarón, queso crema y pepino. Por fuera: Aguacate." Rice+nori base per the ' +
      "roll class ruling (2026-08-22), carried from the same three precedent rolls. At 11 pieces, " +
      "26.6 g/piece, 1.18 g protein/piece - the lightest of the seven, consistent with a topping " +
      "(avocado) that carries no protein of its own. Approved 2026-08-22.",
    retrieved_at: "2026-08-22",
  },
  {
    name: "Tuna Especial",
    menu: "nikkori",
    mass_band_g: [235, 320],
    // Rice 140 g (FDC 2710788) + nori 3 g (FDC 2709988) + cream cheese 30 g (FDC 2705760,
    // filled) + avocado 40 g (FDC 2709223, filled) + tuna ~50 g (FDC 2706308, topped) +
    // masago ~8 g (FDC 175132 fish roe, topped) + mayonnaise ~8 g (FDC 2710204, topped).
    // Totals ~279 g, 21 P / 47 C / 23 F.
    composition: { protein_per_100g: 7.53, carb_per_100g: 16.85, fat_per_100g: 8.24 },
    assumed:
      '"Por dentro: Queso crema y aguacate. Por fuera: Atún con topping de masago y mayonesa." ' +
      "Rice+nori base per the roll class ruling (2026-08-22). At 11 pieces, 25.4 g/piece, 1.91 g " +
      "protein/piece. Approved 2026-08-22.",
    retrieved_at: "2026-08-22",
  },
  {
    name: "Salmón Samba",
    menu: "nikkori",
    mass_band_g: [240, 325],
    // Rice 140 g (FDC 2710788) + nori 3 g (FDC 2709988) + tuna 40 g (FDC 2706308, filled) +
    // avocado 40 g (FDC 2709223, filled) + salmon ~50 g (FDC 2706286 baked/broiled, topped) +
    // ponzu glaze ~10 g (FDC 2707442 soy sauce, proxy for "salsa spicy ponzu" at garnish
    // scale). Totals ~283 g, 29 P / 46 C / 16 F.
    composition: { protein_per_100g: 10.25, carb_per_100g: 16.25, fat_per_100g: 5.65 },
    assumed:
      '"Por dentro: Atún spicy y aguacate. Por fuera: Salmón bañado con salsa spicy ponzu." ' +
      "Rice+nori base per the roll class ruling (2026-08-22). Names both tuna AND salmon as " +
      "defining ingredients, so the highest per-piece protein of the seven at 11 pieces: 25.7 " +
      "g/piece, 2.64 g protein/piece - still under a third of Nikkori Maki's own per-piece mass " +
      "and well inside what the reference photo shows. Approved 2026-08-22.",
    retrieved_at: "2026-08-22",
  },
  {
    name: "Duplex",
    menu: "nikkori",
    mass_band_g: [290, 395],
    // Rice 140 g (FDC 2710788) + nori 3 g (FDC 2709988) + Tampico sauce ~25 g (FDC 2710176
    // "Fry sauce" - Santiago's ruling 2026-08-22 that "Tampico" is a sauce, treated as a
    // generic average the same way "vinagreta de la casa" uses FDC 2710195 elsewhere in the
    // oracle; no protein is assumed inside it) + avocado 35 g (FDC 2709223, filled) + cream
    // cheese 25 g (FDC 2705760, filled) + cucumber 25 g (FDC 2709784, filled) + shrimp 45 g
    // (FDC 2706449, topped) + salmon 45 g (FDC 2706286 baked/broiled, topped). Totals ~343 g,
    // 24 P / 52 C / 37 F.
    composition: { protein_per_100g: 7.0, carb_per_100g: 15.16, fat_per_100g: 10.79 },
    assumed:
      '"Por dentro: Tampico, aguacate, queso crema y pepino. Por fuera: Camarón y salmón." ' +
      "Rice+nori base per the roll class ruling (2026-08-22). Richest of the seven (4 filled + 2 " +
      "topped items) - same total mass as Nikkori Maki (343 g), which has a comparably rich " +
      "structure (2 filled + 2 topped items + vegetable). At 11 pieces, 31.2 g/piece, 2.18 g " +
      "protein/piece, matching Nikkori Maki's own per-piece mass almost exactly. Approved " +
      "2026-08-22.",
    retrieved_at: "2026-08-22",
  },
  {
    name: "Spicy Tuna Roll",
    menu: "nikkori",
    mass_band_g: [210, 285],
    // Rice 140 g (FDC 2710788) + nori 3 g (FDC 2709988) + Tampico sauce ~30 g (FDC 2710176
    // "Fry sauce" - the menu names ONLY "Tampico" as the interior, no protein stated there,
    // so no protein is assumed inside it per the assumed-ingredient rule) + tuna ~55 g
    // (FDC 2706308, topped, "picado" = chopped) + spicy-sauce glaze ~10 g (FDC 2710176, same
    // generic sauce reused at garnish scale for "salsa spicy") + masago ~8 g (FDC 175132 fish
    // roe, topped). Totals ~246 g, 20 P / 45 C / 24 F - the lightest of the seven because all
    // of the stated protein sits in the topping, none in the filling.
    composition: { protein_per_100g: 8.13, carb_per_100g: 18.29, fat_per_100g: 9.76 },
    assumed:
      '"Por dentro: Tampico. Por fuera: Atún picado con salsa spicy y masago." Rice+nori base per ' +
      "the roll class ruling (2026-08-22). The menu names no protein in the filling - only a " +
      "sauce - so the filling is rice+nori+sauce alone; inventing a hidden protein inside " +
      '"Tampico" would violate the assumed-ingredient rule. At 11 pieces, 22.4 g/piece, 1.82 g ' +
      "protein/piece. Approved 2026-08-22.",
    retrieved_at: "2026-08-22",
  },
  // --- Round 2, Task 4: the 3 pizza exceptions - each leaves the topping-class rule
  // for its own reason, ruled individually (Santiago 2026-08-22). ---
  {
    name: "FLAMENKUCHEN",
    menu: "bistro",
    mass_band_g: [400, 450],
    // FDC 2708682 "White pizza, cheese, with meat and vegetables, thin crust" - a CREAM
    // base, not tomato, so the standard 5-class topping rule does not apply. Bacon = meat,
    // caramelized onion = vegetable, matching this record's own class exactly.
    composition: { protein_per_100g: 12.07, carb_per_100g: 21.06, fat_per_100g: 15.31 },
    assumed:
      '"Base de crema, tocino y cebolla caramelizada." CREAM BASE, not tomato - leaves the ' +
      "standard topping-class rule (Task 2/3) for that reason, same 400-450 g mass band carried " +
      "from CAPRICCIOSA (still a 28 cm Bistro pizza; nothing on the menu suggests a different " +
      "size). Composition is FDC 2708682, the FNDDS white-pizza record for exactly this " +
      "combination (meat + vegetable on a cream base). Approved 2026-08-22.",
    retrieved_at: "2026-08-22",
  },
  {
    name: "QUESO AZUL",
    menu: "bistro",
    mass_band_g: [400, 450],
    // Same FDC 2708682 as FLAMENKUCHEN - cream base, blue cheese, serrano ham (meat),
    // spinach (vegetable). Green apple is a named addition with no dedicated FNDDS
    // fruit-on-pizza record at this venue/crust; treated like HAWAIANA's pineapple -
    // not separately weighed.
    composition: { protein_per_100g: 12.07, carb_per_100g: 21.06, fat_per_100g: 15.31 },
    assumed:
      '"Base de crema, queso azul, espinaca, jamón serrano y laminas de manzana verde." CREAM ' +
      "BASE, not tomato, plus a fruit component - leaves the standard topping-class rule for " +
      "that reason. Same 400-450 g mass band carried from CAPRICCIOSA. Composition is FDC " +
      "2708682 (white pizza, meat+vegetable), same record as FLAMENKUCHEN since both are " +
      "cream-base + meat + vegetable; the apple slices are a named addition whose macro " +
      "contribution at this scale is not separately weighed, the same treatment HAWAIANA's " +
      "pineapple got in the MEAT class. Approved 2026-08-22.",
    retrieved_at: "2026-08-22",
  },
  {
    name: "OSTRICA",
    menu: "bistro",
    mass_band_g: [400, 450],
    // 85% FDC 2708650 (plain MEAT class, base+crust+bacon) blended with 15% FDC 2706355
    // "Oysters, canned" (the standard proxy for "ostión ahumado" - canned smoked oyster
    // is a common Mexican product). No FNDDS pizza-with-seafood record exists at any
    // venue/crust. Dijon mustard (FDC 172234) is a drizzle-scale condiment, not separately
    // weighed. Blend: 0.85*(11.5,30.6,12.4) + 0.15*(7.67,4.25,2.68).
    composition: { protein_per_100g: 10.93, carb_per_100g: 26.65, fat_per_100g: 10.94 },
    assumed:
      '"Ostión ahumado, tocino y mostaza dijón." No cream/tomato base is stated, no vegetable, ' +
      "no cheese named - and no FNDDS pizza-with-seafood record exists at any venue/crust, " +
      "confirmed by search. Composition is an 85:15 blend of FDC 2708650 (plain MEAT class, " +
      "representing crust+base+bacon, the dominant conventional pizza ingredient here) with FDC " +
      "2706355 'Oysters, canned' - the same blend-a-base-with-an-addition technique already used " +
      "for Salmón Roll (FDC 2708963 blended 85:15 with cream cheese). Mustard is a thin condiment " +
      "at drizzle quantities, folded in as a rounding-level addition, not separately weighed - " +
      "same treatment as the rolls' sauce garnishes. Mass band 400-450 g carried from " +
      "CAPRICCIOSA; nothing on the menu suggests a different size. Approved 2026-08-22.",
    retrieved_at: "2026-08-22",
  },
  // --- Round 2, Task 6: the two bistro pastas and three andaluz one-offs. ---
  {
    name: "FRADIAVIOLA",
    menu: "bistro",
    mass_band_g: [340, 460],
    // Decomposed, same method as FETUCCINI ALFREDO/PASTA ESPECIAL: 230 g pasta (FDC
    // 2708357) + 100 g tomato-cream sauce (FDC 2709749 "Vodka sauce with tomatoes and
    // cream" - the FNDDS match for "crema de tomate") + 3 g dried chile de árbol (FDC
    // 168570, "un toque" = a touch, flavor-scale only) + 40 g spinach (FDC 2709614) +
    // 25 g feta (FDC 2705714). Totals 398 g, 20.8 P / 78.6 C / 13.9 F.
    composition: { protein_per_100g: 5.224, carb_per_100g: 19.744, fat_per_100g: 3.487 },
    assumed:
      '"Crema de tomate con un toque de chile de árbol, espinacas y queso feta." Pasta base and ' +
      "decomposed-ingredient method carried from CARBONARA/PASTA ESPECIAL/FETUCCINI ALFREDO, all " +
      "already ruled on this menu. Approved 2026-08-22.",
    retrieved_at: "2026-08-22",
  },
  {
    name: "LINGUINNI PARISIENNE",
    menu: "bistro",
    mass_band_g: [380, 510],
    // Decomposed, same method as FETUCCINI ALFREDO/PASTA ESPECIAL: 230 g pasta (FDC
    // 2708357) + 40 g bell pepper (FDC 2709800) + 40 g mushroom (FDC 2709793) + 35 g
    // deli ham (FDC 2706206) + 100 g cheese sauce (FDC 2705808, the FNDDS match for
    // "salsa cremosa a base de quesos"). Totals 445 g, 23.7 P / 82.1 C / 16.9 F.
    composition: { protein_per_100g: 5.321, carb_per_100g: 18.445, fat_per_100g: 3.793 },
    assumed:
      '"Pimientos, campiñones, jamón en salsa cremosa a base de quesos." Pasta base and ' +
      "decomposed-ingredient method carried from CARBONARA/PASTA ESPECIAL/FETUCCINI ALFREDO, all " +
      "already ruled on this menu. Approved 2026-08-22.",
    retrieved_at: "2026-08-22",
  },
  {
    name: "MEDITERRÁNEA",
    menu: "andaluz",
    mass_band_g: [340, 460],
    // 11 named ingredients, decomposed: 100 g lettuce (FDC 2709789) + 30 g cucumber
    // (FDC 2709784) + 30 g corn (FDC 168540) + 30 g queso fresco (FDC 2705745 - the
    // closest FNDDS match to "queso panela"; no exact panela record exists) + 15 g
    // olives (FDC 169095) + 40 g cherry tomato (FDC 2709719) + 30 g avocado (FDC
    // 2709223) + 30 g mushroom (FDC 2709793) + 30 g asparagus (FDC 168390) + 15 g
    // almonds (FDC 168596) + 30 g olive-oil/balsamic dressing (FDC 2710203, the same
    // Italian-dressing record already used for ENSALADA GRIEGA). Totals 400 g, 13.7 P
    // / 26.2 C / 27.5 F.
    composition: { protein_per_100g: 3.4275, carb_per_100g: 6.56, fat_per_100g: 6.8825 },
    assumed:
      '"Lechuga, pepino, elote, queso panela, aceitunas, tomate cherry, aguacate, champis, ' +
      'espárragos, almendras, aderezada con aceite oliva y balsámico." Full description, all ' +
      "ingredients named directly - the lettuce base is stated in the dish's own text (unlike " +
      "the bistro salads, which the plan pointed to for the lettuce-base convention but which " +
      "were not needed here since MEDITERRÁNEA names its own base). Approved 2026-08-22.",
    retrieved_at: "2026-08-22",
  },
  {
    name: "QUESABONELESS",
    menu: "andaluz",
    mass_band_g: [180, 240],
    // "Dos" = 2 tortillas, a stated count: 80 g flour tortilla (FDC 2707824, 2x40g) +
    // 40 g queso chihuahua (FDC 2705774 - manchego has NO FDC record at any venue,
    // confirmed by search; chihuahua is the closest melting-cheese analog already used
    // elsewhere on this menu) + 90 g breaded fried chicken (FDC 170756, reused from
    // TIRAS DE POLLO, already ruled on this exact menu). "Salsa al gusto" (sauce to
    // taste) is explicitly optional/unspecified and not separately weighed, same
    // treatment as the rolls' negligible garnishes. Totals 210 g, 36.4 P / 47.2 C /
    // 29.5 F.
    composition: { protein_per_100g: 17.314, carb_per_100g: 22.452, fat_per_100g: 14.033 },
    assumed:
      '"Dos tortillas de harina, manchego, boneless con salsa al gusto." "Dos" pins the tortilla ' +
      "count. Approved 2026-08-22.",
    retrieved_at: "2026-08-22",
  },
  {
    name: "CROQUETAS DE ABUELA (8 pints.)",
    menu: "andaluz",
    mass_band_g: [190, 260],
    // "8 pints." (piezas) = 8 pieces, a stated count. FDC 2706508 "Ham croquette" is a
    // direct FNDDS composite match (breaded, fried, creamy filling) - already models
    // ham + bechamel structure. Blended 80:20 with FDC 172395 "Chicken, roasting, meat
    // only, cooked, roasted" to account for the named "pollo". Piece size: Santiago's
    // ruling 2026-08-22, ~28 g/piece (a small Spanish-tapa croqueta, NOT FDC's own
    // published "1 croquette = 62 g" portion for this record - that portion reads as an
    // American diner-style croquette, too large for a dish named "de Abuela" in a
    // Spanish tapas context). 8 x 28 g = 224 g total, 43.4 P / 4.7 C / 40.1 F.
    composition: { protein_per_100g: 19.376, carb_per_100g: 2.08, fat_per_100g: 17.918 },
    assumed:
      '"Empanizadas y rellenas de jamón serrano, pollo y queso, en crema bechamel." "(8 pints.)" ' +
      "pins the piece count; the per-piece mass is Santiago's ruling, not FDC's own published " +
      "portion for this record. Approved 2026-08-22.",
    retrieved_at: "2026-08-22",
  },
];

/**
 * Upsert drafts into whatever the oracle already holds, matched on `name`.
 *
 * ponytail: the JSON is the source of truth for dishes this script has no draft
 * for, and the script is the source of truth for the ones it does. A split brain,
 * accepted deliberately - the alternative is back-filling 12 round-1 dishes whose
 * per-100 g compositions were never committed anywhere machine-readable. Collapse
 * it by back-filling those drafts if this file ever needs to be authoritative.
 */
export function mergeEntries(
  existing: UnweightedEntry[],
  built: UnweightedEntry[],
): UnweightedEntry[] {
  const byName = new Map(built.map((e) => [e.name, e]));
  const merged = existing.map((e) => byName.get(e.name) ?? e);
  const seen = new Set(existing.map((e) => e.name));
  return [...merged, ...built.filter((e) => !seen.has(e.name))];
}

const built: UnweightedEntry[] = DRAFTS.map((d) => ({
  name: d.name,
  menu: d.menu,
  unweighted: true,
  mass_band_g: d.mass_band_g,
  band: deriveBands(d.mass_band_g, d.composition),
  assumed: d.assumed,
  source: "USDA FoodData Central",
  retrieved_at: d.retrieved_at ?? RETRIEVED,
}));

async function main() {
  let existing: UnweightedEntry[] = [];
  try {
    existing = JSON.parse(await Deno.readTextFile(OUT));
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw e;
  }
  const entries = mergeEntries(existing, built);

  // Unchanged from the original: refuse to write anything invalid. It now checks
  // the MERGED set, so a bad round-1 entry surfaces here too.
  const problems = entries.flatMap((e) =>
    validateEntry(e).map((p) => `${e.name}: ${p}`)
  );
  if (problems.length > 0) {
    console.error("REFUSING TO WRITE - invalid entries:");
    for (const p of problems) console.error(`  ${p}`);
    Deno.exit(1);
  }

  await Deno.writeTextFile(OUT, JSON.stringify(entries, null, 2) + "\n");
  console.log(
    `wrote ${entries.length} dishes to ${OUT} ` +
      `(${existing.length} before, ${built.length} drafts applied)\n`,
  );

  console.log(`${entries.length} entries -> ${OUT}\n`);
  console.log(
    `${"dish".padEnd(17)}${"mass g".padStart(12)}${"kcal".padStart(14)}${
      "protein".padStart(11)
    }${"carb".padStart(11)}${"fat".padStart(11)}`,
  );
  const pair = (b: MacroBand) => `${b[0]}-${b[1]}`;
  for (const e of entries) {
    console.log(
      `${e.name.slice(0, 16).padEnd(17)}${pair(e.mass_band_g).padStart(12)}${
        pair(e.band.calories).padStart(14)
      }${pair(e.band.protein_g).padStart(11)}${pair(e.band.carb_g).padStart(11)}${
        pair(e.band.fat_g).padStart(11)
      }`,
    );
  }
  // The score's DENOMINATOR is now whatever is ruled, times 4 fields, times the
  // draw count - it was a fixed 6 dishes until 2026-08-20, when Santiago approved
  // widening the set and dropping COLIFLOR ROKA. A hardcoded target would go stale
  // every time the set grows, and the old one already read "-3 of 6 UNRULED" for a
  // set that had GAINED dishes.
  console.log(
    `\n${entries.length} dishes ruled -> ${
      entries.length * 4
    } points per draw, ` +
      `${entries.length * 4 * 3} over the usual 3 draws.` +
      `\nReport it ALONGSIDE the weighted number, never merged into it.` +
      `\n⚠️ The denominator CHANGED on 2026-08-20 (6 dishes -> ${entries.length}). A score from ` +
      `before that date\nis not comparable to one after it; re-score both arms before quoting a gain.`,
  );
}

if (import.meta.main) await main();
