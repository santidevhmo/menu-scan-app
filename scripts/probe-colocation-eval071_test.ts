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

Deno.test("parseOcrUnits handles word-level and line-level shapes", () => {
  const w = parseOcrUnits(SHAPE_WORDS);
  assertEquals(w.length, 5);
  assertEquals(w[0].block, 0);
  assertEquals(w[4].block, 1);
  const l = parseOcrUnits(SHAPE_LINES);
  assertEquals(l.length, 2);
  assertEquals(l.map((u) => u.block), [0, 1]);
});

function caseOf(partial: Partial<Eval071Case> & { name: string }): Eval071Case {
  return {
    id: "t",
    role: "fake",
    expect_colocated: false,
    price: null,
    section_title: null,
    ...partial,
  };
}

Deno.test("checkCase: real card co-locates, borrowed-field fake does not", () => {
  const blocks = groupBlocks(parseOcrUnits(SHAPE_WORDS));
  const real = checkCase(
    blocks,
    caseOf({ name: "Ensalada Verde (150gr)", price: 52, expect_colocated: true, role: "real-keep" }),
  );
  assert(real.colocated && real.pass);
  const fake = checkCase(
    blocks,
    caseOf({ name: "Ensalada Verde (350gr)", price: 70 }),
  );
  assert(!fake.colocated && fake.pass, fake.evidence);
});

Deno.test("checkCase: grams alone discriminates when name+price both match a real card", () => {
  const blocks = groupBlocks(parseOcrUnits(SHAPE_LINES));
  const fake = checkCase(blocks, caseOf({ name: "Buffalo (350gr)", price: 150 }));
  assert(!fake.colocated, fake.evidence);
  const real = checkCase(
    blocks,
    caseOf({ name: "Boneless Buffalo (300gr)", price: 150, expect_colocated: true, role: "control-keep" }),
  );
  assert(real.colocated, real.evidence);
});

Deno.test("checkCase: null price skips the price requirement", () => {
  const blocks = groupBlocks(parseOcrUnits(SHAPE_WORDS));
  const v = checkCase(
    blocks,
    caseOf({ name: "Ensalada Verde", price: null, expect_colocated: true, role: "control-keep" }),
  );
  assert(v.colocated);
});

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

Deno.test("parseOcrUnits handles flat content-key blocks (real mistral-ocr-latest shape)", () => {
  const u = parseOcrUnits(SHAPE_CONTENT);
  assertEquals(u.length, 2);
  assertEquals(u.map((x) => x.block), [0, 1]);
  assertEquals(u[1].text, "Ensalada Verde (150gr) $52");
});
