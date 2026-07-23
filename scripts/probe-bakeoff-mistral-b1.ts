import { compressedPhotoData, MENU_DIR } from "./photo-input.ts";

const MENUS = [
  { menu: "polloteria", photo: "PolloteriaMenu.png" },
  { menu: "bistro", photo: "BistroMenu.png" },
  { menu: "guest-house", photo: "GuestHouseMenu.png" },
];

export const OPTION_FIELD_INSTRUCTION =
  "Only the sizes or extras printed as choices on THIS dish's own card. Never turn a general note printed elsewhere on the menu (e.g. 'add chicken/shrimp to any pasta or salad') into options on one unrelated item.";

export const MENU_ANNOTATION_SCHEMA = {
  type: "object",
  properties: {
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
          options: {
            type: "array",
            description: OPTION_FIELD_INSTRUCTION,
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
        required: [
          "name",
          "description",
          "price",
          "category",
          "section_title",
          "options",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

interface Reshaped {
  rawTopKeys: string[];
  items: unknown[];
}
/** Locate the document annotation object in a Mistral OCR response and pull items[]. */
export function reshape(raw: unknown): Reshaped {
  const r = (raw ?? {}) as Record<string, unknown>;
  const rawTopKeys = Object.keys(r);
  let ann: unknown = r.document_annotation;
  if (typeof ann === "string") {
    try {
      ann = JSON.parse(ann);
    } catch {
      ann = undefined;
    }
  }
  const items = ann && typeof ann === "object" &&
      Array.isArray((ann as Record<string, unknown>).items)
    ? (ann as Record<string, unknown>).items as unknown[]
    : [];
  return { rawTopKeys, items };
}

async function fetchAnnotation(dataUrl: string, key: string): Promise<unknown> {
  const res = await fetch("https://api.mistral.ai/v1/ocr", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "mistral-ocr-latest",
      document: { type: "image_url", image_url: dataUrl },
      document_annotation_format: {
        type: "json_schema",
        json_schema: {
          schema: MENU_ANNOTATION_SCHEMA,
          name: "menu_extraction",
          strict: true,
        },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Mistral OCR HTTP ${res.status}: ${await res.text()}`);
  }
  return await res.json();
}

if (import.meta.main) {
  const key = Deno.env.get("MISTRAL_API_KEY");
  if (!key) throw new Error("MISTRAL_API_KEY missing (worktree .env.local)");
  const TAG = Deno.env.get("TAG") ?? "b1";
  const limit = Number(Deno.env.get("LIMIT") ?? "1");
  const tmp = await Deno.makeTempDir();
  let paid = 0;
  for (const m of MENUS) {
    for (let run = 1; run <= 3; run++) {
      const rawPath = `${MENU_DIR}/${m.menu}.mistral-${TAG}-r${run}.raw.json`;
      const dumpPath = `${MENU_DIR}/${m.menu}.mistral-${TAG}-r${run}.dump.json`;
      let raw: unknown;
      try {
        raw = JSON.parse(await Deno.readTextFile(rawPath));
        console.log(`[cache hit] ${m.menu} r${run}`);
      } catch {
        if (paid >= limit || paid >= 9) {
          console.log(`[stop] reached LIMIT=${limit} (paid ${paid})`);
          console.log(`\npaid calls: ${paid} (~$${(paid * 0.005).toFixed(3)})`);
          Deno.exit(0);
        }
        paid++;
        console.log(`[call ${paid}] ${m.menu} r${run} ...`);
        const dataUrl = await compressedPhotoData(m.photo, 2048, 95, tmp);
        raw = await fetchAnnotation(dataUrl, key);
        await Deno.writeTextFile(rawPath, JSON.stringify(raw, null, 2));
      }
      const { rawTopKeys, items } = reshape(raw);
      await Deno.writeTextFile(
        dumpPath,
        JSON.stringify(
          {
            image_quality: { usable: true, issues: [] },
            image_layout: { dense: false, crop_direction: "none" },
            items,
          },
          null,
          2,
        ),
      );
      console.log(
        `  ${m.menu} r${run}: items=${items.length} | rawTopKeys=[${
          rawTopKeys.join(",")
        }] | first3=${
          items.slice(0, 3).map((it) => (it as { name?: string }).name ?? "?")
            .join(" / ")
        }`,
      );
      if (items.length === 0) {
        console.log(
          "  !! zero items — likely schema/field-path issue; STOP for planner.",
        );
        Deno.exit(0);
      }
    }
  }
  console.log(`\npaid calls: ${paid} (~$${(paid * 0.005).toFixed(3)})`);
}
