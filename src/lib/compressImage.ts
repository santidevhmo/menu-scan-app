import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

export interface CompressedImage {
  uri: string;
  width: number;
  height: number;
}

const MAX_DIMENSION = 1024;
const QUALITY = 0.7;

export async function compressImage(
  uri: string,
  sourceWidth?: number,
  sourceHeight?: number,
): Promise<CompressedImage> {
  const context = ImageManipulator.manipulate(uri);

  if (sourceWidth && sourceHeight) {
    const longest = Math.max(sourceWidth, sourceHeight);
    if (longest > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / longest;
      context.resize({
        width: Math.round(sourceWidth * scale),
        height: Math.round(sourceHeight * scale),
      });
    }
  }

  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    compress: QUALITY,
    format: SaveFormat.JPEG,
  });

  return { uri: result.uri, width: result.width, height: result.height };
}
