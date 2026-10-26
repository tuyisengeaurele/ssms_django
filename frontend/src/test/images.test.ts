// @vitest-environment node
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const dir = resolve(__dirname, '../../public/images');
const file = (name: string) => resolve(dir, name);
const kb = (name: string) => statSync(file(name)).size / 1024;

describe('hero background', () => {
  const widths = [640, 1280, 1920, 2560];

  it.each(widths)('exists in AVIF and WebP at %d px', (w) => {
    expect(existsSync(file(`hero-bg-${w}.avif`))).toBe(true);
    expect(existsSync(file(`hero-bg-${w}.webp`))).toBe(true);
  });

  it('stays inside the size budget', () => {
    expect(kb('hero-bg-640.avif')).toBeLessThan(45);
    expect(kb('hero-bg-1280.avif')).toBeLessThan(100);
    expect(kb('hero-bg-1920.avif')).toBeLessThan(150);
    expect(kb('hero-bg-2560.avif')).toBeLessThan(240);
  });

  it('has the right pixel width', async () => {
    for (const w of widths) {
      const meta = await sharp(file(`hero-bg-${w}.avif`)).metadata();
      expect(meta.width).toBe(w);
    }
  });

  it('has a tiny inline placeholder', () => {
    const text = readFileSync(file('hero-bg-blur.txt'), 'utf8').trim();
    expect(text.startsWith('data:image/webp;base64,')).toBe(true);
    expect(text.length).toBeLessThan(1024);
  });
});

describe('share image', () => {
  it('is 1200 by 630 and light', async () => {
    const meta = await sharp(file('og-1200x630.jpg')).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
    expect(kb('og-1200x630.jpg')).toBeLessThan(120);
  });
});
