// PAID PROBE, §3 of docs/backend-changes-required.md — can a model pick the
// restaurant's name out of the TITLE STRINGS alone?
//
// Geometry could not (eval 190: 5/11, every failure a section heading). But
// `type: "title"` is a real discriminator, and the whole candidate set is tiny
// — 3 to 27 strings per page, ~2,960 characters for the entire corpus. So the
// call is cheap and, unlike a new `EXTRACT_SCHEMA` field, it touches NOTHING
// the eval gate measures: it reads an archived response and returns a string
// the pipeline does not consume.
//
//   deno run --allow-read scripts/probe-menu-title.ts --count   # $0, no calls
//   deno run --allow-read --allow-write --allow-env --allow-net \
//     --env-file=.env.local scripts/probe-menu-title.ts [--run r2]
//
// ⚠️ CEILINGS, measured $0 before this was written — a score here cannot beat
// them, so read them first:
//
//   in title blocks   9/11   ← the ceiling for THIS probe
//   in full markdown 10/11   ← the ceiling for an EXTRACT_SCHEMA field
//
// `brasero` is unreachable for both: its name appears ONLY in a logo image at
// the top of the page, and Mistral transcribes that as `![img-0.jpeg](...)`.
// No text-based approach can ever recover it. `nikkori`'s name is in the
// markdown but not in any title block, which is the 9 vs 10 difference.

import { MODEL_TIMEOUT_MS } from "../supabase/functions/analyze-menu/extract.ts";

const CACHE = "scripts/fixtures/caches";
const MODEL = "gpt-4.1-2025-04-14"; // pinned, never an alias (ruling 35)

/** The real name printed on each fixture menu, read off the photos by hand. */
const TRUTH: Record<string, string> = {
  "andaluz": "EL ANDALUZ",
  "bistro": "PIZZAS BISTRO",
  "brasero": "BRASERO",
  "brasero-two": "BRASERO",
  "casa-nostra": "CASA NOSTRA",
  "el-marcos": "EL MARCOS",
  "guest-house": "GUEST HOUSE",
  "mochomos": "MOCHOMOS",
  "nikkori": "NIKKORI",
  // ⚠️ CORRECTED 2026-09-05, mid-probe. This table first said "ComePollito",
  // which is the HASHTAG printed in the page's top-right corner. The name on
  // the sign is LA POLLOTERIA ("CHICKEN AND BEERS"), verified against
  // scripts/fixtures/photos/PolloteriaMenu.png. The model was right and the
  // truth table was wrong — the exact failure mode AGENTS.md records as having
  // bitten the real oracle five times ("twice the pipeline defect was the
  // oracle's own error"). It also means eval 190's topmost-title rule scored a
  // FALSE PASS here: it was credited for picking a hashtag.
  "polloteria": "LA POLLOTERIA",
};

/** Pages where returning null is the RIGHT answer, because the restaurant's
 *  name is not among the title strings at all. Measured $0, before any call:
 *  - brasero  — the name exists ONLY in a logo image, which Mistral
 *               transcribes as `![img-0.jpeg](...)`. Unreachable by any
 *               text-based method, this probe and EXTRACT_SCHEMA alike.
 *  - nikkori  — present in the markdown but in no title block.
 *  - mochomos — appears only inside the DISH "ENSALADA MOCHOMOS $255".
 *               Naming the restaurant from a dish is a guess, not a read. */
const NULL_IS_CORRECT = new Set(["brasero", "nikkori", "mochomos"]);

const PROMPT =
  `Below are the heading strings read off ONE page of a restaurant menu, in the order they appear.
Exactly one of them may be the RESTAURANT'S OWN NAME — the name on the sign, the thing a diner
would say to a taxi driver. The others are menu section headings (starters, drinks, desserts) or
dish names.

Reply with JSON: {"index": <the 1-based number of the restaurant's name>, "name": "<the name>"}
If none of them is the restaurant's name, reply {"index": null, "name": null}.

Answering null is CORRECT and expected whenever the page shows only section headings. Do not pick
a section heading or a dish because it is first, largest, or in capitals. Return the name only —
strip any price, any section word, any decoration around it.`;

interface Candidate {
  text: string;
}

/** Title strings for one archived page, cleaned for display but not filtered. */
function candidates(raw: unknown): Candidate[] {
  const page = (raw as { pages?: { blocks?: unknown[] }[] })?.pages?.[0];
  const blocks = Array.isArray(page?.blocks) ? page.blocks : [];
  return blocks
    .filter((b) => {
      const block = b as { type?: string; content?: string };
      return block.type === "title" &&
        (block.content ?? "").trim().length >= 3;
    })
    .map((b) => ({
      text: ((b as { content?: string }).content ?? "")
        .split("\n")
        .map((l) => l.replace(/^#{1,6}\s*/, "").replaceAll("*", "").trim())
        .filter((l) => l.length > 0)
        .join(" "),
    }))
    .filter((c) => c.text.length > 0)
    .slice(0, 40);
}

async function askModel(
  list: Candidate[],
  apiKey: string,
): Promise<{ name: string | null; raw: string }> {
  const numbered = list.map((c, i) => `${i + 1}. ${c.text}`).join("\n");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: `${PROMPT}\n\n${numbered}` }],
      }),
      signal: controller.signal,
    });
    const raw = await res.text();
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${raw}`);
    const text = JSON.parse(raw).choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text) as { name?: string | null };
    return { name: parsed.name ?? null, raw };
  } finally {
    clearTimeout(timeout);
  }
}

// ⚠️ Strip DIACRITICS before comparing, or "LA POLLOTERÍA" scores as a miss
// against "LA POLLOTERIA": the Í is not in A-Z, so a naive filter deletes the
// letter rather than folding it. The first version of this probe did exactly
// that and reported the model wrong when it was right — for the second time in
// one session, after the ComePollito truth-table error above. A scorer bug and
// an oracle bug are indistinguishable from the score alone.
const norm = (s: string) =>
  s.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

const files = [...Deno.readDirSync(CACHE)]
  .map((e) => e.name)
  .filter((n) => /\.mistral-pt-r1(\.p\d+)?\.raw\.json$/.test(n))
  .sort();

const run = Deno.args.includes("--run")
  ? Deno.args[Deno.args.indexOf("--run") + 1]
  : "r1";

if (Deno.args.includes("--count")) {
  let chars = 0;
  for (const name of files) {
    const raw = JSON.parse(Deno.readTextFileSync(`${CACHE}/${name}`));
    const list = candidates(raw);
    const payload = list.map((c, i) => `${i + 1}. ${c.text}`).join("\n");
    chars += payload.length;
    console.log(
      `  ${name.replace(/\.mistral.*/, "").padEnd(22)}${
        String(list.length).padStart(3)
      } titles ${String(payload.length).padStart(6)} chars`,
    );
  }
  const inTok = chars / 4 + 200 * files.length;
  const cost = inTok / 1e6 * 2 + (15 * files.length) / 1e6 * 8;
  console.log(`\n  ${files.length} calls, ~${inTok.toFixed(0)} input tokens`);
  console.log(`  estimated cost: $${cost.toFixed(4)} per run`);
  Deno.exit(0);
}

const replay = Deno.args.includes("--replay");
const apiKey = Deno.env.get("OPENAI_API_KEY");
if (!apiKey && !replay) {
  console.error("OPENAI_API_KEY missing — pass --env-file=.env.local");
  Deno.exit(1);
}

let hits = 0;
let rightNulls = 0;
let wrong = 0;
console.log(`run=${run} model=${MODEL}${replay ? " (REPLAY, $0)" : ""}\n`);
for (const file of files) {
  const raw = JSON.parse(Deno.readTextFileSync(`${CACHE}/${file}`));
  const page = file.replace(/\.mistral-pt-r1(\.p\d+)?\.raw\.json$/, "$1");
  const want = TRUTH[page.split(".")[0]];
  const list = candidates(raw);

  const archive = `${CACHE}/menutitle.${run}.${page}.raw.json`;
  let name: string | null;
  if (replay) {
    // $0. Re-score an archived run against a corrected TRUTH table without
    // paying again — the same reason every arm in this repo archives its raw
    // responses (master-roadmap lesson 21). Both scoring bugs found today were
    // fixed and re-scored this way, for nothing.
    const stored = JSON.parse(Deno.readTextFileSync(archive));
    const text = stored.choices?.[0]?.message?.content ?? "{}";
    name = (JSON.parse(text) as { name?: string | null }).name ?? null;
  } else {
    const result = await askModel(list, apiKey!);
    Deno.writeTextFileSync(archive, result.raw);
    name = result.name;
  }

  const nullOk = NULL_IS_CORRECT.has(page.split(".")[0]);
  const ok = name !== null && norm(name).includes(norm(want));
  // Abstaining where the name is genuinely absent is the behaviour §3 asks
  // for — "null is a perfectly good answer" — and is scored apart from a hit
  // so neither number flatters the other.
  const abstained = name === null && nullOk;
  if (ok) hits++;
  if (abstained) rightNulls++;
  if (name !== null && !ok) wrong++;
  console.log(
    `  ${ok ? "✓" : abstained ? "·" : "✗"} ${page.padEnd(20)} got=${
      (name === null ? "(null)" : JSON.stringify(name)).padEnd(24)
    } want=${nullOk ? "(null — name not in titles)" : JSON.stringify(want)}`,
  );
}

console.log(
  `\n  ${hits}/${files.length} named correctly` +
    `  ·  ${rightNulls} correct abstentions` +
    `  ·  ${wrong} confidently WRONG`,
);
console.log(
  `  ceiling is ${files.length - NULL_IS_CORRECT.size}/${files.length} names ` +
    `+ ${NULL_IS_CORRECT.size} nulls. A confidently wrong answer is the only\n` +
    `  failure that reaches a diner: null renders a neutral header (§3).`,
);
