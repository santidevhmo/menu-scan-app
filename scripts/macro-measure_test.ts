import {
  assertEquals,
  assertThrows,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { altOracle, pairWithOracle, scoreDish, toMacroValues } from "./macro-measure.ts";
import { replayDraw } from "./bench-macros.ts";

// ---------------------------------------------------------------------------
// Guards against a SECOND copy of measurement logic.
//
// On 2026-08-09 the live runner and the $0 re-scorer had each grown their own
// copy of the scoring rules, and the copies disagreed in four ways. Every
// disagreement was silent: each produced a clean table of wrong numbers. The
// project's whole method rests on those numbers, so the duplication is now
// deleted - and these tests fail the build if it comes back, because a
// zero-context session will not rediscover the incident on its own.
// ---------------------------------------------------------------------------

async function sourceFiles(): Promise<{ path: string; text: string }[]> {
  const files: { path: string; text: string }[] = [];
  for (const dir of ["scripts", "supabase/functions/analyze-menu"]) {
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isFile || !entry.name.endsWith(".ts")) continue;
      if (entry.name.endsWith("_test.ts")) continue;
      const path = `${dir}/${entry.name}`;
      files.push({ path, text: await Deno.readTextFile(path) });
    }
  }
  return files;
}

/**
 * Files that take part in MACRO measurement - anything importing the scorer or
 * this module. Scoped deliberately: the extraction pipeline has its own
 * unrelated tolerances (`GRAMS_RELATIVE_TOLERANCE`, `NUMBER_LOSS_TOLERANCE`)
 * and a guard that shouts about those would be turned off within a week.
 * Any new tool that joins the macro path is picked up automatically.
 */
async function macroPathFiles(): Promise<{ path: string; text: string }[]> {
  return (await sourceFiles()).filter(({ text }) =>
    text.includes('from "./macro-score.ts"') ||
    text.includes('from "./macro-measure.ts"')
  );
}

Deno.test("only macro-score.ts declares a tolerance band", async () => {
  // The original defect: rescore-history.ts held `const BAND = { cal: 0.2, ... }`.
  // A band change then applied to new runs and NOT to the history they were
  // compared against - the comparison silently stops being like-for-like.
  const files = await macroPathFiles();
  assertEquals(
    files.length > 1,
    true,
    "the macro path should contain more than one file - has an import moved?",
  );
  const offenders = files.filter(({ path, text }) =>
    path !== "scripts/macro-score.ts" &&
    /(?:BAND|TOLERANCE|ALLOWANCE)\w*\s*(?::[^=\n]*)?=\s*[{[]?\s*(?:\w+\s*:\s*)?0?\.\d/i
      .test(text)
  );
  assertEquals(
    offenders.map((o) => o.path),
    [],
    "tolerance bands must be imported from macro-score.ts, never restated",
  );
});

Deno.test("only macro-measure.ts knows the archive eras", async () => {
  // Era detection keys on `protein_per_100g`. A second copy of it is how a
  // re-score returns ZERO for every macro on the older two archive shapes and
  // prints a full table of -100% failures that looks like a real result. That
  // has already happened once in this phase.
  const offenders = (await sourceFiles()).filter(({ path, text }) =>
    path !== "scripts/macro-measure.ts" &&
    !path.startsWith("supabase/") &&
    text.includes("protein_per_100g")
  );
  assertEquals(
    offenders.map((o) => o.path),
    [],
    "era handling belongs to toMacroValues() alone",
  );
});

Deno.test("the alternative oracle reading is DERIVED, never hardcoded", () => {
  // It used to be four constants. When PASTEL's recipe gained its tortilla on
  // 2026-08-09 those constants went stale instantly - the tolerance would have
  // been measured against a dish that no longer existed, silently. Deriving it
  // from the shipped ingredients makes that impossible.
  const entry = {
    name: "PASTEL AZTECA (300gr.)",
    oracle: {
      ingredients: [
        // 300 g inside the printed weight ...
        { grams: 300, per_100g: { calories: 100, protein_g: 10, carb_g: 20, fat_g: 5 } },
        // ... plus a 100 g accompaniment outside it.
        { grams: 100, per_100g: { calories: 100, protein_g: 10, carb_g: 20, fat_g: 5 } },
      ],
    },
  };
  // Beans inside: the same 400 g of food declared to weigh 300 g -> x0.75.
  assertEquals(altOracle(entry, 300), {
    calories: 300,
    protein_g: 30,
    carb_g: 60,
    fat_g: 15,
  });

  // A dish with no second reading, and an unreadable printed weight, both yield
  // null rather than a guess.
  assertEquals(altOracle({ ...entry, name: "CESAR (200 g)" }, 300), null);
  assertEquals(altOracle(entry, null), null);
});

// ---------------------------------------------------------------------------
// Behaviour
// ---------------------------------------------------------------------------

Deno.test("dishes are paired by name, so order cannot misattribute a score", () => {
  // The runner used to pair oracle[i] with modelItems[i]. The oracle has since
  // grown from three dishes to eight; one reordering and every score lands on
  // the wrong dish, with nothing in the output to show it.
  const names = ["CESAR (200 g)", "Salmone toscano", "PASTEL AZTECA (300gr.)"];
  const items = [
    { name: "PASTEL AZTECA (300gr.)", estimated_calories: 3 },
    { name: "CESAR (200 g)", estimated_calories: 1 },
    { name: "Salmone toscano", estimated_calories: 2 },
  ];

  const paired = pairWithOracle(names, items, "throw");
  assertEquals(paired.map((p) => p.name), names);
  assertEquals(paired.map((p) => p.item.estimated_calories), [1, 2, 3]);
});

Deno.test("a missing dish throws on a live run and is skipped on a replay", () => {
  // The two callers genuinely differ. A live response that is short is a real
  // defect and must be loud. An archive that predates a dish is normal - the
  // set went from three dishes to eight, so every historical run is short now.
  const names = ["CESAR (200 g)", "NEW YORK"];
  const items = [{ name: "CESAR (200 g)", estimated_calories: 1 }];

  assertThrows(
    () => pairWithOracle(names, items, "throw"),
    Error,
    "NEW YORK",
  );
  assertEquals(pairWithOracle(names, items, "skip").length, 1);
});

Deno.test("every archive era converts to non-zero macros", async () => {
  // One test per shape in the archive. If any era regresses to zeros, the
  // re-score prints -100% for that run and looks like a catastrophic result
  // rather than a broken reader.
  for (const run of ["baseline-002", "iter-b10-001", "iter-b4-001"]) {
    const [item] = await replayDraw(run, 0);
    const values = toMacroValues(item);
    assertEquals(
      values.calories > 0 && values.protein_g > 0 && values.fat_g > 0,
      true,
      `${run} converted to zeros - the era reader is broken, not the run`,
    );
  }
});

Deno.test("an alternative reading rescues a field without flattering the report", () => {
  // PASTEL's beans tolerance: the field is FORGIVEN for pass/fail, but the
  // reported delta stays measured against the shipped oracle, so the published
  // mean error never gets quietly improved by a second reading.
  const shipped = { calories: 576.7, protein_g: 51.3, carb_g: 35.5, fat_g: 26.8 };
  const beansInside = { calories: 452, protein_g: 39.2, carb_g: 31.4, fat_g: 19.9 };

  const verdict = scoreDish(
    "PASTEL AZTECA (300gr.)",
    shipped,
    beansInside,
    beansInside,
  );
  assertEquals(verdict.pass, true, "the second reading must rescue the draw");
  // Calories is the field that genuinely needs rescuing here: -21.6% against
  // the shipped oracle, outside the +/-20% calorie band, exact under the other
  // reading. (Protein is -23.6%, which the +/-30% macro band passes anyway.)
  const calories = verdict.fields.find((f) => f.field === "calories")!;
  assertEquals(calories.oracle, shipped.calories);
  assertEquals(calories.pass, false, "the shipped-oracle verdict stays honest");
  assertEquals(verdict.passes[0], true, "but the draw forgives it");

  // A dish with no alternative reading gets no such leniency.
  assertEquals(
    scoreDish("CESAR (200 g)", shipped, beansInside, beansInside).pass,
    false,
  );
});
