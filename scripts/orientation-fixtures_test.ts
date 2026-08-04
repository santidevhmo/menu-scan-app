// THE REAL-DATA TEST: every archived OCR response, one expected verdict.
// These are the exact reads Santiago confirmed by eye in eval 132 (he opened
// RotationCheck/2-what-the-system-will-use and reported all 16 correct), so
// this file is that adjudication turned into a gate.
import { assertEquals } from "jsr:@std/assert";
import {
  detectOrientation,
  type OcrBlock,
  type Orientation,
} from "../supabase/functions/analyze-menu/orientation.ts";

const CACHES = new URL("./fixtures/caches/", import.meta.url).pathname;

async function blocksOf(file: string): Promise<OcrBlock[]> {
  const raw = JSON.parse(await Deno.readTextFile(`${CACHES}${file}`));
  return (raw.pages[0].blocks ?? []) as OcrBlock[];
}

// EVERY upright fixture page. This is the false-positive gate and the one that
// must never be weakened: a menu the diner held straight must come back
// untouched.
const UPRIGHT = [
  "andaluz.mistral-pt-r1.raw.json",
  "bistro.mistral-pt-r1.raw.json",
  "brasero.mistral-pt-r1.raw.json",
  "brasero-two.mistral-pt-r1.raw.json",
  "brasero-two.mistral-pt-r1.p1.raw.json",
  "casa-nostra.mistral-pt-r1.raw.json",
  "el-marcos.mistral-pt-r1.raw.json",
  "guest-house.mistral-pt-r1.raw.json",
  "mochomos.mistral-pt-r1.raw.json",
  "nikkori.mistral-pt-r1.raw.json",
  "polloteria.mistral-pt-r1.raw.json",
];

const TURNED: [string, Orientation][] = [
  ["bistro.mistral-rot90-r1.raw.json", "turned_clockwise"],
  ["bistro.mistral-rot180-r1.raw.json", "upside_down"],
  ["bistro.mistral-rot270-r1.raw.json", "turned_counter_clockwise"],
  ["guest-house.mistral-rot90-r1.raw.json", "turned_clockwise"],
  ["guest-house.mistral-rot180-r1.raw.json", "upside_down"],
  ["guest-house.mistral-rot270-r1.raw.json", "turned_counter_clockwise"],
  ["polloteria.mistral-rot90-r1.raw.json", "turned_clockwise"],
  ["polloteria.mistral-rot180-r1.raw.json", "upside_down"],
  ["polloteria.mistral-rot270-r1.raw.json", "turned_counter_clockwise"],
  ["el-marcos.mistral-rot90-r1.raw.json", "turned_clockwise"],
  ["el-marcos.mistral-rot180-r1.raw.json", "upside_down"],
  ["el-marcos.mistral-rot270-r1.raw.json", "turned_counter_clockwise"],
  ["nikkori.mistral-rot90-r1.raw.json", "turned_clockwise"],
  ["brasero.mistral-rot270-r1.raw.json", "turned_counter_clockwise"],
];

Deno.test("no upright fixture page is ever rotated", async () => {
  const wrong: string[] = [];
  for (const file of UPRIGHT) {
    const verdict = detectOrientation(await blocksOf(file));
    if (verdict !== "upright") wrong.push(`${file} -> ${verdict}`);
  }
  assertEquals(wrong, []);
});

Deno.test("every archived rotation is identified, with its direction", async () => {
  const wrong: string[] = [];
  for (const [file, expected] of TURNED) {
    const verdict = detectOrientation(await blocksOf(file));
    if (verdict !== expected) wrong.push(`${file} -> ${verdict}, want ${expected}`);
  }
  assertEquals(wrong, []);
});
