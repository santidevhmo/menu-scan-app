// Eval 071 — spatial co-location replay (harness-only; container ROADMAP Phase 1 step 1c).
// Phase A (paid, ONCE): Mistral OCR on PolloteriaMenu.png -> word/line boxes, cached to disk.
// Phase B ($0, iterate): deterministic check that each archived candidate's claimed
// name + price + grams co-locate inside ONE OCR block. Fakes must fail, keeps must pass.
// Launch: deno run --env-file=.env.local --allow-env --allow-read --allow-write --allow-net=api.mistral.ai scripts/probe-colocation-eval071.ts

import { MENU_DIR } from "./photo-input.ts";

const SOURCE_PHOTO = `${MENU_DIR}/PolloteriaMenu.png`;
const OCR_DUMP = `${MENU_DIR}/polloteria.mistral-ocr-eval071.json`;
const RESULT_DUMP = `${MENU_DIR}/polloteria.colocation-eval071-r1.actual.json`;
const CASES_PATH = new URL("./fixtures/polloteria.eval071-cases.json", import.meta.url);

export interface Eval071Case {
  id: string;
  role: "fake" | "real-keep" | "control-keep";
  expect_colocated: boolean;
  name: string;
  price: number | null;
  section_title: string | null;
}

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

interface BlockText {
  block: number;
  tokens: string[];
  joined: string; // normalized tokens joined by single spaces
}

export function groupBlocks(units: OcrUnit[]): BlockText[] {
  const byBlock = new Map<number, string[]>();
  for (const u of units) {
    const tokens = normTokens(u.text);
    if (!byBlock.has(u.block)) byBlock.set(u.block, []);
    byBlock.get(u.block)!.push(...tokens);
  }
  return [...byBlock.entries()].map(([block, tokens]) => ({
    block,
    tokens,
    joined: tokens.join(" "),
  }));
}

export interface CaseVerdict {
  id: string;
  role: string;
  expect_colocated: boolean;
  colocated: boolean;
  pass: boolean;
  name_blocks: number[];
  evidence: string;
}

/**
 * A candidate co-locates iff SOME block matches >=60% of its name tokens AND
 * contains every field the candidate claims (price token; "NNN gr" grams).
 */
export function checkCase(blocks: BlockText[], c: Eval071Case): CaseVerdict {
  const nTokens = nameTokens(c.name);
  const grams = parseGrams(c.name);
  const nameBlocks: number[] = [];
  let colocated = false;
  let evidence = "name not found in any block";
  for (const b of blocks) {
    const matched = nTokens.filter((t) => b.tokens.some((p) => tokenMatch(t, p)));
    if (nTokens.length === 0 || matched.length / nTokens.length < 0.6) continue;
    nameBlocks.push(b.block);
    const priceOk = c.price === null || b.tokens.includes(String(c.price));
    const gramsOk = grams === null ||
      new RegExp(`(^| )${grams} ?gr( |$)`).test(b.joined);
    if (priceOk && gramsOk) {
      colocated = true;
      evidence = `block ${b.block}: name ${matched.length}/${nTokens.length}` +
        `${c.price !== null ? `, price ${c.price} present` : ""}` +
        `${grams !== null ? `, ${grams}gr present` : ""}`;
      break;
    }
    evidence = `block ${b.block}: name matched but ` +
      `${priceOk ? "" : `price ${c.price} ABSENT`}` +
      `${!priceOk && !gramsOk ? ", " : ""}${gramsOk ? "" : `${grams}gr ABSENT`}`;
  }
  return {
    id: c.id,
    role: c.role,
    expect_colocated: c.expect_colocated,
    colocated,
    pass: colocated === c.expect_colocated,
    name_blocks: nameBlocks,
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
      "WARNING: fewer than 5 blocks — block granularity too coarse for co-location; needs line-clustering v2 before verdicts count.",
    );
  }
  const { cases } = JSON.parse(await Deno.readTextFile(CASES_PATH)) as {
    cases: Eval071Case[];
  };
  const verdicts = cases.map((c) => checkCase(blocks, c));
  for (const v of verdicts) {
    console.log(
      `${v.pass ? "PASS" : "FAIL"} ${v.id.padEnd(26)} expect=${v.expect_colocated} got=${v.colocated} | ${v.evidence}`,
    );
  }
  const fakes = verdicts.filter((v) => v.role === "fake");
  const keeps = verdicts.filter((v) => v.role !== "fake");
  const fakesRejected = fakes.filter((v) => !v.colocated).length;
  const keepsHeld = keeps.filter((v) => v.colocated).length;
  console.log(
    `GATE: fakes rejected ${fakesRejected}/${fakes.length}; keeps held ${keepsHeld}/${keeps.length}`,
  );
  console.log(
    fakesRejected === fakes.length && keepsHeld === keeps.length
      ? "GATE RESULT: FULL PASS — promote co-location per ruling 8"
      : fakesRejected >= 4 && keepsHeld === keeps.length
      ? "GATE RESULT: PARTIAL (>=4/5, controls held) — advisory-flag tier only"
      : "GATE RESULT: FAIL — tighten or reject per ruling 8",
  );
  await Deno.writeTextFile(
    RESULT_DUMP,
    `${JSON.stringify({ blocks: blocks.length, units: units.length, verdicts }, null, 2)}\n`,
  );
  console.log(`Verdicts dumped to ${RESULT_DUMP}`);
}
