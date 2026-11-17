// Run after a build: npm run check:prerender
// The home page must arrive with the landing page already in it, and every other address must get the plain shell. Either one
// going wrong is silent: the site still works, only slower or with a flash of the wrong page.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../dist');
const home = readFileSync(resolve(dist, 'index.html'), 'utf8');
const shell = readFileSync(resolve(dist, 'app.html'), 'utf8');

const problems = [];
if (!home.includes('<div id="root" data-prerendered="true"><div class="landing">')) problems.push('dist/index.html has no prerendered landing page');
if (!/<h1[^>]*>/.test(home)) problems.push('dist/index.html has no headline');
if (home.includes('/hero-preload.js')) problems.push('dist/index.html still loads the hero preload script');
if (!shell.includes('<div id="root"></div>')) problems.push('dist/app.html is not the plain shell');
if (shell.includes('data-prerendered')) problems.push('dist/app.html carries the landing page');

if (problems.length) {
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log('The home page is prerendered and the plain shell is kept as app.html.');
