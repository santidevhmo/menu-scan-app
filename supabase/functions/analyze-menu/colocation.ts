import type { ExtractedMenuItem } from "./extract.ts";

const OCR_TIMEOUT_MS = 20_000;

export interface OcrBlock {
  content: string;
  type: string;
}

export function normTokens(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0);
}

/** Alphabetic name tokens only — numeric/grams/price text in a title is a field claim, not the name. */
export function nameTokens(name: string): string[] {
  return normTokens(name).filter((t) =>
    /[a-z]/.test(t) && !/^\d+(gr|pz)?$/.test(t) && t !== "gr" && t !== "pz"
  );
}

export function parseGrams(name: string): number | null {
  const m = name.match(/(\d+)\s*gr\b/i);
  return m ? Number(m[1]) : null;
}

function editDistanceLeq1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length === b.length) {
      i++;
      j++;
    } else if (a.length > b.length) i++;
    else j++;
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

export function tokenMatch(candidate: string, printed: string): boolean {
  if (candidate === printed) return true;
  // ponytail: 1-edit fuzz only for longer tokens, catches vegetarianos~vegetarianas without jr~gr noise
  return candidate.length >= 5 && printed.length >= 5 &&
    editDistanceLeq1(candidate, printed);
}

const EXISTENCE_SIM_THRESHOLD = 0.75;
const READABILITY_MIN_ANCHORED = 0.5;

export function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur.push(Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      ));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Looser than tokenMatch: misread names drift 2-3 edits (tenderazo~tendedero). */
export function looseTokenMatch(candidate: string, printed: string): boolean {
  if (candidate === printed) return true;
  if (candidate.length < 4 || printed.length < 4) return false;
  return editDistance(candidate, printed) <=
    Math.max(1, Math.min(3, Math.floor(candidate.length / 3)));
}

/** Significant name tokens: >=3 chars, not a number/weight/count. */
export function sigTokens(tokens: string[]): string[] {
  return tokens.filter((t) =>
    t.length >= 3 && !/^\d+(g|gr|pz|oz|ml)?$/.test(t)
  );
}

/** Best per-block name similarity; finalize via max(). */
export function bestLineSim(name: string, blocks: BlockText[]): number {
  const ct = sigTokens(normTokens(name));
  if (ct.length === 0) return 1;
  let best = 0;
  for (const b of blocks) {
    const pt = sigTokens(b.tokens);
    if (pt.length === 0) continue;
    const m = ct.filter((t) => pt.some((p) => looseTokenMatch(t, p))).length;
    best = Math.max(best, m / Math.max(ct.length, pt.length));
  }
  return best;
}

export type Verdict3 = "verified" | "contradicted" | "unverifiable";

interface BlockText {
  block: number;
  tokens: string[];
  joined: string;
  priced: boolean;
}

export function toBlockTexts(blocks: OcrBlock[]): BlockText[] {
  return blocks.map((b, block) => {
    const tokens = normTokens(b.content);
    return {
      block,
      tokens,
      joined: tokens.join(" "),
      priced: /\$\s*\d/.test(b.content),
    };
  });
}

export interface ItemVerdict {
  verdict: Verdict3;
  anchor: number | null;
  anchored: boolean;
}

/** Eval-071 v3 matcher: mention-guard verdict. */
export function judgeItem(
  blocks: BlockText[],
  item: ExtractedMenuItem,
): ItemVerdict {
  const nTokens = nameTokens(item.name);
  const grams = parseGrams(item.name);
  const price = item.price;
  const anchorScores = new Map<
    number,
    { matchedFraction: number; blockCoverage: number }
  >();
  const anchors = blocks.filter((b) => {
    if (nTokens.length === 0) return false;
    const matched = nTokens.filter((t) =>
      b.tokens.some((p) => tokenMatch(t, p))
    );
    const matchedFraction = matched.length / nTokens.length;
    if (matchedFraction < 0.6) return false;
    // A line about this dish, not the dish itself: at least half of the
    // block's own name-like tokens must belong to the candidate's name.
    const blockAlpha = b.tokens.filter((t) =>
      /[a-z]/.test(t) && !/^\d+(gr|pz)?$/.test(t) && t !== "gr" && t !== "pz"
    );
    const covered = blockAlpha.filter((p) =>
      nTokens.some((t) => tokenMatch(t, p))
    );
    const blockCoverage = covered.length / blockAlpha.length;
    if (blockAlpha.length === 0 || blockCoverage < 0.5) return false;
    anchorScores.set(b.block, { matchedFraction, blockCoverage });
    return true;
  });
  const rankedAnchors = [...anchors].sort((a, b) => {
    const aScore = anchorScores.get(a.block)!;
    const bScore = anchorScores.get(b.block)!;
    return bScore.matchedFraction - aScore.matchedFraction ||
      bScore.blockCoverage - aScore.blockCoverage || a.block - b.block;
  });
  const priceOk = (b: BlockText) =>
    price === null || b.tokens.includes(String(price));
  const gramsOk = (b: BlockText) =>
    grams === null || new RegExp(`(^| )${grams} ?gr( |$)`).test(b.joined);
  const gramsTypePresent = (b: BlockText) => /(^| )\d+ ?gr( |$)/.test(b.joined);
  const win = anchors.find((b) => priceOk(b) && gramsOk(b));
  if (win) return { verdict: "verified", anchor: win.block, anchored: true };
  for (const b of rankedAnchors) {
    if (!b.priced) continue;
    const priceContradicts = price !== null && !priceOk(b) &&
      b.tokens.some((t) => /^\d+$/.test(t));
    const gramsContradicts = grams !== null && gramsTypePresent(b) &&
      !gramsOk(b);
    if (priceContradicts || gramsContradicts) {
      return { verdict: "contradicted", anchor: b.block, anchored: true };
    }
  }
  return {
    verdict: "unverifiable",
    anchor: null,
    anchored: anchors.length > 0,
  };
}

/**
 * Polarity v1 (spec 2026-07-17): drops whose contradicting block also verifies another item (corrupted duplicate of a
 * real card). Contradicted-alone → keep. Drinks are never judged or dropped. Zero field mutation.
 */
export function applyColocation(
  blocks: BlockText[],
  items: ExtractedMenuItem[],
): ExtractedMenuItem[] {
  const judged = items.map((item) =>
    item.category === "drink"
      ? {
        item,
        verdict: "verified" as Verdict3,
        anchor: null as number | null,
        anchored: true,
      }
      : { item, ...judgeItem(blocks, item) }
  );
  const verifiedAnchors = new Set(
    judged.filter((j) => j.verdict === "verified" && j.anchor !== null).map((
      j,
    ) => j.anchor),
  );
  const kept: ExtractedMenuItem[] = [];
  const keptAnchors = new Set<number>();
  for (const j of judged) {
    if (
      j.verdict === "contradicted" && j.anchor !== null &&
      verifiedAnchors.has(j.anchor)
    ) {
      console.log(
        `[colocation] drop: "${j.item.name}" contradicted by printed block ${j.anchor} which verifies a sibling`,
      );
      continue;
    }
    if (j.verdict === "contradicted" && j.anchor !== null) {
      console.log(
        `[colocation] flag: "${j.item.name}" conflicts with printed block ${j.anchor}`,
      );
    }
    if (j.anchor !== null) keptAnchors.add(j.anchor);
    kept.push(j.item);
  }
  const unmatched = blocks.filter((b) => b.priced && !keptAnchors.has(b.block));
  if (unmatched.length > 0) {
    console.log(
      `[colocation] unmatched priced lines: ${unmatched.length} — ${
        unmatched.slice(0, 5).map((b) => b.joined).join(" | ")
      }`,
    );
  }
  // Amendment v1.1: novel-name inventions anchor nothing and match no printed
  // line even loosely. Active only when this menu's OCR reads names well enough;
  // otherwise (nikkori-class menus) every real dish would look invented.
  const nonDrink = judged.filter((j) => j.item.category !== "drink");
  const readability = nonDrink.length === 0
    ? 0
    : nonDrink.filter((j) => j.anchored).length / nonDrink.length;
  if (readability < READABILITY_MIN_ANCHORED) {
    console.log(
      `[colocation] existence tier inert: readability=${
        readability.toFixed(2)
      }`,
    );
    return kept;
  }
  const judgedByItem = new Map(judged.map((j) => [j.item, j]));
  return kept.filter((item) => {
    const j = judgedByItem.get(item)!;
    if (
      item.category === "drink" || j.anchored || j.verdict !== "unverifiable"
    ) {
      return true;
    }
    const sim = bestLineSim(item.name, blocks);
    if (sim >= EXISTENCE_SIM_THRESHOLD) return true;
    console.log(
      `[colocation] drop-invented: "${item.name}" bestSim=${sim.toFixed(2)}`,
    );
    return false;
  });
}

export async function fetchOcrBlocks(
  tile: string,
  apiKey: string,
): Promise<OcrBlock[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-ocr-latest",
        document: { type: "image_url", image_url: tile },
        include_blocks: true,
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Mistral OCR ${res.status}`);
    const json = await res.json() as { pages?: { blocks?: OcrBlock[] }[] };
    return (json.pages ?? []).flatMap((p) => p.blocks ?? []);
  } finally {
    clearTimeout(timeout);
  }
}

/** Fail-open full-photo OCR entry point from extract-pages; errors return items unchanged. */
export async function colocationStage(
  ocrPhotos: string[],
  items: ExtractedMenuItem[],
  mistralApiKey: string | undefined,
  fetchOcr = fetchOcrBlocks,
): Promise<ExtractedMenuItem[]> {
  if (!mistralApiKey || ocrPhotos.length === 0) return items;
  try {
    const blockLists = await Promise.all(
      ocrPhotos.map((photo) => fetchOcr(photo, mistralApiKey)),
    );
    const blocks = toBlockTexts(blockLists.flat());
    if (blocks.length < 5) {
      console.log("[colocation] skipped: fewer than 5 OCR blocks");
      return items;
    }
    return applyColocation(blocks, items);
  } catch (error) {
    console.log(`[colocation] skipped: ${String(error).slice(0, 200)}`);
    return items;
  }
}
