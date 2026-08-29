// ARMS RECIPE-H and RECIPE-M — Santiago's idea, eval 179.
//
// THE MECHANISM. Ask the model for the dish's RECIPE in the units a recipe is
// actually written in - "3 tortillas, 1 cup beans, 1 tbsp oil" - then convert each
// line to grams from FNDDS's PUBLISHED portion table. The plate total is the SUM of
// sourced weights, never a number anyone guessed.
//
// WHY IT SHOULD WORK, AND WHAT IT REPLACES. `FORM_G` looks up ONE weight for a WHOLE
// dish from 18 hardcoded rows, so it covers 33% of dishes on menus it was not built
// from and can say nothing about a plate of corn, meat and mashed potatoes. A recipe
// decomposes the plate, and FNDDS publishes a portion for each component - chilaquiles
// 170 g/cup (2708505), mashed potato from restaurant 250 g/cup (2709500), pozole
// 245 g/cup (2707129). Same architecture (we supply the grams), thousands of forms
// instead of eighteen.
//
// WHY THE UNITS MATTER, WHICH IS THE PART THAT IS EASY TO MISS. Over 561 archived
// ingredient answers, 59% of the model's grams are metric-round and they come from a
// vocabulary of just 16 distinct numbers, five of which cover 79%. "80 g of chicken"
// is not an estimate, it is a snap to the nearest grid point. A household measure
// routes around that grid because the conversion happens in FNDDS at food-specific
// density. That is the difference between the two arms below.
//
// ⚠️ THE PRIOR THIS ARM MUST CLEAR. Four arms have died asking the model for grams
// (Arm A 36/108, MASSCALL 50/108, the eval-175 probe, a fitted calibration at
// 223/684). RECIPE-H does not ask for a gram at all. RECIPE-M does, for awkward
// ingredients, and exists precisely so we can measure whether that leak costs anything
// rather than assuming it either way.
//
// Control: FORM (434-453 over 5 runs, mean 442.4) and dual (352, 357).

import {
  ENRICH_MODEL,
  ENRICH_PROMPT,
  ENRICH_SCHEMA_OPENAI,
  enrichBatch,
  type EnrichedItem,
  type ExtractedItem,
  sumIngredientMacros,
} from "../supabase/functions/analyze-menu/enrich.ts";
import {
  food,
  loadCache,
  resolveLine,
  saveCache,
  shortlist,
  UNIT_ENUM,
  type Unit,
} from "./fndds-resolve.ts";
import { retryOnce } from "./probe-plate-arms.ts";

/** The recipe ask, replacing the reference-serving sentence the shipped prompt uses. */
const RECIPE_ASK =
  ' For each ingredient give "amount" and "unit": the quantity of that ingredient in a' +
  " standard recipe for one order of this dish, written the way a recipe writes it -" +
  " 3 pieces, 1 cup, 2 tablespoons. Recall the conventional recipe for this dish rather" +
  " than judging by eye how much is on a plate. Give the amount for the whole order as" +
  " it is served, not for one bite and not for a standalone serving of that ingredient." +
  ' Write every ingredient "name" in ENGLISH, using the plain everyday word for the' +
  " food, whatever language the menu is in.";
// ^ Not cosmetic. The fixtures are Spanish menus and the reference database is
// English-only, so a Spanish ingredient name is unresolvable: the smoke test's
// "jamón serrano" matched "Peppers, serrano, raw". Since the product must work on
// menus worldwide, translating at the naming step is the mechanism, not a fixture fix.

const GRAM_ESCAPE =
  ' Use "gram" as the unit only when no household measure fits that ingredient.';

/**
 * Swap the per-ingredient gram field for amount + unit.
 *
 * Field ORDER matters: strict mode emits in schema order, and the phase's own record
 * is that a required schema field is 6 for 8 where a prompt sentence is 0 for 5. The
 * pair goes exactly where `typical_serving_g` was so the model prices the ingredient
 * at the same point in its reasoning.
 *
 * `typical_serving_g` is REMOVED, not left alongside. S4's second gram field came back
 * identical to the first in 364 of 364 ingredients: a required field whose meaning
 * overlaps an existing one returns a copy.
 */
function recipeSchema(allowGrams: boolean) {
  // deno-lint-ignore no-explicit-any
  const schema: any = structuredClone(ENRICH_SCHEMA_OPENAI);
  const ing = schema.properties.items.items.properties.ingredients.items;
  const units = allowGrams ? [...UNIT_ENUM, "gram"] : [...UNIT_ENUM];

  const rebuilt: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ing.properties)) {
    if (k === "typical_serving_g") {
      rebuilt.amount = { type: "number" };
      rebuilt.unit = { type: "string", enum: units };
      continue;
    }
    rebuilt[k] = v;
  }
  ing.properties = rebuilt;
  ing.required = (ing.required as string[])
    .filter((r) => r !== "typical_serving_g")
    .concat(["amount", "unit"]);
  return schema;
}

export const ARM_RECIPE_H = {
  prompt: ENRICH_PROMPT + RECIPE_ASK,
  schema: recipeSchema(false),
  allowGrams: false,
};
export const ARM_RECIPE_M = {
  prompt: ENRICH_PROMPT + RECIPE_ASK + GRAM_ESCAPE,
  schema: recipeSchema(true),
  allowGrams: true,
};

// A wrong-way-round schema would silently score as the other arm.
if (JSON.stringify(ARM_RECIPE_H.schema).includes('"gram"')) {
  throw new Error("RECIPE-H must NOT offer a gram unit - it does");
}
if (!JSON.stringify(ARM_RECIPE_M.schema).includes('"gram"')) {
  throw new Error("RECIPE-M must offer a gram unit - it does not");
}

/** One shortlist entry as the picker sees it. */
interface Candidate {
  fdcId: number;
  desc: string;
}

/**
 * THE PICKER — the +9 points the probe measured. Taking the search engine's top hit
 * resolves 80.5% of ingredients to the right record; letting the model choose from
 * five resolves 89.6%. It is one extra call for every distinct ingredient name in a
 * batch, and it never sees a gram, only names.
 */
export async function pickRecords(
  names: string[],
  apiKey: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  const lists = new Map<string, Candidate[]>();
  for (const n of names) {
    let ids: number[] = [];
    try {
      ids = await shortlist(n, 5);
    } catch {
      continue; // a search that will not resolve is a missing candidate, not a crash
    }
    if (!ids.length) continue;
    const recs = (await Promise.all(ids.map(food))).filter((r) => r !== null);
    if (!recs.length) continue;
    lists.set(n, recs.map((r) => ({ fdcId: r!.fdcId, desc: r!.desc })));
  }
  if (!lists.size) return out;

  const menu = [...lists.entries()].map(([n, c]) =>
    `${n}\n${c.map((x) => `  ${x.fdcId}: ${x.desc}`).join("\n")}`
  ).join("\n\n");

  const body = {
    model: ENRICH_MODEL,
    messages: [
      {
        role: "system",
        content:
          "For each ingredient, choose the food-database record that best matches it." +
          " Answer with the record's numeric id. Choose the plainest record that fits" +
          " the ingredient as it is used in a restaurant dish. If none fits, choose the" +
          " closest one anyway.",
      },
      { role: "user", content: menu },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "picks",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["picks"],
          properties: {
            picks: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["ingredient", "fdcId"],
                properties: {
                  ingredient: { type: "string" },
                  fdcId: { type: "number" },
                },
              },
            },
          },
        },
      },
    },
  };

  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    // A picker failure must NOT lose the run - fall back to the shortlist head, which
    // is the 80.5% path rather than nothing.
    console.warn(`  picker HTTP ${r.status}; falling back to top hit`);
    for (const [n, c] of lists) out.set(n, c[0].fdcId);
    return out;
  }
  const json = await r.json();
  try {
    const parsed = JSON.parse(json.choices[0].message.content);
    for (const p of parsed.picks ?? []) {
      if (typeof p.ingredient === "string" && typeof p.fdcId === "number") {
        out.set(p.ingredient, p.fdcId);
      }
    }
  } catch {
    console.warn("  picker returned unparseable content; falling back to top hit");
  }
  for (const [n, c] of lists) if (!out.has(n)) out.set(n, c[0].fdcId);
  return out;
}

/**
 * Coverage floor. A dish whose recipe mostly failed to resolve is NOT evidence about
 * the recipe idea, so it reverts to the answer it already had rather than polluting
 * the arm's score with a plate that is mostly model guesswork wearing a recipe label.
 * Santiago's ruling, 2026-08-23. Sweepable at $0 afterwards from the archive.
 */
export const COVERAGE_FLOOR = 0.7;

export interface RecipeStats {
  lines: number;
  resolved: number;
  viaPortion: number;
  viaModelGrams: number;
  dishesKept: number;
  lostBody: number;
  dishesReverted: number;
}

async function runRecipeArm(
  items: ExtractedItem[],
  apiKey: string,
  arm: { prompt: string; schema: unknown; allowGrams: boolean },
  stats: RecipeStats,
): Promise<EnrichedItem[]> {
  await loadCache();
  // retryOnce, exactly like every other arm that calls enrichBatch directly. Omitting
  // it lost most of a paid RECIPE-M run to a single transient 120 s model timeout -
  // and probe-plate-arms.ts's own comment warns that applying this to one arm and not
  // its siblings is the recurring mistake here.
  const got = await retryOnce(() =>
    enrichBatch(
      items,
      apiKey,
      undefined,
      undefined,
      arm.prompt,
      arm.schema,
      "system",
    )
  );

  // deno-lint-ignore no-explicit-any
  const anyGot = got as any[];

  // ARCHIVE THE PAID BYTES BEFORE ANY RESOLUTION TOUCHES THEM.
  // bench-unweighted.ts writes its archive only AFTER the arm returns, so the first
  // run of this arm crashed in resolution and threw away model output that had
  // already been bought. Beyond crash safety this makes the resolver FREE TO CHANGE:
  // the model answer is the expensive half, and re-resolving it costs nothing.
  try {
    await Deno.mkdir("scripts/fixtures/caches", { recursive: true });
    await Deno.writeTextFile(
      `scripts/fixtures/caches/recipe-raw.${arm.allowGrams ? "M" : "H"}.jsonl`,
      JSON.stringify({ at: new Date().toISOString(), items: anyGot }) + "\n",
      { append: true },
    );
  } catch { /* a failed backup must not lose the run either */ }
  const names = [
    ...new Set(
      anyGot.flatMap((it) =>
        // deno-lint-ignore no-explicit-any
        (it.ingredients ?? []).map((i: any) => String(i.name ?? "").trim())
      ).filter((n: string) => n.length > 0),
    ),
  ] as string[];
  // Belt and braces on a PAID run: the model calls above are already bought, so no
  // downstream failure may discard them. Without the picker we still resolve via the
  // shortlist head, which the probe measured at 80.5% against 89.6%.
  let picks = new Map<string, number>();
  try {
    picks = await pickRecords(names, apiKey);
  } catch (e) {
    console.warn(
      `  picker failed (${e instanceof Error ? e.message : e}); using top hits`,
    );
  }

  const out: EnrichedItem[] = [];
  for (const it of anyGot) {
    // deno-lint-ignore no-explicit-any
    const raw = (it.ingredients ?? []) as any[];
    const resolvedIngredients = [];
    let okCount = 0;
    for (const i of raw) {
      const name = String(i.name ?? "").trim();
      const amount = Number(i.amount ?? 0);
      const unit = String(i.unit ?? "") as Unit | "gram";
      stats.lines++;
      let res = null;
      try {
        res = await resolveLine(name, amount, unit, picks.get(name));
      } catch { /* resolution failure is a miss, never a lost run */ }
      if (res) {
        stats.resolved++;
        if (res.via === "published-portion") stats.viaPortion++;
        else stats.viaModelGrams++;
        okCount++;
        resolvedIngredients.push({
          ...i,
          typical_serving_g: res.grams,
          fndds_id: res.fdcId,
          fndds_desc: res.desc,
          fndds_via: res.via,
          // FNDDS composition kept ALONGSIDE the model's, never overwriting it, so the
          // archive can be scored both ways at $0. Swapping grams and composition at
          // once would make a win unattributable.
          fndds_protein_per_100g: res.per100g.protein,
          fndds_carb_per_100g: res.per100g.carb,
          fndds_fat_per_100g: res.per100g.fat,
        });
      } else {
        // Unresolved line contributes 0 g, which is a SILENT UNDERSTATEMENT - so the
        // floor below has to notice when the missing line was load-bearing.
        resolvedIngredients.push({ ...i, typical_serving_g: 0, fndds_via: "unresolved" });
      }
    }

    // THE COUNT FLOOR IS NOT ENOUGH, measured on the smoke test: CAPRICCIOSA lost its
    // whole pizza crust and still passed at 71%, reporting a 372 g pizza. Ingredients
    // are not interchangeable - dropping the crust is not dropping a garnish. A missing
    // `protein` or `carb` line is the dish's BODY, so it reverts regardless of count.
    const lostBody = resolvedIngredients.some((i) =>
      i.fndds_via === "unresolved" && (i.category === "protein" || i.category === "carb")
    );
    const coverage = raw.length ? okCount / raw.length : 0;
    if (lostBody) stats.lostBody++;
    if (coverage < COVERAGE_FLOOR || lostBody) {
      stats.dishesReverted++;
      // Reverted dishes are marked, not dropped: the harness excludes BACKFILLED
      // items from scoring, and silently dropping them would flatter the arm.
      out.push({ ...it, recipe_reverted: true } as EnrichedItem);
      continue;
    }
    stats.dishesKept++;
    out.push({
      ...it,
      ingredients: resolvedIngredients,
      recipe_coverage: coverage,
      ...sumIngredientMacros(resolvedIngredients, it.printed_total_g),
    } as EnrichedItem);
  }
  await saveCache();
  return out;
}

const STATS: RecipeStats = {
  lines: 0,
  resolved: 0,
  viaPortion: 0,
  viaModelGrams: 0,
  dishesKept: 0,
  dishesReverted: 0,
  lostBody: 0,
};
export const recipeStats = () => STATS;

/** Module-level, matching probe-plate-arms.ts - ARM_RUNNERS passes only the batch. */
const ENV_KEY = () => {
  const k = Deno.env.get("OPENAI_API_KEY");
  if (!k) throw new Error("OPENAI_API_KEY is required to run a recipe arm");
  return k;
};

export const armRecipeH = (items: ExtractedItem[]) =>
  runRecipeArm(items, ENV_KEY(), ARM_RECIPE_H, STATS);
export const armRecipeM = (items: ExtractedItem[]) =>
  runRecipeArm(items, ENV_KEY(), ARM_RECIPE_M, STATS);
