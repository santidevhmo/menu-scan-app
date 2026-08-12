/**
 * How the portion stepper moves for one menu item.
 *
 * A pizza is a SINGLE menu item carrying one set of macros, but a diner eats
 * three of its eight slices. The original stepper moved in halves, so 3/8 could
 * not be expressed at all - the closest was x0.5, which is half a pizza. An item
 * the kitchen serves in pieces steps by one PIECE instead, and reads "3/8".
 *
 * Everything else keeps the half-item behaviour, because "half a steak" is how
 * people describe a steak and "1/17 of a steak" is not.
 */
export function portionSteps(servingPieces?: number | null): {
  step: number;
  label: (portion: number) => string;
} {
  // Guard every shape a model can return: null, 0, a fraction, or something
  // absurd. 1 piece is a whole item, so it is not a stepper worth having.
  if (
    !servingPieces ||
    !Number.isFinite(servingPieces) ||
    !Number.isInteger(servingPieces) ||
    servingPieces < 2 ||
    servingPieces > 50
  ) {
    return {
      step: 0.5,
      label: (portion) => (portion < 1 ? "1/2" : `x${portion}`),
    };
  }

  return {
    step: 1 / servingPieces,
    // A plain count of pieces, with no ceiling (Santiago, 2026-08-11): the
    // stepper opens at the whole order - a 10-piece roll reads "10" - and the
    // diner walks it down to what they ate, or up past a whole order. Rounded
    // because 1/3 + 1/3 + 1/3 is not exactly 1 in floating point, and nobody
    // should ever see "2.9999".
    label: (portion) => `${Math.round(portion * servingPieces)}`,
  };
}
