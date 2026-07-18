import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { isValidOcrPhotos } from "./request-validation.ts";

Deno.test("ocr_photos validation accepts absent and valid parallel arrays", () => {
  assertEquals(isValidOcrPhotos(undefined, 2), true);
  assertEquals(isValidOcrPhotos(["photo", null], 2), true);
});

Deno.test("ocr_photos validation rejects wrong length and oversized entries", () => {
  assertEquals(isValidOcrPhotos(["photo"], 2), false);
  assertEquals(isValidOcrPhotos(["x".repeat(10_000_001)], 1), false);
});
