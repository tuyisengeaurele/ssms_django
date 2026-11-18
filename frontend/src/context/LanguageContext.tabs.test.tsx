import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeCatalog as fake } from '../test/fakeCatalog';
import { LanguageProvider, useLanguage, useLanguagePending } from './LanguageContext';

// A person with the app open in two tabs changes the language in one. The other should follow, so a farmer is never reading a
// screen in one language next to a screen in another. The browser tells every other tab through a storage event.

vi.mock('../i18n/catalog', async () => (await import('../test/fakeCatalog')).fakeCatalogModule);

let choose: ReturnType<typeof useLanguage>['setLocale'] | null = null;

function Probe() {
  const { t, locale, setLocale } = useLanguage();
  const waiting = useLanguagePending();
  choose = setLocale;
  return (
    <div>
      <p data-testid="text">{t('hello')}</p>
      <p data-testid="locale">{locale}</p>
      <p data-testid="pending">{waiting ?? 'none'}</p>
    </div>
  );
}

const show = () =>
  render(
    <LanguageProvider>
      <Probe />
    </LanguageProvider>,
  );

/** What another tab's change looks like from here. */
function otherTabSets(value: string | null, key = 'ssms_locale') {
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', { key, newValue: value, storageArea: localStorage }));
  });
}

const locale = () => screen.getByTestId('locale').textContent;
const announced = () => document.querySelector('[data-language-announcer]')?.textContent;

beforeEach(() => {
  fake.reset();
  choose = null;
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});
afterEach(() => vi.restoreAllMocks());

describe('another tab changes the language', () => {
  it('is followed at once when the language is already here', () => {
    fake.preload('fr');
    show();
    otherTabSets('fr');
    expect(locale()).toBe('fr');
    expect(screen.getByTestId('text')).toHaveTextContent('Bonjour');
    expect(document.documentElement.lang).toBe('fr');
  });

  it('is followed once the language has been downloaded, with the old one on screen until then', async () => {
    show();
    otherTabSets('rw');
    expect(locale()).toBe('en');
    await act(async () => fake.arrive('rw'));
    expect(locale()).toBe('rw');
    expect(screen.getByTestId('text')).toHaveTextContent('Muraho');
  });

  it('stays as it was, quietly, when the download fails', async () => {
    show();
    otherTabSets('rw');
    await act(async () => fake.fail('rw'));
    expect(locale()).toBe('en');
    expect(screen.getByTestId('pending')).toHaveTextContent('none');
  });

  it('does not write the value back, since the other tab already saved it', () => {
    fake.preload('fr');
    const save = vi.spyOn(Storage.prototype, 'setItem');
    show();
    otherTabSets('fr');
    expect(save).not.toHaveBeenCalled();
  });

  it('does not speak, since the person did not ask for anything in this tab', () => {
    fake.preload('fr');
    show();
    otherTabSets('fr');
    expect(announced()).toBe('');
  });

  it('does nothing when it is the language already in use', () => {
    show();
    otherTabSets('en');
    expect(locale()).toBe('en');
    expect(screen.getByTestId('pending')).toHaveTextContent('none');
  });
});

describe('a storage event that is not a language change', () => {
  it.each(['klingon', '', 'FR'])('ignores the unknown value "%s"', (value) => {
    fake.preload('fr');
    show();
    otherTabSets(value);
    expect(locale()).toBe('en');
  });

  it('ignores the choice being cleared', () => {
    fake.preload('fr');
    localStorage.setItem('ssms_locale', 'fr');
    show();
    otherTabSets(null);
    expect(locale()).toBe('fr');
  });

  it('ignores a change to some other key', () => {
    fake.preload('fr');
    show();
    otherTabSets('fr', 'ssms_theme');
    expect(locale()).toBe('en');
  });
});

describe('a choice made here and a change made in another tab at the same time', () => {
  it('goes with the other tab, and forgets the download it was waiting for', async () => {
    fake.preload('fr');
    show();
    act(() => void choose?.('rw'));
    expect(screen.getByTestId('pending')).toHaveTextContent('rw');
    otherTabSets('fr');
    expect(locale()).toBe('fr');
    expect(screen.getByTestId('pending')).toHaveTextContent('none');
    await act(async () => fake.arrive('rw'));
    expect(locale()).toBe('fr');
  });

  it('lets a later choice here win over the earlier change from the other tab', async () => {
    show();
    otherTabSets('fr');
    act(() => void choose?.('rw'));
    await act(async () => fake.arrive('fr'));
    await act(async () => fake.arrive('rw'));
    expect(locale()).toBe('rw');
  });
});

describe('leaving the page', () => {
  it('stops listening', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const { unmount } = show();
    unmount();
    expect(remove).toHaveBeenCalledWith('storage', expect.any(Function));
  });
});
