// Production-mirror photo input (ticket #3, spec 2026-07-12): compresses a
// MenusTesting photo the way the client's prepareImage does before upload.
// sips is the pixel-equivalent CLI stand-in for expo-image-manipulator.
// These constants MUST mirror src/lib/compressImage.ts (QUALITY x 100).
export const PROD_MAX_DIMENSION = 2048;
export const PROD_JPEG_QUALITY = 95;

// Run dumps and OCR/response caches live here (disposable scratch; the
// load-bearing caches are backed up in scripts/fixtures/caches/).
export const MENU_DIR = "/Users/santiagoaguirre/Downloads/MenusTesting";
// The ORIGINAL menu photos moved INTO the repo 2026-08-01 (they are oracle
// inputs: fixtures + drafts + photos now version together). Every photo READ
// goes here; MENU_DIR keeps only dumps/caches.
export const PHOTO_DIR = new URL("./fixtures/photos/", import.meta.url)
  .pathname;

/** Absolute path of an original fixture photo (repo-resident). */
export function photoPath(name: string): string {
  return `${PHOTO_DIR}${name}`;
}
export const MAX_BASE64_LEN = 10_000_000;
// Passthrough budget (ticket #3 checkpoint A ruling): originals upload untouched
// when their base64 fits this; only oversized photos take the q95 fallback.
// 9M leaves headroom under the edge fn's 10M per-photo cap.
export const PASSTHROUGH_MAX_B64 = 9_000_000;

/** Original pixel dimensions of a fixture photo. */
export async function photoDims(
  name: string,
): Promise<{ width: number; height: number }> {
  const out = await new Deno.Command("sips", {
    args: [
      "-g",
      "pixelWidth",
      "-g",
      "pixelHeight",
      photoPath(name),
    ],
  }).output();
  const text = new TextDecoder().decode(out.stdout);
  if (!out.success) {
    throw new Error(
      `sips dims ${name} failed: ${new TextDecoder().decode(out.stderr)}`,
    );
  }
  const width = Number(text.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const height = Number(text.match(/pixelHeight:\s*(\d+)/)?.[1]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error(`sips dims ${name}: could not parse dimensions`);
  }
  return { width, height };
}

async function sh(args: string[]): Promise<void> {
  const out = await new Deno.Command(args[0], { args: args.slice(1) }).output();
  if (!out.success) {
    throw new Error(
      `${args.join(" ")} failed: ${new TextDecoder().decode(out.stderr)}`,
    );
  }
}

/** data: URL of a MenusTesting photo compressed to maxDim / JPEG quality (0-100). */
export async function compressedPhotoData(
  name: string,
  maxDim: number,
  quality: number,
  tmpDir: string,
): Promise<string> {
  const out = `${tmpDir}/${name.replaceAll("/", "_")}.${maxDim}q${quality}.jpg`;
  await sh([
    "sips",
    "-Z",
    String(maxDim),
    "-s",
    "format",
    "jpeg",
    "-s",
    "formatOptions",
    String(quality),
    photoPath(name),
    "--out",
    out,
  ]);
  const b64 = (await Deno.readFile(out)).toBase64();
  if (b64.length >= MAX_BASE64_LEN) {
    throw new Error(
      `${name} @${maxDim}/q${quality}: base64 ${b64.length} exceeds edge cap`,
    );
  }
  return `data:image/jpeg;base64,${b64}`;
}

function mimeOf(name: string): string {
  return name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

/** Production-mirror input: original bytes when they fit the passthrough
 * budget (checkpoint A ruling — every 2048px JPEG setting stably lost
 * el-marcos/mochomos dims); 2048/q95 fallback for oversized photos. */
export async function productionPhotoData(
  name: string,
  tmpDir: string,
): Promise<string> {
  const b64 = (await Deno.readFile(photoPath(name))).toBase64();
  if (b64.length <= PASSTHROUGH_MAX_B64) {
    return `data:${mimeOf(name)};base64,${b64}`;
  }
  return compressedPhotoData(
    name,
    PROD_MAX_DIMENSION,
    PROD_JPEG_QUALITY,
    tmpDir,
  );
}

if (import.meta.main && Deno.args.includes("--self-check")) {
  const tmp = await Deno.makeTempDir({ prefix: "photo-input-check-" });
  const url = await compressedPhotoData("NikkoriMenu.png", 1024, 70, tmp);
  const original = await Deno.readFile(photoPath("NikkoriMenu.png"));
  let failed = 0;
  const check = (label: string, ok: boolean) => {
    console.log(`${ok ? "✓" : "✗"} ${label}`);
    if (!ok) failed++;
  };
  check("returns a jpeg data URL", url.startsWith("data:image/jpeg;base64,"));
  check(
    "compressed smaller than original",
    url.length < original.byteLength * (4 / 3),
  );
  check("under edge base64 cap", url.length < MAX_BASE64_LEN);
  const prod = await productionPhotoData("ElMarcosMenu.png", tmp);
  const rawElMarcos = await Deno.readFile(photoPath("ElMarcosMenu.png"));
  check(
    "large fixture passthroughs as png",
    prod.startsWith("data:image/png;base64,"),
  );
  check(
    "passthrough is byte-identical to the original",
    prod.length ===
      "data:image/png;base64,".length + rawElMarcos.toBase64().length,
  );
  console.log(failed === 0 ? "SELF-CHECK PASS" : "SELF-CHECK FAIL");
  if (failed > 0) Deno.exitCode = 1;
}
