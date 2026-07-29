import { compressedPhotoData, MENU_DIR } from "./photo-input.ts";

// All 9 fixture menus (photos per menu = the fixture's `photos` list).
export const MENU_PHOTOS: Record<string, string[]> = {
  polloteria: ["PolloteriaMenu.png"],
  bistro: ["BistroMenu.png"],
  "guest-house": ["GuestHouseMenu.png"],
  brasero: ["BraseroMenu.png"],
  "brasero-two": ["BraseroMenuTwo.png", "BraseroMenuTwo_TWo.png"],
  "casa-nostra": ["CasaNostraMenu.png"],
  "el-marcos": ["ElMarcosMenu.png"],
  mochomos: ["MochomosMenu.png"],
  nikkori: ["NikkoriMenu.png"],
};
export const WIDE_MENUS = ["polloteria", "bistro", "guest-house"];
/** Raw-response path for one menu/run/page; page 0 keeps the historical name. */
export function rawPath(
  dir: string,
  menu: string,
  tag: string,
  run: number,
  page: number,
): string {
  return `${dir}/${menu}.mistral-${tag}-r${run}${
    page === 0 ? "" : `.p${page}`
  }.raw.json`;
}

const MENU_ANNOTATION_SCHEMA = {
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
  const runs = Number(Deno.env.get("RUNS") ?? "3");
  const menus = (Deno.env.get("MENUS") ?? WIDE_MENUS.join(",")).split(",")
    .map((m) => m.trim()).filter((m) => m.length > 0);
  const tmp = await Deno.makeTempDir();
  let paid = 0;
  for (const menu of menus) {
    const photos = MENU_PHOTOS[menu];
    if (!photos) throw new Error(`unknown menu: ${menu}`);
    for (let run = 1; run <= runs; run++) {
      const dumpPath = `${MENU_DIR}/${menu}.mistral-${TAG}-r${run}.dump.json`;
      const allItems: unknown[] = [];
      let topKeys: string[] = [];
      for (const [page, photo] of photos.entries()) {
        const path = rawPath(MENU_DIR, menu, TAG, run, page);
        let raw: unknown;
        try {
          raw = JSON.parse(await Deno.readTextFile(path));
          console.log(`[cache hit] ${menu} r${run} p${page}`);
        } catch {
          if (paid >= limit) {
            console.log(`[stop] reached LIMIT=${limit} (paid ${paid})`);
            console.log(
              `\npaid calls: ${paid} (~$${(paid * 0.005).toFixed(3)})`,
            );
            Deno.exit(0);
          }
          paid++;
          console.log(`[call ${paid}] ${menu} r${run} p${page} ...`);
          const dataUrl = await compressedPhotoData(photo, 2048, 95, tmp);
          raw = await fetchAnnotation(dataUrl, key);
          await Deno.writeTextFile(path, JSON.stringify(raw, null, 2));
        }
        const { rawTopKeys, items } = reshape(raw);
        topKeys = rawTopKeys;
        allItems.push(...items);
      }
      // Combined dump = every page's items concatenated (the per-page cleanup +
      // cross-page merge happens in mistral-cleanup.ts, mirroring production).
      await Deno.writeTextFile(
        dumpPath,
        JSON.stringify(
          {
            image_quality: { usable: true, issues: [] },
            image_layout: { dense: false, crop_direction: "none" },
            items: allItems,
          },
          null,
          2,
        ),
      );
      console.log(
        `  ${menu} r${run}: items=${allItems.length} | rawTopKeys=[${
          topKeys.join(",")
        }] | first3=${
          allItems.slice(0, 3).map((it) =>
            (it as { name?: string }).name ?? "?"
          )
            .join(" / ")
        }`,
      );
      if (allItems.length === 0) {
        console.log(
          "  !! zero items — likely schema/field-path issue; STOP for planner.",
        );
        Deno.exit(0);
      }
    }
  }
  console.log(`\npaid calls: ${paid} (~$${(paid * 0.005).toFixed(3)})`);
}
