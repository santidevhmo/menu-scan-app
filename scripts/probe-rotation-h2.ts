// H2.1 — rotation-detection separability probe (planner-designed; Santiago
// approved ~$0.048 = 12 Mistral OCR calls, 2026-07-22). MEASURES ONLY.
// Harness-only: NO production code touched.
//
// Usage (foreground; <2 min):
//   deno run --env-file=.env.local --allow-read --allow-write --allow-env \
//     --allow-net=api.mistral.ai --allow-run=sips scripts/probe-rotation-h2.ts
import { compressedPhotoData, MENU_DIR } from "./photo-input.ts";
import { firstPage, type OcrBlock } from "./probe-textsize-eval088.ts";

const SUB = "MenuRotationTesting";
const ROT_DIR = `${MENU_DIR}/${SUB}/_rot`;
const MENUS = [
  { menu: "bistro", photo: "BistroMenu.png", correct: 90 },
  { menu: "polloteria", photo: "PolloteriaMenu.png", correct: 90 },
  { menu: "el-marcos", photo: "ElMarcosMenu.png", correct: 270 },
  { menu: "guest-house", photo: "GuestHouseMenu.png", correct: 270 },
];

export function totalChars(blocks: OcrBlock[]): number {
  return blocks.reduce((n, b) => n + (b.content ?? "").trim().length, 0);
}
export function wordCount(blocks: OcrBlock[]): number {
  let n = 0;
  for (const b of blocks) {
    for (const t of (b.content ?? "").split(/\s+/)) {
      if (/\p{L}{2,}/u.test(t)) n++;
    }
  }
  return n;
}
export function nonEmptyBlocks(blocks: OcrBlock[]): number {
  return blocks.filter((b) => (b.content ?? "").trim().length > 0).length;
}
/** Fraction of text blocks wider-than-tall (horizontal text lines). */
export function wideBlockFraction(blocks: OcrBlock[]): number {
  const d = blocks
    .filter((b) => (b.content ?? "").trim().length > 0)
    .map((b) => ({
      w: b.bottom_right_x - b.top_left_x,
      h: b.bottom_right_y - b.top_left_y,
    }))
    .filter((x) => x.w > 0 && x.h > 0);
  if (!d.length) return 0;
  return d.filter((x) => x.w >= x.h).length / d.length;
}
/** Keys in the raw OCR JSON hinting at orientation metadata. */
export function orientationKeys(rawJson: string): string[] {
  const hits = new Set<string>();
  const re = /"([^"]*(?:rotat|orient|angle|skew)[^"]*)"\s*:/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawJson)) !== null) hits.add(m[1]);
  return [...hits];
}

async function sipsRotate(srcAbs: string, deg: number, outAbs: string) {
  if (deg % 360 === 0) {
    await Deno.copyFile(srcAbs, outAbs);
    return;
  }
  const out = await new Deno.Command("sips", {
    args: ["-r", String(deg), srcAbs, "--out", outAbs],
    stderr: "piped",
  }).output();
  if (!out.success) {
    throw new Error(`sips -r ${deg}: ${new TextDecoder().decode(out.stderr)}`);
  }
}
async function fetchOcr(dataUrl: string, key: string): Promise<unknown> {
  const res = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: { type: "image_url", image_url: dataUrl },
      include_blocks: true,
    }),
  });
  if (!res.ok) throw new Error(`OCR HTTP ${res.status}: ${await res.text()}`);
  return await res.json();
}

if (import.meta.main) {
  const key = Deno.env.get("MISTRAL_API_KEY");
  if (!key) throw new Error("MISTRAL_API_KEY missing (worktree .env.local)");
  await Deno.mkdir(ROT_DIR, { recursive: true });
  const tmp = await Deno.makeTempDir();
  let paid = 0;
  const rows: string[][] = [];
  const orientNotes: string[] = [];
  const summary: string[] = [];
  for (const m of MENUS) {
    const orients = [
      { tag: "r0", deg: 0 },
      { tag: "rCorrect", deg: m.correct },
      { tag: "rFlip", deg: (m.correct + 180) % 360 },
    ];
    const charByTag: Record<string, number> = {};
    for (const o of orients) {
      const cachePath =
        `${MENU_DIR}/${SUB}/${m.menu}-${o.tag}.mistral-ocr.json`;
      let raw: unknown;
      try {
        raw = JSON.parse(await Deno.readTextFile(cachePath));
        console.log(`[cache hit] ${m.menu} ${o.tag}`);
      } catch {
        if (paid >= 12) throw new Error("paid-call cap (12) reached");
        paid++;
        console.log(`[OCR ${paid}/12] ${m.menu} ${o.tag} (rot ${o.deg})`);
        const rotName = `${SUB}/_rot/${m.menu}-${o.tag}.png`;
        await sipsRotate(
          `${MENU_DIR}/${SUB}/${m.photo}`,
          o.deg,
          `${MENU_DIR}/${rotName}`,
        );
        const dataUrl = await compressedPhotoData(rotName, 2048, 95, tmp);
        raw = await fetchOcr(dataUrl, key);
        await Deno.writeTextFile(cachePath, JSON.stringify(raw, null, 2));
        console.log(`  cached -> ${cachePath}`);
      }
      const page = firstPage(raw);
      const chars = totalChars(page.blocks);
      charByTag[o.tag] = chars;
      rows.push([
        m.menu,
        o.tag,
        `${o.deg}`,
        `${page.dimensions.width}x${page.dimensions.height}`,
        String(nonEmptyBlocks(page.blocks)),
        String(chars),
        String(wordCount(page.blocks)),
        wideBlockFraction(page.blocks).toFixed(2),
      ]);
      if (o.tag === "r0") {
        const keys = orientationKeys(JSON.stringify(raw));
        orientNotes.push(
          `${m.menu} r0 orientation-keys: ${
            keys.length ? keys.join(", ") : "(none)"
          }`,
        );
      }
    }
    const best = Object.entries(charByTag).sort((a, b) => b[1] - a[1])[0][0];
    summary.push(
      `${m.menu}: max-chars=${best} (expected rCorrect) | ${
        Object.entries(charByTag).map(([k, v]) => `${k}=${v}`).join(" ")
      }`,
    );
  }
  console.log(
    "\nmenu | orient | deg | ocr-dims | blocks | chars | words | wide-frac",
  );
  for (const r of rows) console.log(r.join(" | "));
  console.log("\n-- single-shot orientation field (Gate 2a) --");
  for (const n of orientNotes) console.log(n);
  console.log("\n-- verification separability (Gate 1) --");
  for (const s of summary) console.log(s);
  console.log(`\npaid OCR calls: ${paid} (~$${(paid * 0.004).toFixed(3)})`);
}
