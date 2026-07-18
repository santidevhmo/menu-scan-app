// $0 replay of the production co-location stage against an archived dump.
// Usage: deno run --env-file=.env.local --allow-env --allow-read --allow-write \
//   --allow-net=api.mistral.ai scripts/replay-colocation.ts <dump.json> <ocr-cache.json> [photo.png]
// If <ocr-cache.json> exists it is OCR'd once (~$0.004) and cached there.
// The stage logic itself is the production module — no reimplementation.
import {
  applyColocation,
  type OcrBlock,
  toBlockTexts,
} from "../supabase/functions/analyze-menu/colocation.ts";
import type { ExtractedMenuItem } from "../supabase/functions/analyze-menu/extract.ts";

const [dumpPath, ocrPath, photoPath] = Deno.args;
if (!dumpPath || !ocrPath) {
  console.error(
    "usage: replay-colocation.ts <dump.json> <ocr-cache.json> [photo.png]",
  );
  Deno.exit(2);
}

let ocrRaw: { pages?: { blocks?: OcrBlock[] }[] };
try {
  const cached = JSON.parse(await Deno.readTextFile(ocrPath)) as {
    pages?: { blocks?: OcrBlock[] }[];
    responses?: { pages?: { blocks?: OcrBlock[] }[] }[];
  };
  ocrRaw = cached.responses?.[0] ?? cached;
  console.log(`OCR cache hit: ${ocrPath} ($0)`);
} catch {
  if (!photoPath) throw new Error(`no cache at ${ocrPath} and no photo given`);
  const apiKey = Deno.env.get("MISTRAL_API_KEY");
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY required for the one paid OCR call");
  }
  const png = await Deno.readFile(photoPath);
  let b64 = "";
  for (let i = 0; i < png.length; i += 32768) {
    b64 += String.fromCharCode(...png.subarray(i, i + 32768));
  }
  console.log(`PAID CALL: Mistral OCR on ${photoPath} ≈ $0.004 …`);
  const res = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: {
        type: "image_url",
        image_url: `data:image/png;base64,${btoa(b64)}`,
      },
      include_blocks: true,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Mistral OCR ${res.status}: ${(await res.text()).slice(0, 500)}`,
    );
  }
  ocrRaw = await res.json() as { pages?: { blocks?: OcrBlock[] }[] };
  await Deno.writeTextFile(ocrPath, `${JSON.stringify(ocrRaw, null, 2)}\n`);
  console.log(`cached to ${ocrPath}`);
}

const blocks = toBlockTexts(
  (ocrRaw.pages ?? []).flatMap((p) => p.blocks ?? []),
);
const dump = JSON.parse(await Deno.readTextFile(dumpPath)) as {
  items?: ExtractedMenuItem[];
};
if (!Array.isArray(dump.items)) {
  throw new Error(`dump has no items array: ${dumpPath}`);
}
const before = dump.items;
const after = applyColocation(blocks, before);
const afterNames = new Set(after.map((i) => `${i.name}|${i.price}`));
const dropped = before.filter((i) => !afterNames.has(`${i.name}|${i.price}`));
console.log(
  `\nblocks=${blocks.length} before=${before.length} after=${after.length} dropped=${dropped.length}`,
);
for (const d of dropped) {
  console.log(`DROPPED: ${d.name} $${d.price} [${d.section_title}]`);
}
