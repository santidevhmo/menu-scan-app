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
// A gram field ALSO passes when the absolute miss is small, whatever the
// percentage says. Santiago 2026-08-09: "if something has 20 grams and the
// model says 15, that's only five grams - it's not that different." A ratio
// grades noise on small quantities: 9.3 g of protein answered as 14.5 g is
// +56% and 5.2 g of food. This is a SEPARATE rule from the floor above, which
// keys off a small ORACLE value; this one keys off a small DIFFERENCE.
// Calories deliberately keep a pure percentage band - no dish in the set has a
// small calorie figure (the smallest is Coleslaw at 163), so the problem that
// motivates this rule does not arise there.
const MACRO_ABS_ALLOWANCE_G = 6;
// Calories get an absolute allowance too (Santiago, 2026-08-09, on Coleslaw:
// "the 40 cal and 5 g carb difference is tolerable, not that drastic"). The real
// misses behind that ruling were 47.7 kcal and 5.3 g - the carb one sitting 0.3 g
// above the old 5 g floor. 50 kcal is roughly a fifth of a small side dish and
// well inside the noise of what a kitchen actually plates. It was excluded when
// the gram rule was added on the reasoning that no dish here has a SMALL calorie
// figure; that reasoning held for the count and missed the point, which is that a
// fixed small quantity is not worth failing whatever the denominator.
const CALORIE_ABS_ALLOWANCE = 50;

const FIELDS: { key: keyof MacroValues; tolerance: number; absAllowance: number | null }[] = [
  { key: "calories", tolerance: CALORIE_TOLERANCE, absAllowance: CALORIE_ABS_ALLOWANCE },
  { key: "protein_g", tolerance: MACRO_TOLERANCE, absAllowance: MACRO_ABS_ALLOWANCE_G },
  { key: "carb_g", tolerance: MACRO_TOLERANCE, absAllowance: MACRO_ABS_ALLOWANCE_G },
  { key: "fat_g", tolerance: MACRO_TOLERANCE, absAllowance: MACRO_ABS_ALLOWANCE_G },
];

function scoreField(
  field: keyof MacroValues,
  oracleValue: number,
  modelValue: number,
  tolerance: number,
  absAllowance: number | null = null,
): FieldVerdict {
  // A negative or non-finite prediction is not a near miss, it is a broken
  // answer, and the allowances below would happily forgive one: -2 g of carb
  // against an oracle of 0 sits inside the 3 g floor. No allowance applies to a
  // number that cannot describe food.
  if (!Number.isFinite(modelValue) || modelValue < 0) {
    return {
      field,
      oracle: oracleValue,
      model: modelValue,
      deltaPct: null,
      band: "invalid",
      pass: false,
      // Not `absolute` - it must stay OUT of mean |error|, which cannot
      // meaningfully average a NaN or a negative.
      absolute: true,
    };
  }
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
  const withinBand = Math.abs(deltaPct) <= tolerance + 1e-9;
  const withinGrams = absAllowance !== null &&
    Math.abs(modelValue - oracleValue) <= absAllowance + 1e-9;

  return {
    field,
    oracle: oracleValue,
    model: modelValue,
    deltaPct,
    band: absAllowance === null
      ? `+/-${Math.round(tolerance * 100)}%`
      : `+/-${Math.round(tolerance * 100)}% or <=${absAllowance}g`,
    pass: withinBand || withinGrams,
    // Deliberately NOT flagged absolute. A field forgiven by the gram allowance
    // still carries a real percentage, so it stays in mean |error| - only the
    // pass/fail count changes. That keeps mean |error| comparable with every
    // figure recorded before this rule existed.
    absolute: false,
  };
}

/** Scores one item for one draw. Passes only when every field passes. */
export function scoreItem(
  oracle: MacroValues,
  model: MacroValues,
): { fields: FieldVerdict[]; pass: boolean } {
  const fields = FIELDS.map(({ key, tolerance, absAllowance }) =>
    scoreField(key, oracle[key], model[key], tolerance, absAllowance)
  );
  return { fields, pass: fields.every((field) => field.pass) };
}
