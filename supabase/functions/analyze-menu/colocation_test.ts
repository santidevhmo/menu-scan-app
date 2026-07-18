import { assert, assertEquals } from "jsr:@std/assert";
import {
  applyColocation,
  bestLineSim,
  colocationStage,
  editDistance,
  judgeItem,
  looseTokenMatch,
  nameTokens,
  normTokens,
  parseGrams,
  sigTokens,
  toBlockTexts,
  tokenMatch,
} from "./colocation.ts";
import {
  extractWithRetry,
  runGroupedExtraction,
  verifyTileItems,
} from "./extract.ts";
import type { ExtractedMenuItem, ExtractionResult } from "./extract.ts";

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

function item(partial: Partial<ExtractedMenuItem> = {}): ExtractedMenuItem {
  return {
    name: "Alitas",
    description: "",
    price: null,
    category: "food",
    section_title: null,
    options: [],
    grams: null,
    ...partial,
  };
}

function blocks(...content: string[]) {
  return toBlockTexts(
    content.map((value) => ({ content: value, type: "text" })),
  );
}

Deno.test("judgeItem distinguishes verified, contradicted, and unverifiable", () => {
  const b = blocks("Ensalada Verde (150gr) $52", "Papas (350gr) $70");
  assertEquals(
    judgeItem(b, item({ name: "Ensalada Verde (150gr)", price: 52 })).verdict,
    "verified",
  );
  assertEquals(
    judgeItem(b, item({ name: "Ensalada Verde (350gr)", price: 70 })).verdict,
    "contradicted",
  );
  assertEquals(
    judgeItem(b, item({ name: "Alitas (125gr)", price: 129 })).verdict,
    "unverifiable",
  );
});

Deno.test("mention-guard rejects prose combo lines as anchors", () => {
  const b = blocks(
    "Una orden de boneless(300gr), 12 piezas de alitas, una orden de papas fritas(300gr), 5 piezas de dedos de queso por $499",
    "Alitas 6 PZ $129 / 12PZ $169 / 20PZ $269",
  );
  assertEquals(
    judgeItem(b, item({ name: "Alitas (125gr)" })).verdict,
    "unverifiable",
  );
});

Deno.test("polarity drops a contradicted item when a sibling verifies the block", () => {
  const b = blocks("Ensalada Verde (150gr) $52");
  const real = item({ name: "Ensalada Verde (150gr)", price: 52 });
  const fake = item({ name: "Ensalada Verde (350gr)", price: 70 });
  assertEquals(applyColocation(b, [real, fake]), [real]);
});

Deno.test("polarity flags but keeps a contradicted item without a sibling", () => {
  const tender = item({ name: "Tender (150gr)", price: 165 });
  assertEquals(applyColocation(blocks("Tender (350gr) $165"), [tender]), [
    tender,
  ]);
});

Deno.test("unverifiable items are kept", () => {
  const alitas = item({ name: "Alitas (125gr)", price: 129 });
  assertEquals(
    applyColocation(blocks("Ensalada Verde (150gr) $52"), [alitas]),
    [alitas],
  );
});

Deno.test("drinks are never judged or dropped", () => {
  const drink = item({
    name: "Refresco (350gr)",
    price: 70,
    category: "drink",
  });
  assertEquals(applyColocation(blocks("Refresco (150gr) $50"), [drink]), [
    drink,
  ]);
});

Deno.test("colocationStage fails open and skips empty tile groups", async () => {
  const alitas = item({ name: "Alitas (125gr)", price: 129 });
  let calls = 0;
  const fetchOcr = async () => {
    calls++;
    throw new Error("offline");
  };
  assertEquals(await colocationStage(["tile"], [alitas], "key", fetchOcr), [
    alitas,
  ]);
  assertEquals(calls, 1);
  assertEquals(await colocationStage([], [alitas], "key", fetchOcr), [alitas]);
  assertEquals(calls, 1);
  assertEquals(await colocationStage(["tile"], [alitas], undefined, fetchOcr), [
    alitas,
  ]);
  assertEquals(calls, 1);
});

Deno.test("runGroupedExtraction portrait path skips co-location fetches", async () => {
  const alitas = item({ name: "Alitas (125gr)", price: 129 });
  let calls = 0;
  const fetchOcr = async () => {
    calls++;
    return [];
  };
  assertEquals(await colocationStage([], [alitas], "key", fetchOcr), [alitas]);
  assertEquals(calls, 0);
});

Deno.test("colocationStage fetches each supplied full-photo OCR entry once", async () => {
  const seen: string[] = [];
  const fetchOcr = async (photo: string) => {
    seen.push(photo);
    return Array.from({ length: 5 }, (_, index) => ({
      content: `line ${index}`,
      type: "text",
    }));
  };
  const result = await colocationStage(
    ["photo-a", "photo-b"],
    [item({ name: "Alitas" })],
    "key",
    fetchOcr,
  );
  assertEquals(seen, ["photo-a", "photo-b"]);
  assertEquals(result.length, 1);
});

Deno.test("existence editDistance and looseTokenMatch allow bounded name drift", () => {
  assertEquals(editDistance("tenderazo", "tendedero"), 3);
  assert(looseTokenMatch("tenderazo", "tenderue"));
  assert(looseTokenMatch("papa", "papas"));
  assert(!looseTokenMatch("tender", "tendedero"));
  assert(!looseTokenMatch("jr", "gr"));
  assert(!looseTokenMatch("chicken", "cheesey"));
});

Deno.test("bestLineSim compares significant name tokens per OCR block", () => {
  assertEquals(sigTokens(["el", "tenderazo", "150gr", "52"]), ["tenderazo"]);
  assertEquals(bestLineSim("El Tenderazo", blocks("El Tenderazo")), 1);
  assert(
    bestLineSim(
      "Papa Sazonada (350gr)",
      blocks("Papas Sazonadas (300gr) $70"),
    ) >= 0.75,
  );
  assert(
    bestLineSim(
      "Boneless el Pollo (150gr)",
      blocks("Megacharola Boneless $599", "El Tendedero $165"),
    ) < 0.75,
  );
  assert(
    bestLineSim(
      "Chicken Bacon (300gr)",
      blocks("Cheesey Bacon (300gr) $155", "Aguacate Chicken M (150gr) $178"),
    ) < 0.75,
  );
});

Deno.test("existence tier stays inert when the menu is unreadable", () => {
  const invented = item({ name: "Plato Nuevo", price: 99 });
  assertEquals(
    applyColocation(blocks("Ensalada Verde (150gr) $52"), [invented]),
    [invented],
  );
});

Deno.test("existence tier drops low-sim inventions but keeps misreads, flags, and drinks", () => {
  const real = item({ name: "Ensalada Verde (150gr)", price: 52 });
  const flagged = item({ name: "Tender (150gr)", price: 165 });
  const misread = item({ name: "El Tenderazo", price: 200 });
  const invented = item({ name: "Plato Nuevo", price: 99 });
  const drink = item({
    name: "Refresco (350gr)",
    price: 70,
    category: "drink",
  });
  const result = applyColocation(
    blocks(
      "Ensalada Verde (150gr) $52",
      "Tender (350gr) $165",
      "El Tendedero $200",
      "Agua (500ml) $20",
    ),
    [real, flagged, misread, invented, drink],
  );
  assertEquals(result, [real, flagged, misread, drink]);
});

Deno.test("unpriced anchored title keeps Paletas through the existence tier", () => {
  const paletas = item({ name: "Paletas Heladas Agua", price: 20 });
  const boneless = item({ name: "Boneless Jr (200gr)", price: 132 });
  const b = blocks("# Paletas Heladas", "Boneless Jr(200gr) $132");
  assertEquals(judgeItem(b, paletas).anchored, true);
  assertEquals(applyColocation(b, [paletas, boneless]), [paletas, boneless]);
});

Deno.test("tile path drops category:other condiment echoes", async () => {
  const results: ExtractionResult[] = [
    {
      image_quality: { usable: true, issues: [] },
      image_layout: { dense: false, crop_direction: "none" },
      items: [
        item({ name: "Tacos", price: 100 }),
        item({
          name: "Ranch",
          price: 10,
          category: "other",
        }),
      ],
      raw_response: "t1",
    },
    {
      image_quality: { usable: true, issues: [] },
      image_layout: { dense: false, crop_direction: "none" },
      items: [],
      raw_response: "t2",
    },
    {
      image_quality: { usable: true, issues: [] },
      image_layout: { dense: false, crop_direction: "none" },
      items: [],
      raw_response: "t3",
    },
    {
      image_quality: { usable: true, issues: [] },
      image_layout: { dense: false, crop_direction: "none" },
      items: [],
      raw_response: "t4",
    },
  ];
  let call = 0;
  const extract =
    (() => Promise.resolve(results[call++])) as typeof extractWithRetry;
  const verify =
    ((_tile: string, items: ExtractionResult["items"]) =>
      Promise.resolve(items)) as typeof verifyTileItems;

  const result = await runGroupedExtraction(
    [["a", "b", "c", "d"]],
    "key",
    extract,
    verify,
  );

  assertEquals(result.items.map((entry) => entry.name), ["Tacos"]);
});
