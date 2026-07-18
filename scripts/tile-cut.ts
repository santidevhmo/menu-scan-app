// Verified sips tile cutter. sips --cropOffset silently returns the FULL
// image when originX === 0 AND originY + height === imageHeight (the
// bottom-left tile of every 2x2 grid hits this — ledger eval 079). Every cut
// is dims-verified; the failing combo falls back to a lossless 180° rotation
// (bottom-left maps to top-right, which sips crops correctly), then rotates back.
import type { CropRect } from "../src/lib/adaptiveExtraction.ts";

async function sh(args: string[]): Promise<void> {
  const out = await new Deno.Command(args[0], { args: args.slice(1) }).output();
  if (!out.success) {
    throw new Error(
      `${args.join(" ")} failed: ${new TextDecoder().decode(out.stderr)}`,
    );
  }
}

export async function imageDims(
  path: string,
): Promise<{ w: number; h: number }> {
  const out = await new Deno.Command("sips", {
    args: ["-g", "pixelWidth", "-g", "pixelHeight", path],
  }).output();
  const text = new TextDecoder().decode(out.stdout);
  const w = Number(text.match(/pixelWidth:\s+(\d+)/)?.[1]);
  const h = Number(text.match(/pixelHeight:\s+(\d+)/)?.[1]);
  if (!Number.isFinite(w) || !Number.isFinite(h)) {
    throw new Error(`could not parse dims from sips output: ${text}`);
  }
  return { w, h };
}

/** Rect coordinates after rotating the image 180°. */
export function rotatedRect(rect: CropRect, w: number, h: number): CropRect {
  return {
    originX: w - (rect.originX + rect.width),
    originY: h - (rect.originY + rect.height),
    width: rect.width,
    height: rect.height,
  };
}

async function sipsCrop(
  src: string,
  rect: CropRect,
  out: string,
): Promise<void> {
  await sh([
    "sips",
    "-s",
    "format",
    "png",
    "--cropOffset",
    String(rect.originY),
    String(rect.originX),
    "-c",
    String(rect.height),
    String(rect.width),
    src,
    "--out",
    out,
  ]);
}

/** Cuts rect from src into out (PNG), verifying output dimensions. */
export async function cutTile(
  src: string,
  rect: CropRect,
  out: string,
): Promise<void> {
  await sipsCrop(src, rect, out);
  let d = await imageDims(out);
  if (d.w === rect.width && d.h === rect.height) return;
  // flush-bottom left-aligned combo: rotate 180 (PNG round-trip is lossless), crop mapped rect, rotate back
  const { w, h } = await imageDims(src);
  const rot = `${out}.rot.png`;
  const rotCrop = `${out}.rotcrop.png`;
  await sh(["sips", "-s", "format", "png", "-r", "180", src, "--out", rot]);
  await sipsCrop(rot, rotatedRect(rect, w, h), rotCrop);
  await sh(["sips", "-r", "180", rotCrop, "--out", out]);
  await Deno.remove(rot);
  await Deno.remove(rotCrop);
  d = await imageDims(out);
  if (d.w !== rect.width || d.h !== rect.height) {
    throw new Error(
      `cutTile: ${out} is ${d.w}x${d.h}, wanted ${rect.width}x${rect.height}`,
    );
  }
}
