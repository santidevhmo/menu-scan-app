import { assertEquals } from "jsr:@std/assert";
import { pageBlocks } from "./mistral-extract.ts";

Deno.test("pageBlocks reads the boxes out of a raw OCR response", () => {
  const raw = {
    pages: [{
      markdown: "x",
      blocks: [
        { top_left_x: 79, top_left_y: 30, bottom_right_x: 286, bottom_right_y: 57, content: "Bistro Restaurante" },
      ],
    }],
  };
  assertEquals(pageBlocks(raw).length, 1);
  assertEquals(pageBlocks(raw)[0].content, "Bistro Restaurante");
});

Deno.test("pageBlocks returns [] when a response carries no boxes", () => {
  // mistral-ocr-2512 returns `blocks: []`; a future model may omit the key.
  // Either way the detector must degrade to "cannot tell", never throw.
  assertEquals(pageBlocks({ pages: [{ markdown: "x" }] }), []);
  assertEquals(pageBlocks({}), []);
  assertEquals(pageBlocks(null), []);
});
