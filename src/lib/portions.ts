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
    label: (portion) => {
      // Rounded because 1/3 + 1/3 + 1/3 is not exactly 1 in floating point, and
      // a diner must never see "2.9999/3".
      const eaten = Math.round(portion * servingPieces);
      if (eaten === servingPieces) return "all";
      return `${eaten}/${servingPieces}`;
    },
  };
}
