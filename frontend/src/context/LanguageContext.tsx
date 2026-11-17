import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { isLoaded, loadCatalog, say } from '../i18n/catalog';
import { detectLocale } from '../i18n/detectLocale';
import type { Locale } from '../i18n/locales';
import { warmLikelyLanguages } from '../i18n/warm';

interface LanguageContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  /** Translate a key, falling back to the key itself if not found. */
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = 'ssms_locale';

/** The language the person chose, or the browser's. Also read outside React, by the error messages. */
export function loadLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && ['en', 'fr', 'rw'].includes(saved)) return saved as Locale;
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
  const [, setArrivals] = useState(0);
  const wanted = useRef<Locale>(locale);

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

  const apply = (l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // The choice still holds for this visit.
    }
  };

  // A language that is not downloaded yet is fetched first, so the screen never shows a mix. If the download fails, the
  // language stays as it was and the choice is not saved.
  const setLocale = (l: Locale) => {
    wanted.current = l;
    if (isLoaded(l)) {
      apply(l);
      return;
    }
    loadCatalog(l)
      .then(() => {
        if (wanted.current === l) apply(l);
      })
      .catch(() => {
        if (wanted.current === l) wanted.current = locale;
      });
  };

  const t = (key: string): string => say(locale, key);

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}
