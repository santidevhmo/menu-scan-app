// FNDDS PORTION RESOLVER — turn "1 cup of beans" into grams from a PUBLISHED table.
//
// Why this exists: eval 178 established that the low-mass prior is a property of the
// MODEL CLASS, not of our prompt (Fridolfsson 2025; a competitor with no structural
// correction lands at 0.35x the USDA anchor where we sit at 0.69x). So the grams must
// come from outside the model. `FORM_G` does that with 18 hardcoded rows and covers
// 33% of dishes off-corpus; this does it with FNDDS's ~30,000 published portions.
//
// The model NAMES and COUNTS. It never supplies a gram. That split is the whole point.
//
// ── MEASURED CONSTRAINTS, 2026-08-23. Every one of these cost a debugging cycle. ──
//
// 1. THE API 404s ON ~41% OF ATTEMPTS with 3533 of the hourly 3600 unused. It is
//    FLAKY, not rate-limited, and the failures are random - not tied to pageSize,
//    query text, or any parameter. The fix is MANY SHORT retries. An exponential
//    backoff sleeps straight through a failure a 0.4 s retry clears; that stalled a
//    probe for five minutes looking like a hang.
// 2. KEEP SR Legacy AND Foundation, not just Survey (FNDDS). The oracle cites SR
//    Legacy records (172475 tofu, 169641 jams), so an FNDDS-only filter cannot find
//    its own citations. Measured recall went 54.5% -> 89.6% once this was fixed.
// 3. DROP Branded. Hundreds of thousands of brand products flood the ranking and push
//    the survey record past rank 20. Dropping them moved recall@5 84.4% -> 89.6%.
// 4. PREFER THE STANDALONE RECORD OVER "as ingredient" FOR PORTIONS. FNDDS's
//    `Rice, white, cooked, as ingredient` publishes NO cup measure - only fluid
//    ounces - while the standalone rice record does. The oracle leans on
//    "as ingredient" records and they carry the worse portion data.
// 5. NEVER put this API in the scan path. 41% failure at ~1.4 s per resolved query,
//    times a dozen ingredients, times a menu, is not a user-facing request. This
//    module is for OFFLINE table building and benchmark scoring. Production ships the
//    CC0 bulk download.

const BASE = "https://api.nal.usda.gov/fdc/v1";
const CACHE_PATH = new URL("./fixtures/fndds-cache.json", import.meta.url);

/** Survey (FNDDS) is the composed-restaurant-dish set; the other two carry raw foods. */
const KEEP_TYPES = new Set(["Survey (FNDDS)", "SR Legacy", "Foundation"]);

export interface Portion {
  desc: string;
  grams: number;
}

export interface FnddsRecord {
  fdcId: number;
  desc: string;
  dataType: string;
  per100g: { protein: number; carb: number; fat: number };
  portions: Portion[];
}

interface CacheShape {
  search: Record<string, number[]>;
  food: Record<string, FnddsRecord>;
}

let cache: CacheShape = { search: {}, food: {} };
let dirty = 0;

export async function loadCache(): Promise<void> {
  try {
    cache = JSON.parse(await Deno.readTextFile(CACHE_PATH));
    cache.search ??= {};
    cache.food ??= {};
  } catch {
    cache = { search: {}, food: {} };
  }
}

export async function saveCache(): Promise<void> {
  await Deno.writeTextFile(CACHE_PATH, JSON.stringify(cache));
  dirty = 0;
}

/** Constraint 1: many short retries, never exponential backoff. */
async function get(path: string, params: Record<string, string>): Promise<unknown> {
  const key = Deno.env.get("USDA_FDC_API_KEY");
  if (!key) throw new Error("USDA_FDC_API_KEY is required");
  const url = `${BASE}/${path}?${new URLSearchParams({ ...params, api_key: key })}`;
  let last: unknown;
  for (let i = 0; i < 15; i++) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      last = e;
      // Drain nothing; a failed fetch has no body to release here.
      await new Promise((res) => setTimeout(res, 400));
    }
  }
  throw last;
}

const NUTRIENT: Record<string, "protein" | "carb" | "fat"> = {
  "Protein": "protein",
  "Carbohydrate, by difference": "carb",
  "Total lipid (fat)": "fat",
};

/**
 * Top candidate FDC ids for a free-text ingredient name.
 *
 * 🔑 USE POST, NOT GET. Measured 2026-08-23: `dataType` as a GET query param is
 * unusable - `Survey (FNDDS)` 400s (the parentheses break it) and a comma list 404s -
 * so an earlier note in this project concluded "filter client-side". That conclusion
 * is WRONG and it silently loses the most valuable records: a GET for common food
 * words returns 60 of 60 BRANDED products, because ~300k brand items bury the few
 * hundred reference ones. `black beans`, `tomato sauce`, `crema` and `tortilla chips`
 * all resolved to NOTHING that way.
 *
 * The POST endpoint accepts the same filter as a JSON array and honours it: `black
 * beans` -> "Black bean salad" [Survey (FNDDS)], `chilaquiles` -> "Chilaquiles".
 */
async function searchPost(term: string): Promise<number[]> {
  const key = Deno.env.get("USDA_FDC_API_KEY");
  if (!key) throw new Error("USDA_FDC_API_KEY is required");
  const url = `${BASE}/foods/search?api_key=${encodeURIComponent(key)}`;
  const body = JSON.stringify({
    query: term,
    dataType: [...KEEP_TYPES],
    pageSize: 25,
  });
  let last: unknown;
  for (let i = 0; i < 15; i++) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      // deno-lint-ignore no-explicit-any
      const d = await r.json() as any;
      // deno-lint-ignore no-explicit-any
      return (d.foods ?? []).map((f: any) => f.fdcId as number).slice(0, 20);
    } catch (e) {
      last = e;
      await new Promise((res) => setTimeout(res, 400));
    }
  }
  throw last;
}

export async function shortlist(term: string, n = 5): Promise<number[]> {
  const k = term.toLowerCase().trim();
  // An EMPTY result is never cached. Caching one turned four staples - black beans,
  // tomato sauce, crema, tortilla chips - into permanent misses after a single bad
  // response, and a negative cache entry is indistinguishable from a real absence.
  if (cache.search[k]?.length) return cache.search[k].slice(0, n);
  const ids = await searchPost(term);
  if (ids.length) {
    cache.search[k] = ids;
    if (++dirty % 20 === 0) await saveCache();
  }
  return ids.slice(0, n);
}

/**
 * Returns null rather than throwing when a record cannot be fetched.
 *
 * 🪤 SOME IDS THAT `foods/search` RETURNS 404 ON THE DETAIL ENDPOINT, PERMANENTLY.
 * This project already hit it once (`2705827` "Beef, steak, flank" 404'd four times
 * while search returned it instantly), and it killed a paid benchmark run here: 15
 * retries all 404'd, `Promise.all` rejected, and the whole arm died AFTER the model
 * calls had been paid for. An unfetchable candidate is a missing candidate, never a
 * lost run.
 */
export async function food(fdcId: number): Promise<FnddsRecord | null> {
  const k = String(fdcId);
  if (cache.food[k]) return cache.food[k];
  // deno-lint-ignore no-explicit-any
  let d: any;
  try {
    d = await get(`food/${fdcId}`, {});
  } catch {
    return null;
  }
  const per100g = { protein: 0, carb: 0, fat: 0 };
  for (const n of d.foodNutrients ?? []) {
    const name = n.nutrient?.name ?? n.nutrientName;
    const slot = NUTRIENT[name];
    if (slot) per100g[slot] = n.amount ?? n.value ?? 0;
  }
  const portions: Portion[] = (d.foodPortions ?? [])
    // deno-lint-ignore no-explicit-any
    .filter((p: any) => p.gramWeight)
    // deno-lint-ignore no-explicit-any
    .map((p: any) => ({
      desc: (p.portionDescription ?? p.modifier ?? "").trim(),
      grams: p.gramWeight as number,
    }));
  const rec: FnddsRecord = {
    fdcId,
    desc: d.description ?? "",
    dataType: d.dataType ?? "",
    per100g,
    portions,
  };
  cache.food[k] = rec;
  if (++dirty % 20 === 0) await saveCache();
  return rec;
}

/**
 * The units the model may answer in. Every one must be convertible from a published
 * portion string, or the constraint is theatre. Ordered roughly by how often FNDDS
 * publishes them.
 */
export const UNIT_ENUM = [
  "cup",
  "tablespoon",
  "teaspoon",
  "piece",
  "slice",
  "ounce",
  "fillet",
  "breast",
  "link",
  "patty",
  "leaf",
  "clove",
  "packet",
  "whole",
] as const;
export type Unit = typeof UNIT_ENUM[number];

/** Synonyms a published portion string may use for each unit. */
const UNIT_WORDS: Record<Unit, string[]> = {
  cup: ["cup"],
  tablespoon: ["tablespoon", "tbsp"],
  teaspoon: ["teaspoon", "tsp"],
  piece: ["piece", "pieces", "pc"],
  slice: ["slice"],
  ounce: ["oz", "ounce"],
  fillet: ["fillet", "filet"],
  breast: ["breast"],
  link: ["link"],
  patty: ["patty"],
  leaf: ["leaf"],
  clove: ["clove"],
  packet: ["packet", "package"],
  whole: ["whole", "each", "entire"],
};

/**
 * Grams for ONE of `unit` from a record's published portions.
 *
 * A portion string looks like "1 cup", "1 tablespoon", "1 medium pizza (11-12\")".
 * We want the per-unit weight, so a leading count is divided back out: "2 slices" at
 * 60 g is 30 g per slice.
 */
export function gramsPerUnit(rec: FnddsRecord, unit: Unit): number | null {
  const words = UNIT_WORDS[unit];
  for (const p of rec.portions) {
    const d = p.desc.toLowerCase();
    // `s?` because published portions pluralise freely - "2 slices", "3 pieces".
    // Without it a leading count above 1 never matches, which is exactly the case
    // the per-unit division below exists to handle.
    if (!words.some((w) => new RegExp(`\\b${w}s?\\b`).test(d))) continue;
    const lead = d.match(/^\s*(\d+(?:\.\d+)?)/);
    const count = lead ? parseFloat(lead[1]) : 1;
    if (count > 0) return p.grams / count;
  }
  return null;
}

/**
 * Constraint 4. Between two records for the same food, the one WITHOUT "as
 * ingredient" carries the better portion table, so it wins on ties.
 */
export function preferStandalone(recs: FnddsRecord[]): FnddsRecord[] {
  return [...recs].sort((a, b) => {
    const ai = /as ingredient/i.test(a.desc) ? 1 : 0;
    const bi = /as ingredient/i.test(b.desc) ? 1 : 0;
    return ai - bi;
  });
}

export interface Resolved {
  fdcId: number;
  desc: string;
  grams: number;
  per100g: { protein: number; carb: number; fat: number };
  /** How the grams were obtained, so a run can be audited rather than trusted. */
  via: "published-portion" | "model-grams";
}

/**
 * Resolve one recipe line to grams + composition.
 *
 * `chosenFdcId` is the record the MODEL picked from our shortlist - the +9 points the
 * probe measured over taking the search engine's top hit (80.5% -> 89.6% recall).
 * Falls back to the shortlist head when the model's pick is not among the candidates.
 */
export async function resolveLine(
  name: string,
  amount: number,
  unit: Unit | "gram",
  chosenFdcId?: number,
): Promise<Resolved | null> {
  const ids = await shortlist(name, 5);
  if (!ids.length) return null;
  const id = chosenFdcId && ids.includes(chosenFdcId) ? chosenFdcId : ids[0];
  const fetched = await Promise.all(
    [id, ...ids.filter((x) => x !== id)].slice(0, 3).map(food),
  );
  const recs = preferStandalone(fetched.filter((r): r is FnddsRecord => r !== null));
  if (!recs.length) return null;
  const primary = recs.find((r) => r.fdcId === id) ?? recs[0];

  if (unit === "gram") {
    return {
      fdcId: primary.fdcId,
      desc: primary.desc,
      grams: amount,
      per100g: primary.per100g,
      via: "model-grams",
    };
  }
  // Composition always comes from the record the model picked; the WEIGHT may come
  // from a sibling standalone record, which is the one with the usable portion table.
  for (const r of recs) {
    const g = gramsPerUnit(r, unit);
    if (g != null) {
      return {
        fdcId: primary.fdcId,
        desc: primary.desc,
        grams: amount * g,
        per100g: primary.per100g,
        via: "published-portion",
      };
    }
  }
  return null;
}
