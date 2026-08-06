// Position-correct PNG cropping via pngjs (sips --cropOffset is broken two ways:
// flush-bottom-left returns the full image; 0,0 silently center-crops — eval 079/081).
// usage: node png-crop.cjs crop <src> <out> <originX> <originY> <w> <h>
//        node png-crop.cjs make <out> <w> <h>
//        node png-crop.cjs pixel <png> <x> <y>
const fs = require("fs");
const path = require("path");
const { PNG } = require(path.join(__dirname, "..", "node_modules", "pngjs"));
const [mode, ...a] = process.argv.slice(2);

if (mode === "crop") {
  const [src, out, x, y, w, h] = a;
  const png = PNG.sync.read(fs.readFileSync(src));
  const dst = new PNG({ width: Number(w), height: Number(h) });
  PNG.bitblt(png, dst, Number(x), Number(y), Number(w), Number(h), 0, 0);
  fs.writeFileSync(out, PNG.sync.write(dst));
} else if (mode === "make") {
  const [out, w, h] = a;
  const png = new PNG({ width: Number(w), height: Number(h) });
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const i = (png.width * y + x) << 2;
      png.data[i] = (x * 30) % 256;
      png.data[i + 1] = (y * 40) % 256;
      png.data[i + 2] = 7;
      png.data[i + 3] = 255;
    }
  }
  fs.writeFileSync(out, PNG.sync.write(png));
} else if (mode === "pixel") {
  const [file, x, y] = a;
  const png = PNG.sync.read(fs.readFileSync(file));
  const i = (png.width * Number(y) + Number(x)) << 2;
  console.log(`${png.data[i]},${png.data[i + 1]},${png.data[i + 2]}`);
} else {
  console.error("unknown mode");
  process.exit(2);
}
