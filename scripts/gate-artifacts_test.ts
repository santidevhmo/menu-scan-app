// Protects HARNESSES THAT DO NOT EXIST YET from the eval-110 class.
//
// A gate that scores a DERIVED artifact is blind to the code that derived it.
// `score-c-dumps.ts` scored `*.dump.json` — postprocessed when the probe ran —
// so eval 110's three `postprocess.ts` fixes reported a flat 35/45 while being
// worth +2 dims. Its own sensitivity guard (`score-c-dumps_test.ts`) now covers
// that file, but a NEW harness gets no protection for free, and brief rule 8 /
// master-roadmap lesson 20 are only words.
//
// This test is the structural version: any file that BOTH scores AND mentions a
// derived artifact must be listed below with a reason. A new gate that reads
// `.dump.json` fails here the moment it is written.
//
// Adding a line to ALLOWED is a deliberate act, not a formality. Before you do:
// if the file SCORES what it reads, you are re-creating the bug — rebuild from
// `*.raw.json` through the real chain instead (see `itemsFromRaw` in
// `score-c-dumps.ts`) and give the new harness its own sensitivity guard.
import { assertEquals } from "jsr:@std/assert";

/** Artifacts produced by our own code, so stale the moment that code changes. */
const DERIVED = /\.dump\.json|\.actual\.json|clean\.dump/;
/** The mark of a gate: it turns items into a score. */
const SCORES = /\bscoreMenu\b/;

const ALLOWED: Record<string, string> = {
  "eval-extraction.ts":
    "defines scoreMenu; WRITES <menu>.actual.json, and its --rescore mode " +
    "deliberately re-scores archived actuals. That mode measures the ARCHIVE, " +
    "not current code — never quote its number as a gate on a code change.",
  "eval-027-live.ts":
    "WRITES <menu>.eval027-r<N>.actual.json after scoring a LIVE run. Its " +
    "scored input is the live response, never a file.",
  "probe-tiles.ts":
    "WRITES per-run .actual.json dumps after scoring a LIVE run.",
  "probe-fidelity.ts":
    "WRITES per-mode .actual.json dumps after scoring a LIVE run.",
  "probe-nested-tile-eval072.ts":
    "ARCHIVE ANALYSIS: reads a frozen eval-068 dump as a historical baseline " +
    "to compare against. Not a gate on current code.",
  "score-c-dumps.ts":
    "mentions the suffixes ONLY in the comment explaining why it must not read " +
    "them. It rebuilds from *.raw.json; guarded by score-c-dumps_test.ts.",
};

const SKIP = new Set(["gate-artifacts_test.ts"]);

async function tsFiles(dir: URL): Promise<string[]> {
  const found: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    const child = new URL(`${entry.name}${entry.isDirectory ? "/" : ""}`, dir);
    if (entry.isDirectory) found.push(...await tsFiles(child));
    else if (entry.name.endsWith(".ts")) found.push(child.pathname);
  }
  return found;
}

Deno.test("no gate scores a derived artifact without a stated reason", async () => {
  const roots = [
    new URL("./", import.meta.url),
    new URL("../supabase/functions/", import.meta.url),
  ];
  const paths = (await Promise.all(roots.map(tsFiles))).flat();

  const offenders: string[] = [];
  const matched = new Set<string>();
  for (const path of paths) {
    const name = path.split("/").pop() ?? path;
    if (SKIP.has(name)) continue;
    const source = await Deno.readTextFile(path);
    if (!DERIVED.test(source) || !SCORES.test(source)) continue;
    matched.add(name);
    if (!(name in ALLOWED)) offenders.push(name);
  }

  assertEquals(
    offenders,
    [],
    `These files SCORE and also touch a derived artifact (.dump.json / ` +
      `.actual.json / .clean.dump). A gate that scores a derived artifact is ` +
      `blind to the code that derived it — that is the eval-110 bug. Rebuild ` +
      `from *.raw.json through the real chain (see itemsFromRaw in ` +
      `score-c-dumps.ts) and add a sensitivity guard. If the file genuinely ` +
      `only WRITES the artifact or analyses a frozen archive, add it to ` +
      `ALLOWED in scripts/gate-artifacts_test.ts with the reason.`,
  );

  // Keep the list honest: a stale entry makes the guard look bigger than it is.
  assertEquals(
    Object.keys(ALLOWED).filter((name) => !matched.has(name)),
    [],
    "ALLOWED lists files that no longer score a derived artifact — remove them",
  );
});
