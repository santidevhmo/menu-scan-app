/**
 * How much of a dish the diner will eat, in the dish's own unit.
 *
 * Two numbers describe a portion. `portion` is the share of ONE ORDER and is
 * the only one the macros ever see - they are always `itemMacros * portion`.
 * `piecesPerOrder` is what that order is cut into, and it only formats: a
 * pizza reads "4 / 8", a soup reads "0.5". Because the divisor is absent from
 * the arithmetic, correcting a wrong piece count cannot move a single calorie,
 * which is what makes the model's piece-count defect an ergonomics problem
 * rather than a data one.
 */

const MAX_PIECES = 50;

/**
 * The divisor to show for a model-supplied count. A model can return anything;
 * the UI shows only a whole number of pieces from 1 to 50. Everything else
 * becomes 1, which is what most of the world's menu items are anyway.
 */
export function resolvePiecesPerOrder(servingPieces?: number | null): number {
  if (
    typeof servingPieces !== "number" ||
    !Number.isInteger(servingPieces) ||
    servingPieces < 1 ||
    servingPieces > MAX_PIECES
  ) {
    return 1;
  }
  return servingPieces;
}

/** One tap of the +/- control: one piece, or half an order when there are none. */
export function portionStep(piecesPerOrder: number): number {
  return piecesPerOrder > 1 ? 1 / piecesPerOrder : 0.5;
}

/**
 * What the row shows. No ceiling in either form - "16 / 8" is two pizzas and
 * "2" is two soups, both of which someone orders.
 */
export function portionLabel(portion: number, piecesPerOrder: number): string {
  if (piecesPerOrder <= 1) return formatQuantity(portion);
  return `${formatQuantity(portion * piecesPerOrder)} / ${piecesPerOrder}`;
}

/** A typed quantity: any positive number, rounded to the 2dp the row can show. */
export function parsePortionInput(text: string): number | null {
  const value = Number(text.trim());
  if (text.trim() === "" || !Number.isFinite(value) || value <= 0) return null;
  return round2(value);
}

/** A typed divisor: a whole number of pieces, 1 to 50. */
export function parsePiecesInput(text: string): number | null {
  const value = Number(text.trim());
  if (
    text.trim() === "" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_PIECES
  ) {
    return null;
  }
  return value;
}

/**
 * Two decimals, trailing zeros stripped. Two, not one, so that a typed 0.25
 * displays as what the macros actually used - a diner who sees "0.3" next to
 * calories computed from 0.25 has caught the app lying. Rounding also erases
 * floating-point noise: 1/3 + 1/3 + 1/3 times 3 is 2.9999999999999996, and
 * nobody may ever see that.
 */
function formatQuantity(value: number): string {
  return String(round2(value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
