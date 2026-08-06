// Eval 071 — spatial co-location replay (harness-only; container ROADMAP Phase 1 step 1c).
// Phase A (paid, ONCE): Mistral OCR on PolloteriaMenu.png -> word/line boxes, cached to disk.
// Phase B ($0, iterate): deterministic check that each archived candidate's claimed
// name + price + grams co-locate inside ONE OCR block. Fakes must fail, keeps must pass.
// Launch: deno run --env-file=.env.local --allow-env --allow-read --allow-write --allow-net=api.mistral.ai scripts/probe-colocation-eval071.ts

import { MENU_DIR } from "./photo-input.ts";

const SOURCE_PHOTO = `${MENU_DIR}/PolloteriaMenu.png`;
const OCR_DUMP = `${MENU_DIR}/polloteria.mistral-ocr-eval071.json`;
const RESULT_DUMP = `${MENU_DIR}/polloteria.colocation-eval071-3way.actual.json`;
const CASES_PATH = new URL("./fixtures/polloteria.eval071-cases.json", import.meta.url);

export interface Eval071Case {
  id: string;
  role: "fake" | "real-keep" | "control-keep";
  expect: Verdict3;
  name: string;
  price: number | null;
  section_title: string | null;
}

export type Verdict3 = "verified" | "contradicted" | "unverifiable";

/** One OCR text unit (word or line) with its box and owning block. */
export interface OcrUnit {
  text: string;
  block: number;
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

/**
 * Tolerant walker over the Mistral OCR response: collects text-bearing nodes
 * (blocks/lines/words in either documented shape) as units tagged with the
 * index of their top-level block. Works with word-level or line-level output.
 */
export function parseOcrUnits(raw: unknown): OcrUnit[] {
  const units: OcrUnit[] = [];
  const pages = (raw as { pages?: unknown[] })?.pages ?? [];
  for (const page of pages) {
    const blocks = (page as { blocks?: unknown[] })?.blocks ?? [];
    blocks.forEach((blockNode, blockIdx) => {
      const collect = (node: unknown): void => {
        if (node === null || typeof node !== "object") return;
        if (Array.isArray(node)) { node.forEach(collect); return; }
        const obj = node as Record<string, unknown>;
        const children = obj.lines ?? obj.words ?? obj.blocks;
        if (children) { collect(children); return; }
        const text = typeof obj.text === "string"
          ? obj.text
          : typeof obj.content === "string"
          ? obj.content
          : null;
        if (text && text.length > 0) {
          units.push({ text, block: blockIdx });
        }
      };
      collect(blockNode);
    });
  }
  return units;
}

export interface BlockText {
  block: number;
  tokens: string[];
  joined: string; // normalized tokens joined by single spaces
  priced: boolean; // raw text prints a $-price — only these blocks may contradict
}

export function groupBlocks(units: OcrUnit[]): BlockText[] {
  const byBlock = new Map<number, { tokens: string[]; raw: string[] }>();
  for (const u of units) {
    if (!byBlock.has(u.block)) byBlock.set(u.block, { tokens: [], raw: [] });
    const e = byBlock.get(u.block)!;
    e.tokens.push(...normTokens(u.text));
    e.raw.push(u.text);
  }
  return [...byBlock.entries()].map(([block, e]) => ({
    block,
    tokens: e.tokens,
    joined: e.tokens.join(" "),
    priced: /\$\s*\d/.test(e.raw.join(" ")),
  }));
}

export interface CaseVerdict {
  id: string;
  role: string;
  expect: Verdict3;
  verdict: Verdict3;
  pass: boolean;
  name_blocks: number[];
  evidence: string;
}

/**
 * Ruling 9: verified = some anchor prints every claimed field; contradicted =
 * no anchor verifies and a priced anchor prints a different claimed field;
 * unverifiable = neither verifies nor contradicts (keep, flag).
 */
export function checkCase(blocks: BlockText[], c: Eval071Case): CaseVerdict {
  const nTokens = nameTokens(c.name);
  const grams = parseGrams(c.name);
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
  const priceOk = (b: BlockText) => c.price === null || b.tokens.includes(String(c.price));
  const gramsOk = (b: BlockText) =>
    grams === null || new RegExp(`(^| )${grams} ?gr( |$)`).test(b.joined);
  const gramsTypePresent = (b: BlockText) => /(^| )\d+ ?gr( |$)/.test(b.joined);

  let verdict: Verdict3 = "unverifiable";
  let evidence = anchors.length === 0
    ? "name not found in any block"
    : "claims not printed, nothing contradicts";
  const win = anchors.find((b) => priceOk(b) && gramsOk(b));
  if (win) {
    verdict = "verified";
    evidence = `block ${win.block}: claims printed together`;
  } else {
    for (const b of anchors) {
      if (!b.priced) continue;
      const priceContradicts = c.price !== null && !priceOk(b) &&
        b.tokens.some((t) => /^\d+$/.test(t));
      const gramsContradicts = grams !== null && gramsTypePresent(b) && !gramsOk(b);
      if (priceContradicts || gramsContradicts) {
        verdict = "contradicted";
        evidence = `block ${b.block}: ` +
          `${priceContradicts ? `a different price (claimed ${c.price})` : ""}` +
          `${priceContradicts && gramsContradicts ? ", " : ""}` +
          `${gramsContradicts ? `different grams (claimed ${grams}gr)` : ""}`;
        break;
      }
    }
  }
  return {
    id: c.id,
    role: c.role,
    expect: c.expect,
    verdict,
    pass: verdict === c.expect,
    name_blocks: anchors.map((b) => b.block),
    evidence,
  };
}

async function ensureOcr(): Promise<unknown> {
  try {
    return JSON.parse(await Deno.readTextFile(OCR_DUMP));
  } catch {
    // fall through to the single paid call
  }
  const apiKey = Deno.env.get("MISTRAL_API_KEY");
  if (!apiKey) throw new Error("MISTRAL_API_KEY is required for the one-time OCR call");
  const png = await Deno.readFile(SOURCE_PHOTO);
  let b64 = "";
  const chunk = 32768;
  for (let i = 0; i < png.length; i += chunk) {
    b64 += String.fromCharCode(...png.subarray(i, i + chunk));
  }
  b64 = btoa(b64);
  console.log("PAID CALL: Mistral OCR, 1 page ≈ $0.004 …");
  const res = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: { type: "image_url", image_url: `data:image/png;base64,${b64}` },
      include_blocks: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`Mistral OCR ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  const raw = await res.json();
  await Deno.writeTextFile(OCR_DUMP, `${JSON.stringify(raw, null, 2)}\n`);
  console.log(`OCR response cached to ${OCR_DUMP} — all further runs are $0`);
  return raw;
}

if (import.meta.main) {
  const raw = await ensureOcr();
  const units = parseOcrUnits(raw);
  const blocks = groupBlocks(units);
  console.log(`OCR parsed: ${units.length} units in ${blocks.length} blocks`);
  if (blocks.length < 5) {
    console.log(
      "WARNING: fewer than 5 blocks — block granularity too coarse for co-location; verdicts invalid.",
    );
  }
  const { cases } = JSON.parse(await Deno.readTextFile(CASES_PATH)) as {
    cases: Eval071Case[];
  };
  const verdicts = cases.map((c) => checkCase(blocks, c));
  for (const v of verdicts) {
    console.log(
      `${v.pass ? "PASS" : "FAIL"} ${v.id.padEnd(26)} expect=${v.expect} got=${v.verdict} | ${v.evidence}`,
    );
  }
  const fakes = verdicts.filter((v) => v.role === "fake");
  const keeps = verdicts.filter((v) => v.role !== "fake");
  const fakesContradicted = fakes.filter((v) => v.verdict === "contradicted").length;
  const keepsKept = keeps.filter((v) => v.verdict !== "contradicted").length;
  const met = verdicts.filter((v) => v.pass).length;
  console.log(
    `GATE: fakes contradicted ${fakesContradicted}/${fakes.length}; keeps not deleted ${keepsKept}/${keeps.length}; expected ${verdicts.length}`,
  );
  console.log(
    met === verdicts.length && fakesContradicted === fakes.length
      ? "GATE RESULT: FULL PASS — ruling 9"
      : "GATE RESULT: FAIL — planner audit required before any claim",
  );
  await Deno.writeTextFile(
    RESULT_DUMP,
    `${JSON.stringify({ blocks: blocks.length, units: units.length, verdicts }, null, 2)}\n`,
  );
  console.log(`Verdicts dumped to ${RESULT_DUMP}`);
}
