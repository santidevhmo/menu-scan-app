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
  enrichBatch,
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

export async function armA(items: Item[]) {
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

// ---------------------------------------------------------------- ARM P
//
// PROPORTIONS, not size. The 2026-08-13 simulation proved no plate total can fix
// the Capricciosa: at 450 g - the TOP of its verified band - it still returns
// 812 kcal against a 1101-1238 band, because its decomposition is 1.81 kcal/g
// where USDA thin-crust pizza is 2.75. Rescaling preserves proportions, so the
// defect is the assembly: 30 g of cheese on a 28 cm pizza is a standalone
// reference serving of cheese, not the amount on a pie.
//
// B21 asks for the standard reference amount and EXPLICITLY forbids estimating
// what is on the plate. That is right where resolveGrams pins the total from a
// printed weight - it took the weighted score to ~96% - and wrong where nothing
// pins it, because then the same numbers set the total too.
//
// So this arm overrides that instruction for UNWEIGHTED items only. Weighted
// items keep today's request byte-identically and cannot regress.
//
// ⚠️ Not the same as iter-b1..b13, which were falsified for asking a FITTED gram
// figure: those had a printed weight to hit, and the model back-solved the
// arithmetic (every gram a multiple of 5). There is no target here to fit to.
// No food, dish or cuisine name - enrich_test.ts fails the build otherwise.
const ARM_P_SENTENCE =
  ' The items in this request print no weight. For them, give "typical_serving_g" as the amount of that ingredient actually present in one order of this item as it is served, rather than the amount that ingredient is served in on its own: a component that forms the body of an item is present in considerably greater quantity than a standalone serving of it, and using the standalone amount understates the item.';
const ARM_P_PROMPT = ENRICH_PROMPT + ARM_P_SENTENCE;

// ARM PF = ARM P + preparation fat. Every dish Arm P still fails is fat-low:
// pizza 30 g against 58-65, chicken-and-fries 20 against 31-44, and a
// battered deep-fried vegetable at 5 g against 14-19. The prompt already says
// "fat absorbed or added in cooking counts" inside step 2's composition
// instruction; this tests whether the model needs the FAT ITSELF listed as an
// ingredient rather than folded into a composition figure it evidently reports
// at the plain-food value.
// No food, dish or cuisine name - the mechanical guard in enrich_test.ts.
const ARM_PF_SENTENCE = ARM_P_SENTENCE +
  " Where the item's form or preparation means fat is absorbed or added before it reaches the table, list that fat as its own ingredient with the quantity retained in the finished item, because it is part of what is eaten and no other ingredient accounts for it.";
const ARM_PF_PROMPT = ENRICH_PROMPT + ARM_PF_SENTENCE;

// ARM PD = ARM P + dominance. The 2026-08-13 diagnostic showed Arm P fixes the
// TOTAL and leaves the PROPORTIONS wrong: with the pizza's mass inside its band,
// a third of it is near-zero-calorie vegetables because every topping gets a
// ~30-50 g standalone serving regardless of what the dish carries. The roll's
// rice is 38% where the form is nearer 50%, and its carb is what fails.
//
// Arm P's sentence pushes every ingredient UP from its standalone serving. This
// splits that: the structural body goes up, the components scattered over it go
// DOWN. Food-agnostic - it names a role in a dish, never a food.
const ARM_PD_SENTENCE = ARM_P_SENTENCE +
  " Keep the quantities in proportion to one another as the item is actually composed: the component that forms the body of the item accounts for most of its weight, while components distributed over or through that body are present in smaller quantity than they would be served in on their own, however many of them the description lists.";
const ARM_PD_PROMPT = ENRICH_PROMPT + ARM_PD_SENTENCE;

export const armPD = (items: Item[]) => splitArm(items, ARM_PD_PROMPT);

/** Shared by P and PF: weighted items byte-identical, unweighted get `prompt`. */
async function splitArm(items: Item[], prompt: string) {
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
    const raw = await callOpenAI(prompt, ENRICH_SCHEMA_OPENAI, unweighted);
    for (const it of raw.items ?? []) {
      out.push({
        ...it,
        ...sumIngredientMacros(it.ingredients ?? [], it.printed_total_g),
      });
    }
  }
  return out;
}

export const armPF = (items: Item[]) => splitArm(items, ARM_PF_PROMPT);

export async function armP(items: Item[]) {
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
    // The SCHEMA is untouched - this changes what a number means, not its shape.
    const raw = await callOpenAI(ARM_P_PROMPT, ENRICH_SCHEMA_OPENAI, unweighted);
    for (const it of raw.items ?? []) {
      out.push({
        ...it,
        ...sumIngredientMacros(it.ingredients ?? [], it.printed_total_g),
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

export async function armAConditional(items: Item[]) {
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

// SOLO MODE (Santiago, 2026-08-11). Is the instability the MODEL or the BATCH?
// The noise run measured five batched draws; this measures five SOLO draws of
// the same dishes, one item per call, nothing else changed. If solo is steady
// and batched is not, the fix is in how items are grouped - code only, no
// prompt change.
if (Deno.args[0] === "solo") {
  const all: { name: string; description: string }[] = JSON.parse(
    await Deno.readTextFile("scripts/fixtures/unweighted-guard-set.json"),
  );
  // The three worst offenders, one mid, and the rock-steady control.
  const PICK = [
    "OSTRICA",
    "MEXICANA",
    "BRAISED SHORT-RIB GF",
    "Nevada",
    "ENSALADA GRIEGA",
  ];
  // Batched spreads from the noise run, so the two are directly comparable.
  const BATCHED: Record<string, string> = {
    "OSTRICA": "525,205,243,242,242 (88%)",
    "MEXICANA": "499,335,339,362,639 (62%)",
    "BRAISED SHORT-RIB GF": "500,379,501,501,653 (53%)",
    "Nevada": "347,514,346,503,346 (39%)",
    "ENSALADA GRIEGA": "195,196,196,196,196 (1%)",
  };
  const DRAWS_SOLO = 5;
  console.log(`${"dish".padEnd(24)} ${"SOLO kcal".padEnd(32)} solo   batched`);
  for (const name of PICK) {
    const d = all.find((x) => x.name === name);
    if (!d) continue;
    const xs: number[] = [];
    for (let draw = 0; draw < DRAWS_SOLO; draw++) {
      // deno-lint-ignore no-explicit-any
      const [out] = await ARMS.baseline([item(d.name, d.description)]) as any[];
      archive[`solo ${name} d${draw}`] = out;
      xs.push(Math.round(out?.estimated_calories ?? 0));
    }
    const low = Math.min(...xs), high = Math.max(...xs);
    const spread = (high - low) / ((high + low) / 2);
    console.log(
      `${name.slice(0, 22).padEnd(24)} ${xs.join(",").padEnd(32)} ` +
        `${(spread * 100).toFixed(0).padStart(4)}%   ${BATCHED[name]}`,
    );
  }
  await Deno.writeTextFile(
    "scripts/fixtures/caches/probe-solo-vs-batch.raw.json",
    JSON.stringify(archive, null, 2) + "\n",
  );
  Deno.exit(0);
}

// NOISE MODE (Santiago, 2026-08-11). The SAME dishes through the SAME
// unchanged pipeline, five times. Nothing varies but the model's own sampling.
// Until this number exists, no arm can be judged: a 30% "improvement" means
// nothing if identical input already swings 40%.
if (Deno.args[0] === "noise") {
  const set: { name: string; description: string }[] = JSON.parse(
    await Deno.readTextFile("scripts/fixtures/unweighted-guard-set.json"),
  );
  const items = set.map((d) => item(d.name, d.description));
  const DRAWS_NOISE = 5;
  const byName = new Map<string, number[]>();

  for (let draw = 0; draw < DRAWS_NOISE; draw++) {
    // deno-lint-ignore no-explicit-any
    const out = await ARMS.baseline(items) as any[];
    archive[`noise d${draw}`] = out;
    for (const it of out) {
      if (!byName.has(it.name)) byName.set(it.name, []);
      byName.get(it.name)!.push(Math.round(it.estimated_calories ?? 0));
    }
  }

  const spreads: number[] = [];
  console.log(
    `${"dish".padEnd(30)} ${"kcal across 5 identical runs".padEnd(30)} spread`,
  );
  for (const d of set) {
    const xs = byName.get(d.name) ?? [];
    if (xs.length === 0) {
      console.log(`${d.name.slice(0, 28).padEnd(30)} MISSING`);
      continue;
    }
    const low = Math.min(...xs);
    const high = Math.max(...xs);
    // Spread as a fraction of the midpoint: directly comparable with the
    // "% change" an arm is credited with.
    const spread = (high - low) / ((high + low) / 2);
    spreads.push(spread);
    console.log(
      `${d.name.slice(0, 28).padEnd(30)} ${xs.join(", ").padEnd(30)} ${(spread * 100).toFixed(0)}%`,
    );
  }
  spreads.sort((a, b) => a - b);
  const median = spreads[Math.floor(spreads.length / 2)];
  console.log(
    `\nNOISE FLOOR: median ${(median * 100).toFixed(0)}%, ` +
      `worst ${(spreads[spreads.length - 1] * 100).toFixed(0)}%, ` +
      `best ${(spreads[0] * 100).toFixed(0)}% across ${spreads.length} dishes.`,
  );
  console.log(
    "An arm must move a dish by MORE than this to have moved it at all.",
  );
  await Deno.writeTextFile(
    "scripts/fixtures/caches/probe-noise-floor.raw.json",
    JSON.stringify(archive, null, 2) + "\n",
  );
  Deno.exit(0);
}

// CURVE MODE (Santiago, 2026-08-12). THE BATCH-SIZE CURVE. Solo is stable and
// batched is not; this finds the knee. Where does stability arrive - at 10, at
// 5, at 3, or only at 1? And because ENRICH_BATCH_SIZE was tuned DOWN to 10 to
// stop GPT-4o early-stopping, it must record BOTH numbers: a batch size that
// fixes stability by reintroducing dropped items is not a fix.
//
// Calls enrichBatch DIRECTLY, one call per group, deliberately WITHOUT
// enrichBatchWithRetry: production re-asks whenever the model returns fewer
// items than it was sent, which both hides the drop and substitutes a second
// draw's numbers into the first draw's result. This measures the raw call.
//
// Group size is recorded as the size the dish ACTUALLY sat in, and the median
// counts only dishes that sat in a FULL group of the nominal size - fifteen
// dishes at a nominal 10 is one group of 10 plus a remainder of 5, and calling
// that "15 per call" is exactly how the earlier figures got mislabelled.
if (Deno.args[0] === "curve") {
  const set: { name: string; description: string }[] = JSON.parse(
    await Deno.readTextFile("scripts/fixtures/unweighted-guard-set.json"),
  );
  const items = set.map((d) => item(d.name, d.description));
  const DRAWS_CURVE = 5;
  const NOMINAL = [1, 3, 5, 10];

  // nominal -> dish -> kcal per draw, plus the group size the dish sat in.
  const kcal = new Map<number, Map<string, number[]>>();
  const grpOf = new Map<number, Map<string, number>>();
  const drops: Record<
    number,
    { calls: number; short: number; missing: number; failed: number }
  > = {};
  // A 429 would otherwise blank a whole column: b1 fires 15 calls per draw and
  // a thrown call is a lost data point, not a retried one.
  const CONCURRENCY = 5;

  for (const nominal of NOMINAL) {
    kcal.set(nominal, new Map());
    grpOf.set(nominal, new Map());
    drops[nominal] = { calls: 0, short: 0, missing: 0, failed: 0 };

    for (let draw = 0; draw < DRAWS_CURVE; draw++) {
      const groups: Item[][] = [];
      for (let i = 0; i < items.length; i += nominal) {
        groups.push(items.slice(i, i + nominal));
      }
      // Parallel within a draw, the way production fires its batches, but capped
      // so a rate limit does not eat data points. Each call is independent, so
      // this changes wall-clock only.
      // deno-lint-ignore no-explicit-any
      const outs: { out: any[]; failed: boolean }[] = [];
      for (let w = 0; w < groups.length; w += CONCURRENCY) {
        outs.push(
          ...await Promise.all(groups.slice(w, w + CONCURRENCY).map(async (group) => {
            try {
              // deno-lint-ignore no-explicit-any
              return { out: await enrichBatch(group as any, apiKey!) as any[], failed: false };
            } catch (err) {
              console.error(
                `[curve] b${nominal} d${draw} call FAILED (not a drop):`,
                err instanceof Error ? err.message : err,
              );
              return { out: [], failed: true };
            }
          })),
        );
      }

      outs.forEach(({ out, failed }, g) => {
        const group = groups[g];
        drops[nominal].calls++;
        // A thrown call is an API error, NOT the model stopping early. Counting
        // the two together would credit early-stopping with every 429.
        if (failed) drops[nominal].failed++;
        else if (out.length < group.length) {
          drops[nominal].short++;
          drops[nominal].missing += group.length - out.length;
        }
        archive[`curve b${nominal} d${draw} g${g}`] = out;
        for (const it of out) {
          const byName = kcal.get(nominal)!;
          if (!byName.has(it.name)) byName.set(it.name, []);
          byName.get(it.name)!.push(Math.round(it.estimated_calories ?? 0));
        }
        for (const src of group) grpOf.get(nominal)!.set(src.name, group.length);
      });
    }
  }

  const spreadOf = (xs: number[]) => {
    if (xs.length === 0) return null;
    const low = Math.min(...xs), high = Math.max(...xs);
    return (high - low) / ((high + low) / 2);
  };

  console.log(
    `\nBATCH-SIZE CURVE - ${set.length} dishes, ${DRAWS_CURVE} draws each, kcal spread\n`,
  );
  console.log(
    `${"dish".padEnd(30)}${NOMINAL.map((n) => `b${n}`.padStart(9)).join("")}`,
  );
  const perNominal: Record<number, number[]> = {};
  for (const n of NOMINAL) perNominal[n] = [];
  for (const d of set) {
    const cells = NOMINAL.map((n) => {
      const s = spreadOf(kcal.get(n)!.get(d.name) ?? []);
      if (s === null) return "MISSING".padStart(9);
      const full = grpOf.get(n)!.get(d.name) === n;
      // Only a dish that sat in a full group of n describes batch size n.
      if (full) perNominal[n].push(s);
      return `${(s * 100).toFixed(0)}%${full ? "" : "*"}`.padStart(9);
    });
    console.log(`${d.name.slice(0, 28).padEnd(30)}${cells.join("")}`);
  }

  const median = (xs: number[]) => {
    if (xs.length === 0) return null;
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
  };
  const row = (label: string, pick: (xs: number[]) => number | null) =>
    console.log(
      `${label.padEnd(30)}${
        NOMINAL.map((n) => {
          const v = pick(perNominal[n]);
          return (v === null ? "-" : `${(v * 100).toFixed(0)}%`).padStart(9);
        }).join("")
      }`,
    );
  console.log("");
  row("MEDIAN spread (full groups)", median);
  row("WORST spread (full groups)", (xs) => xs.length ? Math.max(...xs) : null);
  console.log(
    `\n* dish did not sit in a full group of that size (remainder) - excluded from the median.`,
  );

  console.log(`\nITEM DROPS - the reason ENRICH_BATCH_SIZE is 10, not larger:`);
  for (const n of NOMINAL) {
    const d = drops[n];
    console.log(
      `  b${String(n).padEnd(3)} ${d.short}/${d.calls} calls returned short, ` +
        `${d.missing} item(s) missing in total` +
        (d.failed ? `  (+${d.failed} API failures, not drops)` : ""),
    );
  }
  console.log(
    `\nToday's production setting is ENRICH_BATCH_SIZE = 10. ` +
      `A smaller batch multiplies prompt tokens: enrichment is ~$0.03/scan at 10, ~$0.30 at 1.`,
  );

  await Deno.writeTextFile(
    "scripts/fixtures/caches/probe-batch-curve.raw.json",
    JSON.stringify(archive, null, 2) + "\n",
  );
  Deno.exit(0);
}

// WIDE MODE (Santiago, 2026-08-11): fifteen real unweighted dishes with real
// descriptions, spanning 60 g to 510 g across four menus, run BATCHED the way
// production runs them. Four dishes and single-item calls decided A-conditional;
// this is the check on both of those limits at once.
if (Deno.args[0] === "wide") {
  const set: { name: string; description: string; menu: string; baseline_g: number }[] =
    JSON.parse(await Deno.readTextFile("scripts/fixtures/unweighted-guard-set.json"));
  const items = set.map((d) => item(d.name, d.description));

  const runs: Record<string, Map<string, number[]>> = {};
  for (const armName of ["baseline", "A-cond"]) {
    const byName = new Map<string, number[]>();
    for (let draw = 0; draw < DRAWS; draw++) {
      // deno-lint-ignore no-explicit-any
      const out = await ARMS[armName](items) as any[];
      archive[`wide ${armName} d${draw}`] = out;
      for (const it of out) {
        if (!byName.has(it.name)) byName.set(it.name, []);
        byName.get(it.name)!.push(Math.round(it.estimated_calories ?? 0));
      }
    }
    runs[armName] = byName;
  }

  console.log(
    `${"dish".padEnd(30)} ${"baseline kcal".padEnd(16)} ${"A-cond kcal".padEnd(16)} change  anchored`,
  );
  let moved = 0;
  for (const d of set) {
    const b = runs.baseline.get(d.name) ?? [];
    const a = runs["A-cond"].get(d.name) ?? [];
    if (b.length === 0 || a.length === 0) {
      console.log(`${d.name.slice(0, 28).padEnd(30)} MISSING from a run`);
      continue;
    }
    const mid = (xs: number[]) => (Math.min(...xs) + Math.max(...xs)) / 2;
    const change = (mid(a) - mid(b)) / mid(b);
    if (Math.abs(change) > 0.25) moved++;
    const span = (xs: number[]) =>
      Math.min(...xs) === Math.max(...xs)
        ? String(xs[0])
        : `${Math.min(...xs)}-${Math.max(...xs)}`;
    console.log(
      `${d.name.slice(0, 28).padEnd(30)} ${span(b).padEnd(16)} ${span(a).padEnd(16)} ` +
        `${change >= 0 ? "+" : ""}${(change * 100).toFixed(0)}%   ` +
        `${statesSize(d.name, d.description) ? "YES" : "no"}`,
    );
  }
  console.log(`\n${moved} of ${set.length} dishes moved more than 25%.`);
  await Deno.writeTextFile(
    "scripts/fixtures/caches/probe-plate-arms-wide.raw.json",
    JSON.stringify(archive, null, 2) + "\n",
  );
  Deno.exit(0);
}

// GUARD MODE. The 8-dish fixture cannot detect an Arm A regression: every one
// of them prints a weight, so they all take the byte-identical path and the
// changed path is never exercised. The dishes actually at risk are the
// unweighted ones the pipeline already gets RIGHT.
// SAUCE MODE (Santiago, 2026-08-16). Does asking the model to DECOMPOSE a
// prepared mixture move its fat toward the published value?
//
// The 2026-08-16 $0 audit of 10 real menus found the pattern this tests:
//
//   single food   (olive oil, butter, mayonnaise)  model / USDA = 1.00x  n=16
//   MIXTURE       (pesto, caesar, ranch, garlic)   model / USDA = 0.69x  n=21
//   house-named   (chimichurri, chemita, aderezo)  flat 15-20 g fat, protein 1
//
// So the model is not weak on sauces - it is weak on MIXTURES, because a
// mixture's per-100 g figure is a calculation over its parts, and this pipeline
// has measured four times that the model supplies knowledge well and arithmetic
// badly (B10, B12, B4, B21). The parts themselves it gets exactly right.
//
// Each sauce is sent as its OWN item, one per call. That is the only way the
// number is comparable to a published record: inside a dish the sauce's mass
// share is a second unknown, and batch-mates move the answer (2026-08-12 curve).
// ⚠️ SYNTHETIC ITEMS. This measures the model's treatment of a named mixture,
// NOT menu behaviour - do not quote it as a menu-level rate (2026-08-09 lesson).
//
//   deno run --allow-net --allow-env --allow-read --allow-write \
//     --env-file=.env.local scripts/probe-plate-arms.ts sauce
if (Deno.args[0] === "sauce") {
  // Structural, never a food: enrich_test.ts bans food names in the nutrition
  // step, and the standing rule is broader than the test. This names a KIND of
  // component ("a prepared mixture rather than a single food"), which is the
  // same move as B15's name_implied_components and Arm PD's "body of the item".
  const ARM_S_SENTENCE =
    " Where an ingredient is itself a prepared mixture rather than a single food," +
    " do not give figures for the mixture as a whole. List instead the single" +
    " foods it is made from, each as its own ingredient with its own weight and" +
    " its own composition, because a mixture's composition is an average over" +
    " parts that differ enormously and stating it directly understates whichever" +
    " part is most concentrated.";
  const ARM_S_PROMPT = ENRICH_PROMPT + ARM_S_SENTENCE;

  // Published FNDDS fat per 100 g. null = house-named, NO record exists, so it
  // is observed and never scored - inventing a target for it is what put a
  // frozen-pizza band in the oracle for four days.
  const SAUCES: { name: string; usda: number | null }[] = [
    { name: "Garlic sauce", usda: 74.0 },
    { name: "Pesto", usda: 59.2 },
    { name: "Caesar dressing", usda: 57.9 },
    { name: "Ranch dressing", usda: 44.5 },
    { name: "Alfredo sauce", usda: 15.0 },
    // CONTROLS. A sentence that simply inflates every fat would raise these too,
    // and they have almost none. Without them a uniform push reads as a win.
    { name: "Barbecue sauce", usda: 0.63 },
    { name: "Soy sauce", usda: 0.57 },
    // OBSERVED ONLY - the dishes that started this.
    { name: "Chimichurri", usda: null },
    { name: "Salsa chemita", usda: null },
    { name: "Aderezo de la casa", usda: null },
  ];
  const DRAWS_S = 3;

  /** Fat per 100 g of the whole item, from the model's OWN parts. */
  // deno-lint-ignore no-explicit-any
  function fatPer100g(out: any): number | null {
    const ings = out?.ingredients ?? [];
    const grams = resolveGrams(ings, out?.printed_total_g ?? null);
    const total = grams.reduce((a: number, b: number) => a + b, 0);
    if (!(total > 0)) return null;
    const fat = ings.reduce(
      (s: number, i: { fat_per_100g?: number }, n: number) =>
        s + (i.fat_per_100g ?? 0) * grams[n] / 100,
      0,
    );
    return 100 * fat / total;
  }

  const runS = async (items: Item[]) => {
    const raw = await callOpenAI(ARM_S_PROMPT, ENRICH_SCHEMA_OPENAI, items);
    return (raw.items ?? []).map((it: Record<string, unknown>) => ({
      ...it,
      ...sumIngredientMacros(
        // deno-lint-ignore no-explicit-any
        (it.ingredients ?? []) as any,
        it.printed_total_g as number | null,
      ),
    }));
  };

  console.log(
    `${"sauce".padEnd(20)} ${"USDA".padStart(6)} ${"baseline".padStart(14)}` +
      ` ${"decomposed".padStart(14)}   parts the arm named`,
  );
  for (const s of SAUCES) {
    const got: Record<string, number[]> = { baseline: [], S: [] };
    let parts = "";
    for (const arm of ["baseline", "S"] as const) {
      for (let draw = 0; draw < DRAWS_S; draw++) {
        const it = item(s.name, "");
        // deno-lint-ignore no-explicit-any
        const [out] = arm === "S"
          ? await runS([it]) as any[]
          : await ARMS.baseline([it]) as any[];
        archive[`sauce ${arm} ${s.name} d${draw}`] = out;
        const f = fatPer100g(out);
        if (f != null) got[arm].push(f);
        if (arm === "S" && draw === 0) {
          parts = (out?.ingredients ?? [])
            // deno-lint-ignore no-explicit-any
            .map((i: any) => `${i.name} ${i.typical_serving_g}g`)
            .join(", ")
            .slice(0, 60);
        }
      }
    }
    const span = (xs: number[]) =>
      xs.length === 0
        ? "  no data"
        : `${Math.min(...xs).toFixed(0)}-${Math.max(...xs).toFixed(0)}`;
    const mid = (xs: number[]) =>
      xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN;
    const ratio = (xs: number[]) =>
      s.usda ? ` (${(mid(xs) / s.usda).toFixed(2)}x)` : "";
    console.log(
      `${s.name.padEnd(20)} ${(s.usda ?? "-").toString().padStart(6)}` +
        ` ${(span(got.baseline) + ratio(got.baseline)).padStart(14)}` +
        ` ${(span(got.S) + ratio(got.S)).padStart(14)}   ${parts}`,
    );
  }

  await Deno.writeTextFile(
    "scripts/fixtures/caches/probe-sauce-decomposition.raw.json",
    JSON.stringify(archive, null, 2) + "\n",
  );
  console.log(
    "\nArchived to scripts/fixtures/caches/probe-sauce-decomposition.raw.json" +
      "\n⚠️  Synthetic single-sauce items - not a menu-level rate.",
  );
  Deno.exit(0);
}

// IN-DISH SAUCE MODE (2026-08-16). The probe the `sauce` mode could not do.
//
// `sauce` sent each sauce as its OWN item and chimichurri did not move (37-42
// both arms) - because a sauce sent alone is ALREADY decomposed. Inside a real
// menu the same sauce comes back at 15 g fat/100 g. So the failure belongs to
// being ONE INGREDIENT INSIDE A DISH, and that is what this measures.
//
// Three columns, and the first is free:
//   BATCHED  the archived b10 run - what production actually produced
//   SOLO     the same dish alone, today's prompt - separates the BATCH effect
//            from the INGREDIENT effect, since 2026-08-12 proved batch-mates move
//            answers and a solo-only comparison would confound the two
//   ARM S    the same dish alone, decomposition sentence added
//
// Dishes and descriptions are read from the archives, never retyped - a probe
// that invents its own menu text measures the text (2026-08-09 lesson).
//
//   deno run --allow-net --allow-env --allow-read --allow-write \
//     --env-file=.env.local scripts/probe-plate-arms.ts sauce-dish
if (Deno.args[0] === "sauce-dish") {
  const ARM_S_SENTENCE =
    " Where an ingredient is itself a prepared mixture rather than a single food," +
    " do not give figures for the mixture as a whole. List instead the single" +
    " foods it is made from, each as its own ingredient with its own weight and" +
    " its own composition, because a mixture's composition is an average over" +
    " parts that differ enormously and stating it directly understates whichever" +
    " part is most concentrated.";
  const ARM_S_PROMPT = ENRICH_PROMPT + ARM_S_SENTENCE;

  // usda = published fat/100 g of the sauce, for reference only: the metric here
  // is the DISH's fat, because that is what reaches the user and the benchmark.
  // control = no mixture in its ingredient list at all. If the arm inflates a
  // control, it is pushing fat rather than decomposing anything, and the whole
  // idea fails - the `sauce` mode's barbecue and soy controls held, and these
  // are the same guard one level up.
  const DISHES: {
    menu: string;
    name: string;
    sauce: string;
    usda: number | null;
    control?: boolean;
  }[] = [
    { menu: "andaluz", name: "CESAR (200 g)", sauce: "caesar dressing", usda: 57.9 },
    { menu: "casa-nostra", name: "Cesar", sauce: "Caesar dressing", usda: 57.9 },
    { menu: "brasero", name: "PASTA AL PESTO", sauce: "Pesto", usda: 59.2 },
    { menu: "polloteria", name: "Dedos De Queso (200gr)", sauce: "Ranch", usda: 44.5 },
    { menu: "casa-nostra", name: "Salmone padella", sauce: "garlic sauce", usda: 74.0 },
    { menu: "brasero", name: "PESCADO AL AJILLO", sauce: "garlic sauce", usda: 74.0 },
    // House-named: no published record, observed only.
    { menu: "brasero", name: "NEW YORK", sauce: "chimichurri", usda: null },
    { menu: "brasero", name: "FILETE DISCORDIA", sauce: "salsa chemita", usda: null },
    // CONTROLS - single foods throughout.
    {
      menu: "andaluz",
      name: "PULPO A LA GALLEGA (200 g)",
      sauce: "-",
      usda: null,
      control: true,
    },
    {
      menu: "andaluz",
      name: "CAMARONES EMPANIZADOS (200 g)",
      sauce: "-",
      usda: null,
      control: true,
    },
  ];
  const DRAWS_D = 3;

  const menus = new Map<string, Record<string, unknown>[]>();
  for (const m of new Set(DISHES.map((d) => d.menu))) {
    const raw = JSON.parse(
      await Deno.readTextFile(`scripts/fixtures/caches/pipeline.b10.${m}.raw.json`),
    );
    menus.set(m, raw.items ?? []);
  }

  const runS = async (items: Item[]) => {
    const raw = await callOpenAI(ARM_S_PROMPT, ENRICH_SCHEMA_OPENAI, items);
    return (raw.items ?? []).map((it: Record<string, unknown>) => ({
      ...it,
      ...sumIngredientMacros(
        // deno-lint-ignore no-explicit-any
        (it.ingredients ?? []) as any,
        it.printed_total_g as number | null,
      ),
    }));
  };

  console.log(
    `${"dish".padEnd(28)} ${"sauce".padEnd(16)} ${"batched".padStart(8)}` +
      ` ${"SOLO base".padStart(11)} ${"ARM S".padStart(11)}   fat g`,
  );
  for (const d of DISHES) {
    // deno-lint-ignore no-explicit-any
    const src = (menus.get(d.menu) ?? []).find((x: any) => x.name === d.name) as any;
    if (!src) {
      console.log(`${d.name.padEnd(28)} NOT FOUND in pipeline.b10.${d.menu}`);
      continue;
    }
    const it = item(src.name, src.description ?? "");
    const fats: Record<string, number[]> = { base: [], S: [] };
    let parts = "";
    for (const arm of ["base", "S"] as const) {
      for (let draw = 0; draw < DRAWS_D; draw++) {
        // deno-lint-ignore no-explicit-any
        const [out] = arm === "S"
          ? await runS([it]) as any[]
          : await ARMS.baseline([it]) as any[];
        archive[`sauce-dish ${arm} ${d.name} d${draw}`] = out;
        if (typeof out?.fat_g === "number") fats[arm].push(out.fat_g);
        if (arm === "S" && draw === 0) {
          parts = (out?.ingredients ?? [])
            // deno-lint-ignore no-explicit-any
            .map((i: any) => `${i.name} ${i.typical_serving_g}g/${i.fat_per_100g}f`)
            .join(" ")
            .slice(0, 72);
        }
      }
    }
    const span = (xs: number[]) =>
      xs.length === 0 ? "-" : `${Math.min(...xs)}-${Math.max(...xs)}`;
    console.log(
      `${d.name.slice(0, 26).padEnd(28)} ${d.sauce.slice(0, 14).padEnd(16)}` +
        ` ${String(src.fat_g ?? "-").padStart(8)} ${span(fats.base).padStart(11)}` +
        ` ${span(fats.S).padStart(11)}   ${d.control ? "[CONTROL] " : ""}${parts}`,
    );
  }

  await Deno.writeTextFile(
    "scripts/fixtures/caches/probe-sauce-in-dish.raw.json",
    JSON.stringify(archive, null, 2) + "\n",
  );
  console.log(
    "\nArchived to scripts/fixtures/caches/probe-sauce-in-dish.raw.json" +
      "\n⚠️  SOLO calls - not a production estimate. Batched column is the archive.",
  );
  Deno.exit(0);
}

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

// import.meta.main so bench-unweighted.ts can import armA rather than keeping a
// copy of it - lesson 23. Without this guard, importing this file would fire the
// paid size-sensitivity probe below at module scope.
if (!import.meta.main) {
  // Nothing else in this file executes on import; the mode blocks above all
  // require an exact Deno.args[0] match.
} else {
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
}
