// Cuts the silkworm out of the macro photo without any model download.
// The worm is pale and grey, the leaf and the background are saturated or dark,
// so a brightness and saturation mask plus the largest connected blob finds it.
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const WORK_WIDTH = 1600;
const OUT_WIDTHS = [640, 1280, 1600];

function buildMask(rgb, width, height, { minValue, maxSat }) {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const value = max / 255;
    const sat = max === 0 ? 0 : (max - min) / max;
    mask[i] = value >= minValue && sat <= maxSat ? 1 : 0;
  }
  return mask;
}

function largestComponent(mask, width, height) {
  const seen = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  let best = [];
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    const members = [];
    while (head < tail) {
      const p = queue[head++];
      members.push(p);
      const x = p % width;
      const y = (p - x) / width;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; queue[tail++] = p - 1; }
      if (x < width - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; queue[tail++] = p + 1; }
      if (y > 0 && mask[p - width] && !seen[p - width]) { seen[p - width] = 1; queue[tail++] = p - width; }
      if (y < height - 1 && mask[p + width] && !seen[p + width]) { seen[p + width] = 1; queue[tail++] = p + width; }
    }
    if (members.length > best.length) best = members;
  }
  const out = new Uint8Array(mask.length);
  for (const p of best) out[p] = 1;
  return out;
}

function diskOffsets(radius) {
  const offsets = [];
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx * dx + dy * dy <= radius * radius) offsets.push([dx, dy]);
    }
  }
  return offsets;
}

function dilate(mask, width, height, radius) {
  const offsets = diskOffsets(radius);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (mask[y * width + x]) { out[y * width + x] = 1; continue; }
      for (const [dx, dy] of offsets) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < width && yy >= 0 && yy < height && mask[yy * width + xx]) {
          out[y * width + x] = 1;
          break;
        }
      }
    }
  }
  return out;
}

function erode(mask, width, height, radius) {
  const inv = mask.map((v) => (v ? 0 : 1));
  const grown = dilate(inv, width, height, radius);
  return grown.map((v) => (v ? 0 : 1));
}

function fillHoles(mask, width, height) {
  const outside = new Uint8Array(mask.length);
  const stack = [];
  const push = (p) => { if (!mask[p] && !outside[p]) { outside[p] = 1; stack.push(p); } };
  for (let x = 0; x < width; x += 1) { push(x); push((height - 1) * width + x); }
  for (let y = 0; y < height; y += 1) { push(y * width); push(y * width + width - 1); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % width;
    if (x > 0) push(p - 1);
    if (x < width - 1) push(p + 1);
    if (p >= width) push(p - width);
    if (p < mask.length - width) push(p + width);
  }
  return mask.map((v, i) => (v || !outside[i] ? 1 : 0));
}

export async function computeMask(source, thresholds = { minValue: 0.42, maxSat: 0.34 }) {
  const meta = await sharp(source).metadata();
  const height = Math.round((WORK_WIDTH * meta.height) / meta.width);
  const { data } = await sharp(source)
    .resize(WORK_WIDTH, height)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let mask = buildMask(data, WORK_WIDTH, height, thresholds);
  mask = dilate(mask, WORK_WIDTH, height, 2);
  mask = erode(mask, WORK_WIDTH, height, 2);
  mask = largestComponent(mask, WORK_WIDTH, height);
  mask = dilate(mask, WORK_WIDTH, height, 9);
  mask = erode(mask, WORK_WIDTH, height, 9);
  mask = fillHoles(mask, WORK_WIDTH, height);
  return { mask, width: WORK_WIDTH, height };
}

export async function cutoutWorm({ source, outDir, thresholds, debugPath }) {
  const { mask, width, height } = await computeMask(source, thresholds);

  let minX = width, minY = height, maxX = 0, maxY = 0, count = 0;
  for (let p = 0; p < mask.length; p += 1) {
    if (!mask[p]) continue;
    count += 1;
    const x = p % width;
    const y = (p - x) / width;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const pad = 14;
  minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad); maxY = Math.min(height - 1, maxY + pad);
  const share = (count / (width * height)) * 100;
  console.log(`worm mask covers ${share.toFixed(1)}% of the frame, box ${maxX - minX}x${maxY - minY}`);

  const meta = await sharp(source).metadata();
  const scale = meta.width / width;
  const crop = {
    left: Math.round(minX * scale),
    top: Math.round(minY * scale),
    width: Math.round((maxX - minX) * scale),
    height: Math.round((maxY - minY) * scale),
  };

  // Soft alpha: upscale the binary mask and blur it for a clean, feathered edge.
  const alpha = await sharp(Buffer.from(mask.map((v) => v * 255)), { raw: { width, height, channels: 1 } })
    .resize(meta.width, meta.height, { kernel: 'cubic' })
    .blur(3.2)
    .linear(1.35, -45)
    .extract(crop)
    .png()
    .toBuffer();
  const color = await sharp(source).extract(crop).removeAlpha().toBuffer();
  const rgba = await sharp(color).joinChannel(alpha).png().toBuffer();

  for (const w of OUT_WIDTHS) {
    const pipe = sharp(rgba).resize({ width: w });
    await writeFile(resolve(outDir, `worm-${w}.webp`), await pipe.clone().webp({ quality: 86, alphaQuality: 92, effort: 5 }).toBuffer());
    await writeFile(resolve(outDir, `worm-${w}.avif`), await pipe.clone().avif({ quality: 52, effort: 6 }).toBuffer());
  }
  if (debugPath) {
    const flat = await sharp({ create: { width: crop.width + 80, height: crop.height + 80, channels: 3, background: '#d8472f' } })
      .composite([{ input: rgba, left: 40, top: 40 }])
      .png()
      .toBuffer();
    await sharp(flat).resize({ width: 800 }).png().toFile(debugPath);
  }
}
