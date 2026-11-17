import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Locale } from '../i18n/locales';
import { LanguageProvider, useLanguage } from './LanguageContext';

// French and Kinyarwanda are separate downloads. These tests hold a download open to see what a person sees while they wait.

const fake = vi.hoisted(() => {
  const texts: Record<string, Record<string, string>> = {
    en: { hello: 'Hello' },
    fr: { hello: 'Bonjour' },
    rw: { hello: 'Muraho' },
  };
  const have = new Set<string>(['en']);
  const pending = new Map<string, { resolve: () => void; reject: (e: Error) => void }>();
  return {
    reset() {
      have.clear();
      have.add('en');
      pending.clear();
    },
    isLoaded: (locale: string) => have.has(locale),
    say: (locale: string, key: string) => (have.has(locale) ? texts[locale][key] : texts.en[key]) ?? key,
    loadCatalog: (locale: string) =>
      have.has(locale)
        ? Promise.resolve()
        : new Promise<void>((resolve, reject) => {
            pending.set(locale, { resolve: () => (have.add(locale), resolve()), reject });
          }),
    preload: (locale: string) => have.add(locale),
    arrive: (locale: string) => pending.get(locale)?.resolve(),
    fail: (locale: string) => pending.get(locale)?.reject(new Error('offline')),
  };
});

vi.mock('../i18n/catalog', () => ({ isLoaded: fake.isLoaded, say: fake.say, loadCatalog: fake.loadCatalog }));

function Probe() {
  const { t, locale, setLocale } = useLanguage();
  return (
    <div>
      <p data-testid="text">{t('hello')}</p>
      <p data-testid="locale">{locale}</p>
      <button onClick={() => setLocale('fr')}>fr</button>
      <button onClick={() => setLocale('rw')}>rw</button>
    </div>
  );
}

const show = () =>
  render(
    <LanguageProvider>
      <Probe />
    </LanguageProvider>,
  );
const text = () => screen.getByTestId('text').textContent;
const locale = () => screen.getByTestId('locale').textContent as Locale;

beforeEach(() => {
  fake.reset();
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => vi.restoreAllMocks());

describe('choosing a language that has not been downloaded yet', () => {
  it('keeps the current language on screen until the new one has arrived', async () => {
    show();
    act(() => screen.getByText('fr').click());
    expect(locale()).toBe('en');
    expect(text()).toBe('Hello');
    expect(localStorage.getItem('ssms_locale')).toBeNull();

    await act(async () => fake.arrive('fr'));
    expect(locale()).toBe('fr');
    expect(text()).toBe('Bonjour');
    expect(localStorage.getItem('ssms_locale')).toBe('fr');
  });

  it('changes at once when the language is already here', () => {
    fake.preload('fr');
    show();
    act(() => screen.getByText('fr').click());
    expect(locale()).toBe('fr');
    expect(text()).toBe('Bonjour');
    expect(localStorage.getItem('ssms_locale')).toBe('fr');
  });

  it('stays in the current language, and does not save the choice, when the download fails', async () => {
    show();
    act(() => screen.getByText('rw').click());
    await act(async () => fake.fail('rw'));
    expect(locale()).toBe('en');
    expect(text()).toBe('Hello');
    expect(localStorage.getItem('ssms_locale')).toBeNull();
  });

  it('ends on the last language asked for, even if an earlier one arrives after it', async () => {
    show();
    act(() => screen.getByText('fr').click());
    act(() => screen.getByText('rw').click());
    await act(async () => fake.arrive('rw'));
    await act(async () => fake.arrive('fr'));
    expect(locale()).toBe('rw');
    expect(text()).toBe('Muraho');
  });
});

describe('opening the app in a language that has not been downloaded yet', () => {
  it('shows English meanwhile, then the saved language when it arrives', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    show();
    expect(text()).toBe('Hello');
    expect(document.documentElement.lang).toBe('fr');
    await act(async () => fake.arrive('fr'));
    expect(text()).toBe('Bonjour');
  });
});
