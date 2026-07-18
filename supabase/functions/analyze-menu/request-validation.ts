const MAX_BASE64_LEN = 10_000_000;

export function isValidOcrPhotos(
  value: unknown,
  pageCount: number,
): value is (string | null)[] {
  return value === undefined || (
    Array.isArray(value) &&
    value.length === pageCount &&
    value.every((photo) =>
      photo === null ||
      (typeof photo === "string" && photo.length <= MAX_BASE64_LEN)
    )
  );
}
