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

  it('has a manifest with the project name and icons', () => {
    const manifest = JSON.parse(readFileSync(pub('site.webmanifest'), 'utf8'));
    expect(manifest.name).toBe('Smart Sericulture Management System');
    expect(manifest.short_name).toBe('SSMS');
    expect(manifest.theme_color).toBe('#0B1F17');
    expect(manifest.icons.map((i: { sizes: string }) => i.sizes)).toEqual(['192x192', '512x512']);
  });

  it('allows crawlers and points to the sitemap', () => {
    const robots = readFileSync(pub('robots.txt'), 'utf8');
    expect(robots).toMatch(/User-agent: \*/);
    expect(robots).toMatch(/Allow: \//);
    expect(robots).toMatch(/Sitemap: /);
  });

  it('keeps the sitemap script next to the other build scripts', () => {
    expect(existsSync(resolve(root, 'scripts/make-seo.mjs'))).toBe(true);
  });
});
