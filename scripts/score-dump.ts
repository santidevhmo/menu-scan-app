// Scores an extraction dump against a fixture oracle.
// Usage: deno run --allow-read scripts/score-dump.ts <menu> <dump.json>
import { scoreMenu } from "./eval-extraction.ts";

const [menu, dumpPath] = Deno.args;
if (!menu || !dumpPath) {
  console.error("usage: score-dump.ts <menu> <dump.json>");
  Deno.exit(1);
}

const fixture = JSON.parse(
  await Deno.readTextFile(
    new URL(`./fixtures/${menu}.expected.json`, import.meta.url),
  ),
);
const dump = JSON.parse(await Deno.readTextFile(dumpPath));
if (!Array.isArray(dump.items)) throw new Error("dump has no items array");

const report = scoreMenu(fixture, {
  image_quality: dump.image_quality ?? { usable: true, issues: [] },
  items: dump.items,
});

let failed = 0;
for (
  const dim of [
    "items",
    "options",
    "section_context",
    "categories",
    "grams",
  ] as const
) {
  const result = report[dim] as { pass: boolean; detail: string };
  console.log(`${result.pass ? "PASS" : "FAIL"} ${dim}: ${result.detail}`);
  if (!result.pass) failed++;
}
console.log(failed === 0 ? "ALL DIMS PASS" : `${failed} dims FAIL`);
if (failed > 0) Deno.exitCode = 1;
