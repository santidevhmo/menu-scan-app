// One-off: run current EXTRACT_PROMPT on one fixture's photos, dump raw JSON.
// Usage: deno run -A scripts/run-elmarcos.ts <fixture-name>
import { runExtraction } from "../supabase/functions/analyze-menu/extract.ts";

const MENU_DIR = "/Users/santiagoaguirre/Downloads/MenusTesting";
const apiKey = Deno.env.get("OPENAI_API_KEY");
if (!apiKey) throw new Error("OPENAI_API_KEY is required");

const menu = Deno.args[0] ?? "el-marcos";
const photoOverride = Deno.args[1];
const label = Deno.args[2] ?? "current-prompt";
const fixture = JSON.parse(
  await Deno.readTextFile(
    new URL(`./fixtures/${menu}.expected.json`, import.meta.url),
  ),
) as { photos: string[] };
const photoNames = photoOverride ? [photoOverride] : fixture.photos;

const mime = (f: string) =>
  f.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
const photos = await Promise.all(
  photoNames.map(async (p) =>
    `data:${mime(p)};base64,${
      (await Deno.readFile(`${MENU_DIR}/${p}`)).toBase64()
    }`
  ),
);
const result = await runExtraction(photos, apiKey);

const out = `${MENU_DIR}/${menu}.${label}.actual.json`;
await Deno.writeTextFile(
  out,
  `${
    JSON.stringify(
      { image_quality: result.image_quality, items: result.items },
      null,
      2,
    )
  }\n`,
);
console.log(
  `wrote ${out} — ${result.items.length} items from ${photoNames.join(", ")}`,
);
