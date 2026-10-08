// Fails if the built site points at a file that is not in dist, or if a secret-looking value ships.
// Run after a build: npm run check:links
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, '../dist');
const assets = resolve(dist, 'assets');

const files = [resolve(dist, 'index.html'), ...readdirSync(assets).filter((f) => /\.(js|css)$/.test(f)).map((f) => resolve(assets, f))];

const missing = new Set();
const FILE_REF = /["'(]\s*(\/(?:images|assets)\/[A-Za-z0-9_\-./]+\.(?:avif|webp|png|jpe?g|svg|woff2?|js|css)|\/(?:favicon-32|apple-touch-icon|icon-192|icon-512|logo)\.png|\/site\.webmanifest|\/robots\.txt|\/sitemap\.xml)/g;

for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(FILE_REF)) {
    if (!existsSync(resolve(dist, m[1].slice(1)))) missing.add(`${m[1]}  (in ${file.split(/[\\/]/).pop()})`);
  }
}

const SECRET_LOOKING = [
  /AKIA[0-9A-Z]{16}/,
  /sk_(live|test)_[0-9a-zA-Z]{16,}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /SECRET_KEY\s*[:=]\s*["'][^"']{8,}/,
  /RwandaKigali/,
  /EMAIL_HOST_PASSWORD/,
];
const leaks = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  for (const re of SECRET_LOOKING) if (re.test(text)) leaks.push(`${re}  (in ${file.split(/[\\/]/).pop()})`);
}

if (missing.size) {
  console.error('Missing files:');
  for (const m of missing) console.error('  ' + m);
}
if (leaks.length) {
  console.error('Secret-looking values in the build:');
  for (const l of leaks) console.error('  ' + l);
}
if (missing.size || leaks.length) process.exit(1);
console.log(`Checked ${files.length} built files: every referenced file exists and nothing secret-looking ships.`);
