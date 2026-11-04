import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The website host sends these headers. The site is built to meet them: no inline script, no eval, and every other
// address it talks to is named below. A change that breaks one of those fails here before the browser console does.

const root = join(__dirname, '..', '..');
const vercel = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const html = readFileSync(join(root, 'index.html'), 'utf8');
const renderYaml = readFileSync(join(root, '..', 'render.yaml'), 'utf8');

const everyPage = vercel.headers.find((h) => h.source === '/(.*)')!.headers;
const header = (name: string) => everyPage.find((h) => h.key.toLowerCase() === name.toLowerCase())?.value;

// Report-only until the console has been checked on every role's pages. Then it is enforced under its own name.
const policyText = header('Content-Security-Policy') ?? header('Content-Security-Policy-Report-Only') ?? '';
const policy = Object.fromEntries(
  policyText.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
    const [name, ...sources] = part.split(/\s+/);
    return [name, sources];
  }),
) as Record<string, string[]>;

describe('Website security headers', () => {
  it('has a Content Security Policy, and only one', () => {
    expect(policyText).not.toBe('');
    expect(Boolean(header('Content-Security-Policy')) && Boolean(header('Content-Security-Policy-Report-Only'))).toBe(false);
  });

  it('loads everything from the site itself unless a source is named', () => {
    expect(policy['default-src']).toEqual(["'self'"]);
    expect(policy['object-src']).toEqual(["'none'"]);
    expect(policy['base-uri']).toEqual(["'self'"]);
    expect(policy['form-action']).toEqual(["'self'"]);
    expect(policy['frame-ancestors']).toEqual(["'none'"]);
  });

  it('allows scripts only from the site and the bot check', () => {
    expect(policy['script-src']).toEqual(["'self'", 'https://challenges.cloudflare.com']);
  });

  it('allows inline styles, because the map and the charts set them. That is accepted.', () => {
    expect(policy['style-src']).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it('allows the pictures the site shows: its own, photos, and map tiles', () => {
    expect(policy['img-src']).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:', 'https://res.cloudinary.com', 'https://tile.openstreetmap.org']));
  });

  it('lets the site talk to the API, and to nothing else but error reports and the bot check', () => {
    const connect = policy['connect-src'];
    expect(connect).toContain("'self'");
    expect(connect).toContain('https://challenges.cloudflare.com');
    const others = connect.filter((s) => !s.startsWith("'") && !/sentry\.io$/.test(s) && s !== 'https://challenges.cloudflare.com');
    expect(others).toHaveLength(1);
  });

  it('names the API from the one place that names it', () => {
    const host = renderYaml.match(/key: ALLOWED_HOSTS\s+value: "([^"]+)"/)?.[1];
    expect(host).toBeTruthy();
    expect(policy['connect-src']).toContain(`https://${host}`);
  });

  it('frames only the bot check', () => {
    expect(policy['frame-src']).toEqual(['https://challenges.cloudflare.com']);
  });

  it('never allows eval or an inline script', () => {
    expect(policyText).not.toContain("'unsafe-eval'");
    expect(policy['script-src']).not.toContain("'unsafe-inline'");
  });

  it('has no inline script in the page, so a strict script policy is true', () => {
    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
    for (const [, attrs, body] of scripts) {
      if (/type="application\/ld\+json"/.test(attrs)) continue;
      expect(attrs, 'an inline script needs a hash or a file').toMatch(/\bsrc=/);
      expect(body.trim()).toBe('');
    }
  });

  it('asks the browser for the camera and the location only for this site, and never the microphone', () => {
    expect(header('Permissions-Policy')).toBe('camera=(self), geolocation=(self), microphone=()');
  });

  it('tells the browser to keep using https', () => {
    expect(header('Strict-Transport-Security')).toMatch(/^max-age=\d{7,}; includeSubDomains/);
  });

  it('keeps the headers the site already sent', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
  });
});
