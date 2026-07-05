import type {
  CropDirection,
  ImageLayout,
} from "../types/scan.ts";

export const MAX_SCAN_PHOTOS = 10;
export type CropCount = 2 | 3;
export const DENSE_CROP_COUNT: CropCount = 2;

export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

export function validateLayout(layout: ImageLayout): void {
  if (layout.dense && layout.crop_direction === "none") {
    throw new Error("Dense image is missing a crop direction");
  }
  if (!layout.dense && layout.crop_direction !== "none") {
    throw new Error("Normal image must not request cropping");
  }
}

export function cropRects(
  width: number,
  height: number,
  direction: Exclude<CropDirection, "none">,
  count: CropCount,
): CropRect[] {
  const sizeRatio = count === 2 ? 0.6 : 0.45;
  const offsets = count === 2 ? [0, 0.4] : [0, 0.275, 0.55];
  const total = direction === "left_right" ? width : height;
  const size = Math.round(total * sizeRatio);

  return offsets.map((offset) => {
    const origin = Math.round(total * offset);
    const boundedSize = Math.min(size, total - origin);
    return direction === "left_right"
      ? { originX: origin, originY: 0, width: boundedSize, height }
      : { originX: 0, originY: origin, width, height: boundedSize };
  });
}

export function limitPhotos<T>(photos: T[]): T[] {
  return photos.slice(0, MAX_SCAN_PHOTOS);
}
