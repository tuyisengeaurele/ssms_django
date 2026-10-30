// The public address of the site, for the share preview, the canonical link, the sitemap and robots.txt.
// Used by vite.config.ts and scripts/make-seo.mjs.

const clean = (value) => (value ?? '').trim().replace(/\/+$/, '');
const withScheme = (value) => (/^https?:\/\//i.test(value) ? value : `https://${value}`);

/**
 * VITE_SITE_URL when it is set. Otherwise, on Vercel, the production address Vercel gives the project, or failing that
 * the address of this deployment. Null when none of them is set, so the caller can choose its own default.
 */
export function resolveSiteUrl(env) {
  for (const name of ['VITE_SITE_URL', 'VERCEL_PROJECT_PRODUCTION_URL', 'VERCEL_URL']) {
    const value = clean(env[name]);
    if (value) return withScheme(value);
  }
  return null;
}
