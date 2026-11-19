import { describe, expect, it } from 'vitest';
import { buildLandingPage, fontsToPreload, landingAddress, landingFile, languageFileOf, siteOf, stylesheetsOf } from '../scripts/prerender-lib.mjs';

// dist/index.html is the home address: the app shell with the landing page already written into it. The plain shell moves to
// dist/app.html, which serves every other address. /fr and /rw are the same page in French and Kinyarwanda, each complete in its
// own right. These checks cover how each is made from the shell.

const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <title>Smart Sericulture Management System (SSMS)</title>
    <meta name="description" content="English description." />
    <link rel="canonical" href="https://ssms.example/" />
    <meta property="og:description" content="English share." />
    <meta property="og:url" content="https://ssms.example/" />
    <meta property="og:locale" content="en_US" />
    <meta property="og:locale:alternate" content="fr_FR" />
    <meta property="og:locale:alternate" content="rw_RW" />
    <meta name="twitter:description" content="English share." />
    <script type="application/ld+json">
      {
        "@type": "SoftwareApplication",
        "url": "https://ssms.example/",
        "description": "English schema."
      }
    </script>
    <script src="/theme-boot.js"></script>
    <script src="/locale-boot.js"></script>
    <script src="/hero-preload.js"></script>
    <script type="module" crossorigin src="/assets/index-abc.js"></script>
    <link rel="stylesheet" crossorigin href="/assets/index-abc.css">
  </head>
  <body>
    <noscript><p>needs JavaScript</p></noscript>
    <div id="root"></div>
  </body>
</html>`;

const META = {
  en: { description: 'English description.', share: 'English share.', schema: 'English schema.' },
  fr: { description: 'Description en français avec l\'apostrophe, des "guillemets" et un & commercial.', share: 'Partage en français.', schema: 'Schéma en français.' },
  rw: { description: 'Ibisobanuro mu Kinyarwanda.', share: 'Gusangiza mu Kinyarwanda.', schema: 'Igishushanyo mu Kinyarwanda.' },
};

const options = {
  shell: SHELL,
  appHtml: '<div class="landing"><h1>Raise healthier silkworms.</h1></div>',
  stylesheets: ['/assets/LandingPage-xyz.css'],
  modulepreloads: ['/assets/LandingPage-xyz.js'],
  fonts: ['/assets/geist-latin-wght-normal-1.woff2'],
  locale: 'en' as 'en' | 'fr' | 'rw',
  meta: META.en,
  languageFile: undefined as string | undefined,
};

const head = (page: string) => page.slice(0, page.indexOf('</head>'));

describe('buildLandingPage', () => {
  const page = buildLandingPage(options);

  it('writes the rendered page into the root and marks it as prerendered', () => {
    expect(page).toContain('<div id="root" data-prerendered="true"><div class="landing"><h1>Raise healthier silkworms.</h1></div></div>');
    expect(page).not.toContain('<div id="root"></div>');
  });

  it('asks for the landing styles in the head, so the first paint is not unstyled', () => {
    expect(head(page)).toContain('<link rel="stylesheet" crossorigin href="/assets/LandingPage-xyz.css">');
  });

  it('starts loading the landing code and the fonts before the main script runs', () => {
    expect(head(page)).toContain('<link rel="modulepreload" crossorigin href="/assets/LandingPage-xyz.js">');
    expect(head(page)).toContain('<link rel="preload" as="font" type="font/woff2" crossorigin href="/assets/geist-latin-wght-normal-1.woff2">');
  });

  it('preloads the hero photo with a link the browser can see at once, not with a script', () => {
    expect(page).not.toContain('/hero-preload.js');
    expect(page).toMatch(/<link rel="preload" as="image" type="image\/avif" fetchpriority="high" imagesrcset="[^"]*hero-bg-1280\.avif 1280w[^"]*" imagesizes="[^"]+">/);
  });

  it('leaves out the language boot script, since a language address already asks for its own file in the head', () => {
    expect(page).not.toContain('/locale-boot.js');
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

describe('the English page, which is the shell with the landing page written in', () => {
  const page = buildLandingPage(options);

  it('keeps its language, its texts and its address', () => {
    expect(page).toContain('<html lang="en">');
    expect(page).toContain('<meta name="description" content="English description." />');
    expect(page).toContain('<link rel="canonical" href="https://ssms.example/" />');
    expect(page).toContain('<meta property="og:url" content="https://ssms.example/" />');
    expect(page).toContain('<meta property="og:locale" content="en_US" />');
  });

  it('asks for no language file, since English is in the main script', () => {
    expect(page).not.toMatch(/translations/);
  });
});

describe.each([
  ['fr', '/fr', 'fr_FR', ['en_US', 'rw_RW']],
  ['rw', '/rw', 'rw_RW', ['en_US', 'fr_FR']],
] as const)('the %s page', (locale, path, ogLocale, others) => {
  const page = buildLandingPage({ ...options, locale, meta: META[locale], languageFile: `/assets/translations-${locale}.js` });

  it('says its language to the browser, screen readers and search engines', () => {
    expect(page).toContain(`<html lang="${locale}">`);
    expect(page).not.toContain('<html lang="en">');
  });

  it('carries its own description, share text and schema description, and none of the English', () => {
    expect(page).toContain(META[locale].share);
    expect(page).toContain(META[locale].schema);
    expect(page).toContain(`<meta name="description" content="${META[locale].description.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" />`);
    expect(page).not.toContain('English description.');
    expect(page).not.toContain('English share.');
    expect(page).not.toContain('English schema.');
  });

  it('points its canonical address and share address at itself', () => {
    expect(page).toContain(`<link rel="canonical" href="https://ssms.example${path}" />`);
    expect(page).toContain(`<meta property="og:url" content="https://ssms.example${path}" />`);
    expect(page).not.toContain('<link rel="canonical" href="https://ssms.example/" />');
    expect(page).toContain(`"url": "https://ssms.example${path}"`);
  });

  it('names its own share language and the others as alternates', () => {
    expect(page).toContain(`<meta property="og:locale" content="${ogLocale}" />`);
    for (const other of others) expect(page).toContain(`<meta property="og:locale:alternate" content="${other}" />`);
    expect(page).not.toContain(`<meta property="og:locale:alternate" content="${ogLocale}" />`);
  });

  it('starts fetching its language file from the head, so the app has the words when it starts', () => {
    expect(head(page)).toContain(`<link rel="modulepreload" crossorigin href="/assets/translations-${locale}.js">`);
  });

  it('is still a whole page, with the same rendered content in the root', () => {
    expect(page).toContain('<div id="root" data-prerendered="true"><div class="landing">');
  });

  it('keeps the schema description valid JSON when it holds quotes', () => {
    const schema = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)?.[1] ?? '';
    expect(JSON.parse(schema).description).toBe(META[locale].schema);
  });
});

describe('the alternates every language page lists, so search engines know the three belong together', () => {
  it.each(['en', 'fr', 'rw'] as const)('on the %s page: one for each language and x-default pointing at English', (locale) => {
    const page = buildLandingPage({ ...options, locale, meta: META[locale], languageFile: undefined });
    const links = head(page).match(/<link rel="alternate" hreflang="[^"]+" href="[^"]+" \/>/g) ?? [];
    expect(links).toEqual([
      '<link rel="alternate" hreflang="en" href="https://ssms.example/" />',
      '<link rel="alternate" hreflang="fr" href="https://ssms.example/fr" />',
      '<link rel="alternate" hreflang="rw" href="https://ssms.example/rw" />',
      '<link rel="alternate" hreflang="x-default" href="https://ssms.example/" />',
    ]);
  });
});

describe('where each language page lives', () => {
  it('has an address and a file for each language, English at the root', () => {
    expect(landingAddress('en')).toBe('/');
    expect(landingAddress('fr')).toBe('/fr');
    expect(landingAddress('rw')).toBe('/rw');
    expect(landingFile('en')).toBe('index.html');
    expect(landingFile('fr')).toBe('fr/index.html');
    expect(landingFile('rw')).toBe('rw/index.html');
  });

  it('works out the site address from the canonical link of the shell', () => {
    expect(siteOf(SHELL)).toBe('https://ssms.example');
    expect(siteOf(SHELL.replace('https://ssms.example/', 'http://localhost:5173/'))).toBe('http://localhost:5173');
  });

  it('refuses a shell with no canonical link, since every address would be wrong', () => {
    expect(() => siteOf('<head></head>')).toThrow(/canonical/);
    expect(() => buildLandingPage({ ...options, shell: SHELL.replace(/<link rel="canonical"[^>]*>/, '') })).toThrow(/canonical/);
  });
});

describe('stylesheetsOf, fontsToPreload and languageFileOf', () => {
  const manifest = {
    'index.html': { file: 'assets/index-abc.js', css: ['assets/index-abc.css'], isEntry: true },
    'src/pages/LandingPage.tsx': {
      file: 'assets/LandingPage-xyz.js',
      css: ['assets/LandingPage-xyz.css'],
      imports: ['index.html'],
      isDynamicEntry: true,
    },
    'src/i18n/translations.ts?locale=fr': { file: 'assets/translations-fr1.js', isDynamicEntry: true },
    'src/i18n/translations.ts?locale=rw': { file: 'assets/translations-rw1.js', isDynamicEntry: true },
  };

  it('finds the landing chunk and the styles only it needs', () => {
    expect(stylesheetsOf(manifest)).toEqual({ stylesheets: ['/assets/LandingPage-xyz.css'], modulepreloads: ['/assets/LandingPage-xyz.js'] });
  });

  it('says plainly when the landing chunk is missing', () => {
    expect(() => stylesheetsOf({ 'index.html': manifest['index.html'] })).toThrow(/LandingPage/);
  });

  it('picks the three cut fonts the first screen uses from the stylesheet text, and no others', () => {
    const css = [
      // The full files stay in the stylesheet as the fallback for a rare character. They are not preloaded.
      '@font-face{font-family:Fraunces;src:url(/assets/fraunces-latin-wght-normal-OLD1.woff2) format("woff2")}',
      '@font-face{font-family:Fraunces;font-style:italic;src:url(/assets/fraunces-latin-wght-italic-OLD2.woff2) format("woff2")}',
      '@font-face{font-family:Geist;src:url(/assets/geist-latin-wght-normal-OLD3.woff2) format("woff2")}',
      '@font-face{font-family:Geist;src:url(/assets/geist-latin-ext-wght-normal-DDD.woff2) format("woff2")}',
      '@font-face{font-family:Fraunces;src:url(/assets/fraunces-latin-normal-AAA.woff2) format("woff2")}',
      '@font-face{font-family:Fraunces;font-style:italic;src:url(/assets/fraunces-latin-italic-BBB.woff2) format("woff2")}',
      '@font-face{font-family:Geist;src:url(/assets/geist-latin-normal-CCC.woff2) format("woff2")}',
    ].join('\n');
    expect(fontsToPreload(css)).toEqual([
      '/assets/fraunces-latin-normal-AAA.woff2',
      '/assets/fraunces-latin-italic-BBB.woff2',
      '/assets/geist-latin-normal-CCC.woff2',
    ]);
  });

  it('finds the file that holds each other language, and none for English', () => {
    expect(languageFileOf(manifest, 'fr')).toBe('/assets/translations-fr1.js');
    expect(languageFileOf(manifest, 'rw')).toBe('/assets/translations-rw1.js');
    expect(languageFileOf(manifest, 'en')).toBeUndefined();
  });

  it('says plainly when a language file is missing from the build', () => {
    expect(() => languageFileOf({ 'index.html': manifest['index.html'] }, 'fr')).toThrow(/fr/);
  });
});
