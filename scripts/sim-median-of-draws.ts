// $0. DOES AGGREGATING THE DRAWS BEAT SCORING THEM SEPARATELY?
//
// The external research review's cheapest recommendation (its "Experiment 3"):
// this pipeline is non-deterministic despite temperature 0 and a fixed seed, so it
// already draws k=3 and reports a range. Self-consistency says the MEDIAN of k
// draws should beat any single draw, and the median is more robust than the mean
// against the round-number spikes at 20/30/50/100 that this phase has measured.
// Costs nothing: it re-reads archives already paid for.
//
// What it compares, per dish:
//   per-draw   the mean points the harness gives across the 3 draws — today's
//              number, i.e. what one user request is expected to score
//   median     the per-macro median across the 3 draws, scored ONCE — what a
//              request would score if production sent 3 calls and took the middle
//
// ⚠️ This is NOT free in production. Today's answer is one call; the median needs
// three. The point of measuring it at $0 first is to find out whether 3x the cost
// buys anything before anyone proposes paying it.
//
//   deno run --allow-read scripts/sim-median-of-draws.ts dual NOBOOST
import { scoreItemAgainstBand } from "./macro-band-score.ts";
import type { UnweightedEntry } from "./unweighted-oracle.ts";
import { isBackfilled } from "./bench-pipeline.ts";

const ORACLE = "scripts/fixtures/unweighted-oracle.json";
const CACHE = "scripts/fixtures/caches";
const DRAWS = 3;
const MACROS = ["calories", "protein_g", "carb_g", "fat_g"] as const;

const oracle: UnweightedEntry[] = JSON.parse(await Deno.readTextFile(ORACLE));
const arms = Deno.args.filter((a) => !a.startsWith("--"));
if (arms.length < 1) throw new Error("give at least one arm name");

function armFile(arm: string): string {
  const [name, label] = arm.split("@");
  return `${name}-f${label ? `-${label}` : ""}`;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

for (const arm of arms) {
  let perDrawTotal = 0, medianTotal = 0, dishes = 0;
  const moved: string[] = [];
  for (const e of oracle) {
    // macro -> one value per scored draw
    const got: Record<string, number[]> = { calories: [], protein_g: [], carb_g: [], fat_g: [] };
    let pts = 0, scored = 0;
    for (let d = 0; d < DRAWS; d++) {
      let raw: string;
      try {
        raw = await Deno.readTextFile(
          `${CACHE}/unweighted.${armFile(arm)}.${e.menu}-d${d}.raw.json`,
        );
      } catch {
        continue;
      }
      const item = JSON.parse(raw).items.find((i: { name: string }) => i.name === e.name);
      if (!item || isBackfilled(item)) continue;
      const m = {
        calories: item.estimated_calories ?? 0,
        protein_g: item.protein_g ?? 0,
        carb_g: item.carb_g ?? 0,
        fat_g: item.fat_g ?? 0,
      };
      for (const k of MACROS) got[k].push(m[k]);
      pts += scoreItemAgainstBand(e.band, m).fields.filter((f) => f.pass).length;
      scored++;
    }
    if (scored === 0) continue;
    dishes++;
    const perDraw = pts / scored;
    // Median taken PER MACRO independently. That can produce a combination no
    // single draw returned - which is the point, and is also why this is a
    // simulation of a production change rather than a rescoring of one.
    const med = Object.fromEntries(MACROS.map((k) => [k, Math.round(median(got[k]))]));
    const medPts = scoreItemAgainstBand(
      e.band,
      med as Record<typeof MACROS[number], number>,
    ).fields.filter((f) => f.pass).length;
    perDrawTotal += perDraw;
    medianTotal += medPts;
    if (Math.abs(medPts - perDraw) >= 0.66) {
      moved.push(`${e.name} ${perDraw.toFixed(2)} → ${medPts}`);
    }
  }
  const scale = (x: number) => (x * DRAWS).toFixed(1);
  console.log(
    `\n${arm}  over ${dishes} dishes` +
      `\n  per-draw (today)     ${perDrawTotal.toFixed(2)}/${dishes * 4}` +
      `   → ${scale(perDrawTotal)}/${dishes * 4 * DRAWS} on the published scale` +
      `\n  median-of-${DRAWS}          ${medianTotal}/${dishes * 4}` +
      `   → ${scale(medianTotal)}/${dishes * 4 * DRAWS} equivalent` +
      `\n  difference           ${medianTotal - perDrawTotal >= 0 ? "+" : ""}${
        (medianTotal - perDrawTotal).toFixed(2)
      } points per draw (${
        ((medianTotal - perDrawTotal) * DRAWS).toFixed(1)
      } on the published scale), at 3x the calls`,
  );
  if (moved.length) console.log(`  dishes that moved: ${moved.join(", ")}`);
}
