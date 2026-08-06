// Detector diagnosis (horizontal roadmap Phase 1 step 1): run phase-1 ONLY on
// the given menus xN and report the raw layout verdict per run — is the dense
// flag stable? what does crop_direction say? how many items on a normal verdict?
// Usage: PROBE_RUNS=3 deno run --allow-read --allow-write --allow-env \
//   --allow-net --allow-run scripts/probe-detector.ts PolloteriaMenu.png
import { runPagedExtraction } from "../supabase/functions/analyze-menu/extract.ts";
import { photoDims, productionPhotoData } from "./photo-input.ts";

const apiKey = Deno.env.get("OPENAI_API_KEY")!;
const runs = Number(Deno.env.get("PROBE_RUNS") ?? "3");
const tmp = await Deno.makeTempDir({ prefix: "detector-" });

for (const name of Deno.args) {
  const dims = await photoDims(name);
  for (let i = 1; i <= runs; i++) {
    const photos = [await productionPhotoData(name, tmp)];
    try {
      const r = await runPagedExtraction(photos, apiKey, undefined, [dims]);
      if ("needs_crops" in r) {
        console.log(
          `${name} run ${i}: DENSE-SIGNAL pages=${
            JSON.stringify(r.needs_crops)
          } dims=${dims.width}x${dims.height}`,
        );
      } else {
        console.log(
          `${name} run ${i}: normal; layout=${
            JSON.stringify(r.image_layout)
          }; items=${r.items.length}; dims=${dims.width}x${dims.height}`,
        );
      }
    } catch (error) {
      console.log(
        `${name} run ${i}: TERMINAL ${
          String(error).slice(0, 100)
        }; dims=${dims.width}x${dims.height}`,
      );
    }
  }
}
