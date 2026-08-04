// Guards the corrected draft truths in scripts/fixtures/drafts/ (eval 109).
//
// Two failure classes, both of which went undetected for months because these
// files lived untracked in ~/Downloads with no automated check:
//
//   1. A draft contradicting ITSELF — `Boneless - FIT (300gr) $160` carried
//      price 185 / grams 350 (Tender Cordon Bleu's values).
//   2. A fixture contradicting the draft — required option pins that scored
//      perfectly against the extractor while missing 3 targets on the truth.
//      A pin has TWO oracles (master-roadmap lesson 18).
import { assertEquals } from "jsr:@std/assert";
import { scoreMenu } from "./eval-extraction.ts";

const DRAFTS: Record<string, string> = {
  polloteria: "PolloteriaMenu.png.draft.json",
  bistro: "BistroMenu.png.draft.json",
  "guest-house": "GuestHouseMenu.png.draft.json",
  andaluz: "AndaluzMenu.jpg.draft.json",
};
const DIMS = [
  "items",
  "options",
  "section_context",
  "categories",
  "grams",
] as const;

const read = async (path: string) =>
  JSON.parse(await Deno.readTextFile(new URL(path, import.meta.url)));

for (const [menu, file] of Object.entries(DRAFTS)) {
  Deno.test(`${menu} draft does not contradict itself`, async () => {
    const draft = await read(`./fixtures/drafts/${file}`);
    const conflicts: string[] = [];
    for (const item of draft.items) {
      const name: string = item.name ?? "";
      const price = name.match(/\$\s*(\d+(?:\.\d+)?)/);
      if (price && Number(price[1]) !== item.price) {
        conflicts.push(`${name}: price ${item.price} vs name $${price[1]}`);
      }
      const grams = name.match(/\((\d+)\s*gr/i);
      if (grams && Number(grams[1]) !== item.grams) {
        conflicts.push(`${name}: grams ${item.grams} vs name ${grams[1]}gr`);
      }
    }
    assertEquals(conflicts, []);
  });

  Deno.test(`${menu} draft satisfies its own fixture`, async () => {
    const draft = await read(`./fixtures/drafts/${file}`);
    const fixture = await read(`./fixtures/${menu}.expected.json`);
    const report = scoreMenu(fixture, {
      image_quality: draft.image_quality ?? { usable: true, issues: [] },
      items: draft.items,
    });
    const failed = DIMS.filter((dim) => !report[dim].pass)
      .map((dim) => `${dim}: ${report[dim].detail}`);
    assertEquals(failed, []);
  });
}
