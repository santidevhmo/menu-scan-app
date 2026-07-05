import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { CropRect } from "./adaptiveExtraction";

export interface CompressedImage {
  uri: string;
  width: number;
  height: number;
}

const MAX_DIMENSION = 1024;
const QUALITY = 0.7;

/** Optionally crops, then compresses an image to a max 1024px side. */
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
