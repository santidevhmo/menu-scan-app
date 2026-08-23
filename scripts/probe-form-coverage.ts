// PAID PROBE, eval 176: how often does the FORM table have no row for a real
// dish? The one question that decides whether the mechanism ships.
//
// Eval 175 got 57/57 label agreement, but the 20-row taxonomy was written FROM
// those 57 dishes, so every one had a fitting row waiting. This runs the same enum
// over the FIVE archived menus that have never contributed a ruled dish -
// brasero, casa-nostra, guest-house, mochomos, polloteria - which the table was
// not built from.
//
// There is no oracle for those menus, so nothing here can be SCORED. The only
// output is the `other` rate: how much of a real menu the table cannot size. It is
// reported against the seen menus as the baseline.
//
// `other` returns null in applyFormMass, so an `other` dish keeps today's answer.
// A high rate means the mechanism helps less than +97 suggests; it does NOT mean
// it makes anything worse.
//
//   deno run --allow-read scripts/probe-form-coverage.ts --count   # $0, no calls
//   deno run --allow-read --allow-write --allow-env --allow-net \
//     --env-file=.env.local scripts/probe-form-coverage.ts
import { itemsFromArchiveFile } from "./bench-pipeline.ts";
import { FORM_ENUM, labelForms } from "./arm-dish-form.ts";

const CACHE = "scripts/fixtures/caches";

/** Every archived extraction, split by whether the taxonomy was built from it. */
const SEEN: Record<string, string> = {
  andaluz: "andaluz.eval128-r1.raw.json",
  bistro: "bistro.eval117-r1.raw.json",
  "brasero-two": "brasero-two.eval117-r1.raw.json",
  "el-marcos": "el-marcos.eval103c-m41-r1.raw.json",
  nikkori: "nikkori.eval117-r1.raw.json",
};
const UNSEEN: Record<string, string> = {
  brasero: "brasero.eval117-r1.raw.json",
  "casa-nostra": "casa-nostra.eval117-r1.raw.json",
  "guest-house": "guest-house.eval117-r1.raw.json",
  mochomos: "mochomos.eval117-r1.raw.json",
  polloteria: "polloteria.eval117-r1.raw.json",
};

const countOnly = Deno.args.includes("--count");

if (countOnly) {
  let seen = 0, unseen = 0;
  for (const [group, menus] of [["SEEN", SEEN], ["UNSEEN", UNSEEN]] as const) {
    for (const [menu, file] of Object.entries(menus)) {
      const n = itemsFromArchiveFile(file).length;
      if (group === "SEEN") seen += n;
      else unseen += n;
      console.log(`${group.padEnd(7)}${menu.padEnd(14)}${String(n).padStart(4)} items`);
    }
  }
  console.log(`\nseen ${seen}, unseen ${unseen}, total ${seen + unseen} items`);
  console.log(
    `${Math.ceil((seen + unseen) / 10)} batches of 10 - labels only, a few tokens per item.`,
  );
} else {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required in .env.local");
  console.log(`enum has ${FORM_ENUM.length} rows\n`);
  console.log(
    `${"group".padEnd(8)}${"menu".padEnd(14)}${"items".padStart(6)}${
      "other".padStart(7)
    }${"rate".padStart(8)}`,
  );
  const tally: Record<string, [number, number]> = {
    SEEN: [0, 0],
    UNSEEN: [0, 0],
  };
  const unmatched: string[] = [];
  for (const [group, menus] of [["SEEN", SEEN], ["UNSEEN", UNSEEN]] as const) {
    for (const [menu, file] of Object.entries(menus)) {
      const items = itemsFromArchiveFile(file);
      let batch = 0;
      const labels = await labelForms(items, apiKey, (raw) =>
        Deno.writeTextFileSync(
          `${CACHE}/formcoverage.${menu}-b${batch++}.raw.json`,
          JSON.stringify(raw, null, 2),
        ));
      // A dish the model did not echo back is NOT counted as covered - it is
      // counted as unsized, which is what applyFormMass would do with it.
      const other = items.filter((it) =>
        (labels.get(it.name) ?? "other") === "other"
      );
      tally[group][0] += items.length;
      tally[group][1] += other.length;
      unmatched.push(...other.slice(0, 4).map((it) => `${menu}: ${it.name}`));
      console.log(
        `${group.padEnd(8)}${menu.padEnd(14)}${
          String(items.length).padStart(6)
        }${String(other.length).padStart(7)}${
          `${((100 * other.length) / items.length).toFixed(0)}%`.padStart(8)
        }`,
      );
    }
  }
  console.log("");
  for (const g of ["SEEN", "UNSEEN"]) {
    const [n, o] = tally[g];
    console.log(
      `${g.padEnd(8)}${n} items, ${o} unsized (${
        ((100 * o) / n).toFixed(0)
      }%) -> the table sizes ${(100 - (100 * o) / n).toFixed(0)}%`,
    );
  }
  console.log("\na sample of what the table has no row for:");
  for (const u of unmatched.slice(0, 16)) console.log(`  ${u}`);
}
