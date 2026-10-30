import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider, useLanguage } from './LanguageContext';

const browser = (languages: string[]) => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(languages[0] ?? '');
};

const wrapper = ({ children }: { children: React.ReactNode }) => <LanguageProvider>{children}</LanguageProvider>;
const language = () => renderHook(() => useLanguage(), { wrapper }).result;

beforeEach(() => {
  localStorage.clear();
  browser(['en-US']);
});
afterEach(() => vi.restoreAllMocks());

describe('the first language', () => {
  it('comes from the browser when nothing was chosen', () => {
    browser(['fr-CA', 'en']);
    expect(language().current.locale).toBe('fr');
  });

  it('is Kinyarwanda for a Rwandan browser', () => {
    browser(['rw-RW', 'en-US']);
    expect(language().current.locale).toBe('rw');
  });

  it('is English when the browser speaks nothing the app does', () => {
    browser(['de-DE']);
    expect(language().current.locale).toBe('en');
  });

  it('is English when the browser gives no list at all', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(undefined as unknown as readonly string[]);
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('');
    expect(language().current.locale).toBe('en');
  });

  it('falls back to the single language of an older browser', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(undefined as unknown as readonly string[]);
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('fr-FR');
    expect(language().current.locale).toBe('fr');
  });

  it('is the one the person chose, whatever the browser says', () => {
    browser(['fr']);
    localStorage.setItem('ssms_locale', 'rw');
    expect(language().current.locale).toBe('rw');
  });

  it('ignores a saved value it does not know and asks the browser instead', () => {
    browser(['fr']);
    localStorage.setItem('ssms_locale', 'klingon');
    expect(language().current.locale).toBe('fr');
  });

  it('does not save what the browser suggested, only what the person picks', () => {
    browser(['fr']);
    language();
    expect(localStorage.getItem('ssms_locale')).toBeNull();
  });

  it('still starts when the browser will not let the app read storage', () => {
    browser(['fr']);
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(language().current.locale).toBe('fr');
  });
});

describe('changing language', () => {
  it('switches the words and remembers the choice', () => {
    const result = language();
    expect(result.current.t('btnCancel')).toBe('Cancel');
    act(() => result.current.setLocale('fr'));
    expect(result.current.locale).toBe('fr');
    expect(result.current.t('btnCancel')).toBe('Annuler');
    expect(localStorage.getItem('ssms_locale')).toBe('fr');
  });

  it('still switches for this visit when the browser will not save the choice', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    const result = language();
    act(() => result.current.setLocale('rw'));
    expect(result.current.locale).toBe('rw');
  });

  it('tells the page and screen readers which language it is in', () => {
    const result = language();
    expect(document.documentElement.lang).toBe('en');
    act(() => result.current.setLocale('rw'));
    expect(document.documentElement.lang).toBe('rw');
  });

  it('shows the key itself for a word nobody translated', () => {
    expect(language().current.t('noSuchKeyAnywhere')).toBe('noSuchKeyAnywhere');
  });
});

describe('using the context', () => {
  it('needs a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Probe = () => <p>{useLanguage().locale}</p>;
    expect(() => render(<Probe />)).toThrow('useLanguage must be used inside LanguageProvider');
    expect(screen.queryByText('en')).not.toBeInTheDocument();
    spy.mockRestore();
  });
});
