// Scores the three traced dishes with the harness's OWN scorer, so the numbers
// shown in docs/pipeline-walkthrough.html cannot drift from the benchmark's.
// $0 - reads scripts/fixtures/dish-traces.json, calls no API.
//
//   deno run --allow-read scripts/score-traces.ts
import { type MacroBands, scoreItemAgainstBand } from "./macro-band-score.ts";

type Trace = {
  dish: string;
  pass1: { answer: Slim } | { skipped: string };
  pass2: { answer: Slim } | { skipped: string };
  final: Slim;
};
type Slim = {
  plate_g: number;
  protein_g: number;
  carb_g: number;
  fat_g: number;
  estimated_calories: number;
};

const traces: Trace[] = JSON.parse(
  Deno.readTextFileSync("scripts/fixtures/dish-traces.json"),
);
const unweighted = JSON.parse(
  Deno.readTextFileSync("scripts/fixtures/unweighted-oracle.json"),
) as { name: string; mass_band_g: [number, number]; band: MacroBands }[];
const weighted = JSON.parse(
  Deno.readTextFileSync("scripts/fixtures/macro-oracle.json"),
) as { name: string; oracle: Record<string, number> }[];

const vals = (s: Slim) => ({
  calories: s.estimated_calories,
  protein_g: s.protein_g,
  carb_g: s.carb_g,
  fat_g: s.fat_g,
});

for (const t of traces) {
  console.log("=".repeat(70));
  console.log(t.dish);
  const u = unweighted.find((e) => e.name === t.dish);
  if (u) {
    const [lo, hi] = u.mass_band_g;
    // Every stage this dish actually passed through, scored the same way.
    const stages: [string, Slim][] = [];
    if ("answer" in t.pass1) stages.push(["pass 1", t.pass1.answer]);
    if ("answer" in t.pass2) stages.push(["pass 2", t.pass2.answer]);
    stages.push(["FINAL", t.final]);
    for (const [name, s] of stages) {
      const r = scoreItemAgainstBand(u.band, vals(s));
      const pts = r.fields.filter((f) => f.pass).length;
      const bad = r.fields.filter((f) => !f.pass).map((f) => f.field).join(", ");
      const m = s.plate_g >= lo && s.plate_g <= hi
        ? "in band"
        : s.plate_g < lo
        ? "UNDER"
        : "OVER";
      console.log(
        `  ${name.padEnd(7)} plate ${String(Math.round(s.plate_g)).padStart(4)} g ` +
          `(${lo}-${hi}, ${m})  ${pts}/4${bad ? "  miss: " + bad : ""}`,
      );
    }
    continue;
  }
  const w = weighted.find((e) => e.name === t.dish);
  if (!w) {
    console.log("  not in either oracle");
    continue;
  }
  // The weighted oracle states point values, not bands: report signed % error,
  // which is what bench-macros reports.
  console.log("  field      model    oracle     error");
  for (const [k, got] of Object.entries(vals(t.final))) {
    const want = w.oracle[k];
    const pct = ((got - want) / want) * 100;
    console.log(
      `  ${k.padEnd(10)} ${String(got).padStart(5)} ${want.toFixed(1).padStart(9)} ` +
        `${(pct >= 0 ? "+" : "") + pct.toFixed(1)}%`,
    );
  }
}
