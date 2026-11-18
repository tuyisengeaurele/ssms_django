// The small script every page loads first (dist/locale-boot.js, next to theme-boot.js). A person who chose French opens an app page:
// without it the French file is asked for only after the main script has run, and the page shows English until it arrives.
// This asks for it straight away, while the main script is still downloading. It makes the same choice as the app (src/startup.ts,
// src/i18n/savedLocale.ts, src/i18n/detectLocale.ts) and src/localeBoot.test.ts holds the two together.
//
// It is plain old JavaScript on purpose: it is not compiled, and it must run in any browser the app supports.
// The language files have hashed names, so the build writes this file once it knows them.

/**
 * The source of the boot script, for the language files the build produced.
 * @param {{ fr?: string, rw?: string }} files The address of the French and the Kinyarwanda file. English is in the main script.
 */
export function localeBootScript(files) {
  const known = {};
  for (const code of ['fr', 'rw']) if (files[code]) known[code] = files[code];

  return `(function () {
  try {
    var FILES = ${JSON.stringify(known)};
    var path = location.pathname;
    if (path === '/' || /^\\/(en|fr|rw)\\/?$/.test(path)) return;

    var KNOWN = { en: 'en', fr: 'fr', rw: 'rw', kin: 'rw' };
    var chosen = null;
    try {
      var stored = localStorage.getItem('ssms_locale');
      if (stored === 'en' || stored === 'fr' || stored === 'rw') chosen = stored;
    } catch (e) {}
    if (!chosen) {
      var cookie = /(?:^|;\\s*)ssms_locale=([^;]*)/.exec(document.cookie);
      if (cookie && (cookie[1] === 'en' || cookie[1] === 'fr' || cookie[1] === 'rw')) chosen = cookie[1];
    }
    if (!chosen) {
      var ranked = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ''];
      for (var i = 0; i < ranked.length; i++) {
        var code = String(ranked[i]).replace(/^\\s+|\\s+$/g, '').split('-')[0].toLowerCase();
        if (KNOWN.hasOwnProperty(code)) {
          chosen = KNOWN[code];
          break;
        }
      }
    }

    var href = chosen && FILES[chosen];
    if (!href) return;
    var shown = href.replace(/\\\\/g, '\\\\\\\\').replace(/"/g, '\\\\"');
    if (document.querySelector('link[rel="modulepreload"][href="' + shown + '"]')) return;
    var link = document.createElement('link');
    link.rel = 'modulepreload';
    link.href = href;
    link.crossOrigin = '';
    document.head.appendChild(link);
  } catch (e) {
    // Without it the app still asks for its language once it has started.
  }
})();
`;
}
