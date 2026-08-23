// The FORM arm, eval 176 — now a thin shim over the SHIPPED code.
//
// Everything this arm does lives in supabase/functions/analyze-menu/dish-form.ts,
// which is what production runs. This file exists only so the benchmark can name
// an arm, and it deliberately holds no logic: a harness copy of the table or the
// rescale is exactly how bench-macros.ts once drifted from production and cost a
// wasted paid run. If the benchmark and production ever disagree about what
// `FORM` means, that is a bug in one line of re-export rather than in two
// implementations.
//
// ⚠️ The hand labels in dish-forms.ts are the ANSWER KEY. Nothing here may import
// them - an arm that reads them is not an arm.
export {
  applyFormMass,
  callGptEnrichFormSized,
  FORM_ENUM,
  FORM_G,
  FORM_LABEL_PROMPT,
  FORM_LABEL_SCHEMA,
  labelForms,
} from "../supabase/functions/analyze-menu/dish-form.ts";

import { callGptEnrichFormSized } from "../supabase/functions/analyze-menu/dish-form.ts";
import type {
  EnrichedItem,
  ExtractedItem,
} from "../supabase/functions/analyze-menu/enrich.ts";

/**
 * `FORM` as bench-unweighted.ts dispatches it: the production entry point,
 * unwrapped to the items array the harness scores.
 */
export async function armForm(
  items: ExtractedItem[],
  apiKey: string,
): Promise<EnrichedItem[]> {
  return (await callGptEnrichFormSized(items, apiKey)).items;
}
