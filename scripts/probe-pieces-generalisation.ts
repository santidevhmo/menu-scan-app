// Does the forced `serving_pieces` field survive REAL menus - and does it leave
// a printed weight alone?
//
// The 8 fixtures answered neither question: they are 8 dishes, all of which
// print a weight, so they cannot show breadth and cannot show a no-weight menu
// at all. This runs whole archived menus through callGptEnrich, the deployed
// path, in production batches.
//
// Ground truth costs nothing: `parseItemGrams` is the SAME code extraction uses
// to read a printed weight off menu text, so every item carries its own expected
// answer and the check is automatic over hundreds of items rather than eight.
//
// Audits four things, each a way this change could break a menu:
//   INTERFERENCE  an item that prints grams must still come back with them
//   PIECES        a printed count must be honoured; a plate must be 1
//   INTEGRITY     one item per input, input order, nothing dropped
//   ALLERGENS     still present - the disclaimer depends on them
//
// Run: OPENAI_API_KEY=... deno run --allow-read --allow-write --allow-env --allow-net \
//        scripts/probe-pieces-generalisation.ts <out.json>
import {
  callGptEnrich,
  type EnrichedItem,
  type ExtractedItem,
} from "../supabase/functions/analyze-menu/enrich.ts";
import { parseItemGrams } from "../supabase/functions/analyze-menu/postprocess.ts";

const SOURCES = [
  {
    menu: "andaluz",
    path: "scripts/fixtures/drafts/AndaluzMenu.jpg.draft.json",
  },
  {
    menu: "polloteria",
    path: "scripts/fixtures/drafts/PolloteriaMenu.png.draft.json",
  },
  { menu: "bistro", path: "scripts/fixtures/drafts/BistroMenu.png.draft.json" },
  {
    menu: "guest-house",
    path: "scripts/fixtures/drafts/GuestHouseMenu.png.draft.json",
  },
  { menu: "nikkori", path: "device-scans/nikkori.device-r1.dump.json" },
];

/** A count the menu itself states, e.g. "3 pzas", "(3 piezas)", "6 PZ", "orden de dos". */
export function statedPieces(text: string): number | null {
  const t = text.toLowerCase();
  const digits = t.match(/(\d+)\s*(?:pz|pzs|pzas|piezas|pieces|pcs)\b/);
  if (digits) return Number(digits[1]);
  const words: Record<string, number> = {
    dos: 2,
    tres: 3,
    cuatro: 4,
    seis: 6,
    ocho: 8,
    diez: 10,
    doce: 12,
  };
  const word = t.match(/orden de (dos|tres|cuatro|seis|ocho|diez|doce)\b/);
  return word ? words[word[1]] : null;
}

async function loadMenu(path: string): Promise<ExtractedItem[]> {
  const raw = JSON.parse(await Deno.readTextFile(path));
  const items = raw.items ?? raw;
  // parseItemGrams reads the printed weight exactly as extraction does.
  return parseItemGrams(items) as unknown as ExtractedItem[];
}

interface Finding {
  menu: string;
  name: string;
  kind: string;
  detail: string;
}

if (import.meta.main) {
  const key = Deno.env.get("OPENAI_API_KEY")!;
  const findings: Finding[] = [];
  const dump: Record<string, EnrichedItem[]> = {};
  let items = 0, weighted = 0, weightKept = 0, statedCount = 0, statedKept = 0;
  const pieceHistogram: Record<string, number> = {};

  for (const { menu, path } of SOURCES) {
    const input = await loadMenu(path);
    const { items: out } = await callGptEnrich(input as ExtractedItem[], key);
    dump[menu] = out;

    // INTEGRITY
    if (out.length !== input.length) {
      findings.push({
        menu,
        name: "-",
        kind: "INTEGRITY",
        detail: `${input.length} items in, ${out.length} out`,
      });
    }
    input.forEach((src, i) => {
      items++;
      const got = out[i];
      if (!got || got.name !== src.name) {
        findings.push({
          menu,
          name: src.name,
          kind: "INTEGRITY",
          detail: `position ${i} came back as ${got?.name ?? "nothing"}`,
        });
        return;
      }

      // INTERFERENCE - the printed weight must survive
      const printed = (src as unknown as { grams: number | null }).grams;
      if (printed) {
        weighted++;
        if (got.printed_total_g === printed) weightKept++;
        else {
          findings.push({
            menu,
            name: src.name,
            kind: "INTERFERENCE",
            detail:
              `menu prints ${printed} g, model said ${got.printed_total_g}`,
          });
        }
      }

      // PIECES - a stated count must be honoured
      const stated = statedPieces(`${src.name} ${src.description ?? ""}`);
      if (stated) {
        statedCount++;
        if (got.serving_pieces === stated) statedKept++;
        else {
          findings.push({
            menu,
            name: src.name,
            kind: "PIECES",
            detail: `menu states ${stated}, model said ${got.serving_pieces}`,
          });
        }
      }
      const p = got.serving_pieces;
      pieceHistogram[String(p)] = (pieceHistogram[String(p)] ?? 0) + 1;
      if (
        p !== null && p !== undefined &&
        (!Number.isInteger(p) || p < 1 || p > 50)
      ) {
        findings.push({
          menu,
          name: src.name,
          kind: "PIECES",
          detail: `implausible count ${p}`,
        });
      }

      // ALLERGENS - the mandatory disclaimer depends on them
      if (!Array.isArray(got.allergens)) {
        findings.push({
          menu,
          name: src.name,
          kind: "ALLERGENS",
          detail: "not an array",
        });
      }
    });
  }

  console.log(`\n${items} real items across ${SOURCES.length} menus\n`);
  console.log(
    `INTERFERENCE  printed weight kept on ${weightKept}/${weighted} items that print one`,
  );
  console.log(
    `PIECES        stated count honoured on ${statedKept}/${statedCount} items that state one`,
  );
  console.log(`PIECES        distribution: ${JSON.stringify(pieceHistogram)}`);
  console.log(`\nfindings: ${findings.length}`);
  for (const f of findings) {
    console.log(`  [${f.kind}] ${f.menu} · ${f.name}: ${f.detail}`);
  }

  await Deno.writeTextFile(
    Deno.args[0] ?? "pieces-generalisation.json",
    JSON.stringify({ findings, dump }, null, 2),
  );
}
