// PROBE: what does a 28 cm thin-crust pizza weigh?
//
// Eval 178 raised the question and could not close it: our `FORM_G` row (425 g) and the
// oracle's band [400,450] came from the SAME hand ruling, so the benchmark scores the
// same whether 425 is right or wrong (eval 178 ①, A ≈ C). The score cannot settle it.
//
// Eval 178's USDA figures (473/498/551/620 g) were INTERPOLATED across FNDDS's diameter
// bins. This probe does not interpolate. FNDDS publishes a portion literally called
// "1 surface inch" - grams per square inch of pizza - so a diameter converts to a mass
// with one multiplication and no binning assumption.
//
// 🔑 WHY THE BIN MATTERS: 28 cm = 11.02 in sits at the very BOTTOM of FNDDS's
// "medium (11-12 in)" bin. An 11 in pie is 95.0 in^2 and a 12 in pie is 113.1 in^2 - 19%
// more pizza inside one bin. Reading the flat "medium" row for a 28 cm pizza therefore
// overstates it, which is why this probe prints both columns side by side.
//
// The 28 cm itself is NOT an assumption: the Bistro menu prints "28 CM" as the pizza
// section header (visible in the OCR of the original photo,
// `caches/bistro.mistral-pt-r1.raw.json`).
//
// Run: deno run --allow-read --allow-net --allow-env --env-file=.env.local \
//        scripts/probe-pizza-areal.ts

import { food, loadCache, saveCache } from "./fndds-resolve.ts";

const D_CM = 28;
const D_IN = D_CM / 2.54;
const AREA = Math.PI * (D_IN / 2) ** 2;

/** The four eval 178 cited, plus the rest of the thin-crust family for spread. */
const IDS = [
  2708663, // meat & veg, thin crust - the record CAPRICCIOSA's own `assumed` note cites
  2708615,
  2708626,
  2708639,
  2708622,
  2708632,
  2708674,
  2708618, // stuffed crust - included only as a NOT-thin control
];

const OUR_ROW = 425; // FORM_G.pizza_whole_thin
const OUR_BAND: [number, number] = [400, 450]; // the oracle's ruled band

await loadCache();

console.log(
  `28 cm = ${D_IN.toFixed(2)} in diameter -> area ${AREA.toFixed(1)} in^2\n` +
    `Our shipped row: ${OUR_ROW} g   Oracle band: ${OUR_BAND[0]}-${OUR_BAND[1]} g\n`,
);
console.log(
  "id        g/in^2   28cm est   flat 11-12in row   thin?   description",
);

const thinEstimates: number[] = [];
for (const id of IDS) {
  const f = await food(id);
  if (!f) {
    console.log(`${id}   (unfetchable - an unfetchable candidate is a missing one)`);
    continue;
  }
  const si = f.portions.find((p) => /surface inch/i.test(p.desc));
  const med = f.portions.find((p) => /medium pizza \(11-12/i.test(p.desc));
  const isThin = /thin crust/i.test(f.desc);
  const est = si ? si.grams * AREA : null;
  if (isThin && est != null) thinEstimates.push(est);
  console.log(
    `${id}   ${String(si?.grams ?? "-").padStart(6)}   ${String(est ? est.toFixed(0) : "-").padStart(8)} g   ${String(med?.grams ?? "-").padStart(10)} g       ${isThin ? "yes" : "no "}     ${f.desc}`,
  );
}

// ── CONSISTENCY CHECK: is "surface inch" the same underlying data as the bin row? ──
// If it is, then (flat 11-12in row) / (g per in^2) must recover a sensible diameter.
// This is what proves the areal route is not a different, weaker source - and it is
// also what shows WHY eval 178 read high.
console.log(
  "\nCONSISTENCY: what diameter does each record's own flat '11-12 in' row imply?",
);
const implied: number[] = [];
for (const id of IDS) {
  const f = await food(id);
  if (!f) continue;
  const si = f.portions.find((p) => /surface inch/i.test(p.desc));
  const med = f.portions.find((p) => /medium pizza \(11-12/i.test(p.desc));
  if (!si || !med) continue;
  const d = 2 * Math.sqrt(med.grams / si.grams / Math.PI);
  implied.push(d);
  console.log(`  ${id}  ${med.grams} g / ${si.grams} g-per-in^2  ->  ${d.toFixed(2)} in`);
}
if (implied.length) {
  const mean = implied.reduce((s, x) => s + x, 0) / implied.length;
  console.log(
    `\n  mean implied diameter of the "medium (11-12 in)" row: ${mean.toFixed(2)} in\n` +
      `  🔑 The row is effectively a ${mean.toFixed(1)}-INCH pizza, i.e. the TOP of its bin.\n` +
      `     Our menu prints 28 cm = ${D_IN.toFixed(2)} in, which is ${((1 - AREA / (Math.PI * (mean / 2) ** 2)) * 100).toFixed(0)}% LESS pizza by area.\n` +
      `     Eval 178 read the flat row and so overstated a 28 cm pie; the surface-inch\n` +
      `     figure is the same data at finer resolution and does not have that error.`,
  );
}

if (thinEstimates.length) {
  thinEstimates.sort((a, b) => a - b);
  const lo = thinEstimates[0];
  const hi = thinEstimates[thinEstimates.length - 1];
  const mid = thinEstimates[Math.floor(thinEstimates.length / 2)];
  console.log(
    `\nTHIN-CRUST RECORDS ONLY: ${thinEstimates.length} records, ` +
      `${lo.toFixed(0)}-${hi.toFixed(0)} g, median ${mid.toFixed(0)} g`,
  );
  const inBand = thinEstimates.filter((g) => g >= OUR_BAND[0] && g <= OUR_BAND[1]).length;
  console.log(
    `  inside our ruled band [${OUR_BAND[0]},${OUR_BAND[1]}]: ${inBand} of ${thinEstimates.length}`,
  );
  console.log(`  median vs our ${OUR_ROW} g row: ${(mid / OUR_ROW).toFixed(2)}x`);
}

await saveCache();
