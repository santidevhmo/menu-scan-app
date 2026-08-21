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
 * How close the pipeline must land to the AVERAGE version of a dish to pass.
 *
 * SANTIAGO'S RULING, 2026-08-20. Before it, a band was the mass range times one
 * fixed composition, so its width was whatever the mass range happened to be and
 * nobody had chosen it: CAPRICCIOSA was pinned to 400-450 g and got +/-6% on FAT,
 * while CARBONARA's 250-450 g bought it +/-29%. The dish with the widest band
 * scored 12/12 and the dish with the narrowest scored 3/12, so the benchmark was
 * partly measuring how tightly each dish had been specified.
 *
 * The product goal is a precise estimate of the AVERAGE version of a menu item,
 * so the bar is now stated directly instead of inherited from unrelated
 * arithmetic, and it is the SAME for every dish.
 *
 * 🔴 WHY 0.20 AND NOT A LOOSER NUMBER. A benchmark loosened until the score looks
 * good is rigged. The guard is the gap between the SHIPPED pipeline and the
 * pre-dual-pass baseline, measured by `scripts/sim-tolerance-sweep.ts`:
 *
 *     bar        shipped   pre-dual   gap
 *     today's      36/72      25/72    11
 *     +/-20%       33/72      25/72     8    <- chosen
 *     +/-25%       48/72      27/72    21
 *
 * +/-25% discriminates better AND flatters the headline (36 -> 48). Santiago took
 * +/-20% precisely because it does NOT flatter it - the score lands slightly BELOW
 * today's. COLIFLOR ROKA, which is genuinely wrong, still fails at every bar.
 */
export const BAND_TOLERANCE = 0.20;

/**
 * Macro bands: the AVERAGE dish, plus or minus `BAND_TOLERANCE`.
 *
 * The average is the mass band's midpoint times the reviewed composition, so the
 * mass band still records the sourcing judgement and calories stay
 * Atwater-consistent with the three macros.
 */
export function deriveBands(
  [lowG, highG]: MacroBand,
  composition: Composition,
): MacroBands {
  const midG = (lowG + highG) / 2;
  const span = (value: number): MacroBand => [
    round(value * (1 - BAND_TOLERANCE)),
    round(value * (1 + BAND_TOLERANCE)),
  ];
  const protein = midG * composition.protein_per_100g / 100;
  const carb = midG * composition.carb_per_100g / 100;
  const fat = midG * composition.fat_per_100g / 100;
  return {
    calories: span(4 * protein + 4 * carb + 9 * fat),
    protein_g: span(protein),
    carb_g: span(carb),
    fat_g: span(fat),
  };
}

/** The pre-2026-08-20 rule, kept so `sim-tolerance-sweep.ts` can still show what changed. */
export function deriveBandsFromMassRange(
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
