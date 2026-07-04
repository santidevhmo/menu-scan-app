import { postprocessItems } from "./postprocess.ts";

const MODEL_TIMEOUT_MS = 120000;
const EXTRACT_SEED = 17;

export const EXTRACT_PROMPT =
  `Read this restaurant menu. Return every item exactly as printed, in menu order:
name, description, price, category, and section_title.
Do NOT estimate calories or nutrition. Do NOT invent items you cannot read.
Extract all visible menu items from every provided photo and every menu section.
Do not stop after a representative sample, a section summary, or the first page.
There is no maximum number of items; keep going until every readable item is returned.
Never return a section header as an item.
Copy the nearest printed heading that visually groups an item into section_title.
When a heading contains smaller subheadings, each item belongs to its nearest
subheading, never the parent (a spirits list under a parent heading with per-spirit
subheadings uses the spirit subheading). Use only printed headings; never invent
a grouping that is not printed on the menu. Set section_title to null
only when no heading groups the item. Preserve the item name exactly; never prepend
or synthesize the heading into the name.
A heading is often larger text without its own price, weight, or description, but
it must also group menu items beneath it. If a label has no price of its own and
the entries printed under it each have their own price, that label is a section
title: record it as those entries' section_title, never output the label itself
as an item, and never turn its priced entries into options. Do not treat
restaurant names, slogans, or promotional text as section headings.
Use category "food" for appetizers, entrees, main dishes, and other prepared food.
Use "side", "dessert", or "drink" only when that role is clear; otherwise use "other".
Return separately printed preparations or variants as separate items; do not merge
separate menu rows.
If a description is not printed, use an empty string. If a price is not printed, set it to null.
Assess image quality across all photos. Report blur, low_light, glare, or another concise issue.
Set usable to false only when the menu cannot be read reliably.`;

// ponytail: v2 prompt/schema are an unproven hypothesis until the real-menu harness passes.
export const EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    image_quality: {
      type: "object",
      properties: {
        usable: { type: "boolean" },
        issues: { type: "array", items: { type: "string" } },
      },
      required: ["usable", "issues"],
      additionalProperties: false,
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          price: { type: ["number", "null"] },
          category: {
            type: "string",
            enum: ["food", "side", "dessert", "drink", "other"],
          },
          section_title: { type: ["string", "null"] },
        },
        required: [
          "name",
          "description",
          "price",
          "category",
          "section_title",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["image_quality", "items"],
  additionalProperties: false,
};

export const OPTIONS_SCHEMA = {
  type: "object",
  properties: {
    option_sets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          item_index: { type: "integer" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                price: { type: ["number", "null"] },
                grams: { type: ["number", "null"] },
              },
              required: ["name", "price", "grams"],
              additionalProperties: false,
            },
          },
        },
        required: ["item_index", "options"],
        additionalProperties: false,
      },
    },
  },
  required: ["option_sets"],
  additionalProperties: false,
};

export interface ImageQuality {
  usable: boolean;
  issues: string[];
}

type Category = "food" | "side" | "dessert" | "drink" | "other";

interface ExtractedBaseItem {
  name: string;
  description: string;
  price: number | null;
  category: Category;
  section_title: string | null;
}

export interface ExtractedMenuItem extends ExtractedBaseItem {
  options: { name: string; price: number | null; grams: number | null }[];
}

interface ItemsResult {
  image_quality: ImageQuality;
  items: ExtractedBaseItem[];
}

interface OptionsResult {
  option_sets: {
    item_index: number;
    options: ExtractedMenuItem["options"];
  }[];
}

export interface ExtractionResult {
  image_quality: ImageQuality;
  items: ExtractedMenuItem[];
  raw_response: string;
}

function optionsPrompt(items: ExtractedMenuItem[]): string {
  const indexedItems = items.map((item, item_index) => ({
    item_index,
    name: item.name,
    description: item.description,
    price: item.price,
    section_title: item.section_title,
  }));

  return `Read the restaurant menu photos again and identify selectable options
for the indexed items below. An option is a printed choice within one item's
composition: a protein or filling choice, paid add-on, dietary swap, or flavor
choice. Any wording in the menu's own language that invites choosing one of
several mutually exclusive alternatives is an options list, whatever its
formatting: an inline sentence, a bolded lead-in line, a parenthetical, or a
dash- or slash-separated list. An alternative that carries its own printed
price or weight is one option; record that printed price and grams.

The choice text must be printed inside that item's own block, under its name or
within its description area. A label printed above multiple entries that each
have their own price is a section heading, not an item with options; never
attach those entries as options of the label. Separately printed preparations
or variants are separate items, not options. Ingredients printed as served
together (joined by the menu language's "and") are description, not options.
Conditional or grouped combo choices stay description text. Serving formats and
sizes (glass vs bottle, copa vs botella, small vs large) are not options.
Distinct products listed under a shared heading are not options.

Return only items that have genuine options. Preserve each supplied item_index
exactly. Include an option's printed price and grams when present; otherwise use
null. Do not invent choices that are not printed.

Indexed items:
${JSON.stringify(indexedItems)}`;
}

async function callModel<T>(
  prompt: string,
  schemaName: string,
  schema: unknown,
  photos: string[],
  apiKey: string,
): Promise<{ parsed: T; raw: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
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
            { type: "text", text: prompt },
            ...photos.map((photo) => ({
              type: "image_url",
              image_url: {
                url: photo.startsWith("data:")
                  ? photo
                  : `data:image/jpeg;base64,${photo}`,
              },
            })),
          ],
        }],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: schemaName,
            strict: true,
            schema,
          },
        },
        temperature: 0,
        seed: EXTRACT_SEED,
      }),
      signal: controller.signal,
    });
    const json = await res.json() as {
      error?: { message?: string };
      choices?: { finish_reason: string; message: { content: string } }[];
    };
    if (!res.ok) throw new Error(json.error?.message ?? "OpenAI API error");

    const text = json.choices?.[0]?.message.content;
    if (!text) throw new Error(`OpenAI returned no ${schemaName} content`);

    console.log(
      `[openai:${schemaName}] finish_reason:`,
      json.choices?.[0]?.finish_reason,
    );
    return { parsed: JSON.parse(text) as T, raw: text };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `Model request timed out after ${MODEL_TIMEOUT_MS / 1000}s`,
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function mergeOptions(
  items: ExtractedMenuItem[],
  optionSets: OptionsResult["option_sets"],
): ExtractedMenuItem[] {
  const merged: ExtractedMenuItem[] = items.map((item) => ({
    ...item,
    options: [],
  }));
  const seen = new Set<number>();

  for (const optionSet of optionSets) {
    const index = optionSet.item_index;
    if (
      !Number.isInteger(index) ||
      index < 0 ||
      index >= merged.length ||
      seen.has(index)
    ) {
      throw new Error(`Invalid or duplicate item_index: ${index}`);
    }
    seen.add(index);
    merged[index] = { ...merged[index], options: optionSet.options };
  }

  return postprocessItems(merged);
}

export async function runExtraction(
  photos: string[],
  apiKey: string,
): Promise<ExtractionResult> {
  const first = await callModel<ItemsResult>(
    EXTRACT_PROMPT,
    "menu_items",
    EXTRACT_SCHEMA,
    photos,
    apiKey,
  );
  const items = postprocessItems(
    first.parsed.items.map((item) => ({ ...item, options: [] })),
  );
  const second = await callModel<OptionsResult>(
    optionsPrompt(items),
    "menu_options",
    OPTIONS_SCHEMA,
    photos,
    apiKey,
  );

  return {
    image_quality: first.parsed.image_quality,
    items: mergeOptions(items, second.parsed.option_sets),
    raw_response: JSON.stringify({
      items: first.raw,
      options: second.raw,
    }),
  };
}
