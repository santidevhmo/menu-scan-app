// Does the model's mass estimate RESPOND to a stated size?
//
// This needs no oracle. It asks the same dish at two sizes and checks whether
// the answer moves by the ratio the sizes imply. A model that returns the same
// grams for a 28 cm and a 40 cm pizza is not estimating size, it is returning a
// habit - and that is a defect provable without knowing what a pizza weighs.
//
// Design notes, both deliberate:
//   ONE ITEM PER CALL. Variants in the same batch can anchor each other, which
//   would measure the batch rather than the model.
//   A POSITIVE CONTROL in printed grams. Printed weight is honoured on 63/63
//   items, so if the control does not respond the PROBE is broken, not the model.
//
//   deno run --allow-net --allow-env --allow-write --env-file=.env.local \
//     scripts/probe-size-sensitivity.ts
import { callGptEnrich } from "../supabase/functions/analyze-menu/enrich.ts";

const apiKey = Deno.env.get("OPENAI_API_KEY");
if (!apiKey) throw new Error("OPENAI_API_KEY is required in .env.local");

interface Variant {
  label: string;
  name: string;
  description: string;
}

interface Pair {
  signal: string;
  /** What the sizes imply the mass ratio should be. */
  expected: number;
  small: Variant;
  large: Variant;
}

const PAIRS: Pair[] = [
  {
    // CONTROL. Printed grams already work; this proves the probe measures.
    signal: "printed grams (CONTROL)",
    expected: 2,
    small: {
      label: "CESAR 200 g",
      name: "CESAR (200 g)",
      description:
        "Lechuga, queso parmesano rallado, croutones, pollo a la plancha y aderezo cesar de la casa.",
    },
    large: {
      label: "CESAR 400 g",
      name: "CESAR (400 g)",
      description:
        "Lechuga, queso parmesano rallado, croutones, pollo a la plancha y aderezo cesar de la casa.",
    },
  },
  {
    // The Bistro case. 40/28 squared = 2.04 by area.
    signal: "diameter in cm",
    expected: 2.04,
    small: {
      label: "CAPRICCIOSA 28 cm",
      name: "CAPRICCIOSA (28 cm)",
      description: "Jamón serrano, alcachofa, aceituna negra y champiñón.",
    },
    large: {
      label: "CAPRICCIOSA 40 cm",
      name: "CAPRICCIOSA (40 cm)",
      description: "Jamón serrano, alcachofa, aceituna negra y champiñón.",
    },
  },
  {
    signal: "portions for N people",
    expected: 2,
    small: {
      label: "CARBONARA individual",
      name: "CARBONARA (individual)",
      description:
        "Salsa blanca a base de crema y queso parmesano, con un toque de tocino y nuez moscada.",
    },
    large: {
      label: "CARBONARA para 2",
      name: "CARBONARA (para compartir, 2 personas)",
      description:
        "Salsa blanca a base de crema y queso parmesano, con un toque de tocino y nuez moscada.",
    },
  },
  {
    signal: "piece count",
    expected: 2,
    small: {
      label: "Alitas 6 pz",
      name: "Alitas BBQ (6 pz)",
      description: "Alitas de pollo bañadas en salsa BBQ.",
    },
    large: {
      label: "Alitas 12 pz",
      name: "Alitas BBQ (12 pz)",
      description: "Alitas de pollo bañadas en salsa BBQ.",
    },
  },
  {
    // A size WORD rather than a number - the commonest real signal.
    signal: "size word (chica/grande)",
    expected: 1.5,
    small: {
      label: "ENSALADA chica",
      name: "ENSALADA GRIEGA (chica)",
      description:
        "Lechuga, pepino, tomate, cebolla morada, aceituna negra, queso feta y vinagreta balsámico.",
    },
    large: {
      label: "ENSALADA grande",
      name: "ENSALADA GRIEGA (grande)",
      description:
        "Lechuga, pepino, tomate, cebolla morada, aceituna negra, queso feta y vinagreta balsámico.",
    },
  },
];

// deno-lint-ignore no-explicit-any
function massOf(item: any): number {
  return (item.ingredients ?? []).reduce(
    // deno-lint-ignore no-explicit-any
    (sum: number, i: any) => sum + (i.typical_serving_g ?? 0),
    0,
  );
}

async function measure(variant: Variant) {
  const { items, raw_response } = await callGptEnrich([{
    name: variant.name,
    description: variant.description,
    price: 200,
    category: "food",
    section_title: null,
    options: [],
    grams: null,
    // deno-lint-ignore no-explicit-any
  } as any], apiKey!);
  const item = items[0];
  return {
    mass: massOf(item),
    calories: item?.estimated_calories ?? 0,
    printed: item?.printed_total_g ?? null,
    raw: raw_response,
  };
}

// CALORIES is the metric, not the ingredient sum. The 200g/400g control moved
// the ingredient sum only 1.10x but calories 2.17x, because resolveGrams fits
// the model's servings to the printed weight IN CODE. The ingredient list is
// upstream of the thing that responds. Found by the control, 2026-08-11.
const DRAWS = 3;
const archive: Record<string, unknown> = {};

for (const pair of PAIRS) {
  const ratios: number[] = [];
  for (let draw = 0; draw < DRAWS; draw++) {
    const small = await measure(pair.small);
    const large = await measure(pair.large);
    archive[`${pair.small.label} d${draw}`] = small;
    archive[`${pair.large.label} d${draw}`] = large;
    ratios.push(small.calories > 0 ? large.calories / small.calories : NaN);
  }
  const low = Math.min(...ratios);
  const high = Math.max(...ratios);
  // "Responded" means it moved at least a quarter of the way to the expected
  // ratio on EVERY draw. A model that moves 2% has not responded, it jittered.
  const responded = ratios.every((r) => r >= 1 + (pair.expected - 1) * 0.25);
  console.log(
    `${pair.signal.padEnd(26)} calorie ratio ${low.toFixed(2)}-${high.toFixed(2)}` +
      ` across ${DRAWS} draws (expected ${pair.expected})  ` +
      `${responded ? "RESPONDED" : "FLAT"}`,
  );
}

await Deno.writeTextFile(
  "scripts/fixtures/caches/probe-size-sensitivity.raw.json",
  JSON.stringify(archive, null, 2) + "\n",
);

console.log(`\n${"=".repeat(78)}`);
console.log("If the CONTROL is FLAT, the probe is broken - not the model.");
console.log("Archived to scripts/fixtures/caches/probe-size-sensitivity.raw.json");
