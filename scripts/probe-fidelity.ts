// Fidelity probe (auto-cutter Task 5): for each fixture, run phase-1
// runPagedExtraction twice — on ORIGINAL photos and on production-compressed
// (1024px JPEG q0.7 via sips) photos — record the detector verdict, and for
// non-dense verdicts score all dims against the oracle.
// Run: OPENAI_API_KEY=... deno run --allow-read --allow-write --allow-env \
//   --allow-net --allow-run scripts/probe-fidelity.ts
import { runPagedExtraction } from "../supabase/functions/analyze-menu/extract.ts";
import { scoreMenu } from "./eval-extraction.ts";

type Fixture = Parameters<typeof scoreMenu>[0];
const MENU_DIR = "/Users/santiagoaguirre/Downloads/MenusTesting";
const FIXTURE_DIR = new URL("./fixtures/", import.meta.url);
const apiKey = Deno.env.get("OPENAI_API_KEY")!;
const tmp = await Deno.makeTempDir({ prefix: "fidelity-" });

async function sh(cmd: string[]): Promise<void> {
  const out = await new Deno.Command(cmd[0], { args: cmd.slice(1) }).output();
  if (!out.success) throw new Error(`${cmd.join(" ")} failed`);
}

function mime(name: string): string {
  return name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

async function data(path: string): Promise<string> {
  return `data:${mime(path)};base64,${(await Deno.readFile(path)).toBase64()}`;
}

async function compressed(name: string): Promise<string> {
  const out = `${tmp}/${name.replaceAll("/", "_")}.jpg`;
  await sh([
    "sips",
    "-Z",
    "1024",
    "-s",
    "format",
    "jpeg",
    "-s",
    "formatOptions",
    "70",
    `${MENU_DIR}/${name}`,
    "--out",
    out,
  ]);
  return data(out);
}

const fixtures: Fixture[] = [];
for await (const entry of Deno.readDir(FIXTURE_DIR)) {
  if (entry.isFile && entry.name.endsWith(".expected.json")) {
    fixtures.push(
      JSON.parse(await Deno.readTextFile(new URL(entry.name, FIXTURE_DIR))),
    );
  }
}
fixtures.sort((a, b) => a.menu.localeCompare(b.menu));

for (const mode of ["original", "compressed"] as const) {
  console.log(`\n===== MODE: ${mode} =====`);
  for (const fixture of fixtures) {
    const photos = await Promise.all(fixture.photos.map((p) =>
      mode === "original" ? data(`${MENU_DIR}/${p}`) : compressed(p)
    ));
    try {
      const result = await runPagedExtraction(photos, apiKey);
      if ("needs_crops" in result) {
        console.log(
          `${fixture.menu}: DENSE-SIGNAL pages=${JSON.stringify(result.needs_crops)}`,
        );
        continue;
      }
      const report = scoreMenu(fixture, {
        image_quality: result.image_quality,
        items: result.items,
      });
      const dims = [
        "items",
        "options",
        "section_context",
        "categories",
        "grams",
      ] as const;
      const fails = dims.filter((d) => !(report[d] as { pass: boolean }).pass);
      console.log(
        `${fixture.menu}: normal; ${
          fails.length === 0 ? "ALL DIMS PASS" : `FAIL ${fails.join(",")}`
        }`,
      );
    } catch (error) {
      console.log(`${fixture.menu}: TERMINAL ${String(error).slice(0, 80)}`);
    }
  }
}
