// Position-correct PNG tile cutter. sips --cropOffset is broken two ways:
// flush-bottom-left returns the full image; 0,0 silently center-crops (eval 079/081).
import type { CropRect } from "../src/lib/adaptiveExtraction.ts";

const PNG_CROP = decodeURIComponent(
  new URL("./png-crop.cjs", import.meta.url).pathname,
);

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

/** Cuts rect from src with the repo's native Node/pngjs helper. */
export async function cutTile(
  src: string,
  rect: CropRect,
  out: string,
): Promise<void> {
  const result = await new Deno.Command("node", {
    args: [
      PNG_CROP,
      "crop",
      src,
      out,
      String(rect.originX),
      String(rect.originY),
      String(rect.width),
      String(rect.height),
    ],
  }).output();
  if (!result.success) {
    throw new Error(
      `node png crop failed: ${new TextDecoder().decode(result.stderr)}`,
    );
  }
  const dims = await imageDims(out);
  if (dims.w !== rect.width || dims.h !== rect.height) {
    throw new Error(
      `cutTile: ${out} is ${dims.w}x${dims.h}, wanted ${rect.width}x${rect.height}`,
    );
  }
}
