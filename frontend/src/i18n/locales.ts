export type Locale = 'en' | 'fr' | 'rw';

export function isLocale(value: unknown): value is Locale {
  return value === 'en' || value === 'fr' || value === 'rw';
}

export const LOCALE_LABELS: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  rw: 'Kinyarwanda',
};
