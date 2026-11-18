import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeCatalog as fake } from '../test/fakeCatalog';
import { LanguageProvider, useLanguage, useLanguagePending } from './LanguageContext';

// Hundreds of components read the language. Every time the provider hands them a new value they all draw again, and on a busy
// screen that is the slowest part of a switch. They should draw again once, when the words change, and not for the bookkeeping
// around it: a download starting, the announcement for a screen reader, the announcer being added.

vi.mock('../i18n/catalog', async () => (await import('../test/fakeCatalog')).fakeCatalogModule);

let draws = 0;
let controls: ReturnType<typeof useLanguage> | null = null;

/** Reads the words, as nearly every component does. */
function Reader() {
  const language = useLanguage();
  controls = language;
  draws += 1;
  return <p data-testid="reader">{language.t('hello')}</p>;
}

/** Wants to know which language is on its way, as a language control does. */
function Waiting() {
  const pending = useLanguagePending();
  return <p data-testid="waiting">{pending ?? 'none'}</p>;
}

const show = () =>
  render(
    <LanguageProvider>
      <Reader />
      <Waiting />
    </LanguageProvider>,
  );

beforeEach(() => {
  fake.reset();
  draws = 0;
  controls = null;
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});

describe('how often the screen draws again around a language switch', () => {
  it('draws once at the start, not again when the screen reader announcer is added', () => {
    show();
    expect(draws).toBe(1);
  });

  it('does not draw again when a download starts', () => {
    show();
    const before = draws;
    act(() => void controls?.setLocale('fr'));
    expect(draws).toBe(before);
  });

  it('draws once when the language arrives, in the new words', async () => {
    show();
    const before = draws;
    act(() => void controls?.setLocale('fr'));
    await act(async () => fake.arrive('fr'));
    expect(draws).toBe(before + 1);
    expect(screen.getByTestId('reader')).toHaveTextContent('Bonjour');
  });

  it('draws once for a language that is already here', () => {
    fake.preload('rw');
    show();
    const before = draws;
    act(() => void controls?.setLocale('rw'));
    expect(draws).toBe(before + 1);
  });

  it('does not draw again when a download fails', async () => {
    show();
    const before = draws;
    act(() => void controls?.setLocale('fr'));
    await act(async () => fake.fail('fr'));
    expect(draws).toBe(before);
  });

  it('keeps the same functions in hand while a download starts, so nothing that depends on them redraws', () => {
    show();
    const before = controls;
    act(() => void controls?.setLocale('fr'));
    expect(controls?.t).toBe(before?.t);
    expect(controls?.tn).toBe(before?.tn);
    expect(controls?.setLocale).toBe(before?.setLocale);
  });

  it('does not draw again for a choice that changes nothing', () => {
    show();
    const before = draws;
    act(() => void controls?.setLocale('en'));
    expect(draws).toBe(before);
  });
});

describe('a control that wants to know which language is on its way', () => {
  it('is told when a download starts and when it ends', async () => {
    show();
    expect(screen.getByTestId('waiting')).toHaveTextContent('none');
    act(() => void controls?.setLocale('fr'));
    expect(screen.getByTestId('waiting')).toHaveTextContent('fr');
    await act(async () => fake.arrive('fr'));
    expect(screen.getByTestId('waiting')).toHaveTextContent('none');
  });

  it('is told that nothing is on its way outside a provider only by an error, like the other hooks', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Waiting />)).toThrow('useLanguagePending must be used inside LanguageProvider');
    spy.mockRestore();
  });
});
