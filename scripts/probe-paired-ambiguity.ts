import { gridCropRects } from "../src/lib/adaptiveExtraction.ts";
import { MENU_DIR } from "./photo-input.ts";
import { cutTile } from "./tile-cut.ts";

const INPUT_DUMP = `${MENU_DIR}/polloteria.tiles-2x2-eval068-r1.actual.json`;
const SOURCE_PHOTO = `${MENU_DIR}/PolloteriaMenu.png`;
const MODEL_TIMEOUT_MS = 120_000;

export type DropVerdict = "a" | "b" | "neither";

export interface PairExpectation {
  id: string;
  expected: DropVerdict;
}

export interface PairVerdict {
  id: string;
  drop: DropVerdict;
}

interface CandidateReference {
  tile: number;
  namePrefix: string;
  price: number | null;
}

interface PairSpec extends PairExpectation {
  a: CandidateReference;
  b: CandidateReference;
}

export interface PairGroup {
  tiles: [number, number];
  pairs: PairSpec[];
}

export interface CandidatePayload {
  name: string;
  description: string;
  price: number | null;
  category: string;
  section_title: string | null;
}

export const EVAL069_GROUPS: PairGroup[] = [
  {
    tiles: [0, 2],
    pairs: [
      {
        id: "coliflor",
        expected: "b",
        a: { tile: 0, namePrefix: "Boneless de Coliflor /", price: 139 },
        b: {
          tile: 2,
          namePrefix: "Boneless de Coliflor Vegetarianos",
          price: 150,
        },
      },
      {
        id: "alitas-phase2",
        expected: "neither",
        a: { tile: 0, namePrefix: "Alitas 6 Pz", price: null },
        b: { tile: 2, namePrefix: "Alitas (", price: null },
      },
      {
        id: "distinct-sandwiches",
        expected: "neither",
        a: { tile: 0, namePrefix: "Boneless Barbecue", price: 150 },
        b: { tile: 0, namePrefix: "Boneless Buffalo", price: 150 },
      },
    ],
  },
  {
    tiles: [1, 2],
    pairs: [
      {
        id: "boneless-jr",
        expected: "b",
        a: { tile: 1, namePrefix: "Boneless Jr", price: 132 },
        b: { tile: 2, namePrefix: "Boneless Jr", price: 95 },
      },
      {
        id: "buffalo",
        expected: "b",
        a: { tile: 1, namePrefix: "Boneless Buffalo", price: 150 },
        b: { tile: 2, namePrefix: "Buffalo (350gr)", price: 150 },
      },
      {
        id: "ensalada-verde",
        expected: "b",
        a: { tile: 1, namePrefix: "Ensalada Verde", price: 52 },
        b: { tile: 2, namePrefix: "Ensalada Verde", price: 70 },
      },
      {
        id: "nuggets-coliflor",
        expected: "b",
        a: { tile: 1, namePrefix: "Nuggets (200gr)", price: 89 },
        b: { tile: 2, namePrefix: "Nuggets de Coliflor", price: 132 },
      },
      {
        id: "distinct-kids",
        expected: "neither",
        a: { tile: 1, namePrefix: "Nuggets (200gr)", price: 89 },
        b: { tile: 1, namePrefix: "Chicken-Little", price: 89 },
      },
    ],
  },
];

export const PAIR_PROMPT =
  `You are comparing candidate menu transcriptions against TWO overlapping crop
images from the same printed menu.

Each JSON pair contains candidate "a" and candidate "b". For every pair return
which candidate, if any, must be dropped.

Return "a" or "b" only when the images clearly prove that candidate is either:
1. an inferior duplicate of the same printed menu card represented by the
   other candidate; or
2. an unprinted mashup that combines words, prices, weights, sections, or
   description text from different printed cards.

Judge the name, printed price, weight text, section, and description together.
A small spelling difference or one uncertain OCR field is not enough to drop
a candidate.

When two separate menu cards are printed, return "neither".
When multiple sizes or prices are printed on one size-variant card, return
"neither"; that card is handled by a later extraction phase.
When unsure, return "neither".
Never drop both candidates.`;

export const PAIR_SCHEMA = {
  type: "object",
  properties: {
    verdicts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          drop: { type: "string", enum: ["a", "b", "neither"] },
        },
        required: ["id", "drop"],
        additionalProperties: false,
      },
    },
  },
  required: ["verdicts"],
  additionalProperties: false,
} as const;

export function assessVerdicts(
  expected: PairExpectation[],
  actual: PairVerdict[],
): string[] {
  const counts = new Map<string, number>();
  for (const verdict of actual) {
    counts.set(verdict.id, (counts.get(verdict.id) ?? 0) + 1);
  }

  const failures: string[] = [];
  for (const pair of expected) {
    const count = counts.get(pair.id) ?? 0;
    if (count === 0) {
      failures.push(`missing verdict: ${pair.id}`);
    } else if (count > 1) {
      failures.push(`duplicate verdict: ${pair.id}`);
    } else {
      const verdict = actual.find((item) => item.id === pair.id)!;
      if (verdict.drop !== pair.expected) {
        failures.push(
          `wrong drop for ${pair.id}: expected ${pair.expected}, got ${verdict.drop}`,
        );
      }
    }
  }

  const expectedIds = new Set(expected.map((pair) => pair.id));
  const unexpectedIds = [...new Set(actual.map((verdict) => verdict.id))]
    .filter((id) => !expectedIds.has(id));
  for (const id of unexpectedIds) failures.push(`unexpected verdict: ${id}`);
  return failures;
}

interface RawItem {
  name: string;
  description: string;
  price: number | null;
  category: string;
  section_title: string | null;
}

interface RawDump {
  raw_response: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string`);
  return value;
}

function requiredPrice(value: unknown, label: string): number | null {
  if (
    value !== null && (typeof value !== "number" || !Number.isFinite(value))
  ) {
    throw new Error(`${label} must be a finite number or null`);
  }
  return value;
}

function parseRawItems(value: unknown, tile: number): RawItem[] {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error(`tile ${tile} response must contain an items array`);
  }
  return value.items.map((item, index) => {
    if (!isRecord(item)) {
      throw new Error(`tile ${tile} item ${index} is invalid`);
    }
    return {
      name: requiredString(item.name, `tile ${tile} item ${index} name`),
      description: requiredString(
        item.description,
        `tile ${tile} item ${index} description`,
      ),
      price: requiredPrice(item.price, `tile ${tile} item ${index} price`),
      category: requiredString(
        item.category,
        `tile ${tile} item ${index} category`,
      ),
      section_title: item.section_title === null ? null : requiredString(
        item.section_title,
        `tile ${tile} item ${index} section_title`,
      ),
    };
  });
}

function parseDump(value: unknown): RawItem[][] {
  if (!isRecord(value)) throw new Error("input dump must be an object");
  const rawResponse = requiredString(value.raw_response, "raw_response");
  let responses: unknown;
  try {
    responses = JSON.parse(rawResponse) as unknown;
  } catch (error) {
    throw new Error(`raw_response is not valid JSON: ${String(error)}`);
  }
  if (
    !Array.isArray(responses) ||
    responses.length !== 4 ||
    responses.some((response) => typeof response !== "string")
  ) {
    throw new Error(
      "raw_response must contain exactly four tile-response strings",
    );
  }
  return responses.map((response, tile) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(response as string) as unknown;
    } catch (error) {
      throw new Error(
        `tile ${tile} response is not valid JSON: ${String(error)}`,
      );
    }
    return parseRawItems(parsed, tile);
  });
}

function resolveCandidate(
  reference: CandidateReference,
  items: RawItem[][],
  id: string,
  side: "a" | "b",
): CandidatePayload {
  const tileItems = items[reference.tile];
  if (!tileItems) {
    throw new Error(`${id}.${side} references missing tile ${reference.tile}`);
  }
  const matches = tileItems.filter((item) =>
    item.name.startsWith(reference.namePrefix) && item.price === reference.price
  );
  if (matches.length !== 1) {
    throw new Error(
      `${id}.${side} matched ${matches.length} items in tile ${reference.tile}`,
    );
  }
  const item = matches[0];
  return {
    name: item.name,
    description: item.description,
    price: item.price,
    category: item.category,
    section_title: item.section_title,
  };
}

function resolveGroups(items: RawItem[][]): ResolvedGroup[] {
  return EVAL069_GROUPS.map((group) => ({
    tiles: group.tiles,
    pairs: group.pairs.map((pair) => ({
      id: pair.id,
      expected: pair.expected,
      a: resolveCandidate(pair.a, items, pair.id, "a"),
      b: resolveCandidate(pair.b, items, pair.id, "b"),
    })),
  }));
}

interface ResolvedPair extends PairExpectation {
  a: CandidatePayload;
  b: CandidatePayload;
}

interface ResolvedGroup {
  tiles: [number, number];
  pairs: ResolvedPair[];
}

function pairPayloads(pairs: ResolvedPair[]) {
  return pairs.map(({ id, a, b }) => ({ id, a, b }));
}

async function imageDimensions(
  path: string,
): Promise<{ width: number; height: number }> {
  const result = await new Deno.Command("sips", {
    args: ["-g", "pixelWidth", "-g", "pixelHeight", path],
  }).output();
  if (!result.success) {
    throw new Error(
      `sips dims failed: ${new TextDecoder().decode(result.stderr)}`,
    );
  }
  const output = new TextDecoder().decode(result.stdout);
  const width = Number(output.match(/pixelWidth:\s+(\d+)/)?.[1]);
  const height = Number(output.match(/pixelHeight:\s+(\d+)/)?.[1]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`could not parse dimensions from sips output: ${output}`);
  }
  return { width, height };
}

async function reconstructTiles(
  source: string,
  tmpDir: string,
): Promise<string[]> {
  const { width, height } = await imageDimensions(source);
  const tiles: string[] = [];
  for (const [index, rect] of gridCropRects(width, height).entries()) {
    const output = `${tmpDir}/tile-${index}.png`;
    await cutTile(source, rect, output);
    tiles.push(
      `data:image/png;base64,${(await Deno.readFile(output)).toBase64()}`,
    );
  }
  return tiles;
}

async function requestGroup(
  group: ResolvedGroup,
  tiles: string[],
  apiKey: string,
): Promise<PairVerdict[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{
          role: "user",
          content: [
            {
              type: "text",
              text: `${PAIR_PROMPT}\n\n${
                JSON.stringify(pairPayloads(group.pairs))
              }`,
            },
            ...group.tiles.map((tile) => ({
              type: "image_url",
              image_url: { url: tiles[tile], detail: "high" },
            })),
          ],
        }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "paired_ambiguity_verdicts",
            strict: true,
            schema: PAIR_SCHEMA,
          },
        },
        temperature: 0,
        seed: 17,
      }),
      signal: controller.signal,
    });
    const json = await response.json() as {
      error?: { message?: string };
      choices?: {
        finish_reason?: string;
        message?: { content?: string | null };
      }[];
    };
    if (!response.ok) {
      throw new Error(json.error?.message ?? "OpenAI API error");
    }
    const choice = json.choices?.[0];
    if (!choice) throw new Error("OpenAI returned no paired verdict choice");
    if (choice.finish_reason !== "stop") {
      throw new Error(
        `OpenAI paired verdict stopped with finish_reason=${choice.finish_reason}`,
      );
    }
    const content = choice.message?.content;
    if (!content) throw new Error("OpenAI returned no paired verdict content");
    const parsed = JSON.parse(content) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.verdicts)) {
      throw new Error("paired verdict response must contain a verdicts array");
    }
    return parsed.verdicts.map((verdict, index) => {
      if (!isRecord(verdict)) throw new Error(`verdict ${index} is invalid`);
      const id = requiredString(verdict.id, `verdict ${index} id`);
      const drop = requiredString(verdict.drop, `verdict ${index} drop`);
      if (drop !== "a" && drop !== "b" && drop !== "neither") {
        throw new Error(`verdict ${index} has invalid drop ${drop}`);
      }
      return { id, drop };
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `paired verdict request timed out after ${MODEL_TIMEOUT_MS / 1000}s`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

if (import.meta.main) {
  const dump = JSON.parse(await Deno.readTextFile(INPUT_DUMP)) as unknown;
  const rawItems = parseDump(dump);
  const resolvedGroups = resolveGroups(rawItems);
  const tiles = await reconstructTiles(
    SOURCE_PHOTO,
    await Deno.makeTempDir({ prefix: "paired-ambiguity-" }),
  );
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");

  for (let run = 1; run <= 3; run++) {
    let apiCalls = 0;
    try {
      const groupVerdicts: PairVerdict[][] = [];
      for (const group of resolvedGroups) {
        apiCalls++;
        groupVerdicts.push(await requestGroup(group, tiles, apiKey));
      }
      const rawVerdicts = groupVerdicts.flat();
      const failures = assessVerdicts(
        resolvedGroups.flatMap((group) => group.pairs),
        rawVerdicts,
      );
      for (const verdict of rawVerdicts) console.log("raw verdict:", verdict);
      console.log(
        `run ${run}: ${
          failures.length === 0 ? "PASS" : "FAIL"
        }; api_calls=${apiCalls}`,
      );
      if (failures.length > 0) {
        for (const failure of failures) console.log(`mismatch: ${failure}`);
      }
      await Deno.writeTextFile(
        `${MENU_DIR}/polloteria.paired-ambiguity-eval069-r${run}.actual.json`,
        `${
          JSON.stringify(
            {
              run,
              pairs: resolvedGroups.flatMap((group) => group.pairs),
              raw_verdicts: rawVerdicts,
              assessment_failures: failures,
              api_calls: apiCalls,
            },
            null,
            2,
          )
        }\n`,
      );
      if (failures.length > 0) break;
    } catch (error) {
      console.log(`run ${run}: DIAGNOSTIC FAILURE; api_calls=${apiCalls}`);
      console.log(String(error));
      break;
    }
  }
}
