import { createContext, useContext, useState, ReactNode } from 'react';
import { Locale, translations } from '../i18n/translations';

interface LanguageContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  /** Translate a key, falling back to the key itself if not found. */
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

const STORAGE_KEY = 'ssms_locale';

function loadLocale(): Locale {
  const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
  if (saved && ['en', 'fr', 'rw'].includes(saved)) return saved;
  // Browser language hint
  const lang = navigator.language.slice(0, 2).toLowerCase();
  if (lang === 'fr') return 'fr';
  if (lang === 'rw') return 'rw';
  return 'en';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(loadLocale);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
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
