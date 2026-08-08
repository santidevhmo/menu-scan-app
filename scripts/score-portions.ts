// Per-ingredient PORTION scorer. Benchmark-only, $0 - reads archived responses,
// makes no model call.
//
// Why this exists: until now portioning was judged through four downstream macro
// numbers. The $0 ablation on iter-b13-001 showed the model's own composition
// scores 36/36 once given the oracle's grams, so grams are the whole remaining
// error - and they deserve a direct instrument.
//
// Headline metric is DISPLACEMENT: the share of a dish's mass sitting on the
// wrong ingredient.
//
//   displacement = sum |model_grams - oracle_grams| / oracle total grams
//
// It is preferred over a mean of per-ingredient percentage errors because that
// mean lets a 1.7 g garlic outvote a 140 g salmon fillet.
//
// Run: deno run --allow-read scripts/score-portions.ts [runId ...]

const CACHE_DIR = "scripts/fixtures/caches";
const DRAWS = 3;

interface OracleIngredient {
  name: string;
  grams: number;
}
interface OracleDish {
  name: string;
  oracle?: { ingredients?: OracleIngredient[] };
}

export interface DishPortionScore {
  dish: string;
  /** Share of the dish's mass on the wrong ingredient, 0-1. */
  displacement: number;
  /** Signed error on the dish's total weight, 0-1 scale. */
  totalError: number;
  rows: {
    oracleName: string;
    modelName: string;
    oracleGrams: number;
    modelGrams: number;
  }[];
}

/**
 * Aligns the model's ingredients to the oracle's POSITIONALLY. Both follow the
 * menu description's own order, which has held on every archived run - but a
 * dropped or invented ingredient would silently misalign the two lists, so a
 * count mismatch returns null rather than a wrong number.
 */
export function scoreDishPortions(
  oracleIngredients: OracleIngredient[],
  modelIngredients: { name: string; grams: number }[],
  dish: string,
): DishPortionScore | null {
  if (oracleIngredients.length !== modelIngredients.length) return null;

  const oracleTotal = oracleIngredients.reduce((s, i) => s + i.grams, 0);
  if (oracleTotal <= 0) return null;

  let displaced = 0;
  let modelTotal = 0;
  const rows = oracleIngredients.map((o, idx) => {
    const m = modelIngredients[idx];
    const modelGrams = m.grams ?? 0;
    displaced += Math.abs(modelGrams - o.grams);
    modelTotal += modelGrams;
    return {
      oracleName: o.name,
      modelName: m.name,
      oracleGrams: o.grams,
      modelGrams,
    };
  });

  return {
    dish,
    displacement: displaced / oracleTotal,
    totalError: (modelTotal - oracleTotal) / oracleTotal,
    rows,
  };
}

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`;
}

function signedPct(x: number): string {
  return `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
}

async function main() {
  const runIds = Deno.args.length > 0 ? Deno.args : [
    "iter-b1-001",
    "iter-b10-001",
    "iter-b11-001",
    "iter-b12-001",
    "iter-b13-001",
  ];

  const oracleDishes: OracleDish[] = JSON.parse(
    await Deno.readTextFile("scripts/fixtures/macro-oracle.json"),
  );

  const summary: string[] = [];

  for (const runId of runIds) {
    const perDish = new Map<string, number[]>();
    const perDishTotal = new Map<string, number[]>();
    let unscorable = 0;
    let lastRows: DishPortionScore[] = [];

    for (let d = 0; d < DRAWS; d++) {
      const path = `${CACHE_DIR}/macro-bench.${runId}-d${d}.raw.json`;
      const raw = JSON.parse(await Deno.readTextFile(path));
      const items = JSON.parse(raw.choices[0].message.content).items;

      for (const item of items) {
        const dish = oracleDishes.find((o) => o.name === item.name);
        const oracleIngredients = dish?.oracle?.ingredients;
        if (!oracleIngredients) continue;

        const score = scoreDishPortions(
          oracleIngredients,
          item.ingredients ?? [],
          item.name,
        );
        if (!score) {
          unscorable++;
          continue;
        }
        perDish.set(item.name, [
          ...(perDish.get(item.name) ?? []),
          score.displacement,
        ]);
        perDishTotal.set(item.name, [
          ...(perDishTotal.get(item.name) ?? []),
          score.totalError,
        ]);
        if (d === DRAWS - 1) lastRows.push(score);
      }
    }

    const all = [...perDish.values()].flat();
    const mean = all.length > 0
      ? all.reduce((s, x) => s + x, 0) / all.length
      : NaN;

    summary.push(`\n=== ${runId} ===`);
    summary.push(
      `  mean displacement ${pct(mean)}` +
        (unscorable > 0 ? `  (${unscorable} dish/draws unscorable)` : ""),
    );
    for (const [dishName, values] of perDish) {
      const totals = perDishTotal.get(dishName)!;
      summary.push(
        `    ${dishName.padEnd(24)} displacement ${
          values.map(pct).join(" / ").padEnd(24)
        } total ${totals.map(signedPct).join(" / ")}`,
      );
    }
    if (runIds.length === 1) {
      for (const s of lastRows) {
        summary.push(`\n  -- ${s.dish}, final draw --`);
        for (const r of s.rows) {
          summary.push(
            `     oracle ${String(r.oracleGrams).padStart(6)} g  model ${
              String(r.modelGrams).padStart(5)
            } g   ${r.oracleName}  <-  ${r.modelName}`,
          );
        }
      }
    }
  }

  console.log(summary.join("\n"));
}

if (import.meta.main) await main();
