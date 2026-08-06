import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { CropRect } from "./adaptiveExtraction";

export interface CompressedImage {
  uri: string;
  width: number;
  height: number;
}

// Ticket #3 checkpoint A (ledger eval 056): phase-1 uploads PASSTHROUGH original
// bytes (see analyzeMenu.extractMenu); this compression is only the fallback for
// photos over the passthrough budget. 2048/q0.95 = best measured compressed
// setting (q0.85/q0.90 stably misread small price digits: Chorizo 25→55).
// Mirrored by scripts/photo-input.ts PROD_*.
const MAX_DIMENSION = 2048;
const QUALITY = 0.95;

/** Optionally crops, then compresses an image to a max 2048px side. */
export async function prepareImage(
  uri: string,
  sourceWidth: number,
  sourceHeight: number,
  crop?: CropRect,
): Promise<CompressedImage> {
  const context = ImageManipulator.manipulate(uri);
  if (crop) context.crop(crop);

  const width = crop?.width ?? sourceWidth;
  const height = crop?.height ?? sourceHeight;
  const longest = Math.max(width, height);
  if (longest > MAX_DIMENSION) {
    const scale = MAX_DIMENSION / longest;
    context.resize({
      width: Math.round(width * scale),
      height: Math.round(height * scale),
    });
  }

  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    compress: QUALITY,
    format: SaveFormat.JPEG,
  });

  return { uri: result.uri, width: result.width, height: result.height };
}

export function compressImage(
  uri: string,
  sourceWidth: number,
  sourceHeight: number,
): Promise<CompressedImage> {
  return prepareImage(uri, sourceWidth, sourceHeight);
}

const TILE_MAX_DIMENSION = 2048;

/** Cuts one dense-menu tile from the ORIGINAL image. Deliberately NOT the
 * 1024px/q0.7 pipeline — production compression is what broke every rejected
 * dense candidate (2026-07-04 spec), and the tile A/B (ledger 2026-07-11)
 * showed even JPEG q0.85 re-inflates phantom items vs lossless PNG. The
 * 2048px cap keeps phone-camera tiles ~2x the linear resolution of the
 * gate-proven 718x1138 tiles while bounding payload size. */
export async function prepareTile(
  uri: string,
  crop: CropRect,
): Promise<CompressedImage> {
  const context = ImageManipulator.manipulate(uri);
  context.crop(crop);
  const longest = Math.max(crop.width, crop.height);
  if (longest > TILE_MAX_DIMENSION) {
    const scale = TILE_MAX_DIMENSION / longest;
    context.resize({
      width: Math.round(crop.width * scale),
      height: Math.round(crop.height * scale),
    });
  }
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ format: SaveFormat.PNG });
  return { uri: result.uri, width: result.width, height: result.height };
}

/** Rotate an image CLOCKWISE by `degrees` and return the new file's URI.
 *
 *  expo-image-manipulator's `rotate` is clockwise for positive values, which is
 *  the same convention `correctionDegrees` uses on the server — so the number
 *  the edge function sends is passed straight through, with no sign flip. Eval
 *  094 recorded a session getting exactly that sign wrong. */
export async function rotateImage(
  uri: string,
  degrees: number,
): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  context.rotate(degrees);
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({ format: SaveFormat.JPEG });
  return result.uri;
}
