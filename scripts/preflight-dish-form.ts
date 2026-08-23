// $0 pre-flight for probe-dish-form.ts: does the ruled-dish filter actually
// resolve all 57 dishes from the extraction archives? Buying labels for a menu
// the filter silently drops would produce a believable score over part of the set.
//
//   deno run --allow-read scripts/preflight-dish-form.ts
import { itemsFromArchiveFile } from "./bench-pipeline.ts";
import { MENUS, oracle } from "./dish-forms.ts";

const MENU_ARCHIVE: Record<string, string> = {
  bistro: "bistro.eval117-r1.raw.json",
  andaluz: "andaluz.eval128-r1.raw.json",
  nikkori: "nikkori.eval117-r1.raw.json",
  "el-marcos": "el-marcos.eval103c-m41-r1.raw.json",
  "brasero-two": "brasero-two.eval117-r1.raw.json",
};

let total = 0;
const problems: string[] = [];
for (const menu of MENUS) {
  if (!MENU_ARCHIVE[menu]) {
    problems.push(`no archive mapped for menu "${menu}"`);
    continue;
  }
  const whole = itemsFromArchiveFile(MENU_ARCHIVE[menu]);
  const ruled = whole.filter((it) =>
    oracle.some((e) => e.name === it.name && e.menu === menu)
  );
  const expected = oracle.filter((e) => e.menu === menu).length;
  total += ruled.length;
  const ok = ruled.length === expected;
  if (!ok) {
    const got = new Set(ruled.map((r) => r.name));
    problems.push(
      `${menu}: matched ${ruled.length} of ${expected} - missing ${
        oracle.filter((e) => e.menu === menu && !got.has(e.name)).map((e) =>
          e.name
        ).join(", ")
      }`,
    );
  }
  console.log(
    `${menu.padEnd(13)} archive ${String(whole.length).padStart(3)} items, ` +
      `matched ${String(ruled.length).padStart(3)} of ${expected} ruled  ${
        ok ? "OK" : "*** MISMATCH"
      }`,
  );
}
console.log(`\ntotal matched ${total} of ${oracle.length}`);
if (problems.length) throw new Error(problems.join("\n"));
console.log("pre-flight OK - every ruled dish resolves, safe to buy labels.");
