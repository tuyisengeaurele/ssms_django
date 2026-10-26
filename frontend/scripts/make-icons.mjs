// Builds every logo and icon file from the originals in design/logo.
//   logo-for-light.png  the emblem with a cream cocoon, for light backgrounds
//   logo-for-dark.png   the emblem with a white cocoon, for dark backgrounds
// Run with: npm run icons
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const pub = resolve(here, '../public');
const light = resolve(here, '../../design/logo/logo-for-light.png');
const dark = resolve(here, '../../design/logo/logo-for-dark.png');

await mkdir(pub, { recursive: true });

/** Trim the empty margin, then place the emblem on a transparent or flat square with some padding. */
async function square(source, size, { background, pad = 0.04 } = {}) {
  const trimmed = await sharp(source).trim({ threshold: 10 }).png().toBuffer();
  const inner = Math.round(size * (1 - pad * 2));
  const mark = await sharp(trimmed)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();
  return sharp({
    create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: mark, gravity: 'center' }])
    .png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 })
    .toBuffer();
}

const files = {
  'logo.png': await square(light, 512),
  'logo-on-dark.png': await square(dark, 512),
  'logo-mark.png': await square(light, 96, { pad: 0.02 }),
  'favicon-32.png': await square(light, 32, { pad: 0.02 }),
  'apple-touch-icon.png': await square(light, 180, { background: '#ffffff', pad: 0.12 }),
  'icon-192.png': await square(light, 192, { background: '#ffffff', pad: 0.12 }),
  'icon-512.png': await square(light, 512, { background: '#ffffff', pad: 0.12 }),
};

for (const [name, buf] of Object.entries(files)) {
  await writeFile(resolve(pub, name), buf);
  console.log(`${name.padEnd(22)} ${(buf.length / 1024).toFixed(1)} KB`);
}
