// Pure band scoring for dishes that print NO weight. No I/O, no network.
//
// Why this is not in macro-score.ts: that module is the single source of the
// 96-point weighted number and its header forbids a second copy of that rule.
// This is a DIFFERENT rule for a DIFFERENT set of dishes. Where a weighted dish
// has an oracle value and a tolerance, an unweighted dish has a band, because
// nobody printed its mass and the USDA sources disagree by ~12%.
import {
  CALORIE_ABS_ALLOWANCE,
  type FieldVerdict,
  MACRO_ABS_ALLOWANCE_G,
  type MacroValues,
} from "./macro-score.ts";

export type MacroBand = readonly [low: number, high: number];
export type MacroBands = Record<keyof MacroValues, MacroBand>;

/**
 * The absolute allowances are IMPORTED, not redeclared. Santiago ruled 6 g and
 * 50 kcal on 2026-08-09 for the weighted set; two copies of a ruled number is two
 * things to drift, and a benchmark whose two halves quietly disagree about what
 * "close enough" means is worse than one that is merely strict.
 */
const FIELDS: (keyof MacroValues)[] = [
  "calories",
  "protein_g",
  "carb_g",
  "fat_g",
];

const allowanceFor = (field: keyof MacroValues) =>
  field === "calories" ? CALORIE_ABS_ALLOWANCE : MACRO_ABS_ALLOWANCE_G;

function scoreField(
  field: keyof MacroValues,
  [low, high]: MacroBand,
  modelValue: number,
): FieldVerdict {
  const midpoint = (low + high) / 2;

  // A negative or non-finite prediction is a broken answer, not a near miss.
  if (!Number.isFinite(modelValue) || modelValue < 0) {
    return {
      field,
      oracle: midpoint,
      model: modelValue,
      deltaPct: null,
      band: "invalid",
      pass: false,
      absolute: true,
    };
  }

  // Inclusive: an estimate landing exactly on a published USDA portion weight
  // must not fail for landing on it.
  const inBand = modelValue >= low && modelValue <= high;

  // SANTIAGO'S RULING, 2026-08-20, carried over from the weighted set where he
  // made the same call on 2026-08-09: a percentage alone grades noise on small
  // quantities. ENSALADA GRIEGA's fat band is 10-15 g, so +/-20% demands the
  // model land within 2.5 g of fat - about half a teaspoon of oil - while
  // CAPRICCIOSA is allowed 8.4 g for the same 20%. A miss under the allowance is
  // not worth failing whatever the denominator, so a field passes on EITHER test.
  const absMiss = Math.abs(modelValue - midpoint);
  const allowance = allowanceFor(field);
  const withinAllowance = absMiss <= allowance;

  return {
    field,
    oracle: midpoint,
    model: modelValue,
    deltaPct: midpoint === 0 ? null : (modelValue - midpoint) / midpoint,
    band: inBand || !withinAllowance
      ? `${low}-${high}`
      : `<=${allowance}${field === "calories" ? "kcal" : "g"} absolute`,
    pass: inBand || withinAllowance,
    // Flags only the fields the ALLOWANCE decided, so a reader can see which
    // passes came from the gram rule rather than the band.
    absolute: !inBand && withinAllowance,
  };
}

/** Scores one unweighted dish. Passes only when all four fields are in band. */
export function scoreItemAgainstBand(
  bands: MacroBands,
  model: MacroValues,
): { fields: FieldVerdict[]; pass: boolean } {
  const fields = FIELDS.map((field) =>
    scoreField(field, bands[field], model[field])
  );
  return { fields, pass: fields.every((f) => f.pass) };
}
