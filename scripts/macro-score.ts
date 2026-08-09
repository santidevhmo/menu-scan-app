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
  /**
   * True when the absolute-gram floor decided this field, not the percentage
   * band. Such a field MUST be left out of any mean |error|: a steak answered
   * "0 g carb" against an oracle of 0.82 g scores a 100% error that is real
   * arithmetic and meaningless nutrition, and averaging it in moves the headline
   * number by tens of points.
   */
  absolute: boolean;
}

const CALORIE_TOLERANCE = 0.20;
const MACRO_TOLERANCE = 0.30;
// Below this the percentage band grades noise, so grams are compared directly.
// A steak's whole carb figure is its garnish parsley (0.82 g): at +/-30% the model
// would have to answer between 0.58 and 1.07 g, and "0" - the honest answer for a
// steak - would fail. Applies to any oracle value under the floor, not just an
// exact zero (Santiago, 2026-08-09). It cannot disturb a historical number: the
// smallest field across the original three fixtures is CESAR's 18.4 g of carbs.
const SMALL_ORACLE_ABS_ALLOWANCE_G = 3;

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
  if (oracleValue < SMALL_ORACLE_ABS_ALLOWANCE_G) {
    return {
      field,
      oracle: oracleValue,
      model: modelValue,
      // Still reported when the oracle is non-zero - the size of the miss is
      // information even where it is not the pass/fail rule.
      deltaPct: oracleValue === 0 ? null : (modelValue - oracleValue) / oracleValue,
      band: `<=${SMALL_ORACLE_ABS_ALLOWANCE_G}g absolute`,
      pass: Math.abs(modelValue - oracleValue) <= SMALL_ORACLE_ABS_ALLOWANCE_G,
      absolute: true,
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
    absolute: false,
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
