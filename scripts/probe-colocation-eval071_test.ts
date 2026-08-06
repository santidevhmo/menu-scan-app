import { assert, assertEquals } from "jsr:@std/assert";
import {
  checkCase,
  type Eval071Case,
  groupBlocks,
  nameTokens,
  normTokens,
  parseGrams,
  parseOcrUnits,
  tokenMatch,
} from "./probe-colocation-eval071.ts";

Deno.test("normTokens strips accents, case, punctuation", () => {
  assertEquals(normTokens("Boneless de Coliflor / Vegetarianas (300gr) $139"), [
    "boneless",
    "de",
    "coliflor",
    "vegetarianas",
    "300gr",
    "139",
  ]);
  assertEquals(normTokens("Bañados en salsa"), ["banados", "en", "salsa"]);
});

Deno.test("nameTokens drops numeric/gr/pz field text", () => {
  assertEquals(nameTokens("Buffalo (350gr) $150"), ["buffalo"]);
  assertEquals(nameTokens("Alitas 6 Pz $129 / 12Pz $169"), ["alitas"]);
  assertEquals(nameTokens("Chicken-Little (200gr)"), ["chicken", "little"]);
});

Deno.test("parseGrams reads the first printed-weight claim", () => {
  assertEquals(parseGrams("Buffalo (350gr) $150"), 350);
  assertEquals(parseGrams("Boneless Jr(200gr)"), 200);
  assertEquals(parseGrams("Alitas 6 Pz $129"), null);
});

Deno.test("tokenMatch allows one edit only for long tokens", () => {
  assert(tokenMatch("vegetarianos", "vegetarianas"));
  assert(!tokenMatch("jr", "gr"));
  assert(!tokenMatch("boneless", "buffalo"));
});

const SHAPE_WORDS = {
  pages: [{
    blocks: [
      {
        lines: [{
          words: [
            { text: "Ensalada", bounding_box: [0, 0, 50, 10] },
            { text: "Verde", bounding_box: [55, 0, 90, 10] },
            { text: "(150gr)", bounding_box: [95, 0, 120, 10] },
            { text: "$52", bounding_box: [125, 0, 140, 10] },
          ],
        }],
      },
      { lines: [{ words: [{ text: "Papas (350gr) $70", bounding_box: [0, 40, 140, 50] }] }] },
    ],
  }],
};

const SHAPE_LINES = {
  pages: [{
    blocks: [
      { type: "line", bbox: [0, 0, 140, 10], text: "Boneless Buffalo (300gr) $150" },
      { type: "line", bbox: [0, 40, 140, 50], text: "Boneless Barbecue (300gr) $150" },
    ],
  }],
};

const SHAPE_CONTENT = {
  pages: [{
    blocks: [
      {
        top_left_x: 127,
        top_left_y: 299,
        bottom_right_x: 323,
        bottom_right_y: 315,
        content: "TostiBoneless (450gr) $182",
        type: "text",
      },
      {
        top_left_x: 1691,
        top_left_y: 338,
        bottom_right_x: 1905,
        bottom_right_y: 356,
        content: "Ensalada Verde (150gr) $52",
        type: "text",
      },
    ],
  }],
};

Deno.test("parseOcrUnits handles word-level and line-level shapes", () => {
  const w = parseOcrUnits(SHAPE_WORDS);
  assertEquals(w.length, 5);
  assertEquals(w[0].block, 0);
  assertEquals(w[4].block, 1);
  const l = parseOcrUnits(SHAPE_LINES);
  assertEquals(l.length, 2);
  assertEquals(l.map((u) => u.block), [0, 1]);
});

Deno.test("parseOcrUnits handles flat content-key blocks (real mistral-ocr-latest shape)", () => {
  const u = parseOcrUnits(SHAPE_CONTENT);
  assertEquals(u.length, 2);
  assertEquals(u.map((x) => x.block), [0, 1]);
  assertEquals(u[1].text, "Ensalada Verde (150gr) $52");
});

Deno.test("groupBlocks flags priced anchors", () => {
  const blocks = groupBlocks([
    { text: "Alitas 6 PZ $129", block: 0 },
    { text: "Alitas de pollo empanizadas", block: 1 },
  ]);
  assertEquals(blocks[0].priced, true);
  assertEquals(blocks[1].priced, false);
});

function caseOf(
  partial: Partial<Eval071Case> & { name: string; expect: Eval071Case["expect"] },
): Eval071Case {
  return { id: "t", role: "fake", price: null, section_title: null, ...partial };
}

Deno.test("verified: real card prints every claim in one block", () => {
  const blocks = groupBlocks(parseOcrUnits(SHAPE_WORDS));
  const v = checkCase(
    blocks,
    caseOf({ name: "Ensalada Verde (150gr)", price: 52, expect: "verified", role: "real-keep" }),
  );
  assertEquals(v.verdict, "verified");
  assert(v.pass);
});

Deno.test("contradicted: priced anchor disagrees on price and grams", () => {
  const blocks = groupBlocks(parseOcrUnits(SHAPE_WORDS));
  const v = checkCase(
    blocks,
    caseOf({ name: "Ensalada Verde (350gr)", price: 70, expect: "contradicted" }),
  );
  assertEquals(v.verdict, "contradicted", v.evidence);
});

Deno.test("contradicted: grams alone discriminates when name+price match a real card", () => {
  const blocks = groupBlocks(parseOcrUnits(SHAPE_LINES));
  const v = checkCase(
    blocks,
    caseOf({ name: "Buffalo (350gr)", price: 150, expect: "contradicted" }),
  );
  assertEquals(v.verdict, "contradicted", v.evidence);
});

Deno.test("unverifiable: grams claim has no grams evidence", () => {
  const blocks = groupBlocks([
    { text: "Alitas 6 PZ $129", block: 0 },
    { text: "Alitas de pollo empanizadas bañadas en la salsa", block: 1 },
  ]);
  const v = checkCase(
    blocks,
    caseOf({ name: "Alitas (125gr)", expect: "unverifiable", role: "control-keep" }),
  );
  assertEquals(v.verdict, "unverifiable", v.evidence);
});

Deno.test("prose anchors can never contradict", () => {
  const blocks = groupBlocks([
    { text: "Una orden de boneless", block: 0 },
  ]);
  const v = checkCase(
    blocks,
    caseOf({ name: "Boneless (200gr)", expect: "unverifiable", role: "control-keep" }),
  );
  assertEquals(v.verdict, "unverifiable", v.evidence);
});

Deno.test("verified trivially when the candidate claims no fields", () => {
  const blocks = groupBlocks(parseOcrUnits(SHAPE_WORDS));
  const v = checkCase(
    blocks,
    caseOf({ name: "Ensalada Verde", expect: "verified", role: "control-keep" }),
  );
  assertEquals(v.verdict, "verified");
});

Deno.test("a prose combo line that mentions the dish and ends with a price cannot anchor", () => {
  const blocks = groupBlocks([
    {
      text:
        "Una orden de boneless(300gr), 12 piezas de alitas, una orden de papas fritas(300gr), 5 piezas de dedos de queso por $499",
      block: 0,
    },
    { text: "Alitas 6 PZ $129 / 12PZ $169 / 20PZ $269", block: 1 },
  ]);
  const v = checkCase(
    blocks,
    caseOf({ name: "Alitas (125gr)", expect: "unverifiable", role: "control-keep" }),
  );
  assertEquals(v.verdict, "unverifiable", v.evidence);
});
