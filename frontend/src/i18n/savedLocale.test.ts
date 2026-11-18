import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localeCookie, savedLocale, saveLocale, syncLocaleCookie } from './savedLocale';

// The language a person chose is kept in two places. Browser storage is what the app reads. A cookie is what the host reads
// before any script has run, so a returning visitor can be sent to the page in their language without a flash. The cookie holds
// only the language: no name, no identifier, nothing to track.

let written: string[] = [];

beforeEach(() => {
  localStorage.clear();
  written = [];
  // Read what is set on the cookie, with its attributes, which a browser would not show back.
  vi.spyOn(document, 'cookie', 'set').mockImplementation((value: string) => {
    written.push(value);
  });
  vi.spyOn(document, 'cookie', 'get').mockImplementation(() => '');
});
afterEach(() => vi.restoreAllMocks());

describe('localeCookie', () => {
  it('names the language, for the whole site, for a year, and is not sent with requests from other sites', () => {
    expect(localeCookie('fr', false)).toBe('ssms_locale=fr; Path=/; Max-Age=31536000; SameSite=Lax');
  });

  it('is only sent over https when the page is', () => {
    expect(localeCookie('rw', true)).toBe('ssms_locale=rw; Path=/; Max-Age=31536000; SameSite=Lax; Secure');
  });
});

describe('savedLocale', () => {
  it('is the language the person chose', () => {
    localStorage.setItem('ssms_locale', 'fr');
    expect(savedLocale()).toBe('fr');
  });

  it('is nothing when no choice was made, and it never guesses from the browser', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['fr-FR']);
    expect(savedLocale()).toBeNull();
  });

  it('falls back to the cookie, as the host does, when storage has nothing', () => {
    vi.spyOn(document, 'cookie', 'get').mockImplementation(() => 'other=1; ssms_locale=rw');
    expect(savedLocale()).toBe('rw');
  });

  it('falls back to the cookie when the browser will not let the app read storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(document, 'cookie', 'get').mockImplementation(() => 'ssms_locale=fr');
    expect(savedLocale()).toBe('fr');
  });

  it('prefers storage when both are there', () => {
    localStorage.setItem('ssms_locale', 'fr');
    vi.spyOn(document, 'cookie', 'get').mockImplementation(() => 'ssms_locale=rw');
    expect(savedLocale()).toBe('fr');
  });

  it('ignores a cookie that does not name a language', () => {
    vi.spyOn(document, 'cookie', 'get').mockImplementation(() => 'ssms_locale=klingon');
    expect(savedLocale()).toBeNull();
  });

  it('is nothing for a value that is not a language', () => {
    localStorage.setItem('ssms_locale', 'klingon');
    expect(savedLocale()).toBeNull();
  });

  it('is nothing when the browser will not let the app read storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(savedLocale()).toBeNull();
  });
});

describe('saveLocale', () => {
  it('keeps the choice in storage and in the cookie', () => {
    saveLocale('rw');
    expect(localStorage.getItem('ssms_locale')).toBe('rw');
    expect(written).toEqual(['ssms_locale=rw; Path=/; Max-Age=31536000; SameSite=Lax']);
  });

  it('still works when storage is blocked, with the cookie', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveLocale('fr')).not.toThrow();
    expect(written).toHaveLength(1);
  });

  it('still works when cookies are blocked, with storage', () => {
    vi.spyOn(document, 'cookie', 'set').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => saveLocale('fr')).not.toThrow();
    expect(localStorage.getItem('ssms_locale')).toBe('fr');
  });
});

describe('syncLocaleCookie', () => {
  it('writes the cookie for someone who chose before the cookie existed', () => {
    localStorage.setItem('ssms_locale', 'fr');
    syncLocaleCookie();
    expect(written).toEqual(['ssms_locale=fr; Path=/; Max-Age=31536000; SameSite=Lax']);
  });

  it('does nothing when there is no choice to keep', () => {
    syncLocaleCookie();
    expect(written).toEqual([]);
  });

  it('does nothing when the cookie already says the same', () => {
    localStorage.setItem('ssms_locale', 'fr');
    vi.spyOn(document, 'cookie', 'get').mockImplementation(() => 'other=1; ssms_locale=fr');
    syncLocaleCookie();
    expect(written).toEqual([]);
  });

  it('corrects a cookie that says another language', () => {
    localStorage.setItem('ssms_locale', 'rw');
    vi.spyOn(document, 'cookie', 'get').mockImplementation(() => 'ssms_locale=fr');
    syncLocaleCookie();
    expect(written).toHaveLength(1);
    expect(written[0]).toContain('ssms_locale=rw');
  });
});
