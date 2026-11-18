// Run after both builds: npm run build does it. Turns the app shell into the landing page, already drawn, once for each language:
// dist/index.html (English), dist/fr/index.html and dist/rw/index.html. The plain app shell is kept as dist/app.html for every
// other address (vercel.json sends them there).
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { localeBootScript } from './locale-boot.mjs';
import { buildLandingPage, fontsToPreload, landingFile, languageFileOf, stylesheetsOf } from './prerender-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../dist');
const server = resolve(here, '../dist-server');
const LOCALES = ['en', 'fr', 'rw'];

const indexPath = resolve(dist, 'index.html');
const shell = readFileSync(indexPath, 'utf8');
copyFileSync(indexPath, resolve(dist, 'app.html'));

const manifest = JSON.parse(readFileSync(resolve(dist, '.vite/manifest.json'), 'utf8'));
const { stylesheets, modulepreloads } = stylesheetsOf(manifest);

const sheets = readdirSync(resolve(dist, 'assets')).filter((file) => file.endsWith('.css'));
const css = sheets.map((file) => readFileSync(resolve(dist, 'assets', file), 'utf8')).join('\n');
const fonts = fontsToPreload(css);
if (fonts.length === 0) throw new Error('Found no fonts to preload in the built styles. Did the font imports change?');

const { renderLanding, landingMeta } = await import(pathToFileURL(resolve(server, 'entry-server.js')).href);

for (const locale of LOCALES) {
  const page = buildLandingPage({
    shell,
    appHtml: await renderLanding(locale),
    stylesheets,
    modulepreloads,
    fonts,
    locale,
    meta: await landingMeta(locale),
    languageFile: languageFileOf(manifest, locale),
  });
  const file = resolve(dist, landingFile(locale));
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, page);
}
// The page that asks for the saved language early (see locale-boot.mjs). It is not under /assets, so the host does not cache it
// for a year: the file names inside it change with each build.
writeFileSync(resolve(dist, 'locale-boot.js'), localeBootScript({ fr: languageFileOf(manifest, 'fr'), rw: languageFileOf(manifest, 'rw') }));
console.log(`Prerendered the landing page in ${LOCALES.length} languages (${fonts.length} fonts, ${stylesheets.length} stylesheet, plain shell kept as dist/app.html).`);
