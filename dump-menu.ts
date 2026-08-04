import { cleanForScore, itemsFromRaw } from "./scripts/score-c-dumps.ts";
import { ocrMarkdown, ocrSourcePaths } from "./scripts/probe-c-textstructure.ts";
const menu = Deno.args[0];
const tag = Deno.env.get("TAG") ?? "eval103c-m41";
const markdown = (await Promise.all(
  ocrSourcePaths(menu).map(async (p) => ocrMarkdown(JSON.parse(await Deno.readTextFile(p)))),
)).join("\n");
for (const it of cleanForScore(await itemsFromRaw(menu, tag), markdown).items) {
  if ((it.options ?? []).length === 0 && !Deno.env.get("ALL")) continue;
  console.log(`${it.name} | $${it.price} | g=${it.grams} | opts=[${(it.options ?? []).map((o) => `${o.name}${o.price != null ? "=$" + o.price : ""}${o.grams != null ? "/" + o.grams + "g" : ""}`).join(" ; ")}]`);
}
