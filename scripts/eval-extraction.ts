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
  categories: Category[];
  sections: string[];
  section_headers?: string[];
  section_expectations: {
    name_contains: string;
    section_title: string;
  }[];
  items_with_options: {
    name_contains: string;
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

function normalize(value: string): string {
  return value.toLocaleLowerCase().trim().replaceAll(/\s+/g, " ");
}

export function scoreMenu(
  fixture: ExpectedFixture,
  actual: ActualExtraction,
): MenuReport {
  const itemDelta = actual.items.length - fixture.total_items;
  const headers = new Set(
    [...fixture.sections, ...(fixture.section_headers ?? [])].map(normalize),
  );
  const phantomHeaders =
    actual.items.filter((item) => headers.has(normalize(item.name))).length;
  const items = {
    pass: Math.abs(itemDelta) <= 3 && phantomHeaders === 0,
    detail:
      `${actual.items.length}/${fixture.total_items} items; ${phantomHeaders} section-header items`,
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
  const actualSections = new Map(
    actual.items.flatMap((item) =>
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
  const incorrectMappings = fixture.section_expectations.filter((expected) => {
    const item = actual.items.find((candidate) =>
      normalize(candidate.name).includes(normalize(expected.name_contains))
    );
    return !item ||
      normalize(item.section_title ?? "") !== normalize(expected.section_title);
  });
  const sectionContext = {
    pass: missingSections.length === 0 &&
      spuriousSections.length === 0 &&
      incorrectMappings.length === 0,
    detail: `missing: ${missingSections.join(", ") || "none"}; spurious: ${
      spuriousSections.join(", ") || "none"
    }; wrong item mappings: ${incorrectMappings.length}`,
  };

  const expectedOptionItems = fixture.items_with_options;
  const missingOptionItems = expectedOptionItems.filter((expected) => {
    const item = actual.items.find((candidate) =>
      normalize(candidate.name).includes(normalize(expected.name_contains))
    );
    return !item || item.options.length === 0 ||
      expected.options.some((expectedOption) =>
        !item.options.some((actualOption) =>
          normalize(actualOption.name).includes(normalize(expectedOption))
        )
      );
  });
  const falsePositiveOptions = actual.items.filter((item) =>
    item.options.length > 0 &&
    !expectedOptionItems.some((expected) =>
      normalize(item.name).includes(normalize(expected.name_contains))
    )
  );
  const options = {
    pass: missingOptionItems.length === 0 && falsePositiveOptions.length === 0,
    detail:
      `missed targets: ${missingOptionItems.length}; false-positive items: ${falsePositiveOptions.length}`,
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

  return await Promise.all(
    names.sort().map(async (name) =>
      JSON.parse(
        await Deno.readTextFile(new URL(name, FIXTURE_DIR)),
      ) as ExpectedFixture
    ),
  );
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
  }

  const aggregate = aggregateReports(reports);
  printReport(reports, aggregate);
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
    const raw = JSON.parse(
      await Deno.readTextFile(`${dir}/${fixture.menu}.actual.json`),
    ) as ActualExtraction;
    reports.push(scoreMenu(fixture, {
      image_quality: raw.image_quality,
      items: postprocessItems(raw.items),
    }));
  }
  printReport(reports, aggregateReports(reports));
}

function runSelfCheck(): void {
  assert(imageMimeType("menu.png") === "image/png", "PNG MIME type");
  assert(imageMimeType("menu.jpg") === "image/jpeg", "JPEG MIME type");

  const fixture: ExpectedFixture = {
    menu: "stub",
    photos: ["stub.jpg"],
    total_items: 2,
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
    ],
  });
  assert(
    !failing.items.pass,
    "item score should catch count and header errors",
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
    !scoreMenu(fixture, {
      ...actual,
      items: actual.items.map((item) =>
        item.name === "Fries" ? { ...item, options: [] } : item
      ),
    }).options.pass,
    "an unnamed options target should still require an extracted option",
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
