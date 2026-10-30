// @vitest-environment node
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const pub = (name: string) => resolve(root, 'public', name);
const DASHES = [String.fromCharCode(0x2014), String.fromCharCode(0x2013)];

function meta(attr: 'name' | 'property', key: string): string | undefined {
  const re = new RegExp(`<meta[^>]*${attr}="${key}"[^>]*content="([^"]*)"`, 'i');
  return html.match(re)?.[1];
}

describe('index.html', () => {
  it('names the project in the title', () => {
    expect(html).toMatch(/<title>[^<]*Smart Sericulture Management System[^<]*<\/title>/);
  });

  it('has a short description', () => {
    const description = meta('name', 'description');
    expect(description).toBeTruthy();
    expect(description!.length).toBeLessThanOrEqual(160);
    expect(description).toContain('Smart Sericulture Management System');
  });

  it('has share tags for social previews', () => {
    expect(meta('property', 'og:title')).toBeTruthy();
    expect(meta('property', 'og:description')).toBeTruthy();
    expect(meta('property', 'og:image')).toMatch(/og-1200x630\.jpg$/);
    expect(meta('property', 'og:type')).toBe('website');
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
  });

  it('has a canonical link and a theme color', () => {
    expect(html).toMatch(/<link rel="canonical" href="[^"]*"/);
    expect(meta('name', 'theme-color')).toBe('#0B1F17');
  });

  it('describes the app for search engines', () => {
    const block = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1];
    expect(block).toBeTruthy();
    const data = JSON.parse(block!.replace(/%VITE_SITE_URL%/g, 'http://localhost:5173'));
    expect(data['@type']).toBe('SoftwareApplication');
    expect(data.name).toBe('Smart Sericulture Management System');
    expect(data.inLanguage).toEqual(['en', 'fr', 'rw']);
  });

  it('links the icons and the manifest', () => {
    expect(html).toContain('href="/favicon-32.png"');
    expect(html).toContain('href="/apple-touch-icon.png"');
    expect(html).toContain('href="/site.webmanifest"');
  });

  it('has no em dashes or en dashes', () => {
    for (const dash of DASHES) expect(html.includes(dash)).toBe(false);
  });
});

describe('icons and static files', () => {
  it.each([
    ['favicon-32.png', 32],
    ['apple-touch-icon.png', 180],
    ['icon-192.png', 192],
    ['icon-512.png', 512],
  ])('%s is %d px square', async (name, size) => {
    const meta = await sharp(pub(name)).metadata();
    expect(meta.width).toBe(size);
    expect(meta.height).toBe(size);
  });

  it.each([
    ['logo.png', 512, 70],
    ['logo-on-dark.png', 512, 70],
    ['logo-mark.png', 96, 14],
  ])('%s is a light, transparent square logo', async (name, size, maxKb) => {
    expect(statSync(pub(name)).size / 1024).toBeLessThan(maxKb);
    const meta = await sharp(pub(name)).metadata();
    expect(meta.width).toBe(size);
    expect(meta.height).toBe(size);
    expect(meta.hasAlpha).toBe(true);
  });

  it('keeps the supplied logo files as originals', () => {
    for (const name of ['logo-for-light.png', 'logo-for-dark.png', 'logo-updated.png']) {
      expect(existsSync(resolve(root, '../design/logo', name)), name).toBe(true);
    }
  });

  it('uses the new emblem: no text lockup, so the logo is nearly square after trimming', async () => {
    const { info } = await sharp(pub('logo.png')).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
    expect(Math.abs(info.width - info.height) / info.width).toBeLessThan(0.15);
  });

  it('has a manifest with the project name and colours', () => {
    const manifest = JSON.parse(readFileSync(pub('site.webmanifest'), 'utf8'));
    expect(manifest.name).toBe('Smart Sericulture Management System');
    expect(manifest.short_name).toBe('SSMS');
    expect(manifest.theme_color).toBe('#0B1F17');
    expect(manifest.background_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('allows crawlers and points to the sitemap', () => {
    const robots = readFileSync(pub('robots.txt'), 'utf8');
    expect(robots).toMatch(/User-agent: \*/);
    expect(robots).toMatch(/Allow: \//);
    expect(robots).toMatch(/Sitemap: /);
  });

  it('keeps lot pages out of search results, since each is private to the people who were given its link', () => {
    expect(readFileSync(pub('robots.txt'), 'utf8')).toMatch(/Disallow: \/lot\//);
    expect(readFileSync(resolve(root, 'scripts/make-seo.mjs'), 'utf8')).toContain('Disallow: /lot/');
  });

  it('keeps the sitemap script next to the other build scripts', () => {
    expect(existsSync(resolve(root, 'scripts/make-seo.mjs'))).toBe(true);
  });
});

describe('installing the app', () => {
  const manifest = JSON.parse(readFileSync(pub('site.webmanifest'), 'utf8'));
  type Icon = { src: string; sizes: string; type: string; purpose?: string };
  const icons: Icon[] = manifest.icons;

  it('opens a standalone app that finds its own way home', () => {
    expect(manifest.display).toBe('standalone');
    // /app sends a signed in person to their dashboard and anyone else to the login page.
    expect(manifest.start_url).toBe('/app');
    expect(manifest.id).toBe('/app');
    expect(manifest.scope).toBe('/');
    expect(readFileSync(resolve(root, 'src/App.tsx'), 'utf8')).toMatch(/path="\/app"/);
  });

  it('names its language', () => {
    expect(manifest.lang).toBe('en');
  });

  it.each([192, 512])('has a plain and a maskable icon at %i pixels', (size) => {
    const same = icons.filter((i) => i.sizes === `${size}x${size}`);
    expect(same.map((i) => i.purpose ?? 'any').sort()).toEqual(['any', 'maskable']);
    for (const icon of same) expect(icon.type).toBe('image/png');
  });

  it('never mixes "any" and "maskable" in one entry, which makes the icon look wrong in one of the two uses', () => {
    for (const icon of icons) expect(icon.purpose ?? 'any').not.toMatch(/\s/);
  });

  it('points every icon at a file of exactly the size it says', async () => {
    for (const icon of icons) {
      const [w, h] = icon.sizes.split('x').map(Number);
      const file = pub(icon.src.replace(/^\//, ''));
      expect(existsSync(file), icon.src).toBe(true);
      const meta = await sharp(file).metadata();
      expect([meta.width, meta.height], icon.src).toEqual([w, h]);
    }
  });

  it.each([192, 512])('keeps the emblem of the %i pixel maskable icon inside the safe circle, so a round or squircle mask does not cut it', async (size) => {
    const icon = icons.find((i) => i.sizes === `${size}x${size}` && i.purpose === 'maskable')!;
    const { data, info } = await sharp(pub(icon.src.replace(/^\//, ''))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let farthest = 0;
    for (let y = 0; y < info.height; y += 1) {
      for (let x = 0; x < info.width; x += 1) {
        const at = (y * info.width + x) * 4;
        const drawn = data[at + 3] > 10 && (data[at] < 235 || data[at + 1] < 235 || data[at + 2] < 235);
        if (drawn) farthest = Math.max(farthest, Math.hypot(x + 0.5 - info.width / 2, y + 0.5 - info.height / 2));
      }
    }
    // The safe zone is a circle with a diameter of 80 % of the icon.
    expect(farthest).toBeLessThanOrEqual(size * 0.4);
  });

  it('has a solid background on the maskable icons, since the mask shows whatever is behind the emblem', async () => {
    for (const icon of icons.filter((i) => i.purpose === 'maskable')) {
      const { data } = await sharp(pub(icon.src.replace(/^\//, ''))).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(data[3], icon.src).toBe(255);
    }
  });
});
