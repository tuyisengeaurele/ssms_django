// How the home page is made from the app shell. The build renders the landing page to HTML and writes it into the shell, so a
// visitor sees the page as soon as the HTML and styles arrive, before any script has run. Kept free of file access so it can be
// tested on its own; scripts/prerender.mjs does the reading and writing.

const EMPTY_ROOT = '<div id="root"></div>';

// The hero photo, in the sizes Hero.tsx offers. It was started by public/hero-preload.js, which a script can only do after the
// browser has run it. A link in the HTML is seen while the page is still being read.
const HERO_PRELOAD =
  '<link rel="preload" as="image" type="image/avif" fetchpriority="high" ' +
  'imagesrcset="/images/hero-bg-640.avif 640w, /images/hero-bg-1280.avif 1280w, /images/hero-bg-1920.avif 1920w, /images/hero-bg-2560.avif 2560w" ' +
  'imagesizes="(min-width: 1400px) 1360px, 100vw">';

const LOCALES = ['en', 'fr', 'rw'];
const SHARE_LOCALE = { en: 'en_US', fr: 'fr_FR', rw: 'rw_RW' };

/** The address of the landing page in a language. English is the root, the others have a short prefix. */
export const landingAddress = (locale) => (locale === 'en' ? '/' : `/${locale}`);

/** The file the host serves at that address. */
export const landingFile = (locale) => (locale === 'en' ? 'index.html' : `${locale}/index.html`);

/** The address of the site, found in the canonical link the build wrote into the shell, without the slash at the end. */
export function siteOf(shell) {
  const found = shell.match(/<link rel="canonical" href="([^"]*?)\/?"\s*\/?>/);
  if (!found) throw new Error('The app shell has no canonical link, so the address of each language page cannot be worked out.');
  return found[1];
}

const attribute = (text) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/**
 * One language of the landing page, made from the app shell. It is a whole page: the language, the texts search engines and
 * share previews read, its own address, the list of the other languages, and a request for its language file.
 *
 * @param {{
 *   shell: string, appHtml: string, stylesheets: string[], modulepreloads: string[], fonts: string[],
 *   locale: 'en' | 'fr' | 'rw', meta: { description: string, share: string, schema: string }, languageFile?: string
 * }} options
 */
export function buildLandingPage({ shell, appHtml, stylesheets, modulepreloads, fonts, locale, meta, languageFile }) {
  if (shell.split(EMPTY_ROOT).length !== 2) {
    throw new Error('The app shell needs exactly one empty root element (<div id="root"></div>) to write the landing page into.');
  }
  if (!appHtml.trim()) {
    throw new Error('The landing page rendered empty, so it would ship a blank home page.');
  }
  const site = siteOf(shell);
  const own = `${site}${landingAddress(locale)}`;

  const head = [
    ...fonts.map((href) => `<link rel="preload" as="font" type="font/woff2" crossorigin href="${href}">`),
    HERO_PRELOAD,
    ...modulepreloads.filter((href) => !shell.includes(`href="${href}"`)).map((href) => `<link rel="modulepreload" crossorigin href="${href}">`),
    ...(languageFile ? [`<link rel="modulepreload" crossorigin href="${languageFile}">`] : []),
    ...stylesheets.map((href) => `<link rel="stylesheet" crossorigin href="${href}">`),
    // The other languages of this page, and the one a search engine falls back to.
    ...LOCALES.map((other) => `<link rel="alternate" hreflang="${other}" href="${site}${landingAddress(other)}" />`),
    `<link rel="alternate" hreflang="x-default" href="${site}${landingAddress('en')}" />`,
    `<meta property="og:locale" content="${SHARE_LOCALE[locale]}" />`,
    ...LOCALES.filter((other) => other !== locale).map((other) => `<meta property="og:locale:alternate" content="${SHARE_LOCALE[other]}" />`),
  ]
    .map((line) => `    ${line}\n`)
    .join('');

  return shell
    .replace('<script src="/hero-preload.js"></script>\n', '')
    .replace('<script src="/hero-preload.js"></script>', '')
    .replace(/<html lang="[^"]*">/, `<html lang="${locale}">`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${attribute(meta.description)}" />`)
    .replace(/<meta property="og:description" content="[^"]*" \/>/, `<meta property="og:description" content="${attribute(meta.share)}" />`)
    .replace(/<meta name="twitter:description" content="[^"]*" \/>/, `<meta name="twitter:description" content="${attribute(meta.share)}" />`)
    .replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${own}" />`)
    .replace(/<meta property="og:url" content="[^"]*" \/>/, `<meta property="og:url" content="${own}" />`)
    .replace(/("url":\s*)"[^"]*"/, `$1"${own}"`)
    .replace(/("description":\s*)"(?:[^"\\]|\\.)*"/, (_all, key) => `${key}${JSON.stringify(meta.schema)}`)
    .replace(/^\s*<meta property="og:locale(?::alternate)?" content="[^"]*" \/>\n/gm, '')
    .replace('</head>', `${head}  </head>`)
    .replace(EMPTY_ROOT, `<div id="root" data-prerendered="true">${appHtml}</div>`);
}

/** The file that holds the texts of a language other than English, from the build manifest. English is in the main script. */
export function languageFileOf(manifest, locale) {
  if (locale === 'en') return undefined;
  const entry = manifest[`src/i18n/translations.ts?locale=${locale}`];
  if (!entry) throw new Error(`The build manifest has no file for the language "${locale}", so its page cannot ask for it.`);
  return `/${entry.file}`;
}

/**
 * The landing chunk and the styles that only it needs, from the build manifest. Anything the main entry already loads is left
 * out, because the shell asks for that itself.
 */
export function stylesheetsOf(manifest) {
  const landing = Object.values(manifest).find((chunk) => chunk.isDynamicEntry && /LandingPage-.*\.js$/.test(chunk.file));
  if (!landing) throw new Error('The build manifest has no LandingPage chunk, so there is nothing to prerender around.');

  const files = new Set();
  const css = new Set();
  const seen = new Set();
  const walk = (chunk) => {
    if (seen.has(chunk)) return;
    seen.add(chunk);
    files.add(chunk.file);
    for (const sheet of chunk.css ?? []) css.add(sheet);
    for (const key of chunk.imports ?? []) {
      const next = manifest[key];
      if (next && !next.isEntry) walk(next);
    }
  };
  walk(landing);

  return {
    stylesheets: [...css].map((file) => `/${file}`),
    modulepreloads: [...files].map((file) => `/${file}`),
  };
}

/**
 * The font files the first screen draws with: the Latin Fraunces (upright and italic, for the headline) and the Latin Geist.
 * They are found in the built stylesheet text, because the file names carry a hash. Other scripts' files stay lazy.
 */
export function fontsToPreload(css) {
  const found = [];
  const pattern = /url\(["']?(\/assets\/(?:fraunces-latin-wght-(?:normal|italic)|geist-latin-wght-normal)-[^)"']+\.woff2)["']?\)/g;
  for (const match of css.matchAll(pattern)) {
    if (!found.includes(match[1])) found.push(match[1]);
  }
  return found;
}
