// Production-mirror photo input (ticket #3, spec 2026-07-12): compresses a
// MenusTesting photo the way the client's prepareImage does before upload.
// sips is the pixel-equivalent CLI stand-in for expo-image-manipulator.
// These constants MUST mirror src/lib/compressImage.ts (QUALITY x 100).
export const PROD_MAX_DIMENSION = 2048;
export const PROD_JPEG_QUALITY = 85;

export const MENU_DIR = "/Users/santiagoaguirre/Downloads/MenusTesting";
export const MAX_BASE64_LEN = 10_000_000;

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
    `${MENU_DIR}/${name}`,
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

/** Production-mirror input: what the client actually uploads for phase-1. */
export function productionPhotoData(
  name: string,
  tmpDir: string,
): Promise<string> {
  return compressedPhotoData(name, PROD_MAX_DIMENSION, PROD_JPEG_QUALITY, tmpDir);
}

if (import.meta.main && Deno.args.includes("--self-check")) {
  const tmp = await Deno.makeTempDir({ prefix: "photo-input-check-" });
  const url = await compressedPhotoData("NikkoriMenu.png", 1024, 70, tmp);
  const original = await Deno.readFile(`${MENU_DIR}/NikkoriMenu.png`);
  let failed = 0;
  const check = (label: string, ok: boolean) => {
    console.log(`${ok ? "✓" : "✗"} ${label}`);
    if (!ok) failed++;
  };
  check("returns a jpeg data URL", url.startsWith("data:image/jpeg;base64,"));
  check("compressed smaller than original", url.length < original.byteLength * (4 / 3));
  check("under edge base64 cap", url.length < MAX_BASE64_LEN);
  const prod = await productionPhotoData("NikkoriMenu.png", tmp);
  check("production arm under edge cap", prod.length < MAX_BASE64_LEN);
  console.log(failed === 0 ? "SELF-CHECK PASS" : "SELF-CHECK FAIL");
  if (failed > 0) Deno.exitCode = 1;
}
