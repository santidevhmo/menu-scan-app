// $0: did the form rescale actually FIRE, and on the right row?
//
// 🪤 Eval 172 tried to verify a router by diffing two paid archives and the check
// was invalid - the model is not deterministic, so a difference proves nothing.
// This check is different in kind: form sizing leaves an INVARIANT inside a single
// archive. If a dish was sized as `pizza_thin_meat_veg`, its resolved plate mass must
// equal 488 g exactly. No second run is needed and drift cannot fake it.
//
// ⚠️ AFTER EVAL 181, PRE-SPLIT ARCHIVES READ `OTHERROW` ON EVERY PIZZA, NOT `EXACT`.
// That is correct, not a regression: evals 174-180 sized pizzas at the old single
// 425 g row, which still exists in FORM_G as a legacy key, so the mass matches "some
// other row". A pizza reading OTHERROW at exactly 425 g means "this archive predates
// the topping split" - which is exactly what you want the check to tell you.
//
// Three outcomes are distinguished, because they mean different things:
//   EXACT    - mass equals FORM_G[hand label]. The mechanism fired on the row we
//              expected, so the model's live label matched the hand label.
//   OTHERROW - mass equals some OTHER row's value. It fired, but the model chose a
//              different form than the hand label. Not a bug - a disagreement.
//   NOFIRE   - mass matches no row. Either the label was `other` (correct: left
//              alone) or the rescale did not run at all (a real defect).
//
//   deno run --allow-read scripts/verify-form-fired.ts FORM [runLabel]
import { FORM_G } from "./arm-dish-form.ts";
import { grams, LABEL, MENUS, oracle } from "./dish-forms.ts";

const CACHE = "scripts/fixtures/caches";
const arm = Deno.args[0] ?? "FORM";
const run = Deno.args[1] ? `-${Deno.args[1]}` : "";
const byName = new Map(oracle.map((e) => [e.name, e]));

// deno-lint-ignore no-explicit-any
type Item = any;

const rows: { name: string; mass: number; verdict: string; note: string }[] = [];
for (const menu of MENUS) {
  for (let d = 0; d < 3; d++) {
    let raw: string;
    try {
      raw = await Deno.readTextFile(
        `${CACHE}/unweighted.${arm}-f${run}.${menu}-d${d}.raw.json`,
      );
    } catch {
      continue;
    }
    for (const it of JSON.parse(raw).items as Item[]) {
      if (!byName.has(it.name)) continue;
      const mass = grams(it).reduce((s, g) => s + g, 0);
      const want = FORM_G[LABEL[it.name]];
      // Floating point: the rescale is a multiply, so allow a hair of slack.
      if (Math.abs(mass - want) < 0.5) {
        rows.push({
          name: it.name,
          mass,
          verdict: "EXACT",
          note: LABEL[it.name],
        });
        continue;
      }
      const other = Object.entries(FORM_G).find(([, g]) =>
        Math.abs(mass - g) < 0.5
      );
      rows.push({
        name: it.name,
        mass,
        verdict: other ? "OTHERROW" : "NOFIRE",
        note: other ? `model chose ${other[0]}, hand said ${LABEL[it.name]}` : "",
      });
    }
  }
}

if (!rows.length) {
  throw new Error(`no archives for arm "${arm}${run}"`);
}
const count = (v: string) => rows.filter((r) => r.verdict === v).length;
console.log(`arm ${arm}${run} - ${rows.length} dish-draws\n`);
for (const v of ["EXACT", "OTHERROW", "NOFIRE"]) {
  console.log(
    `${v.padEnd(10)}${String(count(v)).padStart(4)}  (${
      ((100 * count(v)) / rows.length).toFixed(0)
    }%)`,
  );
}

const disagree = rows.filter((r) => r.verdict === "OTHERROW");
if (disagree.length) {
  console.log("\nthe model chose a DIFFERENT row than the hand label:");
  const seen = new Set<string>();
  for (const r of disagree) {
    if (seen.has(r.name)) continue;
    seen.add(r.name);
    console.log(
      `  ${r.name.slice(0, 28).padEnd(30)}${
        r.mass.toFixed(0).padStart(5)
      } g  ${r.note}`,
    );
  }
}
const nofire = rows.filter((r) => r.verdict === "NOFIRE");
if (nofire.length) {
  console.log("\n⚠️ NOFIRE - mass matches no row in the table:");
  const seen = new Set<string>();
  for (const r of nofire) {
    if (seen.has(r.name)) continue;
    seen.add(r.name);
    console.log(
      `  ${r.name.slice(0, 28).padEnd(30)}${r.mass.toFixed(0).padStart(5)} g  ` +
        `(hand label ${LABEL[r.name]} wants ${FORM_G[LABEL[r.name]]} g)`,
    );
  }
  console.log(
    "\nEvery NOFIRE is either an `other` label (correct - left alone) or a rescale " +
      "that did not run (a defect). Read the labels to tell which.",
  );
}
