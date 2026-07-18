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
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length === b.length) { i++; j++; }
    else if (a.length > b.length) i++;
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
}

/** Eval-071 v3 matcher: mention-guard verdict. */
export function judgeItem(blocks: BlockText[], item: ExtractedMenuItem): ItemVerdict {
  const nTokens = nameTokens(item.name);
  const grams = parseGrams(item.name);
  const price = item.price;
  const anchors = blocks.filter((b) => {
    if (nTokens.length === 0) return false;
    const matched = nTokens.filter((t) => b.tokens.some((p) => tokenMatch(t, p)));
    if (matched.length / nTokens.length < 0.6) return false;
    // A line about this dish, not the dish itself: at least half of the
    // block's own name-like tokens must belong to the candidate's name.
    const blockAlpha = b.tokens.filter((t) =>
      /[a-z]/.test(t) && !/^\d+(gr|pz)?$/.test(t) && t !== "gr" && t !== "pz"
    );
    const covered = blockAlpha.filter((p) => nTokens.some((t) => tokenMatch(t, p)));
    return blockAlpha.length > 0 && covered.length / blockAlpha.length >= 0.5;
  });
  const priceOk = (b: BlockText) => price === null || b.tokens.includes(String(price));
  const gramsOk = (b: BlockText) =>
    grams === null || new RegExp(`(^| )${grams} ?gr( |$)`).test(b.joined);
  const gramsTypePresent = (b: BlockText) => /(^| )\d+ ?gr( |$)/.test(b.joined);
  const win = anchors.find((b) => priceOk(b) && gramsOk(b));
  if (win) return { verdict: "verified", anchor: win.block };
  for (const b of anchors) {
    if (!b.priced) continue;
    const priceContradicts = price !== null && !priceOk(b) &&
      b.tokens.some((t) => /^\d+$/.test(t));
    const gramsContradicts = grams !== null && gramsTypePresent(b) && !gramsOk(b);
    if (priceContradicts || gramsContradicts) {
      return { verdict: "contradicted", anchor: b.block };
    }
  }
  return { verdict: "unverifiable", anchor: null };
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
      ? { item, verdict: "verified" as Verdict3, anchor: null as number | null }
      : { item, ...judgeItem(blocks, item) }
  );
  const verifiedAnchors = new Set(
    judged.filter((j) => j.verdict === "verified" && j.anchor !== null).map((j) => j.anchor),
  );
  const kept: ExtractedMenuItem[] = [];
  const keptAnchors = new Set<number>();
  for (const j of judged) {
    if (j.verdict === "contradicted" && j.anchor !== null && verifiedAnchors.has(j.anchor)) {
      console.log(
        `[colocation] drop: "${j.item.name}" contradicted by printed block ${j.anchor} which verifies a sibling`,
      );
      continue;
    }
    if (j.verdict === "contradicted" && j.anchor !== null) {
      console.log(`[colocation] flag: "${j.item.name}" conflicts with printed block ${j.anchor}`);
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
  return kept;
}

export async function fetchOcrBlocks(tile: string, apiKey: string): Promise<OcrBlock[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
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

/** Fail-open entry point: any OCR/matcher error returns items unchanged. */
export async function colocationStage(
  tileGroups: string[][],
  items: ExtractedMenuItem[],
  mistralApiKey: string | undefined,
  fetchOcr = fetchOcrBlocks,
): Promise<ExtractedMenuItem[]> {
  if (!mistralApiKey || tileGroups.length === 0) return items;
  try {
    const tiles = tileGroups.flat();
    const blockLists = await Promise.all(tiles.map((t) => fetchOcr(t, mistralApiKey)));
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
