// $0: shortlist dishes that could JOIN the no-printed-weight oracle.
//
// WHY THIS EXISTS. Six dishes currently stand in for 67% of every real menu item,
// so one dish swinging moves the whole score several points. Santiago approved
// widening the set on 2026-08-20, and approved replacing COLIFLOR ROKA, whose menu
// line is only its name - a dish that is unanswerable rather than badly answered.
//
// WHAT A CANDIDATE HAS TO BE, all four (Santiago, 2026-08-20):
//   1. NO printed weight        - the weighted oracle covers the rest
//   2. DESCRIBED               - the text names its ingredients, or it is the very
//                                thing being excluded. "COLIFLOR ROKA" fails;
//                                "Pepperoni, jamón, tocino y chistorra" passes.
//   3. A DISH THE MODEL CAN KNOW - a recognisable form with a conventional size, so
//                                "average Hawaiian pizza" is answerable where
//                                "Cool House Pizza" is not.
//   4. FOOD                    - drinks are out of scope for macros.
//
// It ONLY shortlists. Every entry still needs USDA records per ingredient and
// Santiago's personal approval, which is the expensive half and cannot be skipped.
//
//   deno run --allow-read scripts/find-unweighted-candidates.ts
import { loadOracle, ORACLE_PATH } from "./bench-macros.ts";

const CACHE = "scripts/fixtures/caches";
const UNWEIGHTED_ORACLE = "scripts/fixtures/unweighted-oracle.json";

// deno-lint-ignore no-explicit-any
type Item = any;

/** A printed weight anywhere in the name or description disqualifies an item. */
const PRINTS_GRAMS = /\d\s*(g|gr|gramos|grs)\b|\(\s*\d+\s*(g|gr)/i;

/**
 * Dish forms with a conventional serving size the model can be expected to know.
 * Deliberately FORM words, never specific menus' wording - a hardcoded item name
 * would not survive the next menu, and production must generalise worldwide.
 */
// Built with RegExp from an array: a regex LITERAL cannot span lines, and a list
// this long on one line is unreadable and unreviewable.
const KNOWN_FORM = new RegExp(
  "\\b(" + [
    "pizza",
    "burger",
    "hamburguesa",
    "sandwich",
    "torta",
    "baguette",
    "taco",
    "quesadilla",
    "burrito",
    "enchilada",
    "roll",
    "maki",
    "nigiri",
    "sashimi",
    "poke",
    "bowl",
    "ramen",
    "pad thai",
    "curry",
    "risotto",
    "pasta",
    "spaghetti",
    "lasagn",
    "fettucc",
    "penne",
    "linguin",
    "gnocchi",
    "ravioli",
    "carbonara",
    "alfredo",
    "pesto",
    "salad",
    "ensalada",
    "caesar",
    "cesar",
    "soup",
    "sopa",
    "crema",
    "steak",
    "arrachera",
    "rib eye",
    "sirloin",
    "salmon",
    "salmón",
    "atún",
    "tuna",
    "shrimp",
    "camarón",
    "camarones",
    "pollo",
    "chicken",
    "wings",
    "alitas",
    "boneless",
    "fries",
    "papas",
    "nuggets",
    "omelette",
    "huevos",
    "pancake",
    "waffle",
    "cheesecake",
    "brownie",
    "flan",
    "tiramisu",
    "helado",
    "nieve",
  ].join("|") + ")\\b",
  "i",
);

/** Words that mark a description as naming FOOD rather than selling it. */
const INGREDIENT_HINT = new RegExp(
  "\\b(" + [
    "con",
    "and",
    "with",
    "salsa",
    "sauce",
    "queso",
    "cheese",
    "crema",
    "cream",
    "tomate",
    "tomato",
    "cebolla",
    "onion",
    "aguacate",
    "avocado",
    "lechuga",
    "lettuce",
    "arroz",
    "rice",
    "pan",
    "bread",
    "tortilla",
    "frijol",
    "bean",
    "papa",
    "potato",
    "pepino",
    "cucumber",
    "tocino",
    "bacon",
    "jamón",
    "ham",
    "pepperoni",
    "champiñon",
    "mushroom",
    "espinaca",
    "spinach",
    "pimiento",
    "pepper",
    "mayonesa",
    "mayo",
    "aderezo",
    "dressing",
    "vinagreta",
    "mantequilla",
    "butter",
    "ajo",
    "garlic",
    "chile",
    "chipotle",
    "parmesano",
    "parmesan",
    "mozzarella",
    "surimi",
    "kanikama",
    "empanizado",
    "capeado",
    "frito",
    "asado",
    "plancha",
    "horneado",
    "gratinado",
  ].join("|") + ")\\b",
  "i",
);

const clean = (s: string) => (s ?? "").replace(/\s+/g, " ").trim();

/** How much ingredient evidence does this text carry? Higher is better. */
function evidence(desc: string): { score: number; why: string } {
  const d = clean(desc);
  if (!d) return { score: 0, why: "no description at all" };
  const parts = d.split(/,| y | and /i).filter((p) => p.trim().length > 2);
  const hits = (d.match(INGREDIENT_HINT) ?? []).length;
  if (parts.length < 2 && !INGREDIENT_HINT.test(d)) {
    return { score: 1, why: "prose, names no ingredients" };
  }
  // Each separated element is a probable ingredient; the hint words confirm the
  // text is describing food rather than listing sizes or prices.
  return { score: parts.length + hits, why: `${parts.length} elements` };
}

// ---------------------------------------------------------------- gather menus
const menus = new Map<string, Item[]>();
for await (const f of Deno.readDir(CACHE)) {
  if (!f.name.endsWith(".raw.json")) continue;
  const menu = f.name.split(".")[0];
  if (["mixed", "unweighted", "macro-bench", "pipeline"].includes(menu)) {
    continue;
  }
  let parsed: Item;
  try {
    parsed = JSON.parse(await Deno.readTextFile(`${CACHE}/${f.name}`));
  } catch {
    continue;
  }
  // Extraction archives are raw model responses; enrichment archives carry .items.
  let items: Item[] | null = parsed?.items ?? null;
  if (!items && parsed?.choices) {
    try {
      items = JSON.parse(parsed.choices[0].message.content).items;
    } catch {
      items = null;
    }
  }
  if (!items?.length) continue;
  if (!menus.has(menu) || items.length > menus.get(menu)!.length) {
    menus.set(menu, items);
  }
}

// Dishes already spoken for, in EITHER oracle - a dish cannot be in both.
const taken = new Set<string>();
for (const e of loadOracle(ORACLE_PATH)) taken.add(e.name);
for (
  const e of JSON.parse(await Deno.readTextFile(UNWEIGHTED_ORACLE)) as Item[]
) {
  taken.add(e.name);
}

// -------------------------------------------------------------------- shortlist
interface Cand {
  menu: string;
  name: string;
  desc: string;
  cat: string;
  score: number;
  why: string;
}
const cands: Cand[] = [];
for (const [menu, items] of menus) {
  for (const it of items) {
    const name = clean(it.name);
    const desc = clean(it.description);
    if (!name || taken.has(it.name)) continue;
    if (!["food", "side", "dessert"].includes(it.category)) continue;
    if (PRINTS_GRAMS.test(`${name} ${desc}`)) continue;
    if (!KNOWN_FORM.test(name)) continue;
    const { score, why } = evidence(desc);
    if (score < 3) continue; // not enough ingredient evidence to be answerable
    cands.push({ menu, name, desc, cat: it.category, score, why });
  }
}

cands.sort((a, b) => b.score - a.score || a.menu.localeCompare(b.menu));

console.log(
  `${cands.length} candidates from ${menus.size} menus.\n` +
    `Filters: no printed weight, a known dish form, and a description naming\n` +
    `at least 3 ingredient elements. Already-used dishes excluded.\n`,
);

// Grouped by menu, because generalisation lives in the DIVERSITY of the menus
// rather than in the count of dishes.
const byMenu = new Map<string, Cand[]>();
for (const c of cands) {
  byMenu.set(c.menu, [...(byMenu.get(c.menu) ?? []), c]);
}
for (const [menu, list] of [...byMenu].sort()) {
  console.log(`\n=== ${menu} (${list.length})`);
  for (const c of list.slice(0, 6)) {
    console.log(`  [${String(c.score).padStart(2)}] ${c.name}`);
    console.log(`       ${c.cat} · "${c.desc.slice(0, 96)}"`);
  }
}

// A like-for-like replacement keeps the set's shape: COLIFLOR ROKA is a SIDE on
// andaluz, so swapping in another andaluz side changes one dish and nothing else.
const swap = cands.filter((c) => c.menu === "andaluz" && c.cat === "side");
console.log(
  `\n\nTo REPLACE COLIFLOR ROKA (a side on andaluz), like-for-like options:`,
);
if (swap.length === 0) {
  console.log(
    `  none - andaluz has no other DESCRIBED side. A replacement therefore has to\n` +
      `  come from another menu or another category, which changes the set's shape;\n` +
      `  Santiago's call.`,
  );
} else {
  for (const c of swap) {
    console.log(`  [${c.score}] ${c.name} — "${c.desc.slice(0, 80)}"`);
  }
}

console.log(
  `\n⚠️ A shortlist, not a decision. Each dish still needs a USDA record per\n` +
    `ingredient, a mass band, and Santiago's approval before it can score anything.`,
);
