// H2.2 — which way up is this photo? (spec 2026-08-03-h2-rotation-design.md)
//
// A diner turns the phone to shoot a wide menu, so the capture arrives with the
// text on its side. Eval 131 measured the cost: `bistro` turned 90 degrees reads
// all 8 pizza names perfectly and returns ZERO of its 8 prices. The names
// surviving is what makes it dangerous — a count check passes while the diner is
// shown a priceless menu.
//
// The signal is the pixel box of each text block, which Mistral already returns
// and production already receives (C3 stopped USING blocks, not receiving them).
// Two questions decide everything:
//
//   1. Are the text boxes WIDE (lines lying down) or TALL (lines on their side)?
//   2. Does the OCR's reading order run top->bottom and left->right?
//
// EVERY THRESHOLD BELOW IS MEASURED, AND THE REFUSALS ARE THE POINT. Santiago's
// requirement is not "detect rotation", it is "never rotate an upright menu by
// accident", so anything short of decisive resolves to `upright`.

export interface OcrBlock {
  top_left_x: number;
  top_left_y: number;
  bottom_right_x: number;
  bottom_right_y: number;
  content?: string | null;
}

export type Orientation =
  | "upright"
  | "upside_down"
  | "turned_clockwise"
  | "turned_counter_clockwise";

/** Measured across 11 upright fixture pages: 0.988 - 1.000. Bar at 0.80. */
export const WIDE_FRAC_HORIZONTAL = 0.80;
/** Measured across 4 sideways captures: 0.000, every one. Bar at 0.20. */
export const WIDE_FRAC_SIDEWAYS = 0.20;
/** A page with a handful of text boxes has no reliable geometry, and guessing
 *  there is exactly how an upright menu gets rotated by accident. */
export const MIN_BLOCKS = 20;
/** A correlation this close to zero states nothing; treat it as no evidence. */
export const MIN_CORRELATION = 0.15;

function usable(blocks: OcrBlock[]): OcrBlock[] {
  return blocks.filter((block) =>
    (block.content ?? "").trim().length > 0 &&
    block.bottom_right_x > block.top_left_x &&
    block.bottom_right_y > block.top_left_y
  );
}

/** Fraction of text boxes wider than tall — lines lying down vs on their side. */
export function wideFraction(blocks: OcrBlock[]): number {
  const text = usable(blocks);
  if (text.length === 0) return 0;
  const wide = text.filter((block) =>
    block.bottom_right_x - block.top_left_x >=
      block.bottom_right_y - block.top_left_y
  );
  return wide.length / text.length;
}

/** Pearson correlation; 0 when either side is constant. */
function correlation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let top = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    top += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx > 0 && dy > 0 ? top / Math.sqrt(dx * dy) : 0;
}

/** How the OCR's reading order tracks each axis of the frame. Upright pages read
 *  top->bottom AND left->right, so both come back positive on all 10 fixtures. */
export function readingOrderDrift(
  blocks: OcrBlock[],
): { x: number; y: number } {
  const text = usable(blocks);
  const order = text.map((_, index) => index);
  return {
    x: correlation(
      order,
      text.map((b) => (b.top_left_x + b.bottom_right_x) / 2),
    ),
    y: correlation(
      order,
      text.map((b) => (b.top_left_y + b.bottom_right_y) / 2),
    ),
  };
}

/**
 * Which way up a page is, from block geometry alone.
 *
 * Returns `upright` for anything it cannot decide — too few blocks, a wide-frac
 * inside the refusal band, a correlation too weak to mean anything, or the two
 * axes disagreeing. Those refusals are load-bearing: they are what stops an
 * upright menu being rotated by mistake.
 *
 * Measured evidence (all archived, `scripts/probe-rotation-gallery.ts` renders it):
 *
 *   | page                 | wide-frac | order-vs-X | order-vs-Y |
 *   | 11 upright fixtures  | .988-1.00 |   + + +    |   + + +    |
 *   | turned clockwise x3  |   0.000   |     -      |     +      |
 *   | turned counter-cw    |   0.000   |     +      |     -      |
 *   | upside down          |   1.000   |     -      |     -      |
 */
export function detectOrientation(blocks: OcrBlock[]): Orientation {
  const text = usable(blocks);
  if (text.length < MIN_BLOCKS) return "upright";

  const wide = wideFraction(text);
  const drift = readingOrderDrift(text);
  // Too weak to state anything — refuse before comparing signs, or noise around
  // zero decides which way we spin a diner's photo.
  if (
    Math.abs(drift.x) < MIN_CORRELATION || Math.abs(drift.y) < MIN_CORRELATION
  ) return "upright";
  const downwards = drift.y > 0;
  const rightwards = drift.x > 0;

  if (wide >= WIDE_FRAC_HORIZONTAL) {
    // Lines lie down: the page is upright or upside down. Both axes must agree;
    // one flipped axis is not a rotation, it is a page we do not understand.
    if (downwards && rightwards) return "upright";
    if (!downwards && !rightwards) return "upside_down";
    return "upright";
  }
  if (wide <= WIDE_FRAC_SIDEWAYS) {
    // Lines stand up: the page is turned. Reading still advances down the frame
    // when the menu's top edge is on the RIGHT, i.e. turned clockwise.
    if (downwards && !rightwards) return "turned_clockwise";
    if (!downwards && rightwards) return "turned_counter_clockwise";
    return "upright";
  }
  return "upright"; // inside the refusal band
}

/**
 * POSITIVELY upright — decisive evidence, not merely the absence of a verdict.
 *
 * `detectOrientation` returns "upright" for two very different situations: a
 * page it can see is the right way up, and a page it cannot read at all. That
 * conflation is safe for DECIDING to rotate (both mean "do nothing") and unsafe
 * for ACCEPTING a rotation, where "I cannot tell" must not pass as "it worked".
 */
export function isPositivelyUpright(blocks: OcrBlock[]): boolean {
  const text = usable(blocks);
  if (text.length < MIN_BLOCKS) return false;
  const drift = readingOrderDrift(text);
  return wideFraction(text) >= WIDE_FRAC_HORIZONTAL &&
    drift.y >= MIN_CORRELATION && drift.x >= MIN_CORRELATION;
}

/** A corrected read may lose this share of the numbers to rounding and reflow
 *  before it counts as a regression. guest-house reads 54 numbers sideways and
 *  53 upright — noise, not damage. A wrongly rotated bistro reads 32 -> 17. */
export const NUMBER_LOSS_TOLERANCE = 0.95;

/**
 * Keep the rotated read? Both guards must pass, and they cover each other:
 * the geometry check catches a menu whose numbers barely move when turned
 * (guest-house), the number check catches a page whose geometry we misread.
 */
export function acceptRotation(
  corrected: { blocks: OcrBlock[]; markdown: string },
  original: { markdown: string },
): boolean {
  if (!isPositivelyUpright(corrected.blocks)) return false;
  const before = printedNumbers(original.markdown);
  return printedNumbers(corrected.markdown) >= before * NUMBER_LOSS_TOLERANCE;
}

/**
 * Clockwise degrees that bring `orientation` back upright.
 *
 * PINNED BY GEOMETRY, NOT ASSUMED. Eval 094 recorded a previous session getting
 * this backwards. bistro is 2384x1844 upright; its header box sits at
 * x[79,286] y[30,57], and in the `sips -r 90` copy at x[1787,1814] y[79,286].
 * The clockwise map (x,y) -> (H - y, x) with H=1844 predicts exactly that, to
 * the pixel — so `sips -r 90` turns clockwise, and a clockwise-turned page is
 * undone by turning a further 270.
 */
export function correctionDegrees(orientation: Orientation): number {
  switch (orientation) {
    case "upright":
      return 0;
    case "upside_down":
      return 180;
    case "turned_clockwise":
      return 270;
    case "turned_counter_clockwise":
      return 90;
  }
}

/** Every standalone number printed on the page.
 *
 *  This is the ACCEPTANCE measure for a rotation, because eval 131 proved the
 *  defect is numeric: a sideways read keeps the dish names and loses the prices.
 *  Comparing text length or word count would have scored bistro's priceless read
 *  at 92% and shipped it.
 *
 *  IT COUNTS BARE NUMBERS, NOT JUST `$` AMOUNTS. A first draft required a
 *  currency symbol or a unit and found only 3 numbers on an upright guest-house,
 *  which prints its prices as bare `150`/`280` — the comparison would have tied
 *  on that menu and silently refused every correction. Rendering the gallery is
 *  what caught it. Over-counting (years, quantities) is harmless here: the same
 *  measure is applied to both reads and only the DIFFERENCE decides. */
export function printedNumbers(markdown: string): number {
  // No trailing-letter guard: menus print weights unit-glued to the number
  // ("300gr", "18oz"), and those are standalone numbers too.
  return (markdown.match(/(?<![\p{L}\d])\d+(?:[.,]\d+)?(?!\d)/gu) ?? [])
    .length;
}
