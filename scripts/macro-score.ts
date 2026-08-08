// Pure scoring for the Stage-2 macro benchmark. No I/O, no network - so the
// scoring rule can be tested exhaustively for $0.

export interface MacroValues {
  calories: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
}

export interface FieldVerdict {
  field: string;
  oracle: number;
  model: number;
  /** Signed % difference from the oracle; null when the oracle value is 0. */
  deltaPct: number | null;
  band: string;
  pass: boolean;
}

const CALORIE_TOLERANCE = 0.20;
const MACRO_TOLERANCE = 0.30;
const ZERO_ORACLE_ABS_ALLOWANCE_G = 3;

const FIELDS: { key: keyof MacroValues; tolerance: number }[] = [
  { key: "calories", tolerance: CALORIE_TOLERANCE },
  { key: "protein_g", tolerance: MACRO_TOLERANCE },
  { key: "carb_g", tolerance: MACRO_TOLERANCE },
  { key: "fat_g", tolerance: MACRO_TOLERANCE },
];

function scoreField(
  field: keyof MacroValues,
  oracleValue: number,
  modelValue: number,
  tolerance: number,
): FieldVerdict {
  if (oracleValue === 0) {
    return {
      field,
      oracle: oracleValue,
      model: modelValue,
      deltaPct: null,
      band: `<=${ZERO_ORACLE_ABS_ALLOWANCE_G}g absolute`,
      pass: Math.abs(modelValue) <= ZERO_ORACLE_ABS_ALLOWANCE_G,
    };
  }

  const deltaPct = (modelValue - oracleValue) / oracleValue;

  return {
    field,
    oracle: oracleValue,
    model: modelValue,
    deltaPct,
    band: `+/-${Math.round(tolerance * 100)}%`,
    pass: Math.abs(deltaPct) <= tolerance + 1e-9,
  };
}

/** Scores one item for one draw. Passes only when every field passes. */
export function scoreItem(
  oracle: MacroValues,
  model: MacroValues,
): { fields: FieldVerdict[]; pass: boolean } {
  const fields = FIELDS.map(({ key, tolerance }) =>
    scoreField(key, oracle[key], model[key], tolerance)
  );
  return { fields, pass: fields.every((field) => field.pass) };
}
