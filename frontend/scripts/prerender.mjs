// Run after both builds: npm run build does it. Turns dist/index.html into the landing page, already drawn, and keeps the plain
// app shell as dist/app.html for every other address (vercel.json sends them there).
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildLandingPage, fontsToPreload, stylesheetsOf } from './prerender-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../dist');
const server = resolve(here, '../dist-server');

const indexPath = resolve(dist, 'index.html');
const shell = readFileSync(indexPath, 'utf8');
copyFileSync(indexPath, resolve(dist, 'app.html'));

const manifest = JSON.parse(readFileSync(resolve(dist, '.vite/manifest.json'), 'utf8'));
const { stylesheets, modulepreloads } = stylesheetsOf(manifest);

const sheets = readdirSync(resolve(dist, 'assets')).filter((file) => file.endsWith('.css'));
const css = sheets.map((file) => readFileSync(resolve(dist, 'assets', file), 'utf8')).join('\n');
const fonts = fontsToPreload(css);
if (fonts.length === 0) throw new Error('Found no fonts to preload in the built styles. Did the font imports change?');

const { renderLanding } = await import(pathToFileURL(resolve(server, 'entry-server.js')).href);

writeFileSync(indexPath, buildLandingPage({ shell, appHtml: renderLanding(), stylesheets, modulepreloads, fonts }));
console.log(`Prerendered the landing page into dist/index.html (${fonts.length} fonts, ${stylesheets.length} stylesheet, plain shell kept as dist/app.html).`);
