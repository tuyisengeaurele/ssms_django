// Checks what a visitor to the landing page downloads as JavaScript.
// That is the entry chunk plus the landing page chunk, with everything they import at load time.
// Run after a build: npm run check:bundle
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { evaluate, overLimit } from './bundle-math.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../dist');
const assets = resolve(dist, 'assets');
const BUDGET_KB = Number(process.env.BUNDLE_BUDGET_KB ?? 145);
// French and Kinyarwanda are fetched when a person picks them, so each has its own limit (29 and 31 KB today).
const LOCALE_BUDGET_KB = Number(process.env.LOCALE_BUDGET_KB ?? 35);

const html = readFileSync(resolve(dist, 'index.html'), 'utf8');
const entry = html.match(/src="\/assets\/(index-[^"]+\.js)"/)?.[1];
if (!entry) throw new Error('Could not find the entry script in dist/index.html');

const landing = readdirSync(assets).find((f) => /^LandingPage-.*\.js$/.test(f));
if (!landing) throw new Error('Could not find the landing page chunk');

const seen = new Set();
function walk(file) {
  if (seen.has(file)) return;
  seen.add(file);
  const code = readFileSync(resolve(assets, file), 'utf8');
  // Static imports in minified code look like: import{a as b}from"./x.js"  or  import"./x.js"
  for (const m of code.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) {
    // Skip dynamic import("./x.js"): those are not part of the first load.
    const before = code.slice(Math.max(0, m.index - 1), m.index + 6);
    if (/import\(/.test(code.slice(m.index, m.index + 8))) continue;
    walk(m[1]);
  }
}
walk(entry);
walk(landing);

const rows = [];
for (const file of seen) {
  rows.push([file, gzipSync(readFileSync(resolve(assets, file))).length / 1024]);
}
const { total, ok } = evaluate(rows.map(([, gz]) => gz), BUDGET_KB);
rows.sort((a, b) => b[1] - a[1]);
for (const [file, gz] of rows) console.log(`${gz.toFixed(1).padStart(7)} KB gzip  ${file}`);
console.log(`${total.toFixed(1).padStart(7)} KB gzip  total JS for the landing page (budget ${BUDGET_KB} KB)`);

let failed = false;
if (!ok) {
  console.error('Over budget.');
  failed = true;
}

const languages = readdirSync(assets)
  .filter((f) => /^translations-.*\.js$/.test(f))
  .map((f) => [f, gzipSync(readFileSync(resolve(assets, f))).length / 1024]);
// Two files are expected, French and Kinyarwanda. None would mean the split broke and this check guards nothing.
if (languages.length !== 2) {
  console.error(`Expected two language files (French and Kinyarwanda), found ${languages.length}.`);
  failed = true;
}
for (const [file, gz] of languages) console.log(`${gz.toFixed(1).padStart(7)} KB gzip  ${file} (language file, limit ${LOCALE_BUDGET_KB} KB)`);
for (const [file, gz] of overLimit(languages, LOCALE_BUDGET_KB)) {
  console.error(`${file} is ${gz.toFixed(1)} KB, over the ${LOCALE_BUDGET_KB} KB limit for a language file.`);
  failed = true;
}

if (failed) process.exit(1);
