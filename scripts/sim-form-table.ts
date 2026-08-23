// $0: does naming a dish's FORM and taking that form's average size beat what the
// model does now? Santiago's proposal, eval 174.
//
// WHAT THIS IS. Two separate things can go wrong with a form mechanism: the TABLE
// of per-form grams can be wrong, or the CLASSIFIER can put a dish in the wrong
// row. This sim removes the classifier entirely - the labels are hand-assigned in
// dish-forms.ts - so what it measures is the TABLE ALONE, at its ceiling. If the
// table cannot beat the shipped 352 with perfect labels, no classifier can rescue
// it and nothing needs to be bought.
//
// WHAT IT IS NOT. Not an arm and it cannot ship: LABEL is hand-written. It also
// does NOT read mass_band_g to build a target - targets come only from FORM_G, and
// `oracle.band` (the MACRO bands) is read solely to score.
//
// ☠️ The table's contamination is declared in dish-forms.ts. The audit column
// below prints every target against the ruled band midpoint, and the pizza-dropped
// total is the honest headline.
//
//   deno run --allow-read scripts/sim-form-table.ts
import {
  assertFullCoverage,
  byName,
  FORM_G,
  LABEL,
  oracle,
  PIZZAS,
  type ScoreRow,
  scoreWithTargets,
  withoutPizzas,
} from "./dish-forms.ts";

const DRAWS = 3;

const unlabelled = oracle.map((e) => e.name).filter((n) => !(n in LABEL));
if (unlabelled.length) {
  throw new Error(
    `${unlabelled.length} ruled dishes have no form label: ${
      unlabelled.join(", ")
    }`,
  );
}
for (const [n, f] of Object.entries(LABEL)) {
  if (!(f in FORM_G)) throw new Error(`${n} labelled with unknown form "${f}"`);
}

const control = await scoreWithTargets(() => null);
const form = await scoreWithTargets((n) => FORM_G[LABEL[n]] ?? null);
assertFullCoverage(control);

console.log("UNWEIGHTED - points in band, higher is better\n");
console.log(
  `${"rule".padEnd(34)}${"all 57".padStart(12)}${"no pizzas".padStart(14)}`,
);
const dropped = PIZZAS.length * 4 * DRAWS;
for (
  const [label, r] of [
    ["today (dual, control)", control],
    ["form -> table average", form],
  ] as [string, ScoreRow][]
) {
  console.log(
    `${label.padEnd(34)}${`${r.pts}/${r.poss}`.padStart(12)}${
      `${withoutPizzas(r)}/${r.poss - dropped}`.padStart(14)
    }`,
  );
}
const sign = (n: number) => `${n >= 0 ? "+" : ""}${n}`;
console.log(
  `${"DELTA".padEnd(34)}${sign(form.pts - control.pts).padStart(12)}${
    sign(withoutPizzas(form) - withoutPizzas(control)).padStart(14)
  }`,
);

// Per FORM: is the row helping or hurting, and how far is its target from the
// bands the oracle ruled? A row whose target equals every band's midpoint is the
// contamination tell.
console.log(
  "\nper form - target vs the mass band the oracle ruled (audit column):",
);
console.log(
  `${"form".padEnd(30)}${"n".padStart(3)}${"target".padStart(8)}${
    "band mid".padStart(10)
  }${"gap".padStart(7)}${"points".padStart(12)}${"delta".padStart(8)}`,
);
let gapSum = 0, gapN = 0;
for (const f of [...new Set(Object.values(LABEL))].sort()) {
  const names = Object.entries(LABEL).filter(([, x]) => x === f).map(([n]) =>
    n
  );
  const mids = names.map((n) => {
    const [lo, hi] = byName.get(n)!.mass_band_g;
    return (lo + hi) / 2;
  });
  const mid = mids.reduce((s, m) => s + m, 0) / mids.length;
  const c = names.reduce((s, n) => s + (control.dish.get(n) ?? 0), 0);
  const v = names.reduce((s, n) => s + (form.dish.get(n) ?? 0), 0);
  gapSum += Math.abs(FORM_G[f] - mid);
  gapN++;
  console.log(
    `${f.padEnd(30)}${String(names.length).padStart(3)}${
      String(FORM_G[f]).padStart(8)
    }${mid.toFixed(0).padStart(10)}${
      sign(Math.round(FORM_G[f] - mid)).padStart(7)
    }${`${v}/${names.length * 4 * DRAWS}`.padStart(12)}${
      sign(v - c).padStart(8)
    }`,
  );
}
console.log(
  `\nmean |gap| between target and ruled band midpoint: ${
    (gapSum / gapN).toFixed(1)
  } g over ${gapN} rows. ` +
    `A table copied from the answer key would show ~0 with no outliers.`,
);

// How often does the table's flat number land inside the ruled mass band? The
// "does form predict mass" question, kept separate from the score.
const inBand = oracle.filter((e) => {
  const [lo, hi] = e.mass_band_g;
  const t = FORM_G[LABEL[e.name]];
  return t >= lo && t <= hi;
});
const noPizza = inBand.filter((e) => !PIZZAS.includes(e.name));
console.log(
  `form target lands INSIDE the ruled mass band: ${inBand.length}/${oracle.length}` +
    ` (${((100 * inBand.length) / oracle.length).toFixed(0)}%)` +
    `, excluding pizzas ${noPizza.length}/${oracle.length - PIZZAS.length}` +
    ` (${
      ((100 * noPizza.length) / (oracle.length - PIZZAS.length)).toFixed(0)
    }%)`,
);
console.log(
  `\nControl covers all ${oracle.length} oracle dishes, scored through the ` +
    `harness's own scoreItemAgainstBand. Targets come only from FORM_G; ` +
    `mass_band_g is read for the audit column and the line above, never to set one.`,
);
