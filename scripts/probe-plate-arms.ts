// Arms A and C for the plate-total fix, judged by the size-sensitivity test.
// Spec: docs/superpowers/specs/2026-08-11-plate-total-arms-design.md
//
// Neither arm touches enrich.ts or the deployed function. Both import the real
// prompt, schema and gram-resolution so the measurement path stays shared -
// this repo has already paid for two paths that disagreed (lesson 28).
//
//   ARM A  split batch: items with a printed weight keep today's request
//          byte-identically; the rest get a required typical_total_g.
//   ARM C  parallel plate call: ENRICH_PROMPT untouched, a second call supplies
//          the plate weight, code rescales through the same resolveGrams.
//
//   deno run --allow-net --allow-env --allow-read --allow-write \
//     --env-file=.env.local scripts/probe-plate-arms.ts
import {
  callGptEnrich,
  ENRICH_MODEL,
  ENRICH_PROMPT,
  ENRICH_SCHEMA_OPENAI,
  resolveGrams,
  sumIngredientMacros,
} from "../supabase/functions/analyze-menu/enrich.ts";
import { parseItemGrams } from "../supabase/functions/analyze-menu/postprocess.ts";

const apiKey = Deno.env.get("OPENAI_API_KEY");
if (!apiKey) throw new Error("OPENAI_API_KEY is required in .env.local");

const DRAWS = 3;
const MIN_PLAUSIBLE_G = 20;
const MAX_PLAUSIBLE_G = 2000;

/** A model can return anything; only a believable plate reaches resolveGrams. */
function plausibleTotal(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) &&
      value >= MIN_PLAUSIBLE_G && value <= MAX_PLAUSIBLE_G
    ? value
    : null;
}

interface Item {
  name: string;
  description: string;
  price: number | null;
  category: string;
  section_title: string | null;
  options: unknown[];
  grams: number | null;
}

const item = (name: string, description: string): Item => {
  const [parsed] = parseItemGrams([
    // deno-lint-ignore no-explicit-any
    { name, description, price: 200, category: "food" } as any,
  ]);
  return {
    name,
    description,
    price: 200,
    category: "food",
    section_title: null,
    options: [],
    grams: parsed?.grams ?? null,
  };
};

// ---------------------------------------------------------------- ARM A

// Today's prompt plus ONE sentence. No food, dish or cuisine name - the
// mechanical guard in enrich_test.ts exists because a food list in the
// nutrition step was measured harmful.
const ARM_A_SENTENCE =
  ' Give "typical_total_g": the total edible weight in grams of one order of this item as it is served.';
const ARM_A_PROMPT = ENRICH_PROMPT + ARM_A_SENTENCE;

// deno-lint-ignore no-explicit-any
const ARM_A_SCHEMA: any = structuredClone(ENRICH_SCHEMA_OPENAI);
{
  // deno-lint-ignore no-explicit-any
  const item: any = ARM_A_SCHEMA.properties.items.items;
  // ORDER IS LOad-BEARING. printed_total_g sits before ingredients on purpose
  // (B4): the model commits to the dish's weight BEFORE portioning anything
  // into it. typical_total_g plays the same role for a dish with no printed
  // weight, so it goes in the same place - appending it after the macro fields
  // would ask for the plate only once the ingredients were already chosen,
  // which is the very failure this arm exists to fix. enrich_test.ts fails the
  // build if ingredients[] stops preceding the macro fields.
  const rebuilt: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item.properties)) {
    rebuilt[key] = value;
    if (key === "printed_total_g") rebuilt.typical_total_g = { type: "number" };
  }
  item.properties = rebuilt;
  const at = item.required.indexOf("printed_total_g");
  item.required.splice(at + 1, 0, "typical_total_g");
}

async function callOpenAI(
  prompt: string,
  // deno-lint-ignore no-explicit-any
  schema: any,
  items: unknown[],
) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: ENRICH_MODEL,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: JSON.stringify({ items }) },
      ],
      response_format: {
        type: "json_schema",
        // ENRICH_SCHEMA_OPENAI is the bare schema; enrich.ts adds this wrapper
        // at the call site, so the probe has to add it too.
        json_schema: schema.schema
          ? schema
          : { name: "menu_items", strict: true, schema },
      },
      temperature: 0,
      seed: 17,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return JSON.parse(json.choices[0].message.content);
}

async function armA(items: Item[]) {
  const weighted = items.filter((i) => i.grams != null);
  const unweighted = items.filter((i) => i.grams == null);
  // deno-lint-ignore no-explicit-any
  const out: any[] = [];

  // Byte-identical request for anything that prints a weight.
  if (weighted.length > 0) {
    // deno-lint-ignore no-explicit-any
    const { items: enriched } = await callGptEnrich(weighted as any, apiKey!);
    out.push(...enriched);
  }
  if (unweighted.length > 0) {
    const raw = await callOpenAI(ARM_A_PROMPT, ARM_A_SCHEMA, unweighted);
    // deno-lint-ignore no-explicit-any
    for (const it of raw.items ?? []) {
      const total = plausibleTotal(it.typical_total_g) ?? it.printed_total_g;
      out.push({
        ...it,
        ...sumIngredientMacros(it.ingredients ?? [], total),
        _plate_g: total,
      });
    }
  }
  return out;
}

// ------------------------------------------------- ARM A-CONDITIONAL

/**
 * Does the menu STATE a size or quantity for this item?
 *
 * The 2026-08-11 arms measured the anchor helping and hurting in different
 * places: with a stated size it is the whole mechanism (28→40 cm moves 1.74×
 * anchored, 1.12× not), and with nothing stated it overrides a better
 * ingredient list with a worse guess (Salmón Roll 322 g of ingredients pushed
 * down to a 250 g guess, against a cross-checked 397 g).
 *
 * Deterministic and food-agnostic - it matches UNITS and QUANTIFIERS, never a
 * food name, the same discipline as parseItemGrams.
 */
export function statesSize(name: string, description: string): boolean {
  const text = `${name} ${description}`.toLowerCase();
  return [
    /\d+\s*(cm|cms|pulgadas?|inch(es)?|")/, // a dimension
    /\d+\s*(pz|pzas?|piezas?|pieces|pcs)\b/, // a piece count
    /\d+\s*person/, // "para 2 personas"
    /\b(chica|chico|grande|mediana|mediano|individual|compartir)\b/, // a size word
    /\b(dos|tres|cuatro|seis|doce)\b/, // a count written out
  ].some((re) => re.test(text));
}

async function armAConditional(items: Item[]) {
  const weighted = items.filter((i) => i.grams != null);
  const unweighted = items.filter((i) => i.grams == null);
  // deno-lint-ignore no-explicit-any
  const out: any[] = [];

  if (weighted.length > 0) {
    // deno-lint-ignore no-explicit-any
    const { items: enriched } = await callGptEnrich(weighted as any, apiKey!);
    out.push(...enriched);
  }
  if (unweighted.length > 0) {
    const raw = await callOpenAI(ARM_A_PROMPT, ARM_A_SCHEMA, unweighted);
    // deno-lint-ignore no-explicit-any
    for (const it of raw.items ?? []) {
      const source = unweighted.find((u) => u.name === it.name);
      // The field is ALWAYS requested - asking for the plate improves the
      // ingredient list either way. It is only APPLIED when the menu said
      // something about size.
      const anchored = source &&
        statesSize(source.name, source.description);
      const total = anchored
        ? plausibleTotal(it.typical_total_g) ?? it.printed_total_g
        : it.printed_total_g;
      out.push({
        ...it,
        ...sumIngredientMacros(it.ingredients ?? [], total),
        _plate_g: total,
        _anchored: Boolean(anchored),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- ARM C

const PLATE_SCHEMA = {
  name: "plate_weights",
  strict: true,
  schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            total_grams: { type: "number" },
          },
          required: ["name", "total_grams"],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  },
};

const PLATE_PROMPT =
  "For each menu item, give the total edible weight in grams of one order as it is served in a " +
  "restaurant. Return the item name exactly as given.";

async function armC(items: Item[]) {
  const unweighted = items.filter((i) => i.grams == null);
  const [{ items: enriched }, plates] = await Promise.all([
    // deno-lint-ignore no-explicit-any
    callGptEnrich(items as any, apiKey!),
    unweighted.length > 0
      ? callOpenAI(
        PLATE_PROMPT,
        PLATE_SCHEMA,
        unweighted.map((i) => ({ name: i.name, description: i.description })),
      )
      : Promise.resolve({ items: [] }),
  ]);

  const byName = new Map<string, number>();
  // deno-lint-ignore no-explicit-any
  for (const p of plates.items ?? []) byName.set(p.name, p.total_grams);

  // deno-lint-ignore no-explicit-any
  return (enriched as any[]).map((it) => {
    // An item that printed a weight keeps it. Rescaling only ever reaches
    // items that had no anchor at all.
    if (it.printed_total_g) return it;
    const total = plausibleTotal(byName.get(it.name));
    if (total === null) return it;
    return {
      ...it,
      ...sumIngredientMacros(it.ingredients ?? [], total),
      _plate_g: total,
    };
  });
}

// ------------------------------------------------------- the size test

const PAIRS = [
  {
    signal: "printed grams (CONTROL)",
    expected: 2,
    small: item(
      "CESAR (200 g)",
      "Lechuga, queso parmesano rallado, croutones, pollo a la plancha y aderezo cesar de la casa.",
    ),
    large: item(
      "CESAR (400 g)",
      "Lechuga, queso parmesano rallado, croutones, pollo a la plancha y aderezo cesar de la casa.",
    ),
  },
  {
    signal: "diameter in cm",
    expected: 2.04,
    small: item(
      "CAPRICCIOSA (28 cm)",
      "Jamón serrano, alcachofa, aceituna negra y champiñón.",
    ),
    large: item(
      "CAPRICCIOSA (40 cm)",
      "Jamón serrano, alcachofa, aceituna negra y champiñón.",
    ),
  },
  {
    signal: "piece count",
    expected: 2,
    small: item("Alitas BBQ (6 pz)", "Alitas de pollo bañadas en salsa BBQ."),
    large: item("Alitas BBQ (12 pz)", "Alitas de pollo bañadas en salsa BBQ."),
  },
  {
    signal: "portions for N people",
    expected: 2,
    small: item(
      "CARBONARA (individual)",
      "Salsa blanca a base de crema y queso parmesano, con un toque de tocino y nuez moscada.",
    ),
    large: item(
      "CARBONARA (para compartir, 2 personas)",
      "Salsa blanca a base de crema y queso parmesano, con un toque de tocino y nuez moscada.",
    ),
  },
];

const ARMS: Record<string, (items: Item[]) => Promise<unknown[]>> = {
  // deno-lint-ignore no-explicit-any
  baseline: async (items) => (await callGptEnrich(items as any, apiKey!)).items,
  A: armA,
  "A-cond": armAConditional,
};

const archive: Record<string, unknown> = {};

// GUARD MODE. The 8-dish fixture cannot detect an Arm A regression: every one
// of them prints a weight, so they all take the byte-identical path and the
// changed path is never exercised. The dishes actually at risk are the
// unweighted ones the pipeline already gets RIGHT.
if (Deno.args[0] === "guard") {
  const GUARDS = [
    {
      it: item(
        "Salmón Roll",
        "Por dentro: Queso crema, pepino, aguacate y surimi. Por fuera: Salmón.",
      ),
      plausible: "300-400 g",
    },
    { it: item("Coliflor Roka", ""), plausible: "80-160 g" },
    {
      it: item(
        "CARBONARA",
        "Salsa blanca a base de crema y queso parmesano, con un toque de tocino y nuez moscada.",
      ),
      plausible: "250-400 g",
    },
    {
      it: item(
        "CAPRICCIOSA",
        "Jamón serrano, alcachofa, aceituna negra y champiñón.",
      ),
      plausible: "500-700 g (28 cm, not stated on the item)",
    },
  ];
  for (const { it, plausible } of GUARDS) {
    const cells: string[] = [];
    for (const [armName, run] of Object.entries(ARMS)) {
      const kcals: number[] = [];
      const plates: number[] = [];
      for (let draw = 0; draw < DRAWS; draw++) {
        // deno-lint-ignore no-explicit-any
        const [out] = await run([it]) as any[];
        archive[`guard ${it.name} ${armName} d${draw}`] = out;
        kcals.push(Math.round(out?.estimated_calories ?? 0));
        if (out?._plate_g) plates.push(Math.round(out._plate_g));
      }
      const span = (xs: number[]) =>
        xs.length === 0
          ? ""
          : Math.min(...xs) === Math.max(...xs)
          ? String(xs[0])
          : `${Math.min(...xs)}-${Math.max(...xs)}`;
      cells.push(
        `${armName}=${span(kcals)}kcal` +
          (plates.length > 0 ? `/${span(plates)}g` : ""),
      );
    }
    console.log(`${it.name.padEnd(16)} ${cells.join("  ")}   plausible ${plausible}`);
  }
  await Deno.writeTextFile(
    "scripts/fixtures/caches/probe-plate-arms-guard.raw.json",
    JSON.stringify(archive, null, 2) + "\n",
  );
  Deno.exit(0);
}

for (const [armName, run] of Object.entries(ARMS)) {
  console.log(`\n=== ARM ${armName}`);
  for (const pair of PAIRS) {
    const ratios: number[] = [];
    const plates: string[] = [];
    for (let draw = 0; draw < DRAWS; draw++) {
      // One item per call so variants cannot anchor each other in a batch.
      // deno-lint-ignore no-explicit-any
      const [small] = await run([pair.small]) as any[];
      // deno-lint-ignore no-explicit-any
      const [large] = await run([pair.large]) as any[];
      archive[`${armName} ${pair.signal} d${draw}`] = { small, large };
      ratios.push(
        small?.estimated_calories > 0
          ? large.estimated_calories / small.estimated_calories
          : NaN,
      );
      if (small?._plate_g) plates.push(`${small._plate_g}->${large._plate_g}`);
    }
    const low = Math.min(...ratios);
    const high = Math.max(...ratios);
    const pass = low >= 1 + (pair.expected - 1) * 0.5;
    console.log(
      `  ${pair.signal.padEnd(26)} ${low.toFixed(2)}-${high.toFixed(2)}` +
        ` (expected ${pair.expected}) ${pass ? "RESPONDED" : "flat"}` +
        (plates.length > 0 ? `  plate ${plates[0]} g` : ""),
    );
  }
}

await Deno.writeTextFile(
  "scripts/fixtures/caches/probe-plate-arms.raw.json",
  JSON.stringify(archive, null, 2) + "\n",
);
console.log("\nArchived to scripts/fixtures/caches/probe-plate-arms.raw.json");
