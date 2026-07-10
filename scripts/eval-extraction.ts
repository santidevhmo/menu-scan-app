import type {
  ExtractedMenuItem,
  ImageQuality,
} from "../supabase/functions/analyze-menu/extract.ts";
import { runExtraction } from "../supabase/functions/analyze-menu/extract.ts";
import { postprocessItems } from "../supabase/functions/analyze-menu/postprocess.ts";

type Category = ExtractedMenuItem["category"];

interface ExpectedFixture {
  menu: string;
  photos: string[];
  total_items: number;
  food_items: number;
  drink_items: number;
  categories: Category[];
  sections: string[];
  section_headers?: string[];
  // Sections that group only drink items — captured at F3 adjudication so the
  // data isn't lost, scored by Feature 5, ignored until then.
  drink_sections?: string[];
  section_expectations: {
    name_contains: string;
    section_title: string;
  }[];
  items_with_options: {
    name_contains: string;
    description_contains?: string;
    price?: number;
    options: string[];
  }[];
  image_quality?: ImageQuality;
}

interface ActualExtraction {
  image_quality: ImageQuality;
  items: ExtractedMenuItem[];
}

interface DimensionScore {
  pass: boolean;
  detail: string;
}

interface MenuReport {
  menu: string;
  items: DimensionScore;
  categories: DimensionScore;
  section_context: DimensionScore;
  options: DimensionScore;
  image_quality: DimensionScore | null;
}

interface AggregateReport {
  items: boolean;
  categories: boolean;
  section_context: boolean;
  options: boolean;
  image_quality: boolean | null;
}

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Self-check failed: ${message}`);
}

// Accent-insensitive: stable OCR accent drops (Marlín→Marlin) must not break
// matching — same spelling-tolerance policy as the Feature 1 items gate.
function normalize(value: string): string {
  return value.toLocaleLowerCase().trim().replaceAll(/\s+/g, " ")
    .normalize("NFD").replaceAll(/[\u0300-\u036f]/g, "");
}

function findOptionTargetIndex(
  target: ExpectedFixture["items_with_options"][number],
  items: ExtractedMenuItem[],
  consumed: Set<number>,
): number | undefined {
  for (let index = 0; index < items.length; index++) {
    if (consumed.has(index)) continue;
    const item = items[index];
    if (!normalize(item.name).includes(normalize(target.name_contains))) {
      continue;
    }
    if (
      target.description_contains &&
      !normalize(item.description).includes(
        normalize(target.description_contains),
      )
    ) {
      continue;
    }
    if (target.price !== undefined && item.price !== target.price) continue;
    return index;
  }
  return undefined;
}

export function optionRecall(
  fixture: ExpectedFixture,
  items: ExtractedMenuItem[],
): { found: number; expected: number } {
  let found = 0;
  let expected = 0;
  const consumed = new Set<number>();
  for (const target of fixture.items_with_options) {
    expected += target.options.length;
    const index = findOptionTargetIndex(target, items, consumed);
    if (index === undefined) continue;
    consumed.add(index);
    const names = items[index].options.map((option) => normalize(option.name));
    for (const expectedOption of target.options) {
      if (names.some((name) => name.includes(normalize(expectedOption)))) {
        found++;
      }
    }
  }
  return { found, expected };
}

export interface OptionBreakdown {
  targets: {
    target: ExpectedFixture["items_with_options"][number];
    matchedItem: string | null;
    matchedOptions: string[];
    missingOptions: string[];
  }[];
  falsePositives: { name: string; options: string[] }[];
}

export function optionBreakdown(
  fixture: ExpectedFixture,
  items: ExtractedMenuItem[],
): OptionBreakdown {
  const consumed = new Set<number>();
  const targets = fixture.items_with_options.map((target) => {
    const index = findOptionTargetIndex(target, items, consumed);
    if (index === undefined) {
      return {
        target,
        matchedItem: null,
        matchedOptions: [],
        missingOptions: target.options,
      };
    }
    consumed.add(index);
    const item = items[index];
    const names = item.options.map((option) => option.name);
    const missingOptions = target.options.filter((expected) =>
      !names.some((name) => normalize(name).includes(normalize(expected)))
    );
    return {
      target,
      matchedItem: item.name,
      matchedOptions: names,
      missingOptions,
    };
  });
  const falsePositives = items
    .filter((item, index) => item.options.length > 0 && !consumed.has(index))
    .map((item) => ({
      name: item.name,
      options: item.options.map((option) => option.name),
    }));
  return { targets, falsePositives };
}

export function formatOptionBreakdown(breakdown: OptionBreakdown): string[] {
  const lines: string[] = [];
  for (const entry of breakdown.targets) {
    const want = `"${entry.target.name_contains}" wants [${
      entry.target.options.join(", ")
    }]`;
    if (entry.matchedItem === null) {
      lines.push(`    ✗ ${want} → no matching item extracted`);
    } else if (entry.matchedOptions.length === 0) {
      lines.push(
        `    ✗ ${want} → "${entry.matchedItem}" extracted with NO options`,
      );
    } else if (entry.missingOptions.length > 0) {
      lines.push(
        `    ~ ${want} → "${entry.matchedItem}" has [${
          entry.matchedOptions.join(", ")
        }]; missing [${entry.missingOptions.join(", ")}]`,
      );
    } else {
      lines.push(
        `    ✓ ${want} → "${entry.matchedItem}" has [${
          entry.matchedOptions.join(", ")
        }]`,
      );
    }
  }
  for (const fp of breakdown.falsePositives) {
    lines.push(
      `    ⚠ FALSE POSITIVE "${fp.name}" has [${fp.options.join(", ")}]`,
    );
  }
  return lines;
}

export function scoreMenu(
  fixture: ExpectedFixture,
  actual: ActualExtraction,
): MenuReport {
  const foodItems = actual.items.filter((item) => item.category !== "drink");
  // Feature 1 measures COMPLETENESS: distinct food dishes found. Same-name
  // variant cards (Revueltos 78/84/90, Chilaquiles' three preparations @138)
  // fold into ONE dish — how they're split/folded is Feature 2's (options) call,
  // so it must not move this count. `food_items` fixtures are distinct-dish counts.
  const distinctDishes = new Set(foodItems.map((item) => normalize(item.name)));
  const itemDelta = distinctDishes.size - fixture.food_items;
  const headers = new Set(
    [...fixture.sections, ...(fixture.section_headers ?? [])].map(normalize),
  );
  // Section-header-as-item ("Pa' los Bukis") is a sections problem = Feature 3.
  // Reported for visibility but NOT a Feature 1 pass condition.
  const phantomHeaders =
    foodItems.filter((item) => headers.has(normalize(item.name))).length;
  // A duplicate = the SAME dish listed twice (same name, price AND description).
  const seenKeys = new Set<string>();
  const duplicateNames = new Set<string>();
  for (const item of foodItems) {
    const key =
      `${normalize(item.name)}@${item.price}@${normalize(item.description)}`;
    if (seenKeys.has(key)) duplicateNames.add(normalize(item.name));
    else seenKeys.add(key);
  }
  const items = {
    pass: Math.abs(itemDelta) <= 3 && duplicateNames.size === 0,
    detail:
      `${distinctDishes.size}/${fixture.food_items} distinct food dishes; ${duplicateNames.size} duplicates; ${phantomHeaders} section-headers (→Feature 3)`,
  };

  const expectedCategories = new Set(fixture.categories);
  const actualCategories = new Set(actual.items.map((item) => item.category));
  const missingCategories = fixture.categories.filter((category) =>
    !actualCategories.has(category)
  );
  const spuriousCategories = [...actualCategories].filter((category) =>
    !expectedCategories.has(category)
  );
  const categories = {
    pass: missingCategories.length === 0 && spuriousCategories.length === 0,
    detail: `missing: ${missingCategories.join(", ") || "none"}; spurious: ${
      spuriousCategories.join(", ") || "none"
    }`,
  };

  const expectedSections = new Map(
    fixture.sections.map((section) => [normalize(section), section]),
  );
  // Feature 3 is food-scoped: the nikkori crop path drops drinks before merge,
  // so drink sections can never appear there — they are Feature 5's dimension.
  const actualSections = new Map(
    foodItems.flatMap((item) =>
      item.section_title
        ? [[normalize(item.section_title), item.section_title] as const]
        : []
    ),
  );
  const missingSections = [...expectedSections].filter(([key]) =>
    !actualSections.has(key)
  ).map(([, section]) => section);
  const spuriousSections = [...actualSections].filter(([key]) =>
    !expectedSections.has(key)
  ).map(([, section]) => section);
  const wrongMappings = fixture.section_expectations.flatMap((expected) => {
    const item = foodItems.find((candidate) =>
      normalize(candidate.name).includes(normalize(expected.name_contains))
    );
    if (!item) return [`${expected.name_contains}→(item not found)`];
    if (
      normalize(item.section_title ?? "") === normalize(expected.section_title)
    ) return [];
    return [
      `${item.name}→${item.section_title ?? "null"} (expected ${expected.section_title})`,
    ];
  });
  const sectionContext = {
    pass: missingSections.length === 0 &&
      spuriousSections.length === 0 &&
      wrongMappings.length === 0,
    detail: `missing: ${missingSections.join(", ") || "none"}; spurious: ${
      spuriousSections.join(", ") || "none"
    }; wrong mappings: ${wrongMappings.join("; ") || "none"}`,
  };

  // Options are scored over FOOD items only (drinks are Feature 5): a drink
  // with options is neither a matchable target nor a false positive.
  const optionsBreakdown = optionBreakdown(fixture, foodItems);
  const missingOptionItems = optionsBreakdown.targets.filter((entry) =>
    entry.matchedItem === null ||
    entry.matchedOptions.length === 0 ||
    entry.missingOptions.length > 0
  );
  const options = {
    pass: missingOptionItems.length === 0 &&
      optionsBreakdown.falsePositives.length === 0,
    detail:
      `missed targets: ${missingOptionItems.length}; false-positive items: ${optionsBreakdown.falsePositives.length}`,
  };

  const expectedQuality = fixture.image_quality;
  const imageQuality = expectedQuality
    ? {
      pass: actual.image_quality.usable === expectedQuality.usable &&
        new Set(actual.image_quality.issues.map(normalize)).size ===
          new Set(expectedQuality.issues.map(normalize)).size &&
        expectedQuality.issues.every((issue) =>
          actual.image_quality.issues.some((actualIssue) =>
            normalize(actualIssue) === normalize(issue)
          )
        ),
      detail: `usable=${actual.image_quality.usable}; issues=${
        actual.image_quality.issues.join(", ") || "none"
      }`,
    }
    : null;

  return {
    menu: fixture.menu,
    items,
    categories,
    section_context: sectionContext,
    options,
    image_quality: imageQuality,
  };
}

export function aggregateReports(reports: MenuReport[]): AggregateReport {
  const green = (
    dimension: "items" | "categories" | "section_context" | "options",
  ): boolean =>
    reports.filter((report) => report[dimension].pass).length >=
      Math.ceil(reports.length * 0.8);
  const qualityReports = reports.flatMap((report) =>
    report.image_quality ? [report.image_quality] : []
  );

  return {
    items: green("items"),
    categories: green("categories"),
    section_context: green("section_context"),
    options: green("options"),
    image_quality: qualityReports.length === 0
      ? null
      : qualityReports.filter((score) => score.pass).length >=
        Math.ceil(qualityReports.length * 0.8),
  };
}

type GateDimension =
  | "items"
  | "categories"
  | "section_context"
  | "options"
  | "image_quality";

const GATE_DIMENSIONS: GateDimension[] = [
  "items",
  "categories",
  "section_context",
  "options",
  "image_quality",
];

export function gateFailures(
  reports: MenuReport[],
  dims: GateDimension[],
): string[] {
  const failures: string[] = [];
  for (const dim of dims) {
    const failing = reports
      .filter((report) => {
        const score = report[dim];
        return score !== null && !score.pass;
      })
      .map((report) => report.menu);
    if (failing.length > 0) failures.push(`${dim}: ${failing.join(", ")}`);
  }
  return failures;
}

function enforceGate(reports: MenuReport[]): boolean {
  const gateIndex = Deno.args.indexOf("--gate");
  if (gateIndex === -1) return false;

  const value = Deno.args[gateIndex + 1];
  if (!value) throw new Error("--gate requires at least one dimension");

  const requested = value.split(",").map((dim) => dim.trim());
  const invalid = requested.filter((dim) =>
    !GATE_DIMENSIONS.includes(dim as GateDimension)
  );
  if (invalid.length > 0) {
    throw new Error(`Unsupported gate dimension: ${invalid.join(", ")}`);
  }

  const dims = requested as GateDimension[];
  const failures = gateFailures(reports, dims);
  if (failures.length > 0) {
    console.log(`\nGATE FAIL (${dims.join(", ")}):`);
    for (const failure of failures) console.log(`  ${failure}`);
    Deno.exitCode = 1;
  } else {
    console.log(
      `\nGATE PASS: ${dims.join(", ")} on all ${reports.length} menus`,
    );
  }
  return true;
}

function status(value: boolean | null): string {
  return value === null ? "SKIP" : value ? "PASS" : "FAIL";
}

function printReport(reports: MenuReport[], aggregate: AggregateReport): void {
  for (const report of reports) {
    console.log(`\n${report.menu}`);
    console.log(`  ${status(report.items.pass)} items: ${report.items.detail}`);
    console.log(
      `  ${
        status(report.categories.pass)
      } categories: ${report.categories.detail}`,
    );
    console.log(
      `  ${
        status(report.section_context.pass)
      } section_context: ${report.section_context.detail}`,
    );
    console.log(
      `  ${status(report.options.pass)} options: ${report.options.detail}`,
    );
    console.log(
      `  ${status(report.image_quality?.pass ?? null)} image_quality: ${
        report.image_quality?.detail ?? "not configured"
      }`,
    );
  }

  console.log("\nAggregate");
  console.log(`  ${status(aggregate.items)} items`);
  console.log(`  ${status(aggregate.categories)} categories`);
  console.log(`  ${status(aggregate.section_context)} section_context`);
  console.log(`  ${status(aggregate.options)} options`);
  console.log(`  ${status(aggregate.image_quality)} image_quality`);
}

const FIXTURE_DIR = new URL("./fixtures/", import.meta.url);
const MENU_DIR = "/Users/santiagoaguirre/Downloads/MenusTesting";

function imageMimeType(filename: string): "image/png" | "image/jpeg" {
  return filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

async function loadFixtures(): Promise<ExpectedFixture[]> {
  const names: string[] = [];
  for await (const entry of Deno.readDir(FIXTURE_DIR)) {
    if (entry.isFile && entry.name.endsWith(".expected.json")) {
      names.push(entry.name);
    }
  }

  const fixtures = await Promise.all(
    names.sort().map(async (name) =>
      JSON.parse(
        await Deno.readTextFile(new URL(name, FIXTURE_DIR)),
      ) as ExpectedFixture
    ),
  );
  for (const fixture of fixtures) {
    if (fixture.food_items + fixture.drink_items !== fixture.total_items) {
      throw new Error(
        `${fixture.menu}: food_items(${fixture.food_items}) + drink_items(${fixture.drink_items}) !== total_items(${fixture.total_items})`,
      );
    }
  }
  return fixtures;
}

async function main(): Promise<void> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY is required");

  const fixtures = await loadFixtures();
  if (fixtures.length === 0) {
    throw new Error(`No *.expected.json fixtures found in ${FIXTURE_DIR}`);
  }

  const reports: MenuReport[] = [];
  for (const fixture of fixtures) {
    const photos = await Promise.all(
      fixture.photos.map(async (photo) => {
        const base64 = (await Deno.readFile(`${MENU_DIR}/${photo}`)).toBase64();
        return `data:${imageMimeType(photo)};base64,${base64}`;
      }),
    );
    const result = await runExtraction(photos, apiKey);
    const actual = {
      image_quality: result.image_quality,
      items: result.items,
    };

    await Deno.writeTextFile(
      `${MENU_DIR}/${fixture.menu}.actual.json`,
      `${JSON.stringify(actual, null, 2)}\n`,
    );
    reports.push(scoreMenu(fixture, actual));
    const recall = optionRecall(fixture, actual.items);
    console.log(
      `option recall ${fixture.menu}: ${recall.found}/${recall.expected}`,
    );
  }

  const aggregate = aggregateReports(reports);
  printReport(reports, aggregate);
  if (enforceGate(reports)) return;
  if (
    !aggregate.items ||
    !aggregate.categories ||
    !aggregate.section_context ||
    !aggregate.options ||
    aggregate.image_quality === false
  ) {
    Deno.exitCode = 1;
  }
}

async function offline(dir: string): Promise<void> {
  const fixtures = await loadFixtures();
  const reports: MenuReport[] = [];
  for (const fixture of fixtures) {
    let raw: ActualExtraction;
    try {
      raw = JSON.parse(
        await Deno.readTextFile(`${dir}/${fixture.menu}.actual.json`),
      ) as ActualExtraction;
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        console.log(`\n${fixture.menu}`);
        console.log(`  SKIP no ${fixture.menu}.actual.json in ${dir}`);
        continue;
      }
      throw error;
    }
    const processed = postprocessItems(raw.items);
    reports.push(scoreMenu(fixture, {
      image_quality: raw.image_quality,
      items: processed,
    }));
    const recall = optionRecall(fixture, processed);
    console.log(
      `option recall ${fixture.menu}: ${recall.found}/${recall.expected}`,
    );
    for (
      const line of formatOptionBreakdown(
        optionBreakdown(
          fixture,
          processed.filter((item) => item.category !== "drink"),
        ),
      )
    ) console.log(line);
  }
  printReport(reports, aggregateReports(reports));
  enforceGate(reports);
}

function runSelfCheck(): void {
  assert(imageMimeType("menu.png") === "image/png", "PNG MIME type");
  assert(imageMimeType("menu.jpg") === "image/jpeg", "JPEG MIME type");

  const balanced: ExpectedFixture = {
    menu: "balance",
    photos: ["stub.jpg"],
    total_items: 5,
    food_items: 3,
    drink_items: 2,
    categories: ["food", "drink"],
    sections: [],
    section_expectations: [],
    items_with_options: [],
  };
  assert(
    balanced.food_items + balanced.drink_items === balanced.total_items,
    "fixture food + drink counts must sum to total",
  );

  const fixture: ExpectedFixture = {
    menu: "stub",
    photos: ["stub.jpg"],
    total_items: 2,
    food_items: 2,
    drink_items: 0,
    categories: ["food", "side"],
    sections: ["Mains", "Sides"],
    section_headers: ["Mains"],
    section_expectations: [
      { name_contains: "Burger", section_title: "Mains" },
      { name_contains: "Fries", section_title: "Sides" },
    ],
    items_with_options: [{
      name_contains: "Burger",
      options: ["Cheese"],
    }, {
      name_contains: "Fries",
      options: [],
    }],
    image_quality: { usable: true, issues: [] },
  };
  const actual: ActualExtraction = {
    image_quality: { usable: true, issues: [] },
    items: [
      {
        name: "House Burger",
        description: "",
        price: 12,
        category: "food",
        section_title: "Mains",
        options: [{ name: "Add Cheese", price: 2, grams: null }],
      },
      {
        name: "Fries",
        description: "",
        price: 4,
        category: "side",
        section_title: "Sides",
        options: [{ name: "Large", price: 2, grams: null }],
      },
    ],
  };

  const passing = scoreMenu(fixture, actual);
  assert(passing.items.pass, "item score should pass");
  assert(passing.categories.pass, "category score should pass");
  assert(passing.section_context.pass, "section-context score should pass");
  assert(passing.options.pass, "options score should pass");
  assert(
    passing.image_quality?.pass === true,
    "image-quality score should pass",
  );

  const failing = scoreMenu(fixture, {
    image_quality: { usable: false, issues: ["blur"] },
    items: [
      ...actual.items,
      {
        name: "Mains",
        description: "",
        price: null,
        category: "other",
        section_title: null,
        options: [{ name: "Not an option", price: null, grams: null }],
      },
      {
        name: "Soup",
        description: "",
        price: 5,
        category: "other",
        section_title: "Soups",
        options: [],
      },
      {
        name: "Cake",
        description: "",
        price: 6,
        category: "dessert",
        section_title: "Desserts",
        options: [],
      },
      {
        name: "Toast",
        description: "",
        price: 7,
        category: "food",
        section_title: "Mains",
        options: [],
      },
    ],
  });
  assert(
    !failing.items.pass,
    "item score should catch count errors (4 distinct food over the +3 band)",
  );
  assert(
    !failing.categories.pass,
    "category score should catch spurious labels",
  );
  assert(
    !failing.section_context.pass,
    "section-context score should catch missing and spurious sections",
  );
  assert(!failing.options.pass, "options score should catch false positives");
  assert(
    failing.image_quality?.pass === false,
    "image-quality score should fail",
  );

  const foodPlusDrinks: ActualExtraction = {
    image_quality: { usable: true, issues: [] },
    items: [
      ...actual.items,
      ...Array.from({ length: 5 }, (_, i) => ({
        name: i === 0 ? "Mains" : `Drink ${i}`,
        description: "",
        price: 3,
        category: "drink" as const,
        section_title: null,
        options: [],
      })),
    ],
  };
  assert(
    scoreMenu(fixture, foodPlusDrinks).items.pass,
    "5 extra drink items must not break the food-only item count",
  );

  const drinkWithOptions: ActualExtraction = {
    image_quality: { usable: true, issues: [] },
    items: [
      ...actual.items,
      {
        name: "Té",
        description: "",
        price: 32,
        category: "drink" as const,
        section_title: null,
        options: [
          { name: "Manzanilla", price: null, grams: null },
          { name: "Negro", price: null, grams: null },
        ],
      },
    ],
  };
  assert(
    scoreMenu(fixture, drinkWithOptions).options.pass,
    "a drink item with options must not fail the food-scoped options gate",
  );

  // Feature 3: section_context is food-scoped — drink items and their sections
  // are Feature 5's dimension, neither satisfying nor polluting this one.
  const mojito = {
    name: "Mojito",
    description: "",
    price: 9,
    category: "drink" as const,
    section_title: "Cocktails",
    options: [],
  };
  const withDrink = scoreMenu(fixture, {
    image_quality: { usable: true, issues: [] },
    items: [...actual.items, mojito],
  });
  assert(
    withDrink.section_context.pass,
    "a drink-only section must not count as spurious (food-scoped)",
  );
  const drinkSatisfied = scoreMenu(
    { ...fixture, sections: [...fixture.sections, "Cocktails"] },
    {
      image_quality: { usable: true, issues: [] },
      items: [...actual.items, mojito],
    },
  );
  assert(
    !drinkSatisfied.section_context.pass,
    "a fixture section satisfied only by a drink item is still missing",
  );
  const namedWrong = scoreMenu(fixture, {
    image_quality: { usable: true, issues: [] },
    items: [
      { ...actual.items[0], section_title: "Sides" },
      actual.items[1],
    ],
  });
  assert(
    !namedWrong.section_context.pass &&
      namedWrong.section_context.detail.includes(
        "House Burger→Sides (expected Mains)",
      ),
    "wrong mappings must be named in the detail string",
  );

  const breakdown = optionBreakdown(fixture, actual.items);
  assert(
    breakdown.targets.length === 2 &&
      breakdown.targets[0].matchedItem === "House Burger" &&
      breakdown.targets[0].matchedOptions.join(",") === "Add Cheese" &&
      breakdown.targets[0].missingOptions.length === 0,
    "breakdown reports the matched item and its actual options",
  );
  assert(
    breakdown.falsePositives.length === 0,
    "consumed targets are not false positives",
  );
  const missedBreakdown = optionBreakdown(fixture, [
    { ...actual.items[0], options: [] },
    actual.items[1],
  ]);
  assert(
    missedBreakdown.targets[0].matchedItem === "House Burger" &&
      missedBreakdown.targets[0].matchedOptions.length === 0 &&
      missedBreakdown.targets[0].missingOptions.join(",") === "Cheese",
    "breakdown reports a matched item extracted with no options",
  );

  const accentFixture: ExpectedFixture = {
    ...fixture,
    items_with_options: [{ name_contains: "Marlín", options: ["Camarón"] }],
  };
  const accentTarget = optionBreakdown(accentFixture, [{
    name: "Machaca de Marlin",
    description: "",
    price: 98,
    category: "food",
    section_title: null,
    options: [{ name: "camaron", price: null, grams: null }],
  }]).targets[0];
  assert(
    accentTarget.matchedItem === "Machaca de Marlin" &&
      accentTarget.missingOptions.length === 0,
    "target matching is accent-insensitive (Marlín matches Marlin)",
  );

  const filler = (name: string): ExtractedMenuItem => ({
    name,
    description: "",
    price: 5,
    category: "food",
    section_title: "Mains",
    options: [],
  });
  assert(
    scoreMenu(fixture, {
      ...actual,
      items: [...actual.items, filler("Soup"), filler("Cake"), filler("Pie")],
    }).items.pass,
    "item count within +3 should pass",
  );
  assert(
    !scoreMenu(fixture, {
      ...actual,
      items: [
        ...actual.items,
        filler("Soup"),
        filler("Cake"),
        filler("Pie"),
        filler("Stew"),
      ],
    }).items.pass,
    "item count at +4 should fail",
  );

  assert(
    aggregateReports([passing, passing, passing, passing, failing]).items,
    "four of five should be green",
  );
  assert(
    !aggregateReports([passing, passing, passing, failing, failing]).items,
    "three of five should be red",
  );
  assert(
    gateFailures([passing, passing], ["items"]).length === 0,
    "gate passes when every menu passes the dimension",
  );
  const gateFail = gateFailures([passing, failing], ["items"]);
  assert(gateFail.length === 1, "gate fails when any menu fails the dimension");
  assert(
    gateFail[0].startsWith("items:"),
    "gate failure names the failing dimension",
  );
  assert(
    !scoreMenu(fixture, {
      ...actual,
      items: actual.items.map((item) =>
        item.name === "Fries" ? { ...item, options: [] } : item
      ),
    }).options.pass,
    "an unnamed options target should still require an extracted option",
  );

  const duplicateFixture: ExpectedFixture = {
    menu: "stub-duplicates",
    photos: ["stub.jpg"],
    total_items: 3,
    food_items: 3,
    drink_items: 0,
    categories: ["food"],
    sections: ["Huevos"],
    section_expectations: [],
    items_with_options: [
      {
        name_contains: "Revueltos",
        description_contains: "jamón",
        price: 90,
        options: ["Jamón", "Chorizo", "Tocino"],
      },
    ],
  };
  const revueltosCard = (
    description: string,
    price: number,
    options: { name: string; price: number | null; grams: number | null }[],
  ): ExtractedMenuItem => ({
    name: "Revueltos",
    description,
    price,
    category: "food",
    section_title: "Huevos",
    options,
  });
  const duplicateActual: ActualExtraction = {
    image_quality: { usable: true, issues: [] },
    items: [
      revueltosCard("Dos huevos naturales", 78, []),
      revueltosCard("Dos huevos la mexicana", 84, []),
      revueltosCard("Con jamón, chorizo o tocino", 90, [
        { name: "jamón", price: null, grams: null },
        { name: "chorizo", price: null, grams: null },
        { name: "tocino", price: null, grams: null },
      ]),
    ],
  };
  assert(
    scoreMenu(duplicateFixture, duplicateActual).options.pass,
    "qualified target should match the correct card among duplicate names",
  );

  assert(
    scoreMenu(duplicateFixture, duplicateActual).items.pass,
    "same name at different prices are distinct food items, not duplicates",
  );
  assert(
    !scoreMenu(fixture, {
      ...actual,
      items: [...actual.items, filler("Soup"), filler("Soup")],
    }).items.pass,
    "same food name at the same price counts as a duplicate item",
  );
  assert(
    scoreMenu(fixture, {
      ...actual,
      items: [
        ...actual.items,
        {
          name: "Chilaquiles",
          description: "Tradicionales",
          price: 138,
          category: "food",
          section_title: "Mains",
          options: [],
        },
        {
          name: "Chilaquiles",
          description: "Divorciados",
          price: 138,
          category: "food",
          section_title: "Mains",
          options: [],
        },
      ],
    }).items.pass,
    "same name and price but different descriptions are distinct variants, not duplicates",
  );

  const duplicateWithFalsePositive: ActualExtraction = {
    image_quality: { usable: true, issues: [] },
    items: [
      revueltosCard("Dos huevos naturales", 78, [
        { name: "salsa", price: null, grams: null },
      ]),
      revueltosCard("Dos huevos la mexicana", 84, []),
      revueltosCard("Con jamón, chorizo o tocino", 90, [
        { name: "jamón", price: null, grams: null },
        { name: "chorizo", price: null, grams: null },
        { name: "tocino", price: null, grams: null },
      ]),
    ],
  };
  assert(
    !scoreMenu(duplicateFixture, duplicateWithFalsePositive).options.pass,
    "options on unclaimed duplicate-name card count as false positive",
  );

  const duplicateWrongCardMatched: ActualExtraction = {
    image_quality: { usable: true, issues: [] },
    items: [
      revueltosCard("Dos huevos naturales", 78, [
        { name: "jamón", price: null, grams: null },
      ]),
      revueltosCard("Dos huevos la mexicana", 84, []),
      revueltosCard("Con jamón, chorizo o tocino", 90, []),
    ],
  };
  assert(
    !scoreMenu(duplicateFixture, duplicateWrongCardMatched).options.pass,
    "a target's price qualifier should reject a same-name card at the wrong price",
  );

  const recall = optionRecall(fixture, actual.items);
  assert(
    recall.found === 1 && recall.expected === 1,
    "option recall should count 1/1 on passing stub",
  );

  printReport([passing], aggregateReports([passing]));
  console.log("Self-check passed");
}

if (import.meta.main) {
  const offlineIndex = Deno.args.indexOf("--offline");
  if (Deno.args.includes("--self-check")) runSelfCheck();
  else if (offlineIndex !== -1) await offline(Deno.args[offlineIndex + 1]);
  else await main();
}
