/** Allergens the analyzer currently returns. Store values, display labels. */
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
];

export function allergenLabel(value: string): string {
  return ALLERGENS.find((allergen) => allergen.value === value)?.label ?? value;
}
