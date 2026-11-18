import { describe, expect, it } from 'vitest';
import { localeBootScript } from '../scripts/locale-boot.mjs';
import { detectLocale } from './i18n/detectLocale';
import { isLocale } from './i18n/locales';

// A person who chose French opens an app page. Until now the French file was asked for only after the main script had run, so the
// page showed English for a moment and then flipped. The boot script (a tiny file the page loads first, like theme-boot.js) asks
// the browser to start downloading the right language file at once, so it is already here when the app starts.
// It has to choose the same language as the app does, so these checks run it against the app's own rules.

const FILES = { fr: '/assets/translations-fr1.js', rw: '/assets/translations-rw1.js' };

interface Situation {
  path?: string;
  storage?: string | null | 'throws';
  cookie?: string;
  languages?: string[];
  language?: string;
  existing?: string[];
}

/** Run the script as a browser would, and say which files it asked for. */
function run(situation: Situation, files: Record<string, string> = FILES): { asked: Array<{ rel: string; href: string; crossOrigin: string }>; error: unknown } {
  const asked: Array<{ rel: string; href: string; crossOrigin: string }> = [];
  const document = {
    cookie: situation.cookie ?? '',
    head: { appendChild: (link: { rel: string; href: string; crossOrigin: string }) => asked.push({ rel: link.rel, href: link.href, crossOrigin: link.crossOrigin }) },
    createElement: () => ({ rel: '', href: '', crossOrigin: null as unknown as string }),
    querySelector: (selector: string) => ((situation.existing ?? []).some((href) => selector.includes(`"${href}"`)) ? {} : null),
  };
  const navigator = { languages: situation.languages, language: situation.language };
  const location = { pathname: situation.path ?? '/login' };
  const localStorage = {
    getItem: () => {
      if (situation.storage === 'throws') throw new Error('blocked');
      return situation.storage ?? null;
    },
  };
  let error: unknown = null;
  try {
    new Function('document', 'navigator', 'location', 'localStorage', localeBootScript(files))(document, navigator, location, localStorage);
  } catch (caught) {
    error = caught;
  }
  return { asked, error };
}
const askedFor = (situation: Situation) => run(situation).asked.map((link) => link.href);

describe('the language file it asks for', () => {
  it.each([
    ['a saved French choice', { storage: 'fr' }, [FILES.fr]],
    ['a saved Kinyarwanda choice', { storage: 'rw' }, [FILES.rw]],
    ['the cookie, when storage is empty', { cookie: 'a=1; ssms_locale=fr; b=2' }, [FILES.fr]],
    ['the cookie, when storage holds nothing valid', { storage: 'klingon', cookie: 'ssms_locale=rw' }, [FILES.rw]],
    ['the cookie, when the browser will not let storage be read', { storage: 'throws', cookie: 'ssms_locale=fr' }, [FILES.fr]],
    ['a French browser, on a first visit', { languages: ['fr-CA', 'en'] }, [FILES.fr]],
    ['a Kinyarwanda browser by its three letter code', { languages: ['kin'] }, [FILES.rw]],
    ['an older browser that gives one language only', { languages: undefined, language: 'fr-FR' }, [FILES.fr]],
  ] as Array<[string, Situation, string[]]>)('is right for %s', (_name, situation, expected) => {
    expect(askedFor(situation)).toEqual(expected);
  });

  it.each([
    ['a saved English choice, whatever the browser says', { storage: 'en', languages: ['fr'] }],
    ['an English cookie, whatever the browser says', { cookie: 'ssms_locale=en', languages: ['fr'] }],
    ['a browser that ranks English first', { languages: ['en-US', 'fr'] }],
    ['a language the app does not speak', { languages: ['de-DE'] }],
    ['no language at all', { languages: [] }],
    ['no information at all', {}],
  ] as Array<[string, Situation]>)('is nothing for %s, since English is already in the main script', (_name, situation) => {
    expect(askedFor(situation)).toEqual([]);
  });

  it('prefers storage to the cookie, as the app does', () => {
    expect(askedFor({ storage: 'rw', cookie: 'ssms_locale=fr' })).toEqual([FILES.rw]);
  });

  it('asks the way the app does, a module preload that the import of that file will use', () => {
    const [link] = run({ storage: 'fr' }).asked;
    expect(link.rel).toBe('modulepreload');
    expect(link.crossOrigin).toBe('');
  });

  it('does not ask twice for a file the page already asks for', () => {
    expect(askedFor({ storage: 'fr', existing: [FILES.fr] })).toEqual([]);
  });
});

describe('the pages it leaves alone', () => {
  it.each(['/', '/fr', '/rw', '/fr/', '/rw/', '/en'])('does nothing at %s, which is English, or already in its language, or on its way elsewhere', (path) => {
    expect(askedFor({ path, storage: 'fr' })).toEqual([]);
  });

  it.each(['/login', '/farms', '/privacy', '/lot/abc', '/supervisor'])('works at %s', (path) => {
    expect(askedFor({ path, storage: 'rw' })).toEqual([FILES.rw]);
  });
});

describe('it never gets in the way', () => {
  it('does not throw with nothing to read', () => {
    const attempt = () => new Function('localStorage', 'document', 'navigator', 'location', localeBootScript(FILES))(undefined, undefined, undefined, undefined);
    expect(attempt).not.toThrow();
  });

  it('does nothing when the build has no file for the language', () => {
    expect(run({ storage: 'fr' }, { rw: FILES.rw }).asked).toEqual([]);
    expect(run({ storage: 'fr' }, {}).asked).toEqual([]);
  });

  it('survives a file name with characters that need care', () => {
    const odd = "/assets/a\"b'c.js";
    expect(run({ storage: 'fr' }, { fr: odd }).asked.map((l) => l.href)).toEqual([odd]);
  });

  it('is plain old JavaScript, which every browser the app supports can run', () => {
    expect(localeBootScript(FILES)).not.toMatch(/=>|\bconst\b|\blet\b|`|\?\.|\?\?/);
  });
});

describe('it chooses the same language as the app', () => {
  // The app: the saved choice (storage, then cookie), else the browser's ranked list. Here that is written out from the app's own
  // helpers, and compared with what the script does, for many situations.
  const savedOf = (s: Situation) => {
    const stored = s.storage === 'throws' ? null : (s.storage ?? null);
    if (isLocale(stored)) return stored;
    const fromCookie = /(?:^|;\s*)ssms_locale=([^;]*)/.exec(s.cookie ?? '')?.[1];
    return isLocale(fromCookie) ? fromCookie : null;
  };
  const appLanguage = (s: Situation) => savedOf(s) ?? detectLocale(s.languages?.length ? s.languages : [s.language ?? '']) ?? 'en';

  const storages: Array<Situation['storage']> = [null, 'en', 'fr', 'rw', 'klingon', 'throws'];
  const cookies = ['', 'ssms_locale=en', 'ssms_locale=fr', 'ssms_locale=rw', 'ssms_locale=de', 'x=1; ssms_locale=fr'];
  const browsers: Array<Pick<Situation, 'languages' | 'language'>> = [
    { languages: ['en-US'] },
    { languages: ['fr-FR', 'en'] },
    { languages: ['en', 'fr'] },
    { languages: ['rw'] },
    { languages: ['kin'] },
    { languages: ['de', 'rw'] },
    { languages: [], language: 'fr' },
    { languages: undefined, language: 'rw-RW' },
    { languages: [] },
  ];

  it('agrees on every combination of storage, cookie and browser language', () => {
    const disagreements: string[] = [];
    for (const storage of storages) {
      for (const cookie of cookies) {
        for (const browser of browsers) {
          const situation = { storage, cookie, ...browser };
          const expected = appLanguage(situation);
          const files = expected === 'en' ? [] : [FILES[expected]];
          const got = askedFor(situation);
          if (JSON.stringify(got) !== JSON.stringify(files)) disagreements.push(`${JSON.stringify(situation)}: the app says ${expected}, the script asked for ${JSON.stringify(got)}`);
        }
      }
    }
    expect(disagreements).toEqual([]);
  });
});
