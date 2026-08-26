// Fills docs/pipeline-walkthrough.html's <!--SEQ--> and <!--TABS--> placeholders
// from scripts/fixtures/dish-traces.json, so every number on the page comes from
// the traced run and cannot be retyped wrong.
//
// Scores come from the harness's own scoreItemAgainstBand and gram resolution
// from the deployed resolveGrams — never from a second copy of either rule.
//
//   deno run --allow-read --allow-write scripts/build-walkthrough.ts
import { type MacroBands, scoreItemAgainstBand } from "./macro-band-score.ts";
import { resolveGrams } from "../supabase/functions/analyze-menu/enrich.ts";

// The template holds the prose and the placeholders; the page is generated. Kept
// apart so a rebuild is idempotent — building in place would consume its own
// placeholders and only ever work once.
const TEMPLATE = "docs/pipeline-walkthrough.template.html";
const PAGE = "docs/pipeline-walkthrough.html";

// ── the sequence diagram ────────────────────────────────────────────────────
// Three lanes on purpose: the FORM_G lane sits idle until message 11, which is
// the visual answer to "at what step does the hardcoded table fit in?".
const LANES = [
  { name: "our code", sub: "the edge function", hue: "vio" },
  { name: "GPT-4o", sub: "the model", hue: "grn" },
  { name: "FORM_G", sub: "our hardcoded table", hue: "amb" },
];
const MSGS: [number, number, string][] = [
  [0, 0, 'read "(300gr.)" off the text with a regex'],
  [0, 0, "split the menu: prints a weight, or not?"],
  [0, 1, "PASS 1 — what is in this dish? (batches of 10)"],
  [1, 0, "an ingredient list: a reference serving + per-100 g each"],
  [0, 0, "fit those grams to the printed weight, or leave them"],
  [0, 0, "grams × per-100 g, summed. calories by Atwater"],
  [0, 1, "PASS 2 — only the no-weight dishes, asked on their own"],
  [1, 0, "the same dishes, re-portioned — this REPLACES pass 1"],
  [0, 1, "LABEL — which of 24 shapes is this dish?"],
  [1, 0, "one form name. never a weight"],
  [0, 2, "look up that form"],
  [2, 0, "the plate's grams — the first hardcoded number"],
  [0, 0, "rescale every ingredient by k, then add it all up again"],
];

const W = 1000, CX = [180, 500, 820], BW = 250, BH = 62, BY = 24;
const TOP = 178, GAP = 72, CHARW = 6.35;
const BOT = TOP + GAP * (MSGS.length - 1) + 54;
const H = BOT + 24;

const s: string[] = [];
s.push(`  <svg class="sq" viewBox="0 0 ${W} ${H}" role="img"`);
s.push('       aria-label="Sequence diagram: what happens to one menu item, step by step">');
s.push("    <defs>");
s.push('      <pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">');
s.push('        <circle cx="1.5" cy="1.5" r="1.1" class="dot"/>');
s.push("      </pattern>");
s.push('      <marker id="tip" markerWidth="11" markerHeight="11" refX="10" refY="5.5" orient="auto">');
s.push('        <path d="M0 0.5 L11 5.5 L0 10.5 Z" class="tip"/>');
s.push("      </marker>");
s.push("    </defs>");
s.push(`    <rect x="0" y="0" width="${W}" height="${H}" class="canvas"/>`);
s.push(`    <rect x="0" y="0" width="${W}" height="${H}" fill="url(#dots)"/>`);

LANES.forEach((l, i) => {
  s.push(`    <rect x="${CX[i] - BW / 2}" y="${BY}" width="${BW}" height="${BH}" rx="14" class="box ${l.hue}"/>`);
  s.push(`    <text x="${CX[i]}" y="${BY + 27}" text-anchor="middle" class="who">${l.name}</text>`);
  s.push(`    <text x="${CX[i]}" y="${BY + 46}" text-anchor="middle" class="whos">${l.sub}</text>`);
  s.push(`    <path d="M${CX[i]} ${BY + BH} V ${BOT}" class="life"/>`);
});

const warn: string[] = [];
MSGS.forEach(([fr, to, label], n0) => {
  const n = n0 + 1;
  const y = TOP + GAP * n0;
  const x1 = CX[fr], x2 = CX[to];
  const self = fr === to;
  const pw = label.length * CHARW + 26;
  let mid: number, py = y - 31;

  if (self) {
    s.push(`    <path d="M${x1 + 7} ${y - 9} h 34 v 18 h -30" class="arw" marker-end="url(#tip)"/>`);
    mid = x1 + 55 + pw / 2;
    py = y - 13;
  } else {
    const right = x2 > x1;
    s.push(`    <path d="M${x1 + (right ? 7 : -7)} ${y} H ${x2 + (right ? -7 : 7)}" class="arw" marker-end="url(#tip)"/>`);
    mid = (x1 + x2) / 2;
  }
  const px = mid - pw / 2;
  const bx = px - 15;
  const hue = self ? LANES[0].hue : LANES[fr].hue;
  s.push(`    <rect x="${px.toFixed(1)}" y="${py}" width="${pw.toFixed(1)}" height="26" rx="8" class="pill"/>`);
  s.push(`    <text x="${mid.toFixed(1)}" y="${py + 17.5}" text-anchor="middle" class="lbl">${label}</text>`);
  s.push(`    <circle cx="${bx.toFixed(1)}" cy="${py + 13}" r="12" class="bdg ${hue}"/>`);
  s.push(`    <text x="${bx.toFixed(1)}" y="${py + 17}" text-anchor="middle" class="num">${n}</text>`);
  if (bx - 12 < 2 || px + pw > W - 2) warn.push(`${n}: ${(bx - 12).toFixed(0)}..${(px + pw).toFixed(0)}`);
});
s.push("  </svg>");

// ── the three tabs ──────────────────────────────────────────────────────────
type Ing = {
  name: string; category: string; within_printed_weight: boolean;
  g: number; per100: [number, number, number];
};
type Slim = {
  printed_total_g: number | null; name_implied_components: string[];
  ingredients: Ing[]; plate_g: number; protein_g: number; carb_g: number;
  fat_g: number; estimated_calories: number; serving_pieces: number | null;
  confidence: string; allergens: string[];
};

/** What the pipeline ACTUALLY uses for each ingredient, via the deployed function. */
function used(a: Slim): number[] {
  return resolveGrams(
    a.ingredients.map((i) => ({
      name: i.name,
      category: i.category as "protein",
      within_printed_weight: i.within_printed_weight,
      typical_serving_g: i.g,
      protein_per_100g: i.per100[0],
      carb_per_100g: i.per100[1],
      fat_per_100g: i.per100[2],
    })),
    a.printed_total_g,
  );
}

/** Editorial, and marked as such: the one thing each trace is here to show. */
const TAKEAWAYS: Record<string, string> = {
  "JAMÓN CON CHAMPIÑONES":
    `<b>Every step helped, in order.</b> Pass 1 put a whole pizza at 230 g and scored
     <b>0 of 4</b>. Pass 2 nearly doubled it to 430 g and scored <b>4 of 4</b>. The table then
     moved it to 488 g — the first answer that lands inside the ruled mass band at all. This is
     the pipeline doing exactly what it was designed to do.`,
  "Salmón Roll":
    `<b>Pass 2 made this dish worse.</b> Pass 1 was already right: 362 g, inside the mass band,
     <b>4 of 4</b>. Pass 2 cut it to 210 g and dropped it to <b>1 of 4</b> — the extra sentence is
     meant to push portions up, and here it pushed the rice down from 150 g to 60 g. Sizing pulled
     it back to 280 g and 3 of 4, still under the 300 g floor.
     <b>The dual pass is an improvement on average, not on every dish</b> — and this is exactly
     what re-scanning the same menu and getting different macros looks like.`,
  "PASTEL AZTECA (300gr.)":
    `<b>The last three steps never touched this dish.</b> Our regex read 300 g off the name, so
     pass 2 skipped it and sizing refused it — and the label call chose <code>other</code> anyway,
     so there was no row to apply. Protein lands within <b>0.4%</b>. Carbohydrate is <b>42% low</b>,
     because <code>name_implied_components</code> came back <b>empty</b>: a pastel azteca is a
     layered tortilla casserole and there is no tortilla in the list. Sizing right, fitting exact,
     protein exact — and still wrong, on the one component the menu did not name.`,
};

// deno-lint-ignore no-explicit-any
const traces: any[] = JSON.parse(Deno.readTextFileSync("scripts/fixtures/dish-traces.json"));
const uOracle = JSON.parse(Deno.readTextFileSync("scripts/fixtures/unweighted-oracle.json")) as
  { name: string; mass_band_g: [number, number]; band: MacroBands }[];
const wOracle = JSON.parse(Deno.readTextFileSync("scripts/fixtures/macro-oracle.json")) as
  { name: string; oracle: Record<string, number> }[];

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const r1 = (n: number) => (Math.round(n * 10) / 10).toString();

function scoreOf(dish: string, a: Slim) {
  const u = uOracle.find((e) => e.name === dish);
  if (!u) return null;
  const r = scoreItemAgainstBand(u.band, {
    calories: a.estimated_calories, protein_g: a.protein_g,
    carb_g: a.carb_g, fat_g: a.fat_g,
  });
  const [lo, hi] = u.mass_band_g;
  return {
    pts: r.fields.filter((f) => f.pass).length,
    miss: r.fields.filter((f) => !f.pass).map((f) => f.field.replace("_g", "")),
    massVerdict: a.plate_g < lo ? "under" : a.plate_g > hi ? "over" : "in band",
    massBand: `${lo}–${hi}`,
  };
}

function ingTable(a: Slim, prev?: Slim): string {
  const now = used(a);
  const before = new Map<string, number>();
  if (prev) used(prev).forEach((g, i) => before.set(prev.ingredients[i].name, g));

  const rows = a.ingredients.map((ing, i) => {
    const g = now[i];
    const b = before.get(ing.name);
    const moved = prev && b !== undefined && Math.abs(b - g) > 0.05;
    const added = prev && b === undefined;
    const fitted = Math.abs(g - ing.g) > 0.05;
    return `<tr${added ? ' class="new"' : ""}><td>${esc(ing.name)}` +
      `${added ? ' <em class="badge">new</em>' : ""}` +
      `${ing.within_printed_weight ? "" : ' <em class="badge out">alongside</em>'}</td>` +
      `<td class="dim">${ing.category}</td>` +
      `<td class="n${moved ? " ch" : ""}">${r1(g)}` +
      `${moved ? ` <s>${r1(b!)}</s>` : ""}` +
      `${!moved && fitted ? ` <s>${r1(ing.g)}</s>` : ""}</td>` +
      `<td class="n dim">${ing.per100.join(" / ")}</td></tr>`;
  }).join("\n");

  return `<div class="scroll"><table class="ing"><thead><tr>` +
    `<th>ingredient</th><th>tag</th><th class="n">grams we use</th>` +
    `<th class="n">P / C / F per 100 g</th></tr></thead><tbody>\n${rows}\n</tbody></table></div>`;
}

function macroLine(dish: string, a: Slim): string {
  const sc = scoreOf(dish, a);
  const badge = sc
    ? `<span class="verdict ${sc.pts === 4 ? "ok" : sc.pts >= 2 ? "mid" : "no"}">${sc.pts}/4 in band` +
      `${sc.miss.length ? " · misses " + sc.miss.join(", ") : ""}</span>`
    : "";
  return `<div class="tot"><span class="plate">plate <b>${r1(a.plate_g)} g</b>` +
    `${sc ? ` <span class="dim">(key: ${sc.massBand} — ${sc.massVerdict})</span>` : ""}</span>` +
    `<span class="mac">${a.protein_g} P · ${a.carb_g} C · ${a.fat_g} F · ` +
    `<b>${a.estimated_calories} kcal</b></span>${badge}</div>`;
}

const tabBtns: string[] = [];
const panes: string[] = [];

traces.forEach((t, idx) => {
  const on = idx === 0 ? " on" : "";
  tabBtns.push(
    `<button class="tb${on}" role="tab" aria-selected="${idx === 0}" ` +
      `aria-controls="p${idx}" id="t${idx}" data-i="${idx}">${esc(t.dish)}</button>`,
  );

  const p1: Slim | null = t.pass1.answer ?? null;
  const p2: Slim | null = t.pass2.answer ?? null;
  const fin: Slim = t.final;
  const st = t.stage1;
  const b: string[] = [];

  b.push(`<div class="pane${on}" role="tabpanel" id="p${idx}" aria-labelledby="t${idx}"${idx ? " hidden" : ""}>`);

  b.push(`<div class="stg"><div class="sn">1</div><div class="sb">`);
  b.push(`<h4>What Stage 1 handed over</h4>`);
  b.push(`<div class="scroll"><table class="kv"><tbody>` +
    `<tr><td>name</td><td class="v">${esc(st.name)}</td></tr>` +
    `<tr><td>description</td><td class="v">${
      st.description ? esc(st.description) : "<i class='dim'>(none printed)</i>"}</td></tr>` +
    `<tr><td>section</td><td class="v">${esc(st.section_title ?? "—")}</td></tr>` +
    `<tr><td><b>grams, from our regex</b></td><td class="v">${
      st.grams_parsed_by_our_regex === null
        ? '<b class="amb">null</b> — the menu prints no weight'
        : `<b class="amb">${st.grams_parsed_by_our_regex} g</b> — read off the name`
    }</td></tr></tbody></table></div>`);
  b.push(`<p class="hint">${esc(t.partition)}</p></div></div>`);

  if (p1) {
    b.push(`<div class="stg"><div class="sn m">2</div><div class="sb">`);
    b.push(`<h4>Pass 1 — the model lists what is in it</h4>`);
    b.push(`<p class="hint">Sent in a batch of ${t.pass1.batch_size}. It is also asked to name the
      components the dish's <i>name</i> implies but the menu never states — it said: ${
      p1.name_implied_components.length
        ? p1.name_implied_components.map((c: string) => `<code>${esc(c)}</code>`).join(" ")
        : "<b class='red'>nothing at all</b>"
    }</p>`);
    b.push(ingTable(p1));
    b.push(`<p class="hint">Our code multiplies and adds — grams × per-100 g ÷ 100, summed, then
      calories by Atwater. <b>The model never reports a total.</b></p>`);
    b.push(macroLine(t.dish, p1));
    b.push(`</div></div>`);
  }

  if (p2) {
    b.push(`<div class="stg"><div class="sn m">3</div><div class="sb">`);
    b.push(`<h4>Pass 2 — re-asked on its own, with one extra sentence</h4>`);
    b.push(`<p class="hint">Only the no-weight dishes, in a batch of ${t.pass2.batch_size}, same
      schema. <b>This answer replaces pass 1's entirely.</b> Struck-through numbers are what pass 1
      had said. An ingredient marked <em class="badge">new</em> was not in pass 1's list under that
      name — sometimes genuinely added, sometimes the same food renamed, since nothing pins the
      model to one language between calls.</p>`);
    b.push(ingTable(p2, p1 ?? undefined));
    b.push(macroLine(t.dish, p2));
    b.push(`</div></div>`);
  } else {
    b.push(`<div class="stg"><div class="sn">3</div><div class="sb">`);
    b.push(`<h4>Pass 2 — skipped entirely</h4>`);
    b.push(`<p class="hint">${esc(t.pass2.skipped)}. Pass 1's answer stands, untouched.</p>`);
    b.push(`</div></div>`);
  }

  const lab = t.label_call, sz = t.sizing;
  b.push(`<div class="stg"><div class="sn m">4</div><div class="sb">`);
  b.push(`<h4>The label call — one word, from a list of 24</h4>`);
  b.push(`<p class="hint">A separate call that sees the dish's name and section and
    <b>cannot state a weight</b>: the schema allows the name and the label and nothing else.</p>`);
  b.push(`<div class="chose${lab.chose === "other" ? " none" : ""}">` +
    `<span class="dim">it chose</span> <code>${esc(String(lab.chose))}</code>` +
    (lab.chose === "other"
      ? ` <span class="dim">— no row fits. That means no opinion, <b>not</b> a 250 g guess.</span>`
      : "") + `</div>`);
  b.push(`</div></div>`);

  b.push(`<div class="stg"><div class="sn t">5</div><div class="sb">`);
  b.push(`<h4>The hardcoded table — the only number we wrote by hand</h4>`);
  if (sz.applied) {
    b.push(`<div class="scroll"><table class="kv"><tbody>` +
      `<tr><td>FORM_G["${esc(String(lab.chose))}"]</td><td class="v"><b class="amb">${sz.target_g} g</b></td></tr>` +
      `<tr><td>the plate right now</td><td class="v">${sz.plate_before_g} g</td></tr>` +
      `<tr><td>so every ingredient ×</td><td class="v"><b class="amb">${sz.k}</b></td></tr>` +
      `</tbody></table></div>`);
    b.push(`<p class="hint">One scalar, applied to every ingredient alike. <b>The ratios between
      them stay the model's; only the scale is ours.</b> Then the macros are recomputed from the
      new grams.</p>`);
  } else {
    b.push(`<div class="chose none"><span class="dim">not applied —</span> ${esc(String(sz.why_not))}</div>`);
    b.push(`<p class="hint">The dish keeps the answer it already had. Sizing can only improve a scan
      or leave it alone; it has no path to making one worse.</p>`);
  }
  b.push(`</div></div>`);

  b.push(`<div class="stg"><div class="sn t">6</div><div class="sb">`);
  b.push(`<h4>What the diner gets</h4>`);
  b.push(ingTable(fin, (p2 ?? p1) ?? undefined));
  b.push(macroLine(t.dish, fin));
  const w = wOracle.find((e) => e.name === t.dish);
  if (w) {
    const rows = ([["calories", fin.estimated_calories], ["protein", fin.protein_g],
      ["carb", fin.carb_g], ["fat", fin.fat_g]] as [string, number][])
      .map(([k, got]) => {
        const want = w.oracle[k === "calories" ? k : `${k}_g`];
        const pct = ((got - want) / want) * 100;
        const cls = Math.abs(pct) <= 10 ? "ok" : Math.abs(pct) <= 25 ? "mid" : "no";
        return `<tr><td>${k}</td><td class="n">${got}</td><td class="n dim">${want.toFixed(1)}</td>` +
          `<td class="n"><span class="verdict ${cls}">${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%</span></td></tr>`;
      }).join("\n");
    b.push(`<p class="hint">Graded against exact values rather than bands, because the menu printed
      its weight:</p>`);
    b.push(`<div class="scroll"><table class="ing"><thead><tr><th>field</th><th class="n">we say</th>` +
      `<th class="n">answer key</th><th class="n">error</th></tr></thead><tbody>\n${rows}\n</tbody></table></div>`);
  }
  b.push(`<p class="hint">Plus <code>confidence: ${esc(fin.confidence)}</code>,
    <code>serving_pieces: ${fin.serving_pieces}</code>, and allergens
    ${fin.allergens.map((a: string) => `<code>${esc(a)}</code>`).join(" ") || "<i>none</i>"}.</p>`);
  b.push(`</div></div>`);

  const take = TAKEAWAYS[t.dish];
  if (!take) throw new Error(`no takeaway written for ${t.dish}`);
  b.push(`<div class="takeaway">${take}</div>`);
  b.push(`</div>`);
  panes.push(b.join("\n"));
});

const tabs = `  <div class="tabs" role="tablist">\n    ${tabBtns.join("\n    ")}\n  </div>\n` +
  panes.join("\n");

let html = Deno.readTextFileSync(TEMPLATE);
if (!html.includes("<!--SEQ-->") || !html.includes("<!--TABS-->")) {
  throw new Error(`${TEMPLATE} is missing <!--SEQ--> or <!--TABS-->`);
}
html = html.replace("<!--SEQ-->", s.join("\n")).replace("<!--TABS-->", tabs);
Deno.writeTextFileSync(PAGE, html);

console.log(warn.length ? `OVERFLOW ${warn.join(" | ")}` : `seq ok, ${MSGS.length} messages, h=${H}`);
console.log(`tabs ok, ${traces.length} dishes`);
