// Eval 079 diagnostic (planner scratch, NOT committed): does per-tile OCR mint
// edge-cut prose fragments that anchor description-minted invention names?
//
//   capture: cut the production 2x2 tiles from PolloteriaMenu.png, fetch
//            Mistral OCR per tile x3 rounds (12 calls ~ $0.05), cache FULL raw
//            responses (with pixel boxes) durably in ~/Downloads/MenusTesting/.
//   analyze <round>: replay the archived eval077-r1 / eval078-r1 / eval078-r2
//            dumps' items through the PRODUCTION matcher against (a) the
//            union of that round's tile blocks — exactly what the live stage
//            saw — and (b) the cached full-photo OCR, and trace the suspects.
//
// usage (cwd = worktree root, so .env.local resolves):
//   deno run --env-file=.env.local --allow-env --allow-read --allow-write \
//     --allow-net=api.mistral.ai --allow-run=sips <this file> capture
//   deno run --allow-read <this file> analyze 1
import {
  applyColocation,
  bestLineSim,
  judgeItem,
  nameTokens,
  type OcrBlock,
  toBlockTexts,
  tokenMatch,
} from "../supabase/functions/analyze-menu/colocation.ts";
import { gridCropRects } from "../src/lib/adaptiveExtraction.ts";

const MENU_DIR = `${
  Deno.env.get("HOME") ?? "/Users/santiagoaguirre"
}/Downloads/MenusTesting`;
const PHOTO = `${MENU_DIR}/PolloteriaMenu.png`;
const DUMPS = [
  "polloteria.tiles-2x2-eval077-r1.actual.json",
  "polloteria.tiles-2x2-eval078-r1.actual.json",
  "polloteria.tiles-2x2-eval078-r2.actual.json",
];
const FULL_OCR = `${MENU_DIR}/polloteria.mistral-ocr-eval071.json`;
const SUSPECT =
  /ensalada de pollo|nuggets de pollo|papa sazonada|papas sazonadas|grande/i;

interface RawBlock extends OcrBlock {
  top_left_x?: number;
  top_left_y?: number;
  bottom_right_x?: number;
  bottom_right_y?: number;
}
interface OcrResponse {
  pages?: {
    blocks?: RawBlock[];
    dimensions?: { width?: number; height?: number; dpi?: number };
  }[];
}

async function sh(args: string[]): Promise<string> {
  const out = await new Deno.Command(args[0], { args: args.slice(1) }).output();
  if (!out.success) {
    throw new Error(
      `${args.join(" ")}: ${new TextDecoder().decode(out.stderr)}`,
    );
  }
  return new TextDecoder().decode(out.stdout);
}

async function capture() {
  const key = Deno.env.get("MISTRAL_API_KEY");
  if (!key) throw new Error("MISTRAL_API_KEY missing");
  const sipsOut = await sh([
    "sips",
    "-g",
    "pixelWidth",
    "-g",
    "pixelHeight",
    PHOTO,
  ]);
  const w = Number(sipsOut.match(/pixelWidth:\s+(\d+)/)?.[1]);
  const h = Number(sipsOut.match(/pixelHeight:\s+(\d+)/)?.[1]);
  const rects = gridCropRects(w, h);
  console.log(`photo ${w}x${h}; rects=${JSON.stringify(rects)}`);
  const tmp = await Deno.makeTempDir({ prefix: "tile-ocr-" });
  const tiles: string[] = [];
  for (const [i, r] of rects.entries()) {
    const out = `${tmp}/tile${i + 1}.png`;
    // exact probe-tiles.ts sips invocation: cropOffset Y X, -c H W
    await sh([
      "sips",
      "-s",
      "format",
      "png",
      "--cropOffset",
      String(r.originY),
      String(r.originX),
      "-c",
      String(r.height),
      String(r.width),
      PHOTO,
      "--out",
      out,
    ]);
    tiles.push(
      `data:image/png;base64,${(await Deno.readFile(out)).toBase64()}`,
    );
    console.log(
      `tile ${i + 1}: ${r.width}x${r.height}@${r.originX},${r.originY}`,
    );
  }
  for (let round = 1; round <= 3; round++) {
    const responses: OcrResponse[] = [];
    for (const [i, tile] of tiles.entries()) {
      const res = await fetch("https://api.mistral.ai/v1/ocr", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "mistral-ocr-latest",
          document: { type: "image_url", image_url: tile },
          include_blocks: true,
        }),
      });
      if (!res.ok) {
        throw new Error(
          `OCR tile ${i + 1} r${round}: ${res.status} ${
            (await res.text()).slice(0, 300)
          }`,
        );
      }
      responses.push(await res.json());
      console.log(
        `round ${round} tile ${i + 1}: ${
          responses[i].pages?.[0]?.blocks?.length ?? 0
        } blocks`,
      );
    }
    const path = `${MENU_DIR}/polloteria.mistral-ocr-tiles-r${round}.json`;
    await Deno.writeTextFile(
      path,
      `${JSON.stringify({ rects, responses }, null, 2)}\n`,
    );
    console.log(`cached ${path}`);
  }
}

// OCR reports boxes in its own page space (pages[].dimensions), not tile pixels.
let pageDims: { w: number; h: number }[] = [];

function edgeInfo(b: RawBlock, tile: number): string {
  if (b.top_left_x === undefined) return "no-coords";
  const pd = pageDims[tile];
  const d = {
    L: b.top_left_x!,
    T: b.top_left_y!,
    R: pd.w - b.bottom_right_x!,
    B: pd.h - b.bottom_right_y!,
  };
  // interior borders per tile position (0=TL,1=TR,2=BL,3=BR); threshold ~1.5% of page dim
  const thr = Math.round(Math.max(pd.w, pd.h) * 0.015);
  const interior: (keyof typeof d)[][] = [["R", "B"], ["L", "B"], ["R", "T"], [
    "L",
    "T",
  ]];
  const flags = interior[tile].filter((side) => d[side] <= thr).map((s) =>
    `CUT-${s}`
  );
  return `box(${b.top_left_x},${b.top_left_y})-(${b.bottom_right_x},${b.bottom_right_y})/page${pd.w}x${pd.h} ` +
    `edges L${d.L} T${d.T} R${d.R} B${d.B}${
      flags.length ? " ** " + flags.join(",") : ""
    }`;
}

/** Same anchor filter as judgeItem (mention-guard), for tracing which blocks anchor a name. */
function anchorsFor(
  name: string,
  bts: ReturnType<typeof toBlockTexts>,
): number[] {
  const nToks = nameTokens(name);
  if (nToks.length === 0) return [];
  return bts.filter((b) => {
    const matched = nToks.filter((t) => b.tokens.some((p) => tokenMatch(t, p)));
    if (matched.length / nToks.length < 0.6) return false;
    const blockAlpha = b.tokens.filter((t) =>
      /[a-z]/.test(t) && !/^\d+(gr|pz)?$/.test(t) && t !== "gr" && t !== "pz"
    );
    const covered = blockAlpha.filter((p) =>
      nToks.some((t) => tokenMatch(t, p))
    );
    return blockAlpha.length > 0 && covered.length / blockAlpha.length >= 0.5;
  }).map((b) => b.block);
}

async function analyze(round: string) {
  const cache = JSON.parse(
    await Deno.readTextFile(
      `${MENU_DIR}/polloteria.mistral-ocr-tiles-r${round}.json`,
    ),
  ) as {
    rects: {
      originX: number;
      originY: number;
      width: number;
      height: number;
    }[];
    responses: OcrResponse[];
  };
  const rawBlocks: { tile: number; raw: RawBlock }[] = [];
  pageDims = cache.responses.map((resp, tile) => {
    const d = resp.pages?.[0]?.dimensions;
    return {
      w: d?.width ?? cache.rects[tile].width,
      h: d?.height ?? cache.rects[tile].height,
    };
  });
  console.log(
    `OCR page dims per tile: ${
      pageDims.map((d) => `${d.w}x${d.h}`).join(", ")
    } ` +
      `(tile pixel dims: ${
        cache.rects.map((r) => `${r.width}x${r.height}`).join(", ")
      })`,
  );
  cache.responses.forEach((resp, tile) => {
    for (const b of (resp.pages ?? []).flatMap((p) => p.blocks ?? [])) {
      rawBlocks.push({ tile, raw: b });
    }
  });
  const tileBT = toBlockTexts(rawBlocks.map((r) => r.raw));
  const fullRaw = JSON.parse(await Deno.readTextFile(FULL_OCR)) as OcrResponse;
  const fullBT = toBlockTexts(
    (fullRaw.pages ?? []).flatMap((p) => p.blocks ?? []),
  );
  console.log(
    `tile-union blocks=${tileBT.length} (round ${round}); full-photo blocks=${fullBT.length}\n`,
  );

  for (const dumpName of DUMPS) {
    const dump = JSON.parse(
      await Deno.readTextFile(`${MENU_DIR}/${dumpName}`),
    ) as {
      items: Parameters<typeof judgeItem>[1][];
    };
    const items = dump.items;
    const nonDrink = items.filter((i) =>
      (i as { category?: string }).category !== "drink"
    );
    console.log(
      `===== ${dumpName} — ${items.length} items (${nonDrink.length} non-drink)`,
    );
    for (
      const src of [{ label: "TILE-OCR", bt: tileBT }, {
        label: "FULL-OCR",
        bt: fullBT,
      }] as const
    ) {
      const verdicts = nonDrink.map((i) => ({ i, v: judgeItem(src.bt, i) }));
      const counts = { verified: 0, contradicted: 0, unverifiable: 0 };
      let anchored = 0;
      for (const { v } of verdicts) {
        counts[v.verdict]++;
        if (v.anchored) anchored++;
      }
      const readability = anchored / nonDrink.length;
      const existenceDrops = verdicts.filter(({ i, v }) =>
        v.verdict === "unverifiable" && !v.anchored &&
        bestLineSim(i.name, src.bt) < 0.75
      );
      console.log(
        `  [${src.label}] verified=${counts.verified} contradicted=${counts.contradicted} ` +
          `unverifiable=${counts.unverifiable} readability=${
            readability.toFixed(2)
          } ` +
          `existence-drops=${existenceDrops.length} [${
            existenceDrops.map(({ i }) => i.name).join("; ")
          }]`,
      );
    }
    for (const item of nonDrink.filter((i) => SUSPECT.test(i.name))) {
      console.log(
        `  --- SUSPECT: ${item.name} $${(item as { price?: number }).price}`,
      );
      for (
        const src of [{ label: "TILE-OCR", bt: tileBT }, {
          label: "FULL-OCR",
          bt: fullBT,
        }] as const
      ) {
        const v = judgeItem(src.bt, item);
        let line =
          `    ${src.label}: ${v.verdict} anchored=${v.anchored} anchor=${v.anchor}`;
        for (const a of anchorsFor(item.name, src.bt)) {
          if (src.label === "TILE-OCR") {
            const rb = rawBlocks[a];
            line += `\n      mention-guard blk${a} tile${rb.tile + 1} "${
              rb.raw.content.replace(/\n/g, "\\n").slice(0, 120)
            }" ${edgeInfo(rb.raw, rb.tile)}`;
          } else {
            line += `\n      mention-guard blk${a} "${
              src.bt[a].joined.slice(0, 120)
            }"`;
          }
        }
        if (v.verdict === "unverifiable") {
          const sim = bestLineSim(item.name, src.bt);
          let bestIdx = -1, best = 0;
          for (let k = 0; k < src.bt.length; k++) {
            const s = bestLineSim(item.name, [src.bt[k]]);
            if (s > best) {
              best = s;
              bestIdx = k;
            }
          }
          line += `\n      bestSim=${sim.toFixed(2)}`;
          if (bestIdx >= 0) {
            if (src.label === "TILE-OCR") {
              const rb = rawBlocks[bestIdx];
              line += ` best blk${bestIdx} tile${rb.tile + 1} "${
                rb.raw.content.replace(/\n/g, "\\n").slice(0, 120)
              }" ${edgeInfo(rb.raw, rb.tile)}`;
            } else {
              line += ` best="${src.bt[bestIdx].joined.slice(0, 120)}"`;
            }
          }
        }
        console.log(line);
      }
    }
    console.log(`  --- applyColocation(TILE-OCR) replay:`);
    const after = applyColocation(tileBT, items);
    console.log(`  kept ${after.length}/${items.length}\n`);
  }

  // fragment hunt: where do the invented names' words appear as block content?
  console.log(
    "===== fragment hunt (blocks whose content contains the invented phrases):",
  );
  for (
    const phrase of [
      "ensalada de pollo",
      "nuggets de pollo",
      "pollo a la plancha",
    ]
  ) {
    console.log(`  "${phrase}":`);
    rawBlocks.forEach((rb, idx) => {
      const norm = rb.raw.content.normalize("NFD").replace(/[̀-ͯ]/g, "")
        .toLowerCase();
      if (norm.includes(phrase)) {
        console.log(
          `    TILE blk${idx} tile${rb.tile + 1} "${
            rb.raw.content.replace(/\n/g, "\\n").slice(0, 130)
          }" ${edgeInfo(rb.raw, rb.tile)}`,
        );
      }
    });
    fullBT.forEach((b) => {
      if (b.joined.includes(phrase)) {
        console.log(`    FULL blk${b.block} "${b.joined.slice(0, 130)}"`);
      }
    });
  }

  // determinism across rounds
  console.log("===== OCR determinism across rounds:");
  for (let t = 0; t < 4; t++) {
    const sigs: string[] = [];
    for (let r = 1; r <= 3; r++) {
      try {
        const c = JSON.parse(
          await Deno.readTextFile(
            `${MENU_DIR}/polloteria.mistral-ocr-tiles-r${r}.json`,
          ),
        ) as { responses: OcrResponse[] };
        const contents = (c.responses[t].pages ?? []).flatMap((p) =>
          p.blocks ?? []
        ).map((b) => b.content);
        sigs.push(`${contents.length}:${contents.join("").length}`);
      } catch {
        sigs.push("missing");
      }
    }
    console.log(
      `  tile ${t + 1}: rounds ${sigs.join(" | ")} ${
        new Set(sigs).size === 1 ? "IDENTICAL-SIG" : "DIFFER"
      }`,
    );
  }
}

/** OCR a single image file N times, save raw responses array. */
async function ocrFile(png: string, outPath: string, rounds: number) {
  const key = Deno.env.get("MISTRAL_API_KEY");
  if (!key) throw new Error("MISTRAL_API_KEY missing");
  const bytes = await Deno.readFile(png);
  const mime = png.endsWith(".jpg") || png.endsWith(".jpeg")
    ? "image/jpeg"
    : "image/png";
  const dataUrl = `data:${mime};base64,${bytes.toBase64()}`;
  const responses: OcrResponse[] = [];
  for (let r = 0; r < rounds; r++) {
    const res = await fetch("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-ocr-latest",
        document: { type: "image_url", image_url: dataUrl },
        include_blocks: true,
      }),
    });
    if (!res.ok) {
      throw new Error(
        `OCR ${png} r${r + 1}: ${res.status} ${
          (await res.text()).slice(0, 300)
        }`,
      );
    }
    const j = await res.json() as OcrResponse;
    responses.push(j);
    const p = j.pages?.[0];
    console.log(
      `${png} round ${r + 1}: ${
        p?.blocks?.length ?? 0
      } blocks, page ${p?.dimensions?.width}x${p?.dimensions?.height}`,
    );
  }
  await Deno.writeTextFile(
    outPath,
    `${JSON.stringify({ responses }, null, 2)}\n`,
  );
  console.log(`saved ${outPath}`);
}

/** Build a corrected union (true tile3, optional tile2 variant), analyze with optional edge exclusion. */
async function analyzeFixed(excludeEdges: boolean, tile2File?: string) {
  const base = JSON.parse(
    await Deno.readTextFile(`${MENU_DIR}/polloteria.mistral-ocr-tiles-r1.json`),
  ) as {
    rects: {
      originX: number;
      originY: number;
      width: number;
      height: number;
    }[];
    responses: OcrResponse[];
  };
  const t3 = JSON.parse(
    await Deno.readTextFile(
      `${MENU_DIR}/polloteria.mistral-ocr-tile3-true.json`,
    ),
  ) as { responses: OcrResponse[] };
  const responses = [
    base.responses[0],
    base.responses[1],
    t3.responses[0],
    base.responses[3],
  ];
  if (tile2File) {
    const t2 = JSON.parse(await Deno.readTextFile(tile2File)) as {
      responses: OcrResponse[];
    };
    responses[1] = t2.responses[0];
  }
  pageDims = responses.map((resp, tile) => {
    const d = resp.pages?.[0]?.dimensions;
    return {
      w: d?.width ?? base.rects[tile].width,
      h: d?.height ?? base.rects[tile].height,
    };
  });
  console.log(
    `FIXED union${excludeEdges ? " + EDGE-EXCLUSION" : ""}${
      tile2File ? ` + tile2=${tile2File}` : ""
    }; ` +
      `page dims: ${pageDims.map((d) => `${d.w}x${d.h}`).join(", ")}`,
  );
  let rawBlocks: { tile: number; raw: RawBlock }[] = [];
  responses.forEach((resp, tile) => {
    for (const b of (resp.pages ?? []).flatMap((p) => p.blocks ?? [])) {
      rawBlocks.push({ tile, raw: b });
    }
  });
  if (excludeEdges) {
    const before = rawBlocks.length;
    rawBlocks = rawBlocks.filter(({ tile, raw }) =>
      !edgeInfo(raw, tile).includes("CUT-")
    );
    console.log(`edge exclusion: ${before} -> ${rawBlocks.length} blocks`);
  }
  const tileBT = toBlockTexts(rawBlocks.map((r) => r.raw));
  for (const dumpName of DUMPS) {
    const dump = JSON.parse(
      await Deno.readTextFile(`${MENU_DIR}/${dumpName}`),
    ) as {
      items: Parameters<typeof judgeItem>[1][];
    };
    const items = dump.items;
    const nonDrink = items.filter((i) =>
      (i as { category?: string }).category !== "drink"
    );
    const verdicts = nonDrink.map((i) => ({ i, v: judgeItem(tileBT, i) }));
    const counts = { verified: 0, contradicted: 0, unverifiable: 0 };
    let anchored = 0;
    for (const { v } of verdicts) {
      counts[v.verdict]++;
      if (v.anchored) anchored++;
    }
    console.log(
      `\n===== ${dumpName}: verified=${counts.verified} contradicted=${counts.contradicted} ` +
        `unverifiable=${counts.unverifiable} readability=${
          (anchored / nonDrink.length).toFixed(2)
        }`,
    );
    const after = applyColocation(tileBT, items);
    const afterKeys = new Set(
      after.map((i) => `${i.name}|${(i as { price?: number }).price}`),
    );
    const dropped = items.filter((i) =>
      !afterKeys.has(`${i.name}|${(i as { price?: number }).price}`)
    );
    console.log(
      `  kept ${after.length}/${items.length}; dropped: [${
        dropped.map((d) => d.name).join("; ")
      }]`,
    );
    for (const item of nonDrink.filter((i) => SUSPECT.test(i.name))) {
      const v = judgeItem(tileBT, item);
      const sim = v.verdict === "unverifiable" && !v.anchored
        ? ` bestSim=${bestLineSim(item.name, tileBT).toFixed(2)}`
        : "";
      console.log(
        `  suspect "${item.name}": ${v.verdict} anchored=${v.anchored}${sim}`,
      );
    }
  }
}

/** Analyze the 3 dumps against ONE OCR source file ({responses:[...]} or raw {pages:[...]}). */
async function analyzeOne(ocrPath: string) {
  const raw = JSON.parse(await Deno.readTextFile(ocrPath)) as
    | { responses: OcrResponse[] }
    | OcrResponse;
  const resp = "responses" in raw ? raw.responses[0] : raw;
  const bt = toBlockTexts((resp.pages ?? []).flatMap((p) => p.blocks ?? []));
  console.log(`source ${ocrPath}: ${bt.length} blocks`);
  for (const dumpName of DUMPS) {
    const dump = JSON.parse(
      await Deno.readTextFile(`${MENU_DIR}/${dumpName}`),
    ) as {
      items: Parameters<typeof judgeItem>[1][];
    };
    const items = dump.items;
    const nonDrink = items.filter((i) =>
      (i as { category?: string }).category !== "drink"
    );
    const verdicts = nonDrink.map((i) => ({ i, v: judgeItem(bt, i) }));
    const counts = { verified: 0, contradicted: 0, unverifiable: 0 };
    let anchored = 0;
    for (const { v } of verdicts) {
      counts[v.verdict]++;
      if (v.anchored) anchored++;
    }
    console.log(
      `\n===== ${dumpName}: verified=${counts.verified} contradicted=${counts.contradicted} ` +
        `unverifiable=${counts.unverifiable} readability=${
          (anchored / nonDrink.length).toFixed(2)
        }`,
    );
    const after = applyColocation(bt, items);
    const afterKeys = new Set(
      after.map((i) => `${i.name}|${(i as { price?: number }).price}`),
    );
    const dropped = items.filter((i) =>
      !afterKeys.has(`${i.name}|${(i as { price?: number }).price}`)
    );
    console.log(
      `  kept ${after.length}/${items.length}; dropped: [${
        dropped.map((d) => d.name).join("; ")
      }]`,
    );
    for (const item of nonDrink.filter((i) => SUSPECT.test(i.name))) {
      const v = judgeItem(bt, item);
      const sim = v.verdict === "unverifiable" && !v.anchored
        ? ` bestSim=${bestLineSim(item.name, bt).toFixed(2)}`
        : "";
      console.log(
        `  suspect "${item.name}": ${v.verdict} anchored=${v.anchored}${sim}`,
      );
    }
  }
}

const [cmd, arg, arg2, arg3] = Deno.args;
if (cmd === "capture") await capture();
else if (cmd === "analyze") await analyze(arg ?? "1");
else if (cmd === "ocr-file") await ocrFile(arg, arg2, Number(arg3 ?? "1"));
else if (cmd === "analyze-fixed") await analyzeFixed(arg === "exclude", arg2);
else if (cmd === "analyze-one") await analyzeOne(arg);
else {console.error(
    "usage: capture | analyze <round> | ocr-file <png> <out.json> [rounds] | analyze-fixed [exclude] [tile2.json] | analyze-one <ocr.json>",
  );}
