import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Locale } from '../i18n/locales';
import { fakeCatalog as fake } from '../test/fakeCatalog';
import { LanguageProvider, useLanguage } from './LanguageContext';

// French and Kinyarwanda are separate downloads. These tests hold a download open to see what a person sees while they wait.

vi.mock('../i18n/catalog', async () => (await import('../test/fakeCatalog')).fakeCatalogModule);

let lastResult: Promise<'ok' | 'failed'> | undefined;

function Probe() {
  const { t, locale, setLocale, pending } = useLanguage();
  return (
    <div>
      <p data-testid="text">{t('hello')}</p>
      <p data-testid="locale">{locale}</p>
      <p data-testid="pending">{pending ?? 'none'}</p>
      <button onClick={() => (lastResult = setLocale('fr'))}>fr</button>
      <button onClick={() => (lastResult = setLocale('rw'))}>rw</button>
      <button onClick={() => (lastResult = setLocale('en'))}>en</button>
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
const pending = () => screen.getByTestId('pending').textContent;
const announced = () => document.querySelector('[data-language-announcer]')?.textContent;

beforeEach(() => {
  fake.reset();
  lastResult = undefined;
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => vi.restoreAllMocks());

describe('choosing a language that has not been downloaded yet', () => {
  it('keeps the current language on screen until the new one has arrived', async () => {
    show();
    act(() => screen.getByRole('button', { name: 'fr' }).click());
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
    act(() => screen.getByRole('button', { name: 'fr' }).click());
    expect(locale()).toBe('fr');
    expect(text()).toBe('Bonjour');
    expect(localStorage.getItem('ssms_locale')).toBe('fr');
  });

  it('stays in the current language, and does not save the choice, when the download fails', async () => {
    show();
    act(() => screen.getByRole('button', { name: 'rw' }).click());
    await act(async () => fake.fail('rw'));
    expect(locale()).toBe('en');
    expect(text()).toBe('Hello');
    expect(localStorage.getItem('ssms_locale')).toBeNull();
  });

  it('ends on the last language asked for, even if an earlier one arrives after it', async () => {
    show();
    act(() => screen.getByRole('button', { name: 'fr' }).click());
    act(() => screen.getByRole('button', { name: 'rw' }).click());
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

  it('says nothing aloud about it, since the person did not ask for a change', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    show();
    await act(async () => fake.arrive('fr'));
    expect(announced()).toBe('');
  });
});

describe('telling the person what is happening', () => {
  it('knows which language is on its way, and stops knowing when it has arrived', async () => {
    show();
    expect(pending()).toBe('none');
    act(() => screen.getByRole('button', { name: 'fr' }).click());
    expect(pending()).toBe('fr');
    await act(async () => fake.arrive('fr'));
    expect(pending()).toBe('none');
  });

  it('says aloud that a language is loading, in the current language and by the new language\'s own name', () => {
    show();
    act(() => screen.getByRole('button', { name: 'fr' }).click());
    expect(announced()).toBe('Loading Français');
  });

  it('says aloud that the language changed, in the new language', async () => {
    show();
    act(() => screen.getByRole('button', { name: 'rw' }).click());
    await act(async () => fake.arrive('rw'));
    expect(announced()).toBe('Ururimi rwahindutse : Kinyarwanda');
  });

  it('says it also when the language was already here', () => {
    fake.preload('fr');
    show();
    act(() => screen.getByRole('button', { name: 'fr' }).click());
    expect(announced()).toBe('Langue changée : Français');
  });

  it('is no longer waiting, and says nothing, when the download fails', async () => {
    show();
    act(() => screen.getByRole('button', { name: 'rw' }).click());
    await act(async () => fake.fail('rw'));
    expect(pending()).toBe('none');
    expect(announced()).toBe('');
  });

  it('says nothing when the language chosen is the one already in use', () => {
    show();
    act(() => screen.getByRole('button', { name: 'en' }).click());
    expect(announced()).toBe('');
    expect(pending()).toBe('none');
  });

  it('stops waiting for a language when the person goes back to the one they had', async () => {
    show();
    act(() => screen.getByRole('button', { name: 'fr' }).click());
    act(() => screen.getByRole('button', { name: 'en' }).click());
    expect(pending()).toBe('none');
    await act(async () => fake.arrive('fr'));
    expect(locale()).toBe('en');
  });

  it('tells the caller whether it worked', async () => {
    show();
    act(() => screen.getByRole('button', { name: 'fr' }).click());
    const worked = lastResult;
    await act(async () => fake.arrive('fr'));
    await expect(worked).resolves.toBe('ok');

    act(() => screen.getByRole('button', { name: 'rw' }).click());
    const failed = lastResult;
    await act(async () => fake.fail('rw'));
    await expect(failed).resolves.toBe('failed');
  });
});
