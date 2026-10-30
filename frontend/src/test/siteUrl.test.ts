// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { resolveSiteUrl } from '../../scripts/siteUrl.mjs';

// The share preview, the canonical link, the sitemap and robots.txt all need the real address of the site. On Vercel
// it can come from our own setting or from the address Vercel gives the project.

describe('resolveSiteUrl', () => {
  it('uses the address set by hand first', () => {
    expect(resolveSiteUrl({ VITE_SITE_URL: 'https://ssms.rw', VERCEL_PROJECT_PRODUCTION_URL: 'ssms-django.vercel.app' })).toBe('https://ssms.rw');
  });

  it('drops a trailing slash and spaces', () => {
    expect(resolveSiteUrl({ VITE_SITE_URL: '  https://ssms.rw/// ' })).toBe('https://ssms.rw');
  });

  it('adds https when only a host was given', () => {
    expect(resolveSiteUrl({ VITE_SITE_URL: 'ssms.rw' })).toBe('https://ssms.rw');
  });

  it('keeps http for a local address', () => {
    expect(resolveSiteUrl({ VITE_SITE_URL: 'http://localhost:4173' })).toBe('http://localhost:4173');
  });

  it('uses the production address Vercel gives the project when nothing was set', () => {
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'ssms-django.vercel.app', VERCEL_URL: 'ssms-django-git-x.vercel.app' })).toBe('https://ssms-django.vercel.app');
  });

  it('falls back to the address of this deployment when Vercel gives no production one', () => {
    expect(resolveSiteUrl({ VERCEL_URL: 'ssms-django-abc123.vercel.app' })).toBe('https://ssms-django-abc123.vercel.app');
  });

  it('gives nothing outside Vercel with nothing set, so the caller can pick its own default', () => {
    expect(resolveSiteUrl({})).toBeNull();
  });

  it('ignores empty values', () => {
    expect(resolveSiteUrl({ VITE_SITE_URL: '   ', VERCEL_PROJECT_PRODUCTION_URL: '' })).toBeNull();
  });
});
