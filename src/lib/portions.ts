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
 * How many of the dish's OWN units a portion is: pieces for a dish that has
 * them, whole orders for one that does not. This is the number the diner sees
 * and types in both places - the row and the editor - so that "18" always
 * means the same thing on one screen.
 */
export function unitCount(portion: number, piecesPerOrder: number): number {
  return portion * (piecesPerOrder > 1 ? piecesPerOrder : 1);
}

/** The inverse: the share of one order that a count of units represents. */
export function portionFromUnitCount(
  count: number,
  piecesPerOrder: number,
): number {
  return count / (piecesPerOrder > 1 ? piecesPerOrder : 1);
}

/**
 * What the row shows. No ceiling in either form - "16 / 8" is two pizzas and
 * "2" is two soups, both of which someone orders.
 */
export function portionLabel(portion: number, piecesPerOrder: number): string {
  const count = formatQuantity(unitCount(portion, piecesPerOrder));
  return piecesPerOrder <= 1 ? count : `${count} / ${piecesPerOrder}`;
}

/**
 * A typed quantity: any positive number, rounded to the 2dp the row can show.
 * `Number` trims and turns "" into 0, so empty input falls out as not positive.
 */
export function parsePortionInput(text: string): number | null {
  // Rounded FIRST, then checked: "0.001" is positive but rounds to 0, and a
  // zero portion is not a small order - it is a row priced at 0 kcal that the
  // editor accepts because 0 is not null.
  const rounded = round2(Number(text));
  return Number.isFinite(rounded) && rounded > 0 ? rounded : null;
}

/**
 * Keeps a quantity field to digits and at most one decimal point. The keyboard
 * is a decimal pad, but a hardware keyboard, a paste and dictation all bypass
 * it, and `Number("1e5")` is 100000 rather than the nonsense it looks like.
 * Returns the text to display, so half-typed states like "0." survive.
 */
export function sanitizeDecimalInput(text: string): string {
  const digitsAndDots = text.replace(/[^0-9.]/g, "");
  const firstDot = digitsAndDots.indexOf(".");
  if (firstDot === -1) return digitsAndDots;
  return (
    digitsAndDots.slice(0, firstDot + 1) +
    digitsAndDots.slice(firstDot + 1).replace(/\./g, "")
  );
}

/** Same, for a field that counts pieces: digits only, never a fraction. */
export function sanitizeIntegerInput(text: string): string {
  return text.replace(/[^0-9]/g, "");
}

/** A typed divisor: a whole number of pieces, 1 to 50. */
export function parsePiecesInput(text: string): number | null {
  const value = Number(text);
  return Number.isInteger(value) && value >= 1 && value <= MAX_PIECES
    ? value
    : null;
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
