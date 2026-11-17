// Cuts one language out of the translation files at build time.
//
// The files in src/i18n keep English, French and Kinyarwanda side by side, as k('Users', 'Utilisateurs', 'Abakoresha') or
// { en: '...', fr: '...', rw: '...' }. Importing one of them with ?locale=fr gives the same file with only the French left, so
// the app downloads English and the one other language a person reads, not all three.
import ts from 'typescript';

export const LOCALES = ['en', 'fr', 'rw'];

const INDEX = { en: 0, fr: 1, rw: 2 };

/** Rewrite a translation source so every text is just the string of one language. */
export function pickLocale(code, locale) {
  if (!(locale in INDEX)) throw new Error(`Unknown language "${locale}". Expected one of ${LOCALES.join(', ')}.`);

  const file = ts.createSourceFile('translations.ts', code, ts.ScriptTarget.Latest, true);
  const edits = [];

  const visit = (node) => {
    // k('English', 'Français', 'Kinyarwanda')
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'k' && node.arguments.length === 3) {
      edits.push([node.getStart(file), node.getEnd(), node.arguments[INDEX[locale]].getText(file)]);
      return;
    }
    // { en: '...', fr: '...', rw: '...' }, and nothing else
    if (ts.isObjectLiteralExpression(node) && node.properties.length === 3) {
      const named = new Map();
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)) named.set(property.name.text, property.initializer);
      }
      if (LOCALES.every((name) => named.has(name))) {
        edits.push([node.getStart(file), node.getEnd(), named.get(locale).getText(file)]);
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);

  let out = code;
  for (const [start, end, text] of edits.sort((a, b) => b[0] - a[0])) out = out.slice(0, start) + text + out.slice(end);
  return out;
}

const QUERY = /\?locale=(en|fr|rw)$/;

/**
 * Vite plugin. A module imported with ?locale=xx is cut down to that language, and so are the translation files it imports in
 * turn, so one import of src/i18n/translations?locale=fr gives every French text and nothing else.
 */
export function localeSplit() {
  return {
    name: 'ssms-locale-split',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      const locale = importer?.match(QUERY)?.[1];
      if (!locale || !source.startsWith('.')) return null;
      const resolved = await this.resolve(source, importer.replace(QUERY, ''), { ...options, skipSelf: true });
      return resolved && !resolved.external && /\.tsx?$/.test(resolved.id) ? `${resolved.id}?locale=${locale}` : resolved;
    },
    transform(code, id) {
      const locale = id.match(QUERY)?.[1];
      return locale ? { code: pickLocale(code, locale), map: null } : null;
    },
  };
}
