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
  // True when this menu is expected to dense-signal the phase-1 detector
  // (fixture DATA, not menu-keyed code — the eval asserts the detector
  // verdict matches this for every menu, every run).
  dense?: boolean;
  // ORACLE-CHANGE 2026-07-12 (user-approved): per-fixture OVER-count band.
  // The items check exists to catch MISSING dishes; dense tile extraction
  // carries a stable 2-5 phantom over-count (model-level, geometry-independent
  // — ledger evals 052-053) that the post-release verification pass owns.
  // The -3 completeness floor stays strict for every menu.
  items_over_tolerance?: number;
  total_items: number;
  food_items: number;
  drink_items: number;
  categories: Category[];
  // Allowed-but-not-required food-scope categories: if they appear, they are
  // not spurious; if they do not appear, they are not missing.
  tolerated_categories?: Category[];
  tolerated_option_names?: string[];
  sections: string[];
  section_headers?: string[];
  // Sections that group only drink items — captured at F3 adjudication so the
  // data isn't lost, scored by Feature 5, ignored until then.
  drink_sections?: string[];
  section_expectations: {
    name_contains: string;
    section_title: string;
  }[];
  // Drink-item mappings parked for Feature 5, unscored until then.
  drink_section_expectations?: {
    name_contains: string;
    section_title: string;
  }[];
  // F4: per-item coarse-category pins (flat category only — the section half
  // is Feature 3's frozen check). Any-match semantics, like section_expectations.
  category_expectations?: {
    name_contains: string;
    category: Category;
  }[];
  // F4: printed item-weight pins (grams as printed on the menu; parseItemGrams
  // fills items[].grams). Any-match over food items.
  grams_expectations?: {
    name_contains: string;
    grams: number;
  }[];
  items_with_options: {
    name_contains: string;
    description_contains?: string;
    price?: number;
    // Eval 048 ruling: unchecked=true ⇒ the item's options are tolerated —
    // never a miss when absent, never false positives when present (the model
    // intermittently drops the printed line; same class as an UNCHECKED price).
    unchecked?: boolean;
    // F4: price/grams present ⇒ matched option's value must equal it (null =
    // "no per-option price printed"). Absent ⇒ unchecked (F2 name-only).
    options: {
      name: string;
      price?: number | null;
      grams?: number | null;
    }[];
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
  grams: DimensionScore;
  image_quality: DimensionScore | null;
}

interface AggregateReport {
  items: boolean;
  categories: boolean;
  section_context: boolean;
  options: boolean;
  grams: boolean;
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

function sectionKey(value: string): string {
  return normalize(value).replace(/[^a-z0-9]+/g, " ").trim();
}

// True when `hay` contains `want` with exactly one letter inserted or dropped
// ("chiplo" vs "chipo"). Exact containment is the caller's job (cheaper and
// unambiguous); short needles (<5 chars) never match — too easy to cross-match
// real near-name dishes. Substitutions intentionally unsupported.
function containsWithOneIndel(hay: string, want: string): boolean {
  if (want.length < 5) return false;
  // One char inserted in hay: some (want.length+1)-window minus one char = want.
  for (let i = 0; i + want.length + 1 <= hay.length; i++) {
    const window = hay.slice(i, i + want.length + 1);
    for (let j = 0; j < window.length; j++) {
      if (window.slice(0, j) + window.slice(j + 1) === want) return true;
    }
  }
  // One char dropped in hay: some (want.length-1)-window = want minus one char.
  for (let i = 0; i + want.length - 1 <= hay.length; i++) {
    const window = hay.slice(i, i + want.length - 1);
    for (let j = 0; j < want.length; j++) {
      if (want.slice(0, j) + want.slice(j + 1) === window) return true;
    }
  }
  return false;
}

function editDistanceLeq1(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

function tokensLookupMatch(hay: string, want: string): boolean {
  const hayTokens = hay.split(/\s+/).filter(Boolean);
  const wantTokens = want.split(/\s+/).filter(Boolean);
  let hayIndex = 0;
  for (const wantToken of wantTokens) {
    let matched = false;
    for (; hayIndex < hayTokens.length; hayIndex++) {
      const hayToken = hayTokens[hayIndex];
      const shortPlural = hayToken.length === 4 && wantToken === `${hayToken}s`;
      const tokenMatches = wantToken === hayToken || (
        shortPlural || (
          wantToken.length >= 5 &&
          hayToken.length >= 5 &&
          editDistanceLeq1(hayToken, wantToken)
        )
      );
      if (tokenMatches) {
        matched = true;
        hayIndex++;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
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
      if (names.some((name) => name.includes(normalize(expectedOption.name)))) {
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
    missingOptions: ExpectedFixture["items_with_options"][number]["options"];
    // F4: "name: price 84 (expected 90)" — price/grams value mismatches on
    // name-matched options.
    valueMismatches: string[];
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
        valueMismatches: [],
      };
    }
    consumed.add(index);
    const item = items[index];
    const names = item.options.map((option) => option.name);
    const missingOptions = target.options.filter((expected) =>
      !names.some((name) => normalize(name).includes(normalize(expected.name)))
    );
    const valueMismatches = target.options.flatMap((expected) => {
      const matched = item.options.find((option) =>
        normalize(option.name).includes(normalize(expected.name))
      );
      if (!matched) return [];
      const mismatches: string[] = [];
      if ("price" in expected && matched.price !== expected.price) {
        mismatches.push(
          `${expected.name}: price ${matched.price ?? "null"} (expected ${
            expected.price ?? "null"
          })`,
        );
      }
      if ("grams" in expected && matched.grams !== expected.grams) {
        mismatches.push(
          `${expected.name}: grams ${matched.grams ?? "null"} (expected ${
            expected.grams ?? "null"
          })`,
        );
      }
      return mismatches;
    });
    return {
      target,
      matchedItem: item.name,
      matchedOptions: names,
      missingOptions,
      valueMismatches,
    };
  });
  const falsePositives = items
    .filter((item, index) => {
      if (item.options.length === 0 || consumed.has(index)) return false;
      const tolerated = fixture.tolerated_option_names;
      return !(tolerated &&
        item.options.every((option) =>
          tolerated.some((name) => {
            const token = normalize(name);
            return token.length > 0 && normalize(option.name).includes(token);
          })
        ));
    })
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
      entry.target.options.map((option) => option.name).join(", ")
    }]`;
    if (entry.target.unchecked) {
      lines.push(
        `    · "${entry.target.name_contains}" UNCHECKED (tolerated) → ${
          entry.matchedItem === null
            ? "not matched"
            : `"${entry.matchedItem}" has [${entry.matchedOptions.join(", ")}]`
        }`,
      );
      continue;
    }
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
        }]; missing [${
          entry.missingOptions.map((option) => option.name).join(", ")
        }]`,
      );
    } else {
      lines.push(
        `    ✓ ${want} → "${entry.matchedItem}" has [${
          entry.matchedOptions.join(", ")
        }]`,
      );
    }
    for (const mismatch of entry.valueMismatches) {
      lines.push(`    $ VALUE MISMATCH ${mismatch}`);
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
    const key = `${normalize(item.name)}@${item.price}@${
      normalize(item.description)
    }`;
    if (seenKeys.has(key)) duplicateNames.add(normalize(item.name));
    else seenKeys.add(key);
  }
  const overTolerance = fixture.items_over_tolerance ?? 3;
  const items = {
    pass: itemDelta >= -3 && itemDelta <= overTolerance &&
      duplicateNames.size === 0,
    detail:
      `${distinctDishes.size}/${fixture.food_items} distinct food dishes; ${duplicateNames.size} duplicates; ${phantomHeaders} section-headers (→Feature 3)`,
  };

  // Feature 4 is food-scoped like Feature 3: the nikkori crop path drops
  // drinks before merge, so the drink category can never appear there —
  // drinks are Feature 5's dimension.
  const expectedCategories = new Set<Category>(
    fixture.categories.filter((category) => category !== "drink"),
  );
  const toleratedCategories = new Set<Category>(
    (fixture.tolerated_categories ?? []).filter((category) =>
      category !== "drink"
    ),
  );
  const actualCategories = new Set(foodItems.map((item) => item.category));
  const missingCategories = [...expectedCategories].filter((category) =>
    !actualCategories.has(category)
  );
  const spuriousCategories = [...actualCategories].filter((category) =>
    !expectedCategories.has(category) && !toleratedCategories.has(category)
  );
  // ANY name-matching food item with the expected category satisfies the pin —
  // impostor/duplicate same-name cards must not steal the check (F3 lesson).
  const wrongCategories = (fixture.category_expectations ?? []).flatMap(
    (expected) => {
      const exact = foodItems.filter((candidate) =>
        normalize(candidate.name).includes(normalize(expected.name_contains))
      );
      const matches = exact.length > 0
        ? exact
        : foodItems.filter((candidate) =>
          tokensLookupMatch(
            normalize(candidate.name),
            normalize(expected.name_contains),
          )
        );
      if (matches.length === 0) {
        return [`${expected.name_contains}→(item not found)`];
      }
      if (matches.some((item) => item.category === expected.category)) {
        return [];
      }
      return [
        `${matches[0].name}→${
          matches[0].category
        } (expected ${expected.category})`,
      ];
    },
  );
  const categories = {
    pass: missingCategories.length === 0 && spuriousCategories.length === 0 &&
      wrongCategories.length === 0,
    detail: `missing: ${missingCategories.join(", ") || "none"}; spurious: ${
      spuriousCategories.join(", ") || "none"
    }; wrong: ${wrongCategories.join("; ") || "none"}`,
  };

  const expectedSections = new Map(
    fixture.sections.map((section) => [sectionKey(section), section]),
  );
  // Feature 3 is food-scoped: the nikkori crop path drops drinks before merge,
  // so drink sections can never appear there — they are Feature 5's dimension.
  const actualSections = new Map(
    foodItems.flatMap((item) =>
      item.section_title
        ? [[sectionKey(item.section_title), item.section_title] as const]
        : []
    ),
  );
  const sectionSatisfies = (actualKey: string, expectedKey: string) =>
    actualKey === expectedKey || actualKey.startsWith(expectedKey + " ");
  const missingSections = [...expectedSections].filter(([key]) =>
    ![...actualSections.keys()].some((actualKey) =>
      sectionSatisfies(actualKey, key)
    )
  ).map(([, section]) => section);
  // section_headers are tolerated as section_titles (allowed, not required):
  // prose blocks (Pa' los Bukis) and parent headings whose subheading is on
  // another crop tile (Rollos) are legitimate model output, just never required.
  const toleratedSections = new Set(
    (fixture.section_headers ?? []).map(sectionKey),
  );
  const spuriousSections = [...actualSections].filter(([key]) =>
    ![...expectedSections.keys()].some((expectedKey) =>
      sectionSatisfies(key, expectedKey)
    ) && !toleratedSections.has(key)
  ).map(([, section]) => section);
  // ANY name-matching food item with the expected section satisfies the
  // expectation — crop overlap and stable misreads produce extra same-name
  // cards; the true item's mapping is what the check is about.
  const wrongMappings = fixture.section_expectations.flatMap((expected) => {
    const exact = foodItems.filter((candidate) =>
      normalize(candidate.name).includes(normalize(expected.name_contains))
    );
    // Tolerant fallback (user ruling, eval 055): one inserted or dropped
    // letter in a ≥5-char name is OCR transcription variance ("Chipo" →
    // "Chiplo"), not a different dish — this check verifies the MAPPING, not
    // the spelling (name fidelity was never a gated dimension). Substitutions
    // and short names stay strict so near-name dishes (Nico vs Pico) can
    // never cross-match. SECTION check only; categories/grams use ruling-14
    // fallback lookup.
    const matches = exact.length > 0
      ? exact
      : foodItems.filter((candidate) =>
        containsWithOneIndel(
          normalize(candidate.name),
          normalize(expected.name_contains),
        )
      );
    if (matches.length === 0) {
      return [`${expected.name_contains}→(item not found)`];
    }
    const satisfied = matches.some((item) =>
      sectionSatisfies(
        sectionKey(item.section_title ?? ""),
        sectionKey(expected.section_title),
      )
    );
    if (satisfied) return [];
    return [
      `${matches[0].name}→${
        matches[0].section_title ?? "null"
      } (expected ${expected.section_title})`,
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
    !entry.target.unchecked && (
      entry.matchedItem === null ||
      entry.matchedOptions.length === 0 ||
      entry.missingOptions.length > 0 ||
      entry.valueMismatches.length > 0
    )
  );
  const optionValueMismatches = optionsBreakdown.targets.flatMap((entry) =>
    entry.valueMismatches
  );
  const options = {
    pass: missingOptionItems.length === 0 &&
      optionsBreakdown.falsePositives.length === 0,
    detail:
      `missed targets: ${missingOptionItems.length}; false-positive items: ${optionsBreakdown.falsePositives.length}; value mismatches: ${
        optionValueMismatches.join("; ") || "none"
      }`,
  };

  // F4: printed-weight pins — any-match over food items (impostor same-name
  // cards must not steal the check), grams filled by parseItemGrams.
  const wrongGrams = (fixture.grams_expectations ?? []).flatMap((expected) => {
    const exact = foodItems.filter((candidate) =>
      normalize(candidate.name).includes(normalize(expected.name_contains))
    );
    const matches = exact.length > 0
      ? exact
      : foodItems.filter((candidate) =>
        tokensLookupMatch(
          normalize(candidate.name),
          normalize(expected.name_contains),
        )
      );
    if (matches.length === 0) {
      return [`${expected.name_contains}→(item not found)`];
    }
    if (matches.some((item) => item.grams === expected.grams)) return [];
    return [
      `${matches[0].name}→${
        matches[0].grams ?? "null"
      } (expected ${expected.grams})`,
    ];
  });
  const grams = {
    pass: wrongGrams.length === 0,
    detail: `wrong: ${wrongGrams.join("; ") || "none"}`,
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
    grams,
    image_quality: imageQuality,
  };
}

export function aggregateReports(reports: MenuReport[]): AggregateReport {
  const green = (
    dimension: "items" | "categories" | "section_context" | "options" | "grams",
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
    grams: green("grams"),
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
  | "grams"
  | "image_quality";

const GATE_DIMENSIONS: GateDimension[] = [
  "items",
  "categories",
  "section_context",
  "options",
  "grams",
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
      `  ${status(report.grams.pass)} grams: ${report.grams.detail}`,
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
  console.log(`  ${status(aggregate.grams)} grams`);
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
      options: [{ name: "Cheese" }],
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
        grams: null,
      },
      {
        name: "Fries",
        description: "",
        price: 4,
        category: "side",
        section_title: "Sides",
        options: [{ name: "Large", price: 2, grams: null }],
        grams: null,
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

  // Section-check tolerant lookup (user ruling, eval 055): one inserted or
  // dropped letter in a ≥5-char name_contains is OCR transcription variance
  // ("Chipo" → "Chiplo") — the check verifies the MAPPING, not the spelling.
  // Substitutions and short names stay strict so near-name dishes (Nico vs
  // Pico) can never cross-match.
  const capeadosFixture = (nameContains: string): ExpectedFixture => ({
    ...fixture,
    sections: ["Capeados"],
    section_headers: [],
    section_expectations: [
      { name_contains: nameContains, section_title: "Capeados" },
    ],
  });
  const capeadosItem = (name: string): ActualExtraction => ({
    image_quality: { usable: true, issues: [] },
    items: [{
      name,
      description: "",
      price: 159,
      category: "food",
      section_title: "Capeados",
      options: [],
      grams: null,
    }],
  });
  assert(
    scoreMenu(capeadosFixture("Chipo"), capeadosItem("Chiplo"))
      .section_context.pass,
    "one-indel name (Chiplo≈Chipo) must satisfy the section expectation",
  );
  assert(
    !scoreMenu(capeadosFixture("Chipo"), capeadosItem("Chapo"))
      .section_context.pass,
    "substitution (Chapo vs Chipo) must stay strict",
  );
  assert(
    !scoreMenu(capeadosFixture("Nico"), capeadosItem("Nixco"))
      .section_context.pass,
    "short names (<5 chars) must stay strict",
  );

  const prefixFixture: ExpectedFixture = {
    ...fixture,
    sections: ["Pizzas Bistro"],
    section_headers: [],
    section_expectations: [{
      name_contains: "Burger",
      section_title: "Pizzas Bistro",
    }],
  };
  const prefixItem = (section_title: string): ActualExtraction => ({
    image_quality: { usable: true, issues: [] },
    items: [{ ...actual.items[0], section_title }],
  });
  assert(
    scoreMenu(prefixFixture, prefixItem("Pizzas Bistro 28CM"))
      .section_context.pass,
    "an actual section may extend the required section with a word prefix",
  );
  assert(
    !scoreMenu(prefixFixture, prefixItem("Pizzas"))
      .section_context.pass,
    "a truncated actual section must not satisfy a longer required section",
  );
  assert(
    !scoreMenu(prefixFixture, prefixItem("Garden"))
      .section_context.pass,
    "an unrelated actual section must remain spurious",
  );
  assert(
    scoreMenu(prefixFixture, prefixItem("Pizzas Bistro"))
      .section_context.pass,
    "exact section equality must remain valid",
  );

  const punctuationFixture = (section: string): ExpectedFixture => ({
    ...fixture,
    sections: [section, "Sides"],
    section_headers: [],
    section_expectations: [
      { name_contains: "Burger", section_title: section },
      { name_contains: "Fries", section_title: "Sides" },
    ],
  });
  assert(
    scoreMenu(
      punctuationFixture("Pa'Compartir"),
      {
        ...actual,
        items: [
          { ...actual.items[0], section_title: "Pa Compartir" },
          actual.items[1],
        ],
      },
    ).section_context.pass,
    "apostrophe fixture section must match punctuation-free actual section",
  );
  assert(
    scoreMenu(
      punctuationFixture("Pa Compartir"),
      {
        ...actual,
        items: [
          { ...actual.items[0], section_title: "Pa'Compartir" },
          actual.items[1],
        ],
      },
    ).section_context.pass,
    "punctuation-free fixture section must match apostrophe actual section",
  );
  assert(
    !scoreMenu(
      punctuationFixture("Pa'Compartir"),
      {
        ...actual,
        items: [
          { ...actual.items[0], section_title: "Pa Beber" },
          actual.items[1],
        ],
      },
    ).section_context.pass,
    "genuinely different sections must remain distinct",
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
        grams: null,
      },
      {
        name: "Soup",
        description: "",
        price: 5,
        category: "other",
        section_title: "Soups",
        options: [],
        grams: null,
      },
      {
        name: "Cake",
        description: "",
        price: 6,
        category: "dessert",
        section_title: "Desserts",
        options: [],
        grams: null,
      },
      {
        name: "Toast",
        description: "",
        price: 7,
        category: "food",
        section_title: "Mains",
        options: [],
        grams: null,
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
        grams: null,
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
        grams: null,
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
    grams: null,
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
  // section_headers are TOLERATED as section_titles (allowed, not required) —
  // Pa' los Bukis / parent headings under crop reality must not flag spurious.
  const headerTitled = scoreMenu(
    { ...fixture, section_headers: ["Specials"] },
    {
      image_quality: { usable: true, issues: [] },
      items: [
        ...actual.items,
        {
          name: "Combo del día",
          description: "",
          price: 7,
          category: "food",
          section_title: "Specials",
          options: [],
          grams: null,
        },
      ],
    },
  );
  assert(
    headerTitled.section_context.pass,
    "a section_headers entry used as section_title must not be spurious",
  );
  // Duplicate/impostor name-matches: the expectation passes when ANY matching
  // food item carries the expected section (crop overlap and stable misreads
  // produce extra same-name cards; the true item's mapping is what matters).
  const anyMatch = scoreMenu(fixture, {
    image_quality: { usable: true, issues: [] },
    items: [
      { ...actual.items[0], section_title: "Sides" },
      actual.items[1],
      { ...actual.items[0] },
    ],
  });
  assert(
    anyMatch.section_context.pass,
    "expectation must pass when any name-matching item has the expected section",
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
  const toleratedOptionFixture = {
    ...fixture,
    tolerated_option_names: ["Queso"],
  } as ExpectedFixture & { tolerated_option_names: string[] };
  const optioned = (options: string[]): ExtractedMenuItem => ({
    name: "Unconsumed",
    description: "",
    price: 10,
    category: "food",
    section_title: null,
    options: options.map((name) => ({ name, price: 10, grams: null })),
    grams: null,
  });
  assert(
    optionBreakdown(toleratedOptionFixture, [optioned(["Queso"])])
      .falsePositives
      .length === 0,
    "tolerated option names must not count as false positives",
  );
  assert(
    optionBreakdown(toleratedOptionFixture, [
      optioned(["Agrega queso a tus papas"]),
    ]).falsePositives.length === 0,
    "tolerated option names match upsell phrasing by substring",
  );
  assert(
    optionBreakdown(toleratedOptionFixture, [optioned(["Extra Bacon"])])
      .falsePositives.length === 1,
    "unrelated option names remain false positives",
  );
  assert(
    optionBreakdown(toleratedOptionFixture, [
      optioned(["Queso", "Fabricada"]),
    ]).falsePositives.length === 1,
    "an item with a non-tolerated option must remain a false positive",
  );
  assert(
    optionBreakdown(fixture, [optioned(["Queso"])]).falsePositives.length === 1,
    "fixtures without tolerated option names keep existing behavior",
  );
  const missedBreakdown = optionBreakdown(fixture, [
    { ...actual.items[0], options: [] },
    actual.items[1],
  ]);
  assert(
    missedBreakdown.targets[0].matchedItem === "House Burger" &&
      missedBreakdown.targets[0].matchedOptions.length === 0 &&
      missedBreakdown.targets[0].missingOptions.map((option) => option.name)
          .join(",") === "Cheese",
    "breakdown reports a matched item extracted with no options",
  );

  const accentFixture: ExpectedFixture = {
    ...fixture,
    items_with_options: [{
      name_contains: "Marlín",
      options: [{ name: "Camarón" }],
    }],
  };
  const accentTarget = optionBreakdown(accentFixture, [{
    name: "Machaca de Marlin",
    description: "",
    price: 98,
    category: "food",
    section_title: null,
    options: [{ name: "camaron", price: null, grams: null }],
    grams: null,
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
    grams: null,
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

  // ORACLE-CHANGE 2026-07-12: per-fixture over-count tolerance widens ONLY
  // the upper band; the -3 completeness floor stays strict.
  const wideFixture: ExpectedFixture = { ...fixture, items_over_tolerance: 6 };
  assert(
    scoreMenu(wideFixture, {
      ...actual,
      items: [
        ...actual.items,
        ...["S1", "S2", "S3", "S4", "S5", "S6"].map(filler),
      ],
    }).items.pass,
    "over-tolerance 6: +6 items should pass",
  );
  assert(
    !scoreMenu(wideFixture, {
      ...actual,
      items: [
        ...actual.items,
        ...["S1", "S2", "S3", "S4", "S5", "S6", "S7"].map(filler),
      ],
    }).items.pass,
    "over-tolerance 6: +7 items should fail",
  );
  assert(
    !scoreMenu(
      { ...wideFixture, food_items: 6 },
      { ...actual, items: actual.items },
    ).items.pass,
    "over-tolerance must not loosen the -3 completeness floor",
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
        options: [{ name: "Jamón" }, { name: "Chorizo" }, { name: "Tocino" }],
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
    grams: null,
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
          grams: null,
        },
        {
          name: "Chilaquiles",
          description: "Divorciados",
          price: 138,
          category: "food",
          section_title: "Mains",
          options: [],
          grams: null,
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

  // F4: categories is food-scoped — drink in fixture.categories is ignored
  // (nikkori crop path drops drinks pre-merge), and per-item pins use the
  // same any-match semantics as section_expectations.
  const catFixture: ExpectedFixture = {
    ...fixture,
    categories: ["food", "dessert", "drink"],
    category_expectations: [
      { name_contains: "Flan", category: "dessert" },
    ],
  };
  const catItems = (
    overrides: Partial<ExtractedMenuItem>[],
  ): ActualExtraction => ({
    image_quality: { usable: true, issues: [] },
    items: overrides.map((o) => ({
      name: "",
      description: "",
      price: null,
      category: "food" as const,
      section_title: null,
      options: [],
      grams: null,
      ...o,
    })),
  });
  assert(
    scoreMenu(
      catFixture,
      catItems([
        { name: "Rib Eye", category: "food" },
        { name: "Flan", category: "dessert" },
      ]),
    ).categories.pass,
    "food-scoped categories: missing drink category must not fail",
  );
  const flanWrong = scoreMenu(
    catFixture,
    catItems([
      { name: "Rib Eye", category: "food" },
      { name: "Flan", category: "food" },
      { name: "Brownie", category: "dessert" },
    ]),
  );
  assert(
    !flanWrong.categories.pass &&
      flanWrong.categories.detail.includes("Flan→food (expected dessert)"),
    "category pin: Flan mislabeled food must fail even when the set matches",
  );
  const papaFixture: ExpectedFixture = {
    ...fixture,
    categories: ["side"],
    category_expectations: [{
      name_contains: "Papas Sazonadas",
      category: "side",
    }],
  };
  const papaCategory = scoreMenu(
    papaFixture,
    catItems([
      { name: "Papa Sazonada (350gr)", category: "side", grams: 350 },
    ]),
  );
  assert(
    papaCategory.categories.pass &&
      !papaCategory.categories.detail.includes("(item not found)"),
    "ruling 14 category lookup: Papa Sazonada matches Papas Sazonadas",
  );
  const papaGramsFixture: ExpectedFixture = {
    ...fixture,
    grams_expectations: [{ name_contains: "Papas Sazonadas", grams: 300 }],
  };
  const papaGrams = scoreMenu(
    papaGramsFixture,
    catItems([
      { name: "Papa Sazonada (350gr)", category: "side", grams: 350 },
    ]),
  );
  assert(
    papaGrams.grams.detail.includes(
      "Papa Sazonada (350gr)→350 (expected 300)",
    ) && !papaGrams.grams.detail.includes("(item not found)"),
    "ruling 14 grams lookup: name tolerance preserves strict value mismatch",
  );
  const nameGuardFixture: ExpectedFixture = {
    ...fixture,
    categories: ["food"],
    category_expectations: [
      { name_contains: "Nico", category: "food" },
      { name_contains: "Boneless Buffalo", category: "food" },
    ],
  };
  const nameGuards = scoreMenu(
    nameGuardFixture,
    catItems([
      { name: "Pico", category: "food" },
      { name: "Boneless Barbecue", category: "food" },
    ]),
  );
  assert(
    nameGuards.categories.detail.includes("Nico→(item not found)") &&
      nameGuards.categories.detail.includes(
        "Boneless Buffalo→(item not found)",
      ),
    "ruling 14 guards: short and distinct near-names never cross-match",
  );
  assert(
    scoreMenu(
      catFixture,
      catItems([
        { name: "Rib Eye", category: "food" },
        { name: "Flan", category: "other" },
        { name: "Flan", category: "dessert" },
      ]),
    ).categories.pass === false,
    "spurious category (other) must fail even when the pin is satisfied by any-match",
  );
  const toleratedCatFixture: ExpectedFixture = {
    ...fixture,
    categories: ["food"],
    tolerated_categories: ["dessert"],
  };
  assert(
    scoreMenu(
      toleratedCatFixture,
      catItems([
        { name: "Rib Eye", category: "food" },
        { name: "Flan", category: "dessert" },
      ]),
    ).categories.pass,
    "tolerated category present: dessert must not be spurious",
  );
  assert(
    scoreMenu(
      toleratedCatFixture,
      catItems([
        { name: "Rib Eye", category: "food" },
      ]),
    ).categories.pass,
    "tolerated category absent: dessert must not be missing",
  );
  assert(
    !scoreMenu(
      toleratedCatFixture,
      catItems([
        { name: "Rib Eye", category: "food" },
        { name: "Soup", category: "other" },
      ]),
    ).categories.pass,
    "category outside required+tolerated sets must stay spurious",
  );

  // F4: a present price/grams key on an expected option is verified against
  // the matched option; absent keys keep F2's name-only semantics.
  const priceFixture: ExpectedFixture = {
    ...fixture,
    items_with_options: [{
      name_contains: "Revueltos",
      options: [{ name: "jamón", price: 90 }],
    }],
  };
  const revueltosAt = (price: number | null): ActualExtraction => ({
    image_quality: { usable: true, issues: [] },
    items: [{
      name: "Revueltos",
      description: "Dos huevos naturales",
      price: 78,
      category: "food",
      section_title: "Huevos",
      options: [{ name: "Con jamón, chorizo o tocino", price, grams: null }],
      grams: null,
    }],
  });
  assert(
    scoreMenu(priceFixture, revueltosAt(90)).options.pass,
    "option price check: matching printed price must pass",
  );
  const priceWrong = scoreMenu(priceFixture, revueltosAt(84));
  assert(
    !priceWrong.options.pass,
    "option price check: 84 vs printed 90 must fail options",
  );
  const noPriceKeyFixture: ExpectedFixture = {
    ...fixture,
    items_with_options: [{
      name_contains: "Revueltos",
      options: [{ name: "jamón" }],
    }],
  };
  assert(
    scoreMenu(noPriceKeyFixture, revueltosAt(84)).options.pass,
    "absent price key: name-only semantics (F2 frozen) must still pass",
  );

  // Eval 048 ruling: unchecked=true tolerates the item's options both ways —
  // present options are consumed (not false positives), absent options are
  // not a miss. Plato Surtido's intermittently-dropped printed line.
  const uncheckedFixture: ExpectedFixture = {
    ...fixture,
    items_with_options: [{
      name_contains: "Revueltos",
      unchecked: true,
      options: [],
    }],
  };
  assert(
    scoreMenu(uncheckedFixture, revueltosAt(84)).options.pass,
    "unchecked target: extracted options must not count as false positives",
  );
  assert(
    scoreMenu(uncheckedFixture, {
      image_quality: { usable: true, issues: [] },
      items: [{ ...revueltosAt(84).items[0], options: [] }],
    }).options.pass,
    "unchecked target: absent options must not count as a miss",
  );

  // F4: grams pins — any-match over food items, same semantics as the
  // category/section pins.
  const gramsFixture: ExpectedFixture = {
    ...fixture,
    grams_expectations: [{ name_contains: "Chilaquiles", grams: 70 }],
  };
  assert(
    scoreMenu(
      gramsFixture,
      catItems([
        { name: "CHILAQUILES (70gr.)", grams: 70 },
      ]),
    ).grams.pass,
    "grams pin: parsed printed weight must pass",
  );
  const gramsWrong = scoreMenu(
    gramsFixture,
    catItems([
      { name: "CHILAQUILES (650gr.)", grams: 650 },
    ]),
  );
  assert(
    !gramsWrong.grams.pass &&
      gramsWrong.grams.detail.includes("(expected 70)"),
    "grams pin: digit-misread weight must fail with named diagnostic",
  );
  const gramsGuardFixture: ExpectedFixture = {
    ...fixture,
    grams_expectations: [{ name_contains: "Boneless Buffalo", grams: 150 }],
  };
  const gramsGuard = scoreMenu(
    gramsGuardFixture,
    catItems([
      { name: "Boneless Barbecue", grams: 150 },
    ]),
  );
  assert(
    gramsGuard.grams.detail.includes("Boneless Buffalo→(item not found)"),
    "ruling 14 grams guard: Buffalo must not match Barbecue",
  );
  assert(
    scoreMenu(fixture, catItems([{ name: "X" }])).grams.pass,
    "no grams_expectations: dimension passes vacuously",
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
