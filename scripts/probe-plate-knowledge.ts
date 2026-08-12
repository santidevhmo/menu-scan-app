// Does the model KNOW what a plate weighs, when asked plainly?
//
// The size-sensitivity probe (2026-08-11) showed the pipeline's mass is a
// BY-PRODUCT of summing per-ingredient typical servings - nothing in the chain
// ever considers the plate as a whole, which is why no stated size moves it.
// That leaves one question before building a plate-total fix: is the knowledge
// there at all, or is the model's "typical pizza" the same ~231 g habit?
//
//   answers ~550 g for a 28 cm pizza -> knowledge exists, the pipeline is not
//                                       asking for it. Arm A is worth building.
//   answers ~250 g                   -> knowledge absent. No routing fixes that,
//                                       and the grams must come from code or a
//                                       human.
//
// Deliberately OUTSIDE the enrichment prompt: a plain question, same model,
// same sampling, so the comparison is knowledge vs pipeline and not prompt vs
// prompt.
//
//   deno run --allow-net --allow-env --allow-write --env-file=.env.local \
//     scripts/probe-plate-knowledge.ts
const apiKey = Deno.env.get("OPENAI_API_KEY");
if (!apiKey) throw new Error("OPENAI_API_KEY is required in .env.local");

const MODEL = "gpt-4o-2024-08-06"; // ENRICH_MODEL, so this is the same brain
const DRAWS = 3;

interface Dish {
  label: string;
  ask: string;
  /** What the deployed pipeline produced for this dish. */
  pipeline: number;
  /** Best current view of the truth, and where it came from. */
  truth: string;
}

const DISHES: Dish[] = [
  {
    label: "CAPRICCIOSA 28 cm",
    ask:
      "a 28 cm pizza with serrano ham, artichoke, black olive and mushroom on a tomato and mozzarella base",
    pipeline: 250,
    truth: "~500-700 g (USDA whole-pie weights scaled by area)",
  },
  {
    label: "Alitas 12 pz",
    ask: "an order of 12 chicken wings with BBQ sauce",
    pipeline: 130,
    truth: "~400-500 g (12 wings)",
  },
  {
    label: "Salmon Roll",
    ask:
      "a sushi roll plate of 10 to 12 pieces with cream cheese, cucumber, avocado and surimi inside, topped with salmon",
    pipeline: 397,
    truth: "300-400 g (USDA 30 g per piece x 10-12)",
  },
  {
    label: "CARBONARA",
    ask:
      "a restaurant plate of spaghetti carbonara with cream, parmesan and bacon",
    pipeline: 315,
    truth: "~250-400 g",
  },
  {
    label: "Coliflor Roka",
    ask: "a side dish of roasted cauliflower",
    pipeline: 85,
    truth: "80-160 g (USDA cooked cauliflower portions)",
  },
  {
    // CONTROL: the size is STATED in the question. If the model cannot repeat a
    // number it was just given, the probe is measuring nothing.
    label: "CESAR (200 g) — CONTROL",
    ask:
      "a 200 g caesar salad with lettuce, parmesan, croutons, grilled chicken and dressing",
    pipeline: 200,
    truth: "200 g, stated in the question",
  },
];

async function askGrams(dish: Dish): Promise<number> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0,
      seed: 17,
      messages: [
        {
          role: "user",
          content:
            `How many grams does ${dish.ask} weigh, as served in a restaurant? ` +
            `Answer with the total edible weight of the whole dish.`,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "plate_weight",
          strict: true,
          schema: {
            type: "object",
            properties: {
              total_grams: { type: "number" },
              reasoning: { type: "string" },
            },
            required: ["total_grams", "reasoning"],
            additionalProperties: false,
          },
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return JSON.parse(json.choices[0].message.content).total_grams;
}

const archive: Record<string, number[]> = {};

console.log(
  `${"dish".padEnd(26)} ${"asked directly".padEnd(18)} pipeline   truth`,
);
for (const dish of DISHES) {
  const answers: number[] = [];
  for (let draw = 0; draw < DRAWS; draw++) answers.push(await askGrams(dish));
  archive[dish.label] = answers;

  const low = Math.min(...answers);
  const high = Math.max(...answers);
  const span = low === high ? `${low} g` : `${low}-${high} g`;
  const factor = (low + high) / 2 / dish.pipeline;
  console.log(
    `${dish.label.padEnd(26)} ${span.padEnd(18)} ${String(dish.pipeline).padStart(5)} g` +
      `  (${factor.toFixed(2)}x)   ${dish.truth}`,
  );
}

await Deno.writeTextFile(
  "scripts/fixtures/caches/probe-plate-knowledge.raw.json",
  JSON.stringify(archive, null, 2) + "\n",
);
console.log(
  "\nA factor near 1.0 means the pipeline already matches the model's own belief.\n" +
    "A factor well above 1.0 means the knowledge exists and the pipeline never asks for it.",
);
