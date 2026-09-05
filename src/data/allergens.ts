/** Allergens the analyzer currently returns. Store values, display labels.
 *
 *  🔑 THIS LIST IS DERIVED FROM WHAT THE MODEL ACTUALLY EMITS, not from a
 *  standard. Measured 2026-09-05 (eval 191) over 1,115 archived responses and
 *  27,188 allergen strings: only 16 distinct strings exist across the whole
 *  corpus, and 99.4% were already in the 9 values this list started with.
 *
 *  The three added below — sulfites, coconut, mustard — were the bug that scan
 *  found. The model had been detecting them all along (91 occurrences), and
 *  `VALID_ALLERGENS` in allergens.store.ts silently dropped them because a user
 *  could never select what was not on this list. That is a live gap in the one
 *  filter carrying a safety disclaimer.
 *
 *  ⚠️ ON-CORPUS. Those are our 10 fixture menus — real Spanish and mixed-language
 *  ones, which is the regime that matters, but ten menus are not the world. A
 *  Japanese or Thai menu is unmeasured. Do not quote 99.4% without that word.
 *
 *  ⚠️ NOT a substitute for the standing allergen disclaimer. `AGENTS.md` fixes
 *  its wording and this file cannot weaken it: our reading is AI-estimated and
 *  must be confirmed with restaurant staff.
 *
 *  ❌ `pork` (46 occurrences) is deliberately NOT here. It is a dietary or
 *  religious restriction, not an allergen, so it belongs in the "ingredients to
 *  avoid" half — where a match flags a dish rather than hiding it. Adding it
 *  here would silently hide dishes from someone who merely prefers to skip it.
 */
export const ALLERGENS: { value: string; label: string }[] = [
  { value: "dairy", label: "Dairy" },
  { value: "egg", label: "Egg" },
  { value: "fish", label: "Fish" },
  { value: "shellfish", label: "Shellfish" },
  { value: "nuts", label: "Tree nuts" },
  { value: "peanuts", label: "Peanuts" },
  { value: "gluten", label: "Wheat/Gluten" },
  { value: "soy", label: "Soy" },
  { value: "sesame", label: "Sesame" },
  { value: "sulfites", label: "Sulfites" },
  { value: "coconut", label: "Coconut" },
  { value: "mustard", label: "Mustard" },
];

/** Model spellings that mean a value we already carry. The model is asked for
 *  allergens in prose, so it occasionally answers in the singular or with a
 *  space — `peanut` for `peanuts`, `tree nuts` for `nuts`. Normalising on READ
 *  is the cheap fix: it needs no prompt change, and prose instructions have a
 *  0-for-6 record on this pipeline. */
const ALIASES: Record<string, string> = {
  peanut: "peanuts",
  "tree nuts": "nuts",
  "tree nut": "nuts",
  nut: "nuts",
  egg: "egg",
  eggs: "egg",
  sulphites: "sulfites",
  shellfish: "shellfish",
  crustacean: "shellfish",
  crustaceans: "shellfish",
  gluten: "gluten",
  wheat: "gluten",
  milk: "dairy",
};

/** Canonical value for one allergen string as the model wrote it. Returns null
 *  for anything we do not carry — including `none`, which the prompt tells the
 *  model not to emit and which it emits anyway (34 times). */
export function canonicalAllergen(raw: string): string | null {
  const key = raw.trim().toLowerCase();
  if (key.length === 0 || key === "none") return null;
  const mapped = ALIASES[key] ?? key;
  return ALLERGENS.some((a) => a.value === mapped) ? mapped : null;
}

/** An item's allergens, canonicalised and de-duplicated. Use this for matching
 *  rather than reading `item.allergens` directly, or `peanut` misses `peanuts`. */
export function canonicalAllergens(raw: string[]): string[] {
  const out = new Set<string>();
  for (const value of raw) {
    const canonical = canonicalAllergen(value);
    if (canonical !== null) out.add(canonical);
  }
  return [...out];
}

export function allergenLabel(value: string): string {
  return ALLERGENS.find((allergen) => allergen.value === value)?.label ?? value;
}
