// Regenerate every raster icon from the SVG masters: npm run icons
//
// build/icon.svg        the application icon
// build/icon-small.svg  the same artwork for 32 px and below (thicker brackets, larger sigma)
// image/OpenMathpix-logo.svg  the logo with its wordmark
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const file = (name) => path.join(root, name);
const SMALL_MAX = 32;
// 20 and 40 px are the 125 % sizes of the 16 and 32 px tray and list icons.
const ICO_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];

/** Rasterize directly at the target size instead of downscaling a large bitmap. */
async function render(svgPath, size) {
  const svg = await fs.readFile(svgPath);
  const { width } = await sharp(svg).metadata();
  return sharp(svg, { density: (72 * size) / width })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();
}

const iconFor = (size) => file(size <= SMALL_MAX ? 'build/icon-small.svg' : 'build/icon.svg');

/** A Windows icon with PNG-compressed entries (supported since Windows Vista). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;
  images.forEach(({ size, png }, index) => {
    const entry = index * 16;
    directory.writeUInt8(size >= 256 ? 0 : size, entry);
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    directory.writeUInt16LE(1, entry + 4);
    directory.writeUInt16LE(32, entry + 6);
    directory.writeUInt32LE(png.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, directory, ...images.map(({ png }) => png)]);
}

async function write(name, data) {
  await fs.writeFile(file(name), data);
  console.log(`${name.padEnd(30)} ${(data.length / 1024).toFixed(1)} KiB`);
}

(async () => {
  const icons = [];
  for (const size of ICO_SIZES) icons.push({ size, png: await render(iconFor(size), size) });
  await write('build/icon.ico', ico(icons));
  // electron-builder derives the macOS and Linux icons from this file.
  await write('build/icon.png', await render(iconFor(1024), 1024));
  // macOS and Linux tray; Electron loads tray@2x.png on high-DPI displays.
  await write('build/tray.png', await render(iconFor(16), 16));
  await write('build/tray@2x.png', await render(iconFor(32), 32));
  await write('image/OpenMathpix.png', await render(iconFor(1024), 1024));
  await fs.copyFile(file('build/icon.svg'), file('image/OpenMathpix.svg'));
  await write('image/OpenMathpix-logo.png', await render(file('image/OpenMathpix-logo.svg'), 2048));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
