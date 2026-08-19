// Writes the unweighted oracle from Santiago's APPROVED mass bands and the USDA
// records those bands were read off. Bands are computed by deriveBands, never by
// hand, so calories stay Atwater-consistent with the three macros at BOTH
// endpoints and nobody has to trust an agent's arithmetic.
//
// Mass bands approved by Santiago 2026-08-12. Compositions are per 100 g exactly
// as published by FDC, fetched with scripts/unweighted-portions.ts.
//
//   deno run --allow-write --allow-read scripts/unweighted-oracle-build.ts
import { deriveBands, type UnweightedEntry, validateEntry } from "./unweighted-oracle.ts";
import type { MacroBand } from "./macro-band-score.ts";

const OUT = "scripts/fixtures/unweighted-oracle.json";
const RETRIEVED = "2026-08-12";

interface Draft {
  name: string;
  menu: string;
  mass_band_g: MacroBand;
  composition: { protein_per_100g: number; carb_per_100g: number; fat_per_100g: number };
  assumed: string;
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
      'Area-scaling USDA\'s 14" meat-and-vegetable records (FDC 172055 at 1168 g/pie, FDC 172049 ' +
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
      "Superseded compositions, in order: CHEESE-ONLY 14\" (wrong topping class), chain regular " +
      "crust (wrong crust), thin crust from frozen (wrong venue).",
  },
  {
    name: "CARBONARA",
    menu: "bistro",
    mass_band_g: [250, 450],
    // FDC 2708861 - the WITH MEAT record. See the re-source note below.
    composition: { protein_per_100g: 5.67, carb_per_100g: 15.4, fat_per_100g: 14.1 },
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
    composition: { protein_per_100g: 2.22, carb_per_100g: 6.12, fat_per_100g: 6.56 },
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
    composition: { protein_per_100g: 15.68, carb_per_100g: 19.82, fat_per_100g: 13.32 },
    assumed:
      "No printed weight, and the menu says 'Acompañadas de papas fritas', so the plate is strips " +
      "PLUS fries. Low endpoint 234 g = FDC 170756 breast without skin (142 g) + fries (92 g); " +
      "high endpoint 333 g = FDC 170756 breast with skin and breading (203 g) + fries (130 g). " +
      "Chicken:fries is 61:39 at both endpoints, and the composition is blended at that ratio. " +
      "Fries composition is FDC 2709461 'Potato, french fries, fast food' - the PLAIN record. " +
      "The candidate list's FDC 2709469 is 'french fries WITH CHEESE', which this menu does not " +
      "print; that substitution is the only change made to an approved input.",
  },
  {
    name: "COLIFLOR ROKA",
    menu: "andaluz",
    mass_band_g: [85, 120],
    // 90% FDC 2710042 + 10% FDC 2710195.
    composition: { protein_per_100g: 3.75, carb_per_100g: 20.3, fat_per_100g: 16.06 },
    assumed:
      "No printed weight and an EMPTY description. What the dish is comes from the menu photo: " +
      "Andaluz defines 'Roka' on the same page - CAMARÓN ROKA is 'capeado y bañado en nuestro " +
      "aderezo roka a base de chipotle' - so this is battered, fried and sauced cauliflower, not " +
      "a plain vegetable side. Low endpoint 85 g = FDC 2710042 'Fried cauliflower', its largest " +
      "published portion. High endpoint 120 g adds the aderezo it is bathed in. Composition is " +
      "FDC 2710042 blended 90:10 with FDC 2710195 dressing. " +
      "⚠️ PRICE WAS NOT USED. An earlier draft proposed 150-300 g by price parity with a 200 g " +
      "dish on the same menu; Santiago ruled that out on 2026-08-12 - price reflects margin and " +
      "scarcity, never mass - and ruled 85 g sound. Never reintroduce a price argument here. " +
      "⚠️ IT IS NOT THE GUARD IT WAS BUILT AS. A draft of this entry claimed the pipeline 'already " +
      "says 85 g, so this passes today'. It scores 0/4. Mass is not scored - the four MACROS are - " +
      "and the pipeline returns 25 kcal, 2 g protein, 4 g carb and 0 g FAT, which is plain raw " +
      "cauliflower. With an empty description it never learns the dish is battered, fried and " +
      "sauced, because 'Roka' is only defined on ANOTHER LINE of the same menu (CAMARÓN ROKA, " +
      "'capeado y bañado'). A right-looking mass with a raw-vegetable composition is the failure " +
      "mode this dish now documents. 0 g fat on a fried dish is the clearest single defect in the set.",
  },
  {
    name: "Salmón Roll",
    menu: "nikkori",
    mass_band_g: [300, 400],
    // 85% FDC 2708963 + 15% FDC 2705760.
    composition: { protein_per_100g: 6.72, carb_per_100g: 13.69, fat_per_100g: 6.11 },
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
];

const entries: UnweightedEntry[] = DRAFTS.map((d) => ({
  name: d.name,
  menu: d.menu,
  unweighted: true,
  mass_band_g: d.mass_band_g,
  band: deriveBands(d.mass_band_g, d.composition),
  assumed: d.assumed,
  source: "USDA FoodData Central",
  retrieved_at: RETRIEVED,
}));

const problems = entries.flatMap((e) =>
  validateEntry(e).map((p) => `${e.name}: ${p}`)
);
if (problems.length > 0) {
  console.error("REFUSING TO WRITE - invalid entries:");
  for (const p of problems) console.error(`  ${p}`);
  Deno.exit(1);
}

await Deno.writeTextFile(OUT, JSON.stringify(entries, null, 2) + "\n");

console.log(`${entries.length} entries -> ${OUT}\n`);
console.log(
  `${"dish".padEnd(17)}${"mass g".padStart(12)}${"kcal".padStart(14)}${"protein".padStart(11)}${
    "carb".padStart(11)
  }${"fat".padStart(11)}`,
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
const DESIGN_DISHES = 6;
console.log(
  entries.length === DESIGN_DISHES
    ? `\nAll ${DESIGN_DISHES} design dishes are ruled. Full score: ${entries.length * 4} points.` +
      `\nReport it ALONGSIDE the 96-point weighted number, never merged into it.`
    : `\n${DESIGN_DISHES - entries.length} of ${DESIGN_DISHES} design dishes are UNRULED and absent.` +
      `\nSo this scores ${entries.length * 4} points, not ${DESIGN_DISHES * 4}. Never report it as ` +
      `the full unweighted score.`,
);
