// Checks what a visitor to the landing page downloads as JavaScript.
// That is the entry chunk plus the landing page chunk, with everything they import at load time.
// Run after a build: npm run check:bundle
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../dist');
const assets = resolve(dist, 'assets');
const BUDGET_KB = Number(process.env.BUNDLE_BUDGET_KB ?? 250);

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

let total = 0;
const rows = [];
for (const file of seen) {
  const gz = gzipSync(readFileSync(resolve(assets, file))).length / 1024;
  total += gz;
  rows.push([file, gz]);
}
rows.sort((a, b) => b[1] - a[1]);
for (const [file, gz] of rows) console.log(`${gz.toFixed(1).padStart(7)} KB gzip  ${file}`);
console.log(`${total.toFixed(1).padStart(7)} KB gzip  total JS for the landing page (budget ${BUDGET_KB} KB)`);

if (total > BUDGET_KB) {
  console.error('Over budget.');
  process.exit(1);
}
