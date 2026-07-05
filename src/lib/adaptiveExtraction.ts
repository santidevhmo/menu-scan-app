import type {
  CropDirection,
  ExtractedItem,
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

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = row[j];
      row[j] = Math.min(
        row[j] + 1,
        row[j - 1] + 1,
        diagonal + Number(a[i - 1] !== b[j - 1]),
      );
      diagonal = above;
    }
  }
  return row[b.length];
}

function duplicate(a: ExtractedItem, b: ExtractedItem): boolean {
  const left = normalize(a.name);
  const right = normalize(b.name);
  const compatiblePrice =
    a.price === b.price || a.price === null || b.price === null;
  if (left === right) return compatiblePrice;
  if (
    a.price === null ||
    b.price === null ||
    a.price !== b.price ||
    a.category !== b.category ||
    normalize(a.section_title ?? "") !== normalize(b.section_title ?? "")
  )
    return false;
  return (
    editDistance(left, right) <=
    Math.max(1, Math.floor(Math.max(left.length, right.length) * 0.2))
  );
}

function mergeOptions(
  first: ExtractedItem["options"],
  second: ExtractedItem["options"],
): ExtractedItem["options"] {
  return [...first, ...second].filter(
    (option, index, all) =>
      all.findIndex(
        (candidate) =>
          normalize(candidate.name) === normalize(option.name) &&
          candidate.price === option.price,
      ) === index,
  );
}

function richer(a: ExtractedItem, b: ExtractedItem): ExtractedItem {
  const best =
    b.description.length + b.options.length >
    a.description.length + a.options.length
      ? b
      : a;
  return { ...best, options: mergeOptions(a.options, b.options) };
}

export function mergeItemSources(sources: ExtractedItem[][]): ExtractedItem[] {
  const sectionTitles = new Set(
    sources
      .flat()
      .flatMap((entry) =>
        entry.section_title ? [normalize(entry.section_title)] : [],
      ),
  );
  const kept: { item: ExtractedItem; sources: Set<number> }[] = [];

  sources.forEach((source, sourceIndex) => {
    for (const entry of source) {
      if (
        entry.price === null &&
        entry.description.trim() === "" &&
        entry.options.length === 0 &&
        sectionTitles.has(normalize(entry.name))
      )
        continue;

      const match = kept.find(
        (candidate) =>
          !candidate.sources.has(sourceIndex) &&
          duplicate(candidate.item, entry),
      );
      if (match) {
        match.item = richer(match.item, entry);
        match.sources.add(sourceIndex);
      } else {
        kept.push({ item: entry, sources: new Set([sourceIndex]) });
      }
    }
  });

  return kept.map(({ item }) => item);
}
