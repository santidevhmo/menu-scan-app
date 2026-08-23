// $0: the raw `other` rate from probe-form-coverage.ts OVERSTATES the gap, because
// some of those items were never candidates for form sizing in the first place.
//
// applyFormMass already skips a dish with a PRINTED weight - the menu said what it
// weighs and a category average must not overrule the page. Drinks are out of
// scope for this phase entirely. So the number that matters is not "how many items
// got `other`" but "how many items that the mechanism WOULD have sized got
// `other`".
//
// Reads the archives probe-form-coverage.ts already bought. No new spend.
//
//   deno run --allow-read scripts/sim-form-coverage-split.ts
import { itemsFromArchiveFile } from "./bench-pipeline.ts";

const CACHE = "scripts/fixtures/caches";

const GROUPS: Record<string, Record<string, string>> = {
  SEEN: {
    andaluz: "andaluz.eval128-r1.raw.json",
    bistro: "bistro.eval117-r1.raw.json",
    "brasero-two": "brasero-two.eval117-r1.raw.json",
    "el-marcos": "el-marcos.eval103c-m41-r1.raw.json",
    nikkori: "nikkori.eval117-r1.raw.json",
  },
  UNSEEN: {
    brasero: "brasero.eval117-r1.raw.json",
    "casa-nostra": "casa-nostra.eval117-r1.raw.json",
    "guest-house": "guest-house.eval117-r1.raw.json",
    mochomos: "mochomos.eval117-r1.raw.json",
    polloteria: "polloteria.eval117-r1.raw.json",
  },
};

/**
 * A printed weight, as Stage 2 would find one. Deliberately the loose version -
 * "20 g", "200g", "300gr.", "70gr." all appear across these menus - because the
 * point is to be GENEROUS about what counts as already-weighed, so the residual
 * uncovered-food number is a worst case rather than a flattering one.
 */
const WEIGHT = /\d+\s*(g|gr|gramos|grs)\b\.?/i;

function labelsFor(menu: string): Map<string, string> {
  const out = new Map<string, string>();
  for (let b = 0;; b++) {
    let raw: string;
    try {
      raw = Deno.readTextFileSync(`${CACHE}/formcoverage.${menu}-b${b}.raw.json`);
    } catch {
      return out;
    }
    const content = JSON.parse(raw).choices[0].message.content;
    for (const it of JSON.parse(content).items) {
      if (it?.name && it?.dish_form) out.set(it.name, it.dish_form);
    }
  }
}

console.log(
  `${"group".padEnd(8)}${"menu".padEnd(14)}${"items".padStart(6)}${
    "drink".padStart(7)
  }${"printed".padStart(8)}${"CAND".padStart(6)}${"other".padStart(7)}${
    "GAP".padStart(7)
  }`,
);
const tally: Record<string, [number, number]> = { SEEN: [0, 0], UNSEEN: [0, 0] };
const uncovered: string[] = [];

for (const [group, menus] of Object.entries(GROUPS)) {
  for (const [menu, file] of Object.entries(menus)) {
    const items = itemsFromArchiveFile(file);
    const labels = labelsFor(menu);
    // deno-lint-ignore no-explicit-any
    const isDrink = (it: any) => it.category === "drink";
    // deno-lint-ignore no-explicit-any
    const isPrinted = (it: any) =>
      WEIGHT.test(it.name ?? "") || WEIGHT.test(it.description ?? "");
    const cand = items.filter((it) => !isDrink(it) && !isPrinted(it));
    const gap = cand.filter((it) => (labels.get(it.name) ?? "other") === "other");
    tally[group][0] += cand.length;
    tally[group][1] += gap.length;
    uncovered.push(...gap.slice(0, 3).map((it) => `${menu}: ${it.name}`));
    console.log(
      `${group.padEnd(8)}${menu.padEnd(14)}${String(items.length).padStart(6)}${
        String(items.filter(isDrink).length).padStart(7)
      }${String(items.filter(isPrinted).length).padStart(8)}${
        String(cand.length).padStart(6)
      }${
        String(
          items.filter((it) => (labels.get(it.name) ?? "other") === "other")
            .length,
        ).padStart(7)
      }${String(gap.length).padStart(7)}`,
    );
  }
}

console.log(
  "\nCAND = items the mechanism would actually try to size (not a drink, no printed weight).",
);
console.log("GAP  = of those, how many the table has no row for.\n");
for (const g of ["SEEN", "UNSEEN"]) {
  const [n, o] = tally[g];
  console.log(
    `${g.padEnd(8)}${n} candidates, ${o} with no row (${
      ((100 * o) / n).toFixed(0)
    }%) -> the table sizes ${(100 - (100 * o) / n).toFixed(0)}% of them`,
  );
}
console.log("\na sample of genuinely uncovered FOOD:");
for (const u of uncovered.slice(0, 18)) console.log(`  ${u}`);
