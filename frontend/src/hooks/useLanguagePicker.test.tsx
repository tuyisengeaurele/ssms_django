import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../context/LanguageContext';
import { prefetchCatalog } from '../i18n/catalog';
import { useLanguagePicker } from './useLanguagePicker';

vi.mock('../i18n/catalog', async (original) => ({ ...(await original<typeof import('../i18n/catalog')>()), prefetchCatalog: vi.fn() }));

// A language control tells the page what the person is about to do: hover, focus and touch on one language, or open a menu.
// The hook turns that into fetching the language, so it is already here when they choose.

function Harness() {
  const { locale, choose, intentFor, menuIntent } = useLanguagePicker();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <button {...intentFor('fr')} onClick={() => choose('fr')}>
        French
      </button>
      <select aria-label="menu" {...menuIntent} value={locale} onChange={(e) => choose(e.target.value as 'en' | 'fr' | 'rw')}>
        <option value="en">en</option>
        <option value="fr">fr</option>
        <option value="rw">rw</option>
      </select>
    </div>
  );
}

const show = () =>
  render(
    <LanguageProvider>
      <Harness />
    </LanguageProvider>,
  );

beforeEach(() => {
  // An app address: on the landing page a language change goes to the page in that language instead.
  window.history.pushState({}, '', '/farms');
  localStorage.clear();
  vi.mocked(prefetchCatalog).mockClear();
});
afterEach(() => window.history.pushState({}, '', '/'));

describe('a control for one language', () => {
  it('fetches that language when the pointer reaches it', () => {
    show();
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'French' }));
    expect(prefetchCatalog).toHaveBeenCalledWith('fr');
  });

  it('fetches it on keyboard focus and when it is touched', () => {
    show();
    const button = screen.getByRole('button', { name: 'French' });
    fireEvent.focus(button);
    fireEvent.pointerDown(button);
    expect(prefetchCatalog).toHaveBeenCalledTimes(2);
    expect(prefetchCatalog).toHaveBeenCalledWith('fr');
  });

  it('chooses the language on click', () => {
    show();
    fireEvent.click(screen.getByRole('button', { name: 'French' }));
    expect(screen.getByTestId('locale')).toHaveTextContent('fr');
  });
});

describe('a menu of languages', () => {
  it('fetches nothing while the pointer only passes over it', () => {
    show();
    fireEvent.pointerEnter(screen.getByRole('combobox'));
    expect(prefetchCatalog).not.toHaveBeenCalled();
  });

  it('fetches every other language once it is focused or pressed, since any could be picked', () => {
    show();
    fireEvent.focus(screen.getByRole('combobox'));
    expect(vi.mocked(prefetchCatalog).mock.calls.map(([code]) => code).sort()).toEqual(['fr', 'rw']);
  });

  it('leaves out the language already in use', () => {
    localStorage.setItem('ssms_locale', 'fr');
    show();
    fireEvent.pointerDown(screen.getByRole('combobox'));
    expect(vi.mocked(prefetchCatalog).mock.calls.map(([code]) => code)).toEqual(['rw']);
  });

  it('chooses the language picked', () => {
    show();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'rw' } });
    expect(screen.getByTestId('locale')).toHaveTextContent('rw');
  });
});
