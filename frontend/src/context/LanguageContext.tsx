import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { detectLocale } from '../i18n/detectLocale';
import { Locale, translations } from '../i18n/translations';

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

  // Screen readers and the browser translate bar read this.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // The choice still holds for this visit.
    }
  };

  const t = (key: string): string => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[locale] ?? entry['en'] ?? key;
  };

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
