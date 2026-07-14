// Draft extraction for NEW menu photos (fixture onboarding, ticket #4+):
// runs the full production path (passthrough input; dense → 2x2 tiles from the
// ORIGINAL) and writes <MENU_DIR>/<photo>.draft.json for oracle drafting.
// Usage: OPENAI_API_KEY=... deno run --allow-read --allow-write --allow-env \
//   --allow-net --allow-run scripts/extract-draft.ts BistroMenu.png PolloteriaMenu.png
// Multi-page menus: comma-join pages into one arg ("PageOne.png,PageTwo.png").
import {
  runGroupedExtraction,
  runPagedExtraction,
} from "../supabase/functions/analyze-menu/extract.ts";
import { gridCropRects } from "../src/lib/adaptiveExtraction.ts";
import { MENU_DIR, productionPhotoData } from "./photo-input.ts";

const apiKey = Deno.env.get("OPENAI_API_KEY")!;
const tmp = await Deno.makeTempDir({ prefix: "draft-" });

async function sh(args: string[]): Promise<void> {
  const out = await new Deno.Command(args[0], { args: args.slice(1) }).output();
  if (!out.success) {
    throw new Error(
      `${args.join(" ")} failed: ${new TextDecoder().decode(out.stderr)}`,
    );
  }
}

async function dims(path: string): Promise<{ w: number; h: number }> {
  const out = await new Deno.Command("sips", {
    args: ["-g", "pixelWidth", "-g", "pixelHeight", path],
  }).output();
  const text = new TextDecoder().decode(out.stdout);
  return {
    w: Number(text.match(/pixelWidth: (\d+)/)?.[1]),
    h: Number(text.match(/pixelHeight: (\d+)/)?.[1]),
  };
}

// Same recipe as eval-027-live cutTiles: PNG tiles from the ORIGINAL photo.
async function cutTiles(name: string): Promise<string[]> {
  const src = `${MENU_DIR}/${name}`;
  const { w, h } = await dims(src);
  const tiles: string[] = [];
  for (const [i, rect] of gridCropRects(w, h).entries()) {
    const out = `${tmp}/${name.replaceAll("/", "_")}.tile${i}.png`;
    await sh([
      "sips",
      "-s",
      "format",
      "png",
      "--cropOffset",
      String(rect.originY),
      String(rect.originX),
      "-c",
      String(rect.height),
      String(rect.width),
      src,
      "--out",
      out,
    ]);
    tiles.push(
      `data:image/png;base64,${(await Deno.readFile(out)).toBase64()}`,
    );
  }
  return tiles;
}

for (const arg of Deno.args) {
  const pages = arg.split(",").map((s) => s.trim());
  const photos = await Promise.all(
    pages.map((p) => productionPhotoData(p, tmp)),
  );
  let result;
  let dense: number[] = [];
  const phase1 = await runPagedExtraction(photos, apiKey);
  if ("needs_crops" in phase1) {
    dense = phase1.needs_crops;
    const denseSet = new Set(dense);
    const groups = await Promise.all(pages.map(async (name, index) =>
      denseSet.has(index)
        ? await cutTiles(name)
        : [await productionPhotoData(name, tmp)]
    ));
    result = await runGroupedExtraction(groups, apiKey);
  } else {
    result = phase1;
  }
  const outPath = `${MENU_DIR}/${pages[0]}.draft.json`;
  await Deno.writeTextFile(
    outPath,
    `${
      JSON.stringify(
        {
          dense_pages: dense,
          image_quality: result.image_quality,
          items: result.items,
        },
        null,
        2,
      )
    }\n`,
  );
  console.log(
    `${arg}: ${dense.length ? `DENSE pages=${JSON.stringify(dense)}` : "normal"}; ${result.items.length} items → ${outPath}`,
  );
}
