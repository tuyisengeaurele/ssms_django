// Builds the landing page images from the untouched originals in design/stock-originals.
// Run with: npm run images
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const originals = resolve(root, 'design/stock-originals');
const out = resolve(here, '../public/images');

const COCOONS = resolve(originals, 'pexels-32277772-silkworm-cocoons-bamboo-trays.jpeg');
const LOGO = resolve(here, '../public/logo-on-dark.png');

// Size budgets in KB for the AVIF files. Quality is lowered until each one fits.
const HERO_WIDTHS = [
  { width: 640, budget: 44 },
  { width: 1280, budget: 98 },
  { width: 1920, budget: 148 },
  { width: 2560, budget: 235 },
];

function vignette(width, height) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs>
      <radialGradient id="v" cx="50%" cy="45%" r="75%">
        <stop offset="55%" stop-color="#0B1F17" stop-opacity="0"/>
        <stop offset="100%" stop-color="#0B1F17" stop-opacity="0.55"/>
      </radialGradient>
      <linearGradient id="b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="55%" stop-color="#0B1F17" stop-opacity="0"/>
        <stop offset="100%" stop-color="#0B1F17" stop-opacity="0.6"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#v)"/>
    <rect width="100%" height="100%" fill="url(#b)"/>
  </svg>`;
  return Buffer.from(svg);
}

async function graded(width) {
  const height = Math.round((width * 4672) / 7008);
  const base = await sharp(COCOONS)
    .resize(width, height, { kernel: 'lanczos3' })
    .modulate({ brightness: 0.92, saturation: 1.06 })
    .linear(1.04, -4)
    .toBuffer();
  return sharp(base)
    .composite([{ input: vignette(width, height), blend: 'over' }])
    .removeAlpha();
}

async function encodeAvifUnderBudget(pipeline, budgetKb) {
  let quality = 58;
  for (;;) {
    const buf = await pipeline.clone().avif({ quality, effort: 6, chromaSubsampling: '4:2:0' }).toBuffer();
    if (buf.length / 1024 <= budgetKb || quality <= 22) {
      return { buf, quality };
    }
    quality -= 3;
  }
}

async function hero() {
  for (const { width, budget } of HERO_WIDTHS) {
    const pipe = await graded(width);
    const { buf, quality } = await encodeAvifUnderBudget(pipe, budget);
    await writeFile(resolve(out, `hero-bg-${width}.avif`), buf);
    const webp = await pipe.clone().webp({ quality: 70, effort: 6 }).toBuffer();
    await writeFile(resolve(out, `hero-bg-${width}.webp`), webp);
    console.log(`hero-bg-${width}: avif ${(buf.length / 1024).toFixed(0)} KB (q${quality}), webp ${(webp.length / 1024).toFixed(0)} KB`);
  }
  const tiny = await (await graded(24)).blur(1).webp({ quality: 40 }).toBuffer();
  await writeFile(resolve(out, 'hero-bg-blur.txt'), `data:image/webp;base64,${tiny.toString('base64')}\n`);
}

async function share() {
  const pipe = sharp(COCOONS).resize(1200, 630, { fit: 'cover', position: 'centre' }).modulate({ brightness: 0.8 });
  const shade = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#0B1F17" stop-opacity="0.92"/>
      <stop offset="0.7" stop-color="#0B1F17" stop-opacity="0.35"/>
      <stop offset="1" stop-color="#0B1F17" stop-opacity="0.1"/>
    </linearGradient></defs>
    <rect width="1200" height="630" fill="url(#g)"/>
  </svg>`);
  const logo = await sharp(LOGO).resize({ height: 200, fit: 'inside' }).toBuffer();
  const buf = await pipe
    .composite([
      { input: shade, blend: 'over' },
      { input: logo, left: 72, top: 215 },
    ])
    .jpeg({ quality: 78, mozjpeg: true })
    .toBuffer();
  await writeFile(resolve(out, 'og-1200x630.jpg'), buf);
  console.log(`og: ${(buf.length / 1024).toFixed(0)} KB`);
}

// Usage: node scripts/make-images.mjs [hero|share]. No argument runs everything.
const only = process.argv[2];

await mkdir(out, { recursive: true });
if (!only || only === 'hero') await hero();
if (!only || only === 'share') await share();
