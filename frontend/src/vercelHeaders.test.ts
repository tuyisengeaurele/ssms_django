import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The content security policy is sent by Vercel (vercel.json). It starts as "report only", so the browser tells the API what
// it would have blocked, without blocking anything. After a quiet week it is enforced. These checks keep the policy honest in
// both stages: it reports to our own API, and it still names every outside host the app really uses.

interface Header { key: string; value: string }
const config = JSON.parse(readFileSync(join(__dirname, '../vercel.json'), 'utf8')) as {
  headers: Array<{ source: string; headers: Header[] }>;
  rewrites: Array<{ source: string; destination: string }>;
};
const all: Header[] = config.headers.find((h) => h.source === '/(.*)')!.headers;
const policy = all.find((h) => h.key.startsWith('Content-Security-Policy'));

describe('the content security policy header', () => {
  it('exists', () => {
    expect(policy).toBeDefined();
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
