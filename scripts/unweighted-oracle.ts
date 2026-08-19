// The unweighted-dish oracle: dishes whose MASS nobody printed, so truth is a
// band rather than a number. Benchmark-only - never imported by the app, never
// called at runtime.
import type { MacroBand, MacroBands } from "./macro-band-score.ts";

export interface Composition {
  protein_per_100g: number;
  carb_per_100g: number;
  fat_per_100g: number;
}

export interface UnweightedEntry {
  name: string;
  menu: string;
  unweighted: true;
  mass_band_g: MacroBand;
  band: MacroBands;
  assumed: string;
  source: string;
  retrieved_at: string;
}

const round = (value: number) => Math.round(value);

/**
 * Macro bands come from the MASS band times the reviewed composition, never
 * from a second source. Uncertainty therefore has exactly one origin - how much
 * food is on the plate - and calories stay Atwater-consistent with the three
 * macros at both endpoints.
 */
export function deriveBands(
  [lowG, highG]: MacroBand,
  composition: Composition,
): MacroBands {
  const at = (grams: number) => {
    const protein = grams * composition.protein_per_100g / 100;
    const carb = grams * composition.carb_per_100g / 100;
    const fat = grams * composition.fat_per_100g / 100;
    return {
      protein,
      carb,
      fat,
      calories: 4 * protein + 4 * carb + 9 * fat,
    };
  };
  const low = at(lowG);
  const high = at(highG);
  return {
    calories: [round(low.calories), round(high.calories)],
    protein_g: [round(low.protein), round(high.protein)],
    carb_g: [round(low.carb), round(high.carb)],
    fat_g: [round(low.fat), round(high.fat)],
  };
}

const REQUIRED_TEXT = ["name", "menu", "assumed", "source", "retrieved_at"];

/** Returns every problem with an entry. An empty list means it is valid. */
export function validateEntry(entry: unknown): string[] {
  const problems: string[] = [];
  if (typeof entry !== "object" || entry === null) {
    return ["entry is not an object"];
  }
  const e = entry as Record<string, unknown>;

  for (const key of REQUIRED_TEXT) {
    if (typeof e[key] !== "string" || (e[key] as string).trim() === "") {
      problems.push(`${key} is missing`);
    }
  }
  if ("printed_total_g" in e && e.printed_total_g != null) {
    problems.push(
      "an unweighted entry carries printed_total_g - it belongs in the weighted oracle",
    );
  }

  const mass = e.mass_band_g;
  if (!Array.isArray(mass) || mass.length !== 2) {
    problems.push("mass_band_g must be a [low, high] pair");
  } else {
    const [low, high] = mass as number[];
    if (!(low > 0) || !(high > 0)) {
      problems.push("mass_band_g endpoints must be positive");
    } else if (low > high) {
      problems.push("mass_band_g low exceeds high");
    }
  }

  const band = e.band as Record<string, unknown> | undefined;
  for (const field of ["calories", "protein_g", "carb_g", "fat_g"]) {
    const pair = band?.[field];
    if (!Array.isArray(pair) || pair.length !== 2) {
      problems.push(`band.${field} must be a [low, high] pair`);
      continue;
    }
    const [low, high] = pair as number[];
    if (low < 0 || high < 0) {
      problems.push(`band.${field} endpoints must not be negative`);
    } else if (low > high) {
      problems.push(`band.${field} low exceeds high`);
    }
  }
  return problems;
}
