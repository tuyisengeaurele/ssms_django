import { isLocale, type Locale } from './locales';

const NAME = 'ssms_locale';
const ONE_YEAR = 60 * 60 * 24 * 365;

/** The cookie that says which language a person chose. Only the language, for the host to read before any script runs. */
export function localeCookie(locale: Locale, secure: boolean): string {
  return `${NAME}=${locale}; Path=/; Max-Age=${ONE_YEAR}; SameSite=Lax${secure ? '; Secure' : ''}`;
}

/** What the cookie says about the language, or undefined. */
function cookieLanguage(): string | undefined {
  try {
    return document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${NAME}=`))?.slice(NAME.length + 1);
  } catch {
    return undefined;
  }
}

/**
 * The language the person chose, or null. Browser storage first, then the cookie, which is what the host goes by, so the app and
 * the host agree even when storage was cleared or is blocked. It never guesses from the browser: that is for the first visit only.
 */
export function savedLocale(): Locale | null {
  try {
    const saved = localStorage.getItem(NAME);
    if (isLocale(saved)) return saved;
  } catch {
    // Storage can be blocked. The cookie below still works.
  }
  const fromCookie = cookieLanguage();
  return isLocale(fromCookie) ? fromCookie : null;
}

function writeCookie(locale: Locale): void {
  try {
    document.cookie = localeCookie(locale, window.location.protocol === 'https:');
  } catch {
    // Cookies can be blocked. The choice still holds in storage.
  }
}

/** Keep the choice in browser storage, which the app reads, and in the cookie, which the host reads. */
export function saveLocale(locale: Locale): void {
  try {
    localStorage.setItem(NAME, locale);
  } catch {
    // Storage can be blocked. The choice still holds for this visit, and in the cookie.
  }
  writeCookie(locale);
}

/** Someone who chose before the cookie existed gets it now, so the host can act on it from their next visit. */
export function syncLocaleCookie(): void {
  const saved = savedLocale();
  if (saved && cookieLanguage() !== saved) writeCookie(saved);
}
