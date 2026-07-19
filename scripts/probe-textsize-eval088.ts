// Eval 088 — hypothesis probe (planner-designed; Santiago approved ~$0.03,
// 2026-07-18): "dense = printed per-line text height falls below a legibility
// floor after GPT's 768px-shortest-side rescale." This script only MEASURES;
// the planner judges the result. Harness-only: no production code involved.
//
// Reuses cached OCR responses when present; otherwise makes ONE Mistral OCR
// call per menu on its 2048/q95 JPEG copy (the colocation input transform)
// and caches the response durably in ~/Downloads/MenusTesting/.
//
// Usage (foreground; <2 min):
//   deno run --env-file=.env.local --allow-read --allow-write --allow-env \
//     --allow-net=api.mistral.ai --allow-run=sips scripts/probe-textsize-eval088.ts

import { compressedPhotoData, MENU_DIR } from "./photo-input.ts";

export interface OcrBlock {
  content: string;
  top_left_x: number;
  top_left_y: number;
  bottom_right_x: number;
  bottom_right_y: number;
  type?: string;
}

export interface OcrPage {
  dimensions: { width: number; height: number };
  blocks: OcrBlock[];
}

/** Per-line text heights: block pixel height divided by its line count. */
export function perLineHeights(blocks: OcrBlock[]): number[] {
  const out: number[] = [];
  for (const b of blocks) {
    const content = (b.content ?? "").trim();
    const h = b.bottom_right_y - b.top_left_y;
    if (!content || h <= 0) continue;
    out.push(h / content.split("\n").length);
  }
  return out;
}

export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

export function percentile(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
}

/** Text height in px as GPT sees it after the 768-shortest-side rescale.
 * Uses the OCR image's own dims — sips -Z preserves aspect ratio, so the
 * ratio equals the original photo's. */
export function rescaledHeight(h: number, page: OcrPage): number {
  return (h * 768) / Math.min(page.dimensions.width, page.dimensions.height);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOcrBlock(value: unknown): value is OcrBlock {
  if (!isRecord(value)) return false;
  return typeof value.content === "string" &&
    isNumber(value.top_left_x) &&
    isNumber(value.top_left_y) &&
    isNumber(value.bottom_right_x) &&
    isNumber(value.bottom_right_y) &&
    (value.type === undefined || typeof value.type === "string");
}

function isOcrPage(value: unknown): value is OcrPage {
  if (!isRecord(value) || !isRecord(value.dimensions)) return false;
  return isNumber(value.dimensions.width) &&
    isNumber(value.dimensions.height) &&
    Array.isArray(value.blocks) &&
    value.blocks.every(isOcrBlock);
}

function firstPageFrom(value: unknown): OcrPage | undefined {
  if (!isRecord(value) || !Array.isArray(value.pages)) return undefined;
  const page = value.pages[0];
  return isOcrPage(page) ? page : undefined;
}

/** Accepts both cache shapes: {responses:[{pages:[p]}]} and {pages:[p]}. */
export function firstPage(raw: unknown): OcrPage {
  if (!isRecord(raw)) throw new Error("OCR cache is not an object");

  if (Array.isArray(raw.responses)) {
    const page = firstPageFrom(raw.responses[0]);
    if (page) return page;
  }

  const page = firstPageFrom(raw);
  if (page) return page;
  throw new Error("OCR cache has no valid pages[0].blocks");
}

const MENUS = [
  // cache-hit anchors (MUST NOT trigger a paid call):
  {
    menu: "polloteria",
    photo: "PolloteriaMenu.png",
    cache: "polloteria.mistral-ocr-2048q95.json",
    truth: "DENSE landscape (must tile)",
  },
  {
    menu: "nikkori",
    photo: "NikkoriMenu.png",
    cache: "nikkori.mistral-ocr.json",
    truth: "DENSE portrait (tiles today)",
  },
  // 7 paid captures:
  {
    menu: "bistro",
    photo: "BistroMenu.png",
    cache: "bistro.mistral-ocr-2048q95.json",
    truth: "NOT dense landscape (must read whole)",
  },
  {
    menu: "guest-house",
    photo: "GuestHouseMenu.png",
    cache: "guest-house.mistral-ocr-2048q95.json",
    truth: "record-only landscape",
  },
  {
    menu: "brasero",
    photo: "BraseroMenu.png",
    cache: "brasero.mistral-ocr-2048q95.json",
    truth: "NOT dense portrait",
  },
  {
    menu: "brasero-two",
    photo: "BraseroMenuTwo.png",
    cache: "brasero-two.mistral-ocr-2048q95.json",
    truth: "NOT dense portrait",
  },
  {
    menu: "casa-nostra",
    photo: "CasaNostraMenu.png",
    cache: "casa-nostra.mistral-ocr-2048q95.json",
    truth: "NOT dense portrait",
  },
  {
    menu: "el-marcos",
    photo: "ElMarcosMenu.png",
    cache: "el-marcos.mistral-ocr-2048q95.json",
    truth: "NOT dense portrait",
  },
  {
    menu: "mochomos",
    photo: "MochomosMenu.png",
    cache: "mochomos.mistral-ocr-2048q95.json",
    truth: "NOT dense portrait",
  },
];

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
  const tmp = await Deno.makeTempDir();
  let paid = 0;
  const rows: string[][] = [];
  for (const m of MENUS) {
    const cachePath = `${MENU_DIR}/${m.cache}`;
    let raw: unknown;
    try {
      raw = JSON.parse(await Deno.readTextFile(cachePath));
      console.log(`[cache hit] ${m.menu}`);
    } catch {
      if (m.menu === "polloteria" || m.menu === "nikkori") {
        throw new Error(`${m.cache} missing — HARD STOP, do not re-pay`);
      }
      if (paid >= 7) throw new Error("paid-call cap (7) reached");
      paid++;
      console.log(`[OCR call ${paid}/7] ${m.menu} (${m.photo}) ...`);
      const dataUrl = await compressedPhotoData(m.photo, 2048, 95, tmp);
      raw = await fetchOcr(dataUrl, key);
      await Deno.writeTextFile(cachePath, JSON.stringify(raw, null, 2));
      console.log(`  cached -> ${cachePath}`);
    }
    const page = firstPage(raw);
    const hs = perLineHeights(page.blocks);
    const r = (h: number) => rescaledHeight(h, page).toFixed(1);
    rows.push([
      m.menu,
      `${page.dimensions.width}x${page.dimensions.height}`,
      String(hs.length),
      r(percentile(hs, 25)),
      r(median(hs)),
      r(percentile(hs, 75)),
      m.truth,
    ]);
  }
  console.log(
    "\nmenu | ocr-dims | line-blocks | p25 | median | p75  (px after GPT 768-shortest-side rescale)",
  );
  for (const row of rows) console.log(row.join(" | "));
  console.log(`\npaid OCR calls: ${paid} (~$${(paid * 0.004).toFixed(3)})`);
}
