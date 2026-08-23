// PAID PROBE, eval 175: can the model pick the dish FORM, and does it need our
// gram table at all? Two arms, deliberately separated because they fail
// differently.
//
//   label  (approach 1) - the model returns ONLY a form label from a fixed enum,
//                         and WE supply the grams from FORM_G. Measures the
//                         CLASSIFIER against the hand labels in dish-forms.ts.
//   grams  (approach 2) - the model returns the form AND that form's typical
//                         grams, and we use ITS number. Nothing hardcoded, so it
//                         ships anywhere; but asking a model for grams is the
//                         family that already lost twice (Arm A 36/108,
//                         MASSCALL 50/108).
//
// The $0 ceiling with perfect labels is 469/684 (sim-form-table.ts). Whatever the
// classifier loses against that ceiling is the price of automating the label, and
// whatever `grams` loses against `label` is the price of not owning the table.
//
// Requests go through production's own enrichBatch with a custom schema, NOT a
// private request builder - the one time this harness built its own request,
// every published macro number came from a shape production never sends.
//
//   deno run --allow-read --allow-write --allow-env --allow-net \
//     --env-file=.env.local scripts/probe-dish-form.ts label [draws]
//   ... scripts/probe-dish-form.ts label --replay      # $0 re-score
import {
  ENRICH_BATCH_SIZE,
  ENRICH_MODEL,
  enrichBatch,
} from "../supabase/functions/analyze-menu/enrich.ts";
import { itemsFromArchiveFile } from "./bench-pipeline.ts";
import {
  assertFullCoverage,
  FORM_G,
  LABEL,
  MENUS,
  oracle,
  PIZZAS,
  scoreWithTargets,
  withoutPizzas,
} from "./dish-forms.ts";

const CACHE = "scripts/fixtures/caches";

// Same archives every unweighted eval reads, so a form label is assigned to the
// same bytes the score is computed from.
const MENU_ARCHIVE: Record<string, string> = {
  bistro: "bistro.eval117-r1.raw.json",
  andaluz: "andaluz.eval128-r1.raw.json",
  nikkori: "nikkori.eval117-r1.raw.json",
  "el-marcos": "el-marcos.eval103c-m41-r1.raw.json",
  "brasero-two": "brasero-two.eval117-r1.raw.json",
};

const mode = Deno.args[0];
if (mode !== "label" && mode !== "grams") {
  throw new Error('first argument must be "label" or "grams"');
}
const replay = Deno.args.includes("--replay");
const draws = Number(Deno.args.find((a) => /^\d+$/.test(a)) ?? 2);

const FORMS = Object.keys(FORM_G);

/**
 * approach 1. The enum is the whole mechanism: the model cannot invent a form, so
 * it cannot invent a gram value either. Only `name` and `dish_form` - anything
 * else would give it room to reason about this plate's size, which is the failure
 * mode being avoided.
 */
const LABEL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "dish_form"],
        properties: {
          name: { type: "string" },
          dish_form: { type: "string", enum: FORMS },
        },
      },
    },
  },
};

/** approach 2. Free-text form, and the model owns the gram number. */
const GRAMS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        // Order matters (schema-force finding): commit to the KIND first, then
        // give that kind's weight. Reversed, the number leads and the label
        // becomes a post-hoc description of it.
        required: ["name", "dish_form", "form_typical_g"],
        properties: {
          name: { type: "string" },
          dish_form: { type: "string" },
          form_typical_g: { type: "number" },
        },
      },
    },
  },
};

const LABEL_PROMPT =
  `You are labelling restaurant menu items by the SHAPE of dish they are.

For each item choose the one dish_form that best describes A SINGLE ORDER of it
as it arrives at the table. Judge the whole plate, including anything the
description says comes with it. Use the item's section heading as a strong hint
about what kind of dish it is.

Do not estimate any weight. Do not describe the ingredients. Choose a form.
If no form fits the dish, choose "other".`;

const GRAMS_PROMPT =
  `You are labelling restaurant menu items by the SHAPE of dish they are, and
stating how big that shape usually is.

For each item:
1. dish_form - a short lowercase name for the KIND of dish this is, as a
   category that exists on menus worldwide (for example "thin crust pizza",
   "single soft taco", "maki roll order"). Include what comes with it if the
   description says something does.
2. form_typical_g - the total served weight in grams of ONE ORDER of THAT KIND
   of dish in a restaurant, in general. This is a fact about the category, not
   an estimate of this particular restaurant's version. Two items of the same
   kind must get the same number.`;

type Answer = { name: string; dish_form: string; form_typical_g?: number };

async function collect(): Promise<Answer[][]> {
  const perDraw: Answer[][] = [];
  for (let d = 0; d < draws; d++) {
    const got: Answer[] = [];
    for (const menu of MENUS) {
      const whole = itemsFromArchiveFile(MENU_ARCHIVE[menu]);
      const ruled = whole.filter((it) =>
        oracle.some((e) => e.name === it.name && e.menu === menu)
      );
      for (let b = 0; b * ENRICH_BATCH_SIZE < ruled.length; b++) {
        const batch = ruled.slice(
          b * ENRICH_BATCH_SIZE,
          (b + 1) * ENRICH_BATCH_SIZE,
        );
        const path = `${CACHE}/dishform.${mode}.${menu}-d${d}-b${b}.raw.json`;
        if (replay) {
          let raw: string;
          try {
            raw = await Deno.readTextFile(path);
          } catch {
            continue;
          }
          const content = JSON.parse(raw).choices[0].message.content;
          got.push(...JSON.parse(content).items);
          continue;
        }
        const out = await enrichBatch(
          batch,
          Deno.env.get("OPENAI_API_KEY")!,
          ENRICH_MODEL,
          (r) => Deno.writeTextFileSync(path, JSON.stringify(r, null, 2)),
          mode === "label" ? LABEL_PROMPT : GRAMS_PROMPT,
          mode === "label" ? LABEL_SCHEMA : GRAMS_SCHEMA,
          "system",
        );
        // enrichBatch appends zeroed macro totals because these schemas have no
        // ingredients. The fields this probe reads arrive via its `...item`.
        // deno-lint-ignore no-explicit-any
        got.push(...(out as any[]).map((it) => ({
          name: it.name,
          dish_form: it.dish_form,
          form_typical_g: it.form_typical_g,
        })));
      }
    }
    perDraw.push(got);
    console.log(`draw ${d}: ${got.length} labelled`);
  }
  return perDraw;
}

const perDraw = await collect();
if (!perDraw.some((d) => d.length)) {
  throw new Error(
    `no answers for mode "${mode}" - run without --replay to buy them first`,
  );
}

// ---------------------------------------------------------------- the reporting
const first = perDraw[0];
const seen = new Map<string, Answer>(first.map((a) => [a.name, a]));
const ruledNames = oracle.map((e) => e.name);
const gotAll = ruledNames.filter((n) => seen.has(n));
console.log(
  `\n${gotAll.length} of ${ruledNames.length} ruled dishes answered on draw 0`,
);
const absent = ruledNames.filter((n) => !seen.has(n));
if (absent.length) console.log(`  MISSING: ${absent.join(", ")}`);

if (mode === "label") {
  const right = gotAll.filter((n) => seen.get(n)!.dish_form === LABEL[n]);
  console.log(
    `\nagrees with the hand label: ${right.length}/${gotAll.length} (${
      ((100 * right.length) / gotAll.length).toFixed(0)
    }%)`,
  );
  const wrong = gotAll.filter((n) => seen.get(n)!.dish_form !== LABEL[n]);
  if (wrong.length) {
    console.log("\ndisagreements (model -> hand):");
    for (const n of wrong) {
      console.log(
        `  ${n.slice(0, 30).padEnd(32)}${
          seen.get(n)!.dish_form.padEnd(30)
        } vs ${LABEL[n]}`,
      );
    }
  }
} else {
  // Does the model give ONE number per kind, as asked? Grouped by its own label.
  const byForm = new Map<string, number[]>();
  for (const n of gotAll) {
    const a = seen.get(n)!;
    const k = a.dish_form.toLowerCase().trim();
    byForm.set(k, [...(byForm.get(k) ?? []), a.form_typical_g ?? 0]);
  }
  console.log(
    `\nthe model invented ${byForm.size} distinct forms for ${gotAll.length} dishes` +
      ` (our table has ${FORMS.length} rows for all of them)`,
  );
  const shared = [...byForm.entries()].filter(([, v]) => v.length > 1);
  const inconsistent = shared.filter(([, v]) => new Set(v).size > 1);
  console.log(
    `forms it used for more than one dish: ${shared.length}, of which ${inconsistent.length}` +
      ` got DIFFERENT grams for the same form (it was asked for one number per kind)`,
  );
  for (const [f, v] of inconsistent.slice(0, 6)) {
    console.log(`  ${f.slice(0, 34).padEnd(36)} ${v.join(", ")} g`);
  }
}

// Label stability across draws - the untested half of "a form does not drift".
if (perDraw.length > 1) {
  const later = perDraw.slice(1).map((d) => new Map(d.map((a) => [a.name, a])));
  const stable = gotAll.filter((n) =>
    later.every((m) => m.get(n)?.dish_form === seen.get(n)!.dish_form)
  );
  console.log(
    `\nsame form on all ${perDraw.length} draws: ${stable.length}/${gotAll.length} (${
      ((100 * stable.length) / gotAll.length).toFixed(0)
    }%)`,
  );
  if (mode === "grams") {
    const sameG = gotAll.filter((n) =>
      later.every((m) =>
        m.get(n)?.form_typical_g === seen.get(n)!.form_typical_g
      )
    );
    console.log(
      `same grams on all ${perDraw.length} draws: ${sameG.length}/${gotAll.length} (${
        ((100 * sameG.length) / gotAll.length).toFixed(0)
      }%)`,
    );
  }
}

// ------------------------------------------------------------------- the score
const targetFor = (n: string): number | null => {
  const a = seen.get(n);
  if (!a) return null;
  if (mode === "grams") {
    const g = a.form_typical_g;
    return typeof g === "number" && g >= 20 && g <= 2000 ? g : null;
  }
  // "other" is the fallback and means no opinion - it must NOT rescale to 250 g.
  return a.dish_form === "other" ? null : (FORM_G[a.dish_form] ?? null);
};

const control = await scoreWithTargets(() => null);
const scored = await scoreWithTargets(targetFor);
const ceiling = await scoreWithTargets((n) => FORM_G[LABEL[n]] ?? null);
assertFullCoverage(control);

const DRAWS_SCORED = 3;
const dropped = PIZZAS.length * 4 * DRAWS_SCORED;
console.log("\nUNWEIGHTED - points in band, higher is better\n");
console.log(
  `${"rule".padEnd(38)}${"all 57".padStart(12)}${"no pizzas".padStart(14)}`,
);
for (
  const [l, r] of [
    ["today (dual, control)", control],
    [`form -> ${mode} (THIS PROBE)`, scored],
    ["form -> hand labels (ceiling)", ceiling],
  ] as [string, typeof control][]
) {
  console.log(
    `${l.padEnd(38)}${`${r.pts}/${r.poss}`.padStart(12)}${
      `${withoutPizzas(r)}/${r.poss - dropped}`.padStart(14)
    }`,
  );
}
const sign = (n: number) => `${n >= 0 ? "+" : ""}${n}`;
console.log(
  `\nvs control : ${sign(scored.pts - control.pts)} all 57, ${
    sign(withoutPizzas(scored) - withoutPizzas(control))
  } without pizzas`,
);
console.log(
  `vs ceiling : ${
    sign(scored.pts - ceiling.pts)
  } all 57 - what automating the label costs`,
);
