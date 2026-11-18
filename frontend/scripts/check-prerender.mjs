// Run after a build: npm run check:prerender
// The landing page must arrive already written, in each language, at its own address, and every other address must get the plain
// shell. Any of these going wrong is silent: the site still works, only slower, with a flash of the wrong page or the wrong
// language for a search engine.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { landingAddress, landingFile, siteOf } from './prerender-lib.mjs';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const shell = readFileSync(resolve(dist, 'app.html'), 'utf8');
const site = siteOf(shell);

// A word that only the headline of that language has, and the English headline that must not be in the others.
const HEADLINE = { en: 'Raise healthier silkworms.', fr: 'Élevez des vers à soie en meilleure santé.', rw: 'Korora inyo z' };
const LOCALES = ['en', 'fr', 'rw'];

const problems = [];
const check = (condition, message) => {
  if (!condition) problems.push(message);
};

for (const locale of LOCALES) {
  const file = `dist/${landingFile(locale)}`;
  let page = '';
  try {
    page = readFileSync(resolve(dist, landingFile(locale)), 'utf8');
  } catch {
    problems.push(`${file} is missing`);
    continue;
  }
  check(page.includes('<div id="root" data-prerendered="true"><div class="landing">'), `${file} has no prerendered landing page`);
  check(/<h1[^>]*>/.test(page), `${file} has no headline`);
  check(page.includes(HEADLINE[locale]), `${file} does not have the ${locale} headline`);
  if (locale !== 'en') check(!page.includes(HEADLINE.en), `${file} still has the English headline`);
  check(page.includes(`<html lang="${locale}">`), `${file} does not say it is ${locale}`);
  check(page.includes(`<link rel="canonical" href="${site}${landingAddress(locale)}" />`), `${file} has the wrong canonical address`);
  for (const other of LOCALES) check(page.includes(`hreflang="${other}" href="${site}${landingAddress(other)}"`), `${file} does not list ${other} as an alternate`);
  check(page.includes(`hreflang="x-default" href="${site}/"`), `${file} has no x-default alternate`);
  check(locale === 'en' || /<link rel="modulepreload" crossorigin href="\/assets\/translations-[^"]+\.js">/.test(page), `${file} does not ask for its language file`);
  check(!page.includes('/hero-preload.js'), `${file} still loads the hero preload script`);
}
check(shell.includes('<div id="root"></div>'), 'dist/app.html is not the plain shell');
check(!shell.includes('data-prerendered'), 'dist/app.html carries the landing page');

// Every other page asks for the saved language early, with a small script the build writes. It must be in the shell and must name
// the same files the landing pages ask for, or a French visitor sees English first again.
check(shell.includes('<script src="/locale-boot.js"></script>'), 'dist/app.html does not load the language boot script');
let boot = '';
try {
  boot = readFileSync(resolve(dist, 'locale-boot.js'), 'utf8');
} catch {
  problems.push('dist/locale-boot.js is missing');
}
for (const locale of ['fr', 'rw']) {
  const page = readFileSync(resolve(dist, landingFile(locale)), 'utf8');
  const file = page.match(/<link rel="modulepreload" crossorigin href="(\/assets\/translations-[^"]+\.js)">/)?.[1];
  check(Boolean(file) && boot.includes(JSON.stringify(file)), `dist/locale-boot.js does not name the ${locale} file (${file}) that dist/${landingFile(locale)} asks for`);
}

if (problems.length) {
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log('The landing page is prerendered in English, French and Kinyarwanda, and the plain shell is kept as app.html.');
