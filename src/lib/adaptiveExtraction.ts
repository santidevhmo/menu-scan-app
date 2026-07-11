export const MAX_SCAN_PHOTOS = 10;

export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

// The gate-proven dense recipe's geometry (2026-07-04 benchmark): four 2x2
// tiles, each 60% x 60% of the source, 20% overlap on both axes. For nikkori
// 1196x1896 this reproduces the exact 718x1138 tiles the gate passes with.
export function gridCropRects(width: number, height: number): CropRect[] {
  const tileW = Math.round(width * 0.6);
  const tileH = Math.round(height * 0.6);
  const oX = Math.round(width * 0.4);
  const oY = Math.round(height * 0.4);
  return [
    { originX: 0, originY: 0, width: tileW, height: tileH },
    { originX: oX, originY: 0, width: Math.min(tileW, width - oX), height: tileH },
    { originX: 0, originY: oY, width: tileW, height: Math.min(tileH, height - oY) },
    {
      originX: oX,
      originY: oY,
      width: Math.min(tileW, width - oX),
      height: Math.min(tileH, height - oY),
    },
  ];
}

export function limitPhotos<T>(photos: T[]): T[] {
  return photos.slice(0, MAX_SCAN_PHOTOS);
}
