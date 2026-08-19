// Pure band scoring for dishes that print NO weight. No I/O, no network.
//
// Why this is not in macro-score.ts: that module is the single source of the
// 96-point weighted number and its header forbids a second copy of that rule.
// This is a DIFFERENT rule for a DIFFERENT set of dishes. Where a weighted dish
// has an oracle value and a tolerance, an unweighted dish has a band, because
// nobody printed its mass and the USDA sources disagree by ~12%.
import type { FieldVerdict, MacroValues } from "./macro-score.ts";

export type MacroBand = readonly [low: number, high: number];
export type MacroBands = Record<keyof MacroValues, MacroBand>;

const FIELDS: (keyof MacroValues)[] = [
  "calories",
  "protein_g",
  "carb_g",
  "fat_g",
];

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

  return {
    field,
    oracle: midpoint,
    model: modelValue,
    deltaPct: midpoint === 0 ? null : (modelValue - midpoint) / midpoint,
    band: `${low}-${high}`,
    // Inclusive: an estimate landing exactly on a published USDA portion
    // weight must not fail for landing on it.
    pass: modelValue >= low && modelValue <= high,
    absolute: false,
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
