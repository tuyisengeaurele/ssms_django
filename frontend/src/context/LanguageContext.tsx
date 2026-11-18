import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { isLoaded, loadCatalog, say } from '../i18n/catalog';
import { detectLocale } from '../i18n/detectLocale';
import { isLocale, LOCALE_LABELS, type Locale } from '../i18n/locales';
import { pluralText } from '../i18n/plural';
import { warmLikelyLanguages } from '../i18n/warm';
import { fill } from '../utils/fill';

interface LanguageContextValue {
  locale: Locale;
  /** Switch language. A language not downloaded yet is fetched first. Says whether it worked. */
  setLocale: (l: Locale) => Promise<'ok' | 'failed'>;
  /** Translate a key, falling back to the key itself if not found. */
  t: (key: string) => string;
  /** The singular or the other text for a count, in the language on screen, with the count filled in. See i18n/plural.ts. */
  tn: (n: number, oneKey: string, otherKey: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

// Which language is being downloaded for a switch. Kept apart so only the language controls draw again when a download starts.
const PendingContext = createContext<Locale | null | undefined>(undefined);

const STORAGE_KEY = 'ssms_locale';

// The shared stylesheets load with the signed in layout only, so the screen reader region hides itself.
const VISUALLY_HIDDEN = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

/** The language the person chose, or the browser's. Also read outside React, by the error messages. */
export function loadLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch {
    // Storage can be blocked. The browser language below still works.
  }
  // The browser's ranked list first, then the single language older browsers give.
  const ranked = navigator.languages?.length ? navigator.languages : [navigator.language ?? ''];
  return detectLocale(ranked) ?? 'en';
}

/** `initialLocale` fixes the first language, for the build that writes the landing page to HTML. The person can still change it. */
export function LanguageProvider({ children, initialLocale }: { children: ReactNode; initialLocale?: Locale }) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? loadLocale());
  // Counts the languages that have arrived, so the screen redraws in the new words.
  const [arrivals, setArrivals] = useState(0);
  const wanted = useRef<Locale>(locale);
  const current = useRef<Locale>(locale);
  current.current = locale;
  const [pending, setPending] = useState<Locale | null>(null);
  // The announcer is added after the first render, so a page drawn on a server has none and nothing has to be matched.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // The language the person last switched to, so a screen reader can be told. Not set when the app opens in a saved language.
  const [switchedTo, setSwitchedTo] = useState<Locale | null>(null);

  // Screen readers and the browser translate bar read this.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  // A browser that lists French or Kinyarwanda after English suggests a switch. Have them ready once the page is idle.
  useEffect(() => {
    warmLikelyLanguages(wanted.current);
  }, []);

  // Opening the app in a language that is not here yet shows English for a moment, then the language.
  useEffect(() => {
    if (isLoaded(locale)) return;
    loadCatalog(locale)
      .then(() => setArrivals((n) => n + 1))
      .catch(() => {
        // Offline or blocked. English stays, and the next visit tries again.
      });
  }, [locale]);

  const apply = useCallback((l: Locale) => {
    setLocaleState(l);
    setSwitchedTo(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // The choice still holds for this visit.
    }
  }, []);

  // A language that is not downloaded yet is fetched first, so the screen never shows a mix. If the download fails, the
  // language stays as it was and the choice is not saved.
  const setLocale = useCallback((l: Locale): Promise<'ok' | 'failed'> => {
    wanted.current = l;
    if (l === current.current) {
      setPending(null);
      return Promise.resolve('ok');
    }
    if (isLoaded(l)) {
      setPending(null);
      apply(l);
      return Promise.resolve('ok');
    }
    setPending(l);
    return loadCatalog(l).then(
      () => {
        if (wanted.current === l) {
          setPending(null);
          apply(l);
        }
        return 'ok' as const;
      },
      () => {
        if (wanted.current === l) {
          wanted.current = current.current;
          setPending(null);
        }
        return 'failed' as const;
      },
    );
  }, [apply]);

  // The same app open in another tab: when the person changes the language there, this tab follows. The browser sends a storage
  // event to every other tab, never to the one that wrote, so there is no loop. The other tab already saved the choice, so
  // nothing is written back, and nothing is said aloud, since nobody asked for a change in this tab. If the download fails,
  // the language stays as it was and the next visit picks up the saved one.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY || !isLocale(event.newValue)) return;
      const next = event.newValue;
      wanted.current = next;
      setPending(null);
      if (next === current.current) return;
      const follow = () => {
        if (wanted.current === next) setLocaleState(next);
      };
      if (isLoaded(next)) follow();
      else loadCatalog(next).then(follow, () => {});
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // `arrivals` is a dependency so the words are looked up again once a language that was still downloading has arrived.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const t = useCallback((key: string): string => say(locale, key), [locale, arrivals]);

  // One value for the whole app. It changes only when the words do, so the bookkeeping below (a download starting, the
  // announcement for a screen reader) does not make hundreds of components draw again.
  const tn = useCallback(
    (n: number, oneKey: string, otherKey: string, params?: Record<string, string | number>) => pluralText(t, locale, n, oneKey, otherKey, params),
    [t, locale],
  );
  const value = useMemo(() => ({ locale, setLocale, t, tn }), [locale, setLocale, t, tn]);

  // Said aloud to a screen reader. A polite live region needs no role, and it sits in the body, outside the app's own markup: that a language is loading (in the language still on screen), then that it changed (in the new one).
  const announcement = pending
    ? fill(t('lpLangBusy'), { language: LOCALE_LABELS[pending] })
    : switchedTo
      ? fill(t('lpLangChanged'), { language: LOCALE_LABELS[switchedTo] })
      : '';

  return (
    <LanguageContext.Provider value={value}>
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
      {!mounted
        ? null
        : createPortal(
            <div aria-live="polite" data-language-announcer="" style={VISUALLY_HIDDEN}>
              {announcement}
            </div>,
            document.body,
          )}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}

/** The language being downloaded for a switch the person asked for, or null. For the controls that show it. */
export function useLanguagePending(): Locale | null {
  const pending = useContext(PendingContext);
  if (pending === undefined) throw new Error('useLanguagePending must be used inside LanguageProvider');
  return pending;
}
