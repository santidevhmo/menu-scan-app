// Is `typical_total_g` CALIBRATED? Two independent yardsticks, one run each.
//
// The anchor decides how big an unweighted dish is, and no fixture can score it:
// all 8 were selected FOR carrying a printed weight. So we borrow ground truth
// from two places that already know the answer.
//
//   BLIND  - the 8 fixtures with their printed weight cut out of the payload.
//            The menu's own number becomes the truth the model never saw.
//   USDA   - five dishes USDA has actually weighed, which no fixture contains.
//            Checks, NOT constants: nothing here is shipped or prompted.
//
// Reaches the model through enrichBatch, the deployed request.
//
// Run: OPENAI_API_KEY=... deno run --allow-read --allow-write --allow-env --allow-net \
//        scripts/probe-anchor-calibration.ts
import {
  enrichBatch,
  type ExtractedItem,
} from "../supabase/functions/analyze-menu/enrich.ts";
import { loadOracle, ORACLE_PATH } from "./bench-macros.ts";

/** Removes the printed weight from the text the model sees. */
export function blind(text: string, printedWeight: string): string {
  if (!printedWeight) return text;
  // The weight appears as the menu prints it - "200 g", "300gr.", "(280gr)" -
  // so the literal string is cut along with any brackets left around it.
  const escaped = printedWeight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text
    .replace(new RegExp(`\\(\\s*${escaped}\\s*\\)`, "gi"), "")
    .replace(new RegExp(escaped, "gi"), "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** The number a printed weight string means, e.g. "300gr." -> 300. */
export function printedGrams(printedWeight: string): number | null {
  const m = printedWeight.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

/**
 * Dishes USDA has weighed. The `truth` is the whole ORDER, not one piece, since
 * that is what typical_total_g means.
 */
const USDA_CHECKS: (ExtractedItem & { truth: number; source: string })[] = [
  {
    name: "California Roll",
    description: "Surimi, avocado and cucumber, rolled with rice outside.",
    price: 120,
    category: "food",
    truth: 240,
    source: "FDC 2344446: 1 piece 30 g x 8 pieces",
  },
  {
    name: "Cheese Pizza",
    description: "Classic cheese pizza, original crust, 14 inch.",
    price: 210,
    category: "food",
    truth: 938,
    source: "FDC/USDA SR: Papa John's 14in cheese, whole pie",
  },
  {
    name: "Thin Crust Pepperoni Pizza",
    description: "Pepperoni pizza on crunchy thin crust, 14 inch.",
    price: 220,
    category: "food",
    truth: 563,
    source: "FDC: Domino's 14in thin crust, whole pie",
  },
  {
    name: "Crunchy Beef Taco",
    description: "Hard shell taco with seasoned beef, cheese and lettuce.",
    price: 45,
    category: "food",
    truth: 69,
    source: "FDC 170332",
  },
  {
    name: "Buffalo Wings (10 pz)",
    description: "Ten bone-in chicken wings tossed in buffalo sauce.",
    price: 189,
    category: "food",
    truth: 320,
    source: "USDA/poultry-science: cooked segment 30-34 g x 10",
  },
];

interface Row {
  name: string;
  truth: number;
  anchor: number | null;
  printed: number | null;
  pieces: number | null | undefined;
}

function report(title: string, rows: Row[], passAt: number): string {
  const errs: number[] = [];
  const lines = rows.map((r) => {
    const err = r.anchor === null
      ? null
      : Math.abs(r.anchor - r.truth) / r.truth;
    if (err !== null) errs.push(err);
    return `| ${r.name} | ${r.truth} | ${r.anchor ?? "—"} | ${
      err === null ? "—" : `${(err * 100).toFixed(1)}%`
    } | ${r.printed ?? "—"} | ${r.pieces ?? "—"} |`;
  });
  const sorted = [...errs].sort((a, b) => a - b);
  const median = sorted.length ? sorted[Math.floor(sorted.length / 2)] : NaN;
  const mean = errs.length
    ? errs.reduce((s, e) => s + e, 0) / errs.length
    : NaN;
  const within = errs.filter((e) => e <= passAt).length;
  return [
    `\n## ${title}`,
    "| dish | truth g | anchor g | error | printed g | pieces |",
    "|---|---|---|---|---|---|",
    ...lines,
    `\nmedian error ${(median * 100).toFixed(1)}% · mean (MAPE) ${
      (mean * 100).toFixed(1)
    }% · within ${(passAt * 100).toFixed(0)}%: ${within}/${rows.length}`,
  ].join("\n");
}

if (import.meta.main) {
  const key = Deno.env.get("OPENAI_API_KEY")!;

  // ── BLIND: the 8 fixtures, printed weight cut out ────────────────────────
  const entries = loadOracle(ORACLE_PATH);
  const blinded: ExtractedItem[] = entries.map((e) => ({
    name: blind(e.name, e.printed_weight),
    description: blind(e.description ?? "", e.printed_weight),
    price: e.price ?? null,
    category: e.category ?? "food",
  }));
  const blindOut = await enrichBatch(blinded, key);
  const blindRows: Row[] = entries.map((e, i) => ({
    name: e.name,
    truth: printedGrams(e.printed_weight) ?? 0,
    anchor: blindOut[i]?.typical_total_g ?? null,
    printed: blindOut[i]?.printed_total_g ?? null,
    pieces: blindOut[i]?.serving_pieces,
  }));

  // ── USDA: five weighed dishes no fixture contains ────────────────────────
  const usdaOut = await enrichBatch(
    USDA_CHECKS.map(({ truth: _t, source: _s, ...item }) => item),
    key,
  );
  const usdaRows: Row[] = USDA_CHECKS.map((c, i) => ({
    name: c.name,
    truth: c.truth,
    anchor: usdaOut[i]?.typical_total_g ?? null,
    printed: usdaOut[i]?.printed_total_g ?? null,
    pieces: usdaOut[i]?.serving_pieces,
  }));

  console.log(
    report("TEST 1 — blinded fixtures (pass: median <= 25%)", blindRows, 0.25),
  );
  console.log(
    report(
      "TEST 5 — USDA weighed dishes (pass: 3 of 5 within 30%)",
      usdaRows,
      0.30,
    ),
  );
  console.log(
    "\nUSDA sources: " +
      USDA_CHECKS.map((c) => `${c.name} — ${c.source}`).join(" · "),
  );

  await Deno.writeTextFile(
    Deno.args[0] ?? "scratchpad-anchor-calibration.json",
    JSON.stringify({ blind: blindOut, usda: usdaOut }, null, 2),
  );
}
