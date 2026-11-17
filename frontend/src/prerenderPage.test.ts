import { describe, expect, it } from 'vitest';
import { buildLandingPage, fontsToPreload, stylesheetsOf } from '../scripts/prerender-lib.mjs';

// dist/index.html is the home address: the app shell with the landing page already written into it. The plain shell moves to
// dist/app.html, which serves every other address. These checks cover how the first is made from the second.

const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <title>Smart Sericulture Management System (SSMS)</title>
    <script src="/theme-boot.js"></script>
    <script src="/hero-preload.js"></script>
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-abc.css">
  </head>
  <body>
    <noscript><p>needs JavaScript</p></noscript>
    <div id="root"></div>
  </body>
</html>`;

const options = {
  shell: SHELL,
  appHtml: '<div class="landing"><h1>Raise healthier silkworms.</h1></div>',
  stylesheets: ['/assets/LandingPage-xyz.css'],
  modulepreloads: ['/assets/LandingPage-xyz.js'],
  fonts: ['/assets/geist-latin-wght-normal-1.woff2'],
};

describe('buildLandingPage', () => {
  const page = buildLandingPage(options);

  it('writes the rendered page into the root and marks it as prerendered', () => {
    expect(page).toContain('<div id="root" data-prerendered="true"><div class="landing"><h1>Raise healthier silkworms.</h1></div></div>');
    expect(page).not.toContain('<div id="root"></div>');
  });

  it('asks for the landing styles in the head, so the first paint is not unstyled', () => {
    const head = page.slice(0, page.indexOf('</head>'));
    expect(head).toContain('<link rel="stylesheet" crossorigin href="/assets/LandingPage-xyz.css">');
  });

  it('starts loading the landing code and the fonts before the main script runs', () => {
    const head = page.slice(0, page.indexOf('</head>'));
    expect(head).toContain('<link rel="modulepreload" crossorigin href="/assets/LandingPage-xyz.js">');
    expect(head).toContain('<link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/geist-latin-wght-normal-1.woff2">');
  });

  it('preloads the hero photo with a link the browser can see at once, not with a script', () => {
    expect(page).not.toContain('/hero-preload.js');
    expect(page).toMatch(/<link rel="preload" as="image" type="image\/avif" fetchpriority="high" imagesrcset="[^"]*hero-bg-1280\.avif 1280w[^"]*" imagesizes="[^"]+">/);
  });

  it('keeps the rest of the shell as it was', () => {
    expect(page).toContain('<title>Smart Sericulture Management System (SSMS)</title>');
    expect(page).toContain('<script src="/theme-boot.js"></script>');
    expect(page).toContain('src="/assets/index-abc.js"');
    expect(page).toContain('<noscript>');
  });

  it('does not ask twice for a file the shell already loads', () => {
    const shell = SHELL.replace('</head>', '<link rel="modulepreload" crossorigin href="/assets/react-q.js"></head>');
    const out = buildLandingPage({ ...options, shell, modulepreloads: ['/assets/react-q.js', '/assets/LandingPage-xyz.js'] });
    expect(out.match(/href="\/assets\/react-q\.js"/g)).toHaveLength(1);
    expect(out).toContain('href="/assets/LandingPage-xyz.js"');
  });

  it('refuses a shell that has no empty root to fill', () => {
    expect(() => buildLandingPage({ ...options, shell: '<html><body></body></html>' })).toThrow(/root/);
    expect(() => buildLandingPage({ ...options, shell: SHELL.replace('<div id="root"></div>', '<div id="root"><p>x</p></div>') })).toThrow(/root/);
  });

  it('refuses an empty render, which would ship a blank page', () => {
    expect(() => buildLandingPage({ ...options, appHtml: '   ' })).toThrow(/empty/);
  });
});

describe('stylesheetsOf and fontsToPreload', () => {
  const manifest = {
    'index.html': { file: 'assets/index-abc.js', css: ['assets/index-abc.css'], isEntry: true },
    'src/pages/LandingPage.tsx': {
      file: 'assets/LandingPage-xyz.js',
      css: ['assets/LandingPage-xyz.css'],
      imports: ['index.html'],
      isDynamicEntry: true,
    },
  };

  it('finds the landing chunk and the styles only it needs', () => {
    expect(stylesheetsOf(manifest)).toEqual({ stylesheets: ['/assets/LandingPage-xyz.css'], modulepreloads: ['/assets/LandingPage-xyz.js'] });
  });

  it('says plainly when the landing chunk is missing', () => {
    expect(() => stylesheetsOf({ 'index.html': manifest['index.html'] })).toThrow(/LandingPage/);
  });

  it('picks the two fonts the first screen uses from the stylesheet text, and no others', () => {
    const css = [
      '@font-face{font-family:Fraunces;src:url(/assets/fraunces-latin-wght-normal-AAA.woff2) format("woff2")}',
      '@font-face{font-family:Fraunces;font-style:italic;src:url(/assets/fraunces-latin-wght-italic-BBB.woff2) format("woff2")}',
      '@font-face{font-family:Geist;src:url(/assets/geist-latin-wght-normal-CCC.woff2) format("woff2")}',
      '@font-face{font-family:Geist;src:url(/assets/geist-latin-ext-wght-normal-DDD.woff2) format("woff2")}',
    ].join('\n');
    expect(fontsToPreload(css)).toEqual([
      '/assets/fraunces-latin-wght-normal-AAA.woff2',
      '/assets/fraunces-latin-wght-italic-BBB.woff2',
      '/assets/geist-latin-wght-normal-CCC.woff2',
    ]);
  });
});
