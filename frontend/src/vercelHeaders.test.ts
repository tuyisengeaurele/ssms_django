import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The content security policy is sent by Vercel (vercel.json). It was "report only" from 2026-11-12, so the browser told the API what
// it would have blocked without blocking anything. Eight days of real use gave no genuine report (only our own probes), and every
// outside host the code references is in it, so it is enforced since 2026-11-20. It keeps reporting, so a later violation still
// reaches the Security log. These checks keep the policy honest: it is enforced, it reports to our own API, and it still names every
// outside host the app really uses.

interface Header { key: string; value: string }
const config = JSON.parse(readFileSync(join(__dirname, '../vercel.json'), 'utf8')) as {
  headers: Array<{ source: string; headers: Header[] }>;
  rewrites: Array<{ source: string; destination: string }>;
  redirects?: Array<{ source: string; destination: string; permanent?: boolean; has?: unknown }>;
};
const all: Header[] = config.headers.find((h) => h.source === '/(.*)')!.headers;
const policy = all.find((h) => h.key.startsWith('Content-Security-Policy'));

describe('the content security policy header', () => {
  it('exists', () => {
    expect(policy).toBeDefined();
  });

  it('is enforced, not only reported', () => {
    expect(policy?.key).toBe('Content-Security-Policy');
  });

  it('sends its reports to the API on the same address', () => {
    expect(policy?.value).toContain('report-uri /api/csp-report');
  });

  it('reaches the API through the same rewrite as every other call', () => {
    // A report sent to /api/csp-report is forwarded by this rewrite, so it needs no separate allowance in the policy.
    expect(config.rewrites.some((r) => r.source.startsWith('/api/'))).toBe(true);
  });

  it('still names every outside host the app uses', () => {
    for (const host of ['challenges.cloudflare.com', 'res.cloudinary.com', 'tile.openstreetmap.org', 'ingest.sentry.io']) {
      expect(policy?.value, host).toContain(host);
    }
  });

  it('still shuts out frames, plugins and other sites', () => {
    for (const rule of ["object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "default-src 'self'"]) {
      expect(policy?.value, rule).toContain(rule);
    }
  });
});

describe('the rewrites that serve the app', () => {
  // The home address is a static file, the landing page already written out (dist/index.html). Every other address that is
  // not a file is the plain app shell (dist/app.html), so a visit to /login never flashes the landing page first.
  const rewrites = config.rewrites;

  it('sends the API through first', () => {
    expect(rewrites[0].source).toBe('/api/:path*');
    expect(rewrites[0].destination).toMatch(/^https:\/\//);
  });

  it('serves the plain app shell, not the prerendered home page, for every other address', () => {
    const catchAll = rewrites[rewrites.length - 1];
    expect(catchAll.source).toMatch(/^\/\(/);
    expect(catchAll?.destination).toBe('/app.html');
  });
});

describe('the language addresses', () => {
  // English is the root address. /en is not a page, but people will type it, so it goes to the root.
  const redirects = config.redirects ?? [];
  const cookieRedirects = redirects.filter((r) => r.source === '/');

  it('sends /en to the English page for good', () => {
    expect(redirects).toContainEqual({ source: '/en', destination: '/', permanent: true });
  });

  it('sends a returning visitor who chose French or Kinyarwanda from the root to that page, by the cookie only', () => {
    expect(cookieRedirects).toEqual([
      { source: '/', has: [{ type: 'cookie', key: 'ssms_locale', value: 'fr' }], destination: '/fr', permanent: false },
      { source: '/', has: [{ type: 'cookie', key: 'ssms_locale', value: 'rw' }], destination: '/rw', permanent: false },
    ]);
  });

  it('never redirects by the language of the browser, which a search engine does not have', () => {
    const conditions = cookieRedirects.flatMap((r) => (r.has as Array<{ type: string }>).map((h) => h.type));
    expect(conditions.every((type) => type === 'cookie')).toBe(true);
  });

  it('serves the French and Kinyarwanda pages at /fr and /rw, whether or not the host would find the folder index by itself', () => {
    expect(config.rewrites).toContainEqual({ source: '/fr', destination: '/fr/index.html' });
    expect(config.rewrites).toContainEqual({ source: '/rw', destination: '/rw/index.html' });
  });

  it('puts those rewrites after the API and before the catch-all, so neither is shadowed', () => {
    const order = config.rewrites.map((r) => r.source);
    expect(order[0]).toBe('/api/:path*');
    expect(order.indexOf('/fr')).toBeLessThan(order.length - 1);
    expect(order.indexOf('/rw')).toBeLessThan(order.length - 1);
    expect(order.indexOf('/fr')).toBeGreaterThan(0);
  });

  it('keeps the root redirect temporary, so a search engine that once saw it does not remember it', () => {
    expect(cookieRedirects.every((r) => r.permanent === false)).toBe(true);
  });

  it('redirects nothing else, and never to an address it redirects from, so no address can loop', () => {
    const sources = new Set(redirects.map((r) => r.source));
    expect([...sources].sort()).toEqual(['/', '/en']);
    expect(redirects.filter((r) => sources.has(r.destination) && r.destination !== '/')).toEqual([]);
    expect(redirects.filter((r) => r.source === r.destination)).toEqual([]);
  });
});
