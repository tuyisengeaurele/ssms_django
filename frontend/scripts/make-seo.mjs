// Writes robots.txt and sitemap.xml for the site address (see siteUrl.mjs).
// Runs before every build (see "prebuild" in package.json).
import { writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSiteUrl } from './siteUrl.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pub = resolve(here, '../public');

const resolved = resolveSiteUrl(process.env);
const site = resolved ?? 'http://localhost:5173';
if (!resolved) {
  console.warn('VITE_SITE_URL is not set, using http://localhost:5173 for robots.txt and sitemap.xml');
}

const pages = ['/', '/login', '/register', '/privacy', '/terms'];
const today = new Date().toISOString().slice(0, 10);

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages.map((p) => `  <url><loc>${site}${p === '/' ? '/' : p}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`;

const robots = `User-agent: *
Allow: /
Disallow: /admin
Disallow: /farmer
Disallow: /supervisor

Sitemap: ${site}/sitemap.xml
`;

await writeFile(resolve(pub, 'sitemap.xml'), sitemap);
await writeFile(resolve(pub, 'robots.txt'), robots);
console.log(`robots.txt and sitemap.xml written for ${site}`);
