import { assertEquals } from "jsr:@std/assert";
import {
  MENU_ANNOTATION_SCHEMA,
  OPTION_FIELD_INSTRUCTION,
  reshape,
} from "./probe-bakeoff-mistral-b1.ts";

Deno.test("reshape reads items from a JSON document annotation", () => {
  const result = reshape({ document_annotation: '{"items":[{"name":"Foo"}]}' });
  assertEquals(result.items.length, 1);
  assertEquals(result.rawTopKeys, ["document_annotation"]);
});

Deno.test("reshape reads items from an object document annotation", () => {
  const result = reshape({
    document_annotation: { items: [{ name: "A" }, { name: "B" }] },
  });
  assertEquals(result.items.length, 2);
});

Deno.test("reshape returns no items when document annotation is missing", () => {
  const result = reshape({ pages: [] });
  assertEquals(result.items.length, 0);
  assertEquals(result.rawTopKeys, ["pages"]);
});

Deno.test("reshape tolerates invalid document annotation JSON", () => {
  assertEquals(reshape({ document_annotation: "not json" }).items.length, 0);
});

Deno.test("options field carries the exact approved E instruction", () => {
  assertEquals(
    OPTION_FIELD_INSTRUCTION,
    "Only the sizes or extras printed as choices on THIS dish's own card. Never turn a general note printed elsewhere on the menu (e.g. 'add chicken/shrimp to any pasta or salad') into options on one unrelated item.",
  );
  const opt = (MENU_ANNOTATION_SCHEMA as {
    properties: { items: { items: { properties: { options: unknown } } } };
  }).properties.items.items.properties.options as { description: string };
  assertEquals(opt.description, OPTION_FIELD_INSTRUCTION);
});
