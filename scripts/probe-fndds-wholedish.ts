// $0 SANITY CHECK: could FNDDS's published whole-dish portions replace FORM_G?
//
// ⚠️ THIS IS NOT THE SHAPE EVAL 179 REJECTED. That one DECOMPOSED a dish into
// ingredients and looked each one up, and both its arms lost to FORM. This looks up
// the DISH ITSELF - the shape Menu-Match (WACV 2015) supports and the one FORM
// already implements, just with 24 handwritten rows instead of thousands of
// published ones. Decomposition failing says nothing about it.
//
// ⚠️ NEVER IN THE SCAN PATH. 1,000 req/hour PER IP; a cold scan is ~304 calls.
// Offline probing only - production would ship the CC0 bulk download.
import type { Portion } from "./fndds-resolve.ts";

export type PortionKind = "serving" | "volume" | "piece" | "weight";

// Order matters: "1 medium pizza" must read as a serving before "piece" gets a
// chance at it, and "1 fl oz" must read as volume before "oz" makes it a weight.
const PATTERNS: [PortionKind, RegExp][] = [
  ["serving", /\b(servings?|order|plate|meal|entree|sandwich|burrito|taco|pizza|roll|bowl|burger|wrap)\b/],
  ["volume", /\b(cup|tablespoon|tbsp|teaspoon|tsp|fl\.? ?oz|fluid ounce|pint|quart|liter|litre|ml)\b/],
  ["piece", /\b(piece|pieces|slice|slices|pc|each|item|unit|link|patty|leaf|clove|fillet|filet|breast|wing)\b/],
];

/** What KIND of thing a published portion string measures. */
export function classifyPortion(desc: string): PortionKind {
  const d = desc.toLowerCase();
  for (const [kind, re] of PATTERNS) if (re.test(d)) return kind;
  return "weight";
}

export interface ServingPortion {
  desc: string;
  kind: PortionKind;
  gramsPerUnit: number;
}

/**
 * The best serving-level portion a record publishes, or null if it publishes none.
 *
 * A leading count is divided back out - "2 servings, 600 g" is 300 g per serving -
 * the same rule `gramsPerUnit` in fndds-resolve.ts already applies.
 */
export function bestServingPortion(portions: Portion[]): ServingPortion | null {
  for (const p of portions) {
    if (classifyPortion(p.desc) !== "serving") continue;
    const lead = p.desc.trim().match(/^(\d+(?:\.\d+)?)/);
    const count = lead ? parseFloat(lead[1]) : 1;
    if (count > 0) {
      return { desc: p.desc, kind: "serving", gramsPerUnit: p.grams / count };
    }
  }
  return null;
}

import {
  food,
  loadCache,
  preferStandalone,
  saveCache,
  shortlist,
} from "./fndds-resolve.ts";
import { itemsFromArchiveFile } from "./bench-pipeline.ts";

interface OracleEntry {
  name: string;
  menu: string;
  mass_band_g: [number, number];
}

// Task 4: the 82 off-corpus dishes are `sim-form-coverage-split.ts`'s own UNSEEN
// menus, restricted to items that script counts as candidates (not a drink, no
// printed weight) with no FORM_G row (dish_form "other"). Duplicated here rather
// than imported because that script has no `import.meta.main` guard - importing
// it would run its whole report as a side effect.
const UNSEEN_MENUS: Record<string, string> = {
  brasero: "brasero.eval117-r1.raw.json",
  "casa-nostra": "casa-nostra.eval117-r1.raw.json",
  "guest-house": "guest-house.eval117-r1.raw.json",
  mochomos: "mochomos.eval117-r1.raw.json",
  polloteria: "polloteria.eval117-r1.raw.json",
};
const PRINTED_WEIGHT = /\d+\s*(g|gr|gramos|grs)\b\.?/i;

function labelsForMenu(menu: string): Map<string, string> {
  const out = new Map<string, string>();
  for (let b = 0;; b++) {
    let raw: string;
    try {
      raw = Deno.readTextFileSync(
        `scripts/fixtures/caches/formcoverage.${menu}-b${b}.raw.json`,
      );
    } catch {
      return out;
    }
    const content = JSON.parse(raw).choices[0].message.content;
    for (const it of JSON.parse(content).items) {
      if (it?.name && it?.dish_form) out.set(it.name, it.dish_form);
    }
  }
}

function offCorpusEntries(): OracleEntry[] {
  const out: OracleEntry[] = [];
  for (const [menu, file] of Object.entries(UNSEEN_MENUS)) {
    const labels = labelsForMenu(menu);
    for (const it of itemsFromArchiveFile(file)) {
      if (it.category === "drink") continue;
      if (PRINTED_WEIGHT.test(it.name ?? "") || PRINTED_WEIGHT.test(it.description ?? "")) {
        continue;
      }
      if ((labels.get(it.name) ?? "other") !== "other") continue;
      out.push({ name: it.name, menu, mass_band_g: [0, 0] });
    }
  }
  return out;
}

// Search terms for the 82 off-corpus dishes, written blind from name + description
// only, same discipline as scripts/fixtures/fndds-dish-terms.json (Task 2). A
// non-trivial fraction are steak-enhancement add-ons, sauces, or bare flavor names
// (a wing-sauce menu, a smoothie-flavor list) with no independent "whole dish"
// serving to look up - those are marked "" rather than guessed at, per the same
// rule Task 2 uses. That is itself a reportable finding about this candidate set.
const OFFCORPUS_TERMS: Record<string, string> = JSON.parse(`\
{
  "TARTAR DE ATÚN": "tuna tartare",
  "COASTAL OYSTERS (6) DF, GF": "oysters raw",
  "SHRIMP COCKTAIL DF, GF": "shrimp cocktail",
  "HAMACHI CRUDO* DF, GF": "yellowtail raw",
  "HALF MAINE LOBSTER TAIL": "lobster tail",
  "TAYLOR BAY SCALLOP CEVICHE": "scallop ceviche",
  "CRAB CAKE": "crab cake",
  "CHARRED MOROCCAN BEET v": "beet salad",
  "SEAFOOD PLATEAU*": "",
  "PRIME TOMAHAWK* GF, DF": "tomahawk steak",
  "40-DAY DRY AGED BONE-IN RIBEYE* 20 OZ GF": "ribeye steak",
  "PARMESAN-CRUSTED FILET* 7 OZ / 10 OZ": "beef filet",
  "BUTCHER'S CUT* GF": "beef steak",
  "MISHIMA RESERVE WAGYU NEW YORK* GF": "new york strip steak",
  "FOIE GRAS": "",
  "KING CRAB": "",
  "FRESH SHAVED TRUFFLES (5c)": "",
  "BUTTERED LUMP CRAB": "",
  "BLACK TRUFFLE BUTTER": "",
  "MEXICAN WHITE SHRIMP": "",
  "HALF LOBSTER TAIL": "",
  "OSETRA CAVIAR (3c)": "",
  "CHIMICHURRI": "",
  "BEARNAISE": "",
  "HORSERADISH CRÈME": "",
  "GH STEAK SAUCE": "",
  "BRAISED SHORT-RIB GF": "braised short rib",
  "ORGANIC CHICKEN A LA RAJ": "roast chicken",
  "FAROE ISLAND SALMON GF": "salmon",
  "NEEV'S CAULIFLOWER": "cauliflower",
  "FREE RANGE DUROC PORK CHOP GF": "pork chop",
  "AUSTRALIAN LAMB CHOPS": "lamb chops",
  "CHARRED BRUSSELS V, GF": "brussels sprouts",
  "GH MAC | N | CHEESE": "mac and cheese",
  "MISO MUSHROOMS": "miso mushroom",
  "SWEET CORN PLODING V": "corn pudding",
  "GRILLED BROCCOLINI": "broccolini",
  "YUKON POTATO PUREE V": "mashed potato",
  "ROASTED ASPARAGUS": "asparagus",
  "TOSTADAS PUESTAS DE ATÚN": "tostada tuna",
  "TOSTADAS DE ATÚN": "tostada tuna",
  "TOSTADAS DE MARISCOS": "tostada seafood",
  "TOSTADAS DE ATÚN AL AJONJOLÍ": "tostada tuna",
  "TORRE DE BETABEL": "beet salad",
  "COLIFLOR ALMENDRADA": "cauliflower",
  "CARPACCIO DE BETABEL": "beet salad",
  "CEVICHE VEGANO": "vegetable ceviche",
  "COLIFLOR CHIGUILI": "cauliflower",
  "CARPACCIO DE CALABAZA": "squash salad",
  "CARPACCIO DE PORTOBELLO": "mushroom salad",
  "Agridulce Oriental": "",
  "BBQ": "",
  "BBQ Chipotle": "",
  "Kukla": "",
  "Leve": "",
  "Spicy Garlic": "",
  "Buffalo": "",
  "Mango-Habanero": "",
  "Hot": "",
  "Bomba": "",
  "BUFFALO CHEESE (4oz)": "",
  "Sampler (3pz)": "hamburger",
  "Lemon Pepper": "",
  "Ajo-Parmesano": "",
  "Parmesano": "",
  "Ranch": "",
  "De La Casa": "",
  "Blue Cheese": "",
  "Chipotle": "",
  "Cilantro": "",
  "Ranch Habanero": "",
  "Ranch Buffalo": "",
  "Ranch Sriracha": "",
  "Uva": "",
  "Piña": "",
  "Melón": "",
  "Limón": "",
  "Tamarindo": "",
  "Fresa": "",
  "Yoghurt con Cajeta": "",
  "Combinada Fresa-Vainilla/Yogurt": ""
}`);

if (import.meta.main) {
  await loadCache();
  const offCorpus = Deno.args.includes("--offcorpus");
  const oracle: OracleEntry[] = offCorpus
    ? offCorpusEntries()
    : JSON.parse(await Deno.readTextFile("scripts/fixtures/unweighted-oracle.json"));
  const terms: Record<string, string> = offCorpus
    ? OFFCORPUS_TERMS
    : JSON.parse(await Deno.readTextFile("scripts/fixtures/fndds-dish-terms.json"));

  const rows: Record<string, unknown>[] = [];
  for (const e of oracle) {
    const term = (terms[e.name] ?? "").trim();
    if (!term) {
      rows.push({ dish: e.name, term: null, outcome: "NO_TERM" });
      continue;
    }
    // Up to 5 candidates, standalone records preferred - constraint 4 in
    // fndds-resolve.ts: "as ingredient" records carry the worse portion table.
    const ids = await shortlist(term, 5);
    const recs = preferStandalone(
      (await Promise.all(ids.map((id) => food(id))))
        .filter((r): r is NonNullable<typeof r> => r !== null),
    );
    if (recs.length === 0) {
      rows.push({ dish: e.name, term, outcome: "NO_RECORD" });
      continue;
    }
    const head = recs[0];
    const serving = bestServingPortion(head.portions);
    const [lo, hi] = e.mass_band_g;
    rows.push({
      dish: e.name,
      term,
      fdcId: head.fdcId,
      record: head.desc,
      dataType: head.dataType,
      // EVERY published portion, not just the chosen one. The DISTRIBUTION of
      // portion kinds is the finding; a single number would hide it.
      portions: head.portions.map((p) => ({
        desc: p.desc,
        grams: p.grams,
        kind: classifyPortion(p.desc),
      })),
      serving_g: serving?.gramsPerUnit ?? null,
      serving_desc: serving?.desc ?? null,
      band: [lo, hi],
      outcome: !serving
        ? "VOLUME_ONLY"
        : serving.gramsPerUnit >= lo && serving.gramsPerUnit <= hi
        ? "IN_BAND"
        : serving.gramsPerUnit < lo
        ? "UNDER"
        : "OVER",
    });
    console.error(`  ${e.name} -> ${head.desc}`);
  }
  await saveCache();

  const tally: Record<string, number> = {};
  for (const r of rows) tally[String(r.outcome)] = (tally[String(r.outcome)] ?? 0) + 1;

  console.log("\n=== FNDDS WHOLE-DISH SANITY CHECK ===");
  console.log(`${oracle.length} oracle dishes\n`);
  console.log("A. COVERAGE — did we get a record at all?");
  console.log(`   no search term written : ${tally.NO_TERM ?? 0}`);
  console.log(`   no record found        : ${tally.NO_RECORD ?? 0}`);
  const withRec = oracle.length - (tally.NO_TERM ?? 0) - (tally.NO_RECORD ?? 0);
  console.log(`   record found           : ${withRec}`);

  console.log("\nB. UNITS — does it publish a SERVING, or only volume measures?");
  console.log(`   volume/piece only      : ${tally.VOLUME_ONLY ?? 0}`);
  const withServing = withRec - (tally.VOLUME_ONLY ?? 0);
  console.log(`   serving-level portion  : ${withServing}`);
  console.log("   🔑 If this line is small, the idea inherits eval 179's unit problem.");

  if (offCorpus) {
    console.log("\nC. ACCURACY — NOT MEASURABLE off-corpus: these dishes have no ruled band.");
    console.log("   Report coverage and units only. Do not invent a band to score against.");
  } else {
    console.log("\nC. ACCURACY — of those, how many land in the ruled mass band?");
    console.log(`   IN BAND                : ${tally.IN_BAND ?? 0}`);
    console.log(`   under                  : ${tally.UNDER ?? 0}`);
    console.log(`   over                   : ${tally.OVER ?? 0}`);
    console.log(
      `\n   FNDDS in-band rate     : ${tally.IN_BAND ?? 0}/${withServing}` +
        ` of dishes it can size`,
    );
    console.log("   COMPARE: FORM_G is 48/57. Re-derive with sim-form-table.ts.");
  }

  await Deno.writeTextFile(
    "scripts/fixtures/fndds-wholedish-report.json",
    JSON.stringify(rows, null, 2) + "\n",
  );
  console.log("\nwrote scripts/fixtures/fndds-wholedish-report.json");
}
