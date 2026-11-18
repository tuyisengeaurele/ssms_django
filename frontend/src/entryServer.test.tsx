import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { landingAddress as buildAddress } from '../scripts/prerender-lib.mjs';
import { landingMeta, renderLanding } from './entry-server';
import { landingAddress as appAddress } from './i18n/landingAddress';

// The build draws the landing page once for each language and writes the three into the site, so a visitor sees their language
// in the first byte of HTML. These checks cover what it draws and the texts it hands the page for search engines and previews.

vi.mock('lenis', () => ({ default: class FakeLenis { on() {} raf() {} destroy() {} scrollTo() {} } }));

const shell = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const inShell = (pattern: RegExp) => shell.match(pattern)?.[1] ?? '';

describe('renderLanding', () => {
  it('draws the English page for English', async () => {
    const html = await renderLanding('en');
    expect(html).toContain('Raise healthier silkworms.');
    expect(html).not.toContain('Élevez des vers à soie');
  });

  it('draws the French page for French, with no English headline left', async () => {
    const html = await renderLanding('fr');
    expect(html).toContain('Élevez des vers à soie en meilleure santé.');
    expect(html).not.toContain('Raise healthier silkworms.');
  });

  it('draws the Kinyarwanda page for Kinyarwanda', async () => {
    const html = await renderLanding('rw');
    // The apostrophe is written as a character reference in HTML.
    expect(html).toContain('Korora inyo z&#x27;ubudodo zifite ubuzima bwiza.');
    expect(html).not.toContain('Raise healthier silkworms.');
  });

  it('draws a page of a similar size in every language, so none is a stub', async () => {
    const sizes = await Promise.all((['en', 'fr', 'rw'] as const).map(async (l) => (await renderLanding(l)).length));
    for (const size of sizes) expect(size).toBeGreaterThan(20000);
  });
});

describe('landingMeta, the texts for search engines and share previews', () => {
  it('are in English exactly what the shell says today, so the English page does not change', async () => {
    const meta = await landingMeta('en');
    expect(meta.description).toBe(inShell(/<meta name="description" content="([^"]*)"/));
    expect(meta.share).toBe(inShell(/<meta property="og:description" content="([^"]*)"/));
    expect(meta.share).toBe(inShell(/<meta name="twitter:description" content="([^"]*)"/));
    expect(JSON.parse(inShell(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/).replace(/%VITE_SITE_URL%/g, 'x')).description).toBe(meta.schema);
  });

  it.each(['fr', 'rw'] as const)('are written out in %s, not left as English or as a name', async (locale) => {
    const meta = await landingMeta(locale);
    const english = await landingMeta('en');
    for (const key of ['description', 'share', 'schema'] as const) {
      expect(meta[key]).not.toBe(english[key]);
      expect(meta[key].length).toBeGreaterThan(30);
      expect(meta[key]).not.toMatch(/\{|\}|^lpMeta/);
    }
  });
});

describe('the address of each language page', () => {
  it('is the same for the build script and for the app, which keep one copy each', () => {
    for (const locale of ['en', 'fr', 'rw'] as const) expect(appAddress(locale)).toBe(buildAddress(locale));
  });
});
