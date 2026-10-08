// Makes the favicon set and a light logo from the original logo.
// The original is kept in design/logo-original.png. Run with: node scripts/make-icons.mjs
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const pub = resolve(here, '../public');
const original = resolve(here, '../../design/logo-original.png');
const logo = resolve(pub, 'logo.png');

await mkdir(dirname(original), { recursive: true });
if (!existsSync(original)) await copyFile(logo, original);

// The emblem is the round mark above the words. Cut it out and trim the empty margin.
const top = await sharp(original).extract({ left: 0, top: 0, width: 1024, height: 598 }).png().toBuffer();
const emblem = await sharp(top).trim({ threshold: 12 }).png().toBuffer();

async function square(size, { background, pad = 0.1 } = {}) {
  const inner = Math.round(size * (1 - pad * 2));
  const mark = await sharp(emblem).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  let canvas = sharp({
    create: { width: size, height: size, channels: 4, background: background ?? { r: 0, g: 0, b: 0, alpha: 0 } },
  }).composite([{ input: mark, gravity: 'center' }]);
  return canvas.png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 }).toBuffer();
}

await writeFile(resolve(pub, 'favicon-32.png'), await square(32, { pad: 0.02 }));
await writeFile(resolve(pub, 'apple-touch-icon.png'), await square(180, { background: '#ffffff', pad: 0.12 }));
await writeFile(resolve(pub, 'icon-192.png'), await square(192, { background: '#ffffff', pad: 0.12 }));
await writeFile(resolve(pub, 'icon-512.png'), await square(512, { background: '#ffffff', pad: 0.12 }));

// A light copy of the full logo for the app. The same file name, so nothing else changes.
const light = await sharp(original)
  .resize({ width: 360 })
  .png({ palette: true, quality: 82, effort: 10, colours: 128 })
  .toBuffer();
await writeFile(logo, light);
console.log(`logo.png ${(light.length / 1024).toFixed(0)} KB`);
