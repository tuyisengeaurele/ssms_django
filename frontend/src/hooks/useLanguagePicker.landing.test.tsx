import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../context/LanguageContext';
import { goTo } from '../utils/goTo';
import { useLanguagePicker } from './useLanguagePicker';

// On the landing page each language has its own address, so choosing a language goes to that page: it is already built in that
// language, so it is instant, and its title and description are right. Everywhere else the language changes in place.

vi.mock('../utils/goTo', () => ({ goTo: vi.fn() }));

function Harness() {
  const { choose, locale } = useLanguagePicker();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <button onClick={() => void choose('fr')}>fr</button>
      <button onClick={() => void choose('rw')}>rw</button>
      <button onClick={() => void choose('en')}>en</button>
    </div>
  );
}

const open = (path: string) => {
  window.history.pushState({}, '', path);
  return render(
    <LanguageProvider>
      <Harness />
    </LanguageProvider>,
  );
};
const press = (name: string) => act(() => screen.getByRole('button', { name }).click());

beforeEach(() => {
  localStorage.clear();
  vi.mocked(goTo).mockClear();
});
afterEach(() => window.history.pushState({}, '', '/'));

describe('choosing a language on the landing page', () => {
  it('goes to the page in that language, and keeps the choice', () => {
    open('/');
    press('fr');
    expect(goTo).toHaveBeenCalledWith('/fr');
    expect(localStorage.getItem('ssms_locale')).toBe('fr');
  });

  it('does not change the words in place, since the next page is already in that language', () => {
    open('/');
    press('rw');
    expect(screen.getByTestId('locale')).toHaveTextContent('en');
  });

  it('goes from one language page to another, and back to the root for English', () => {
    open('/fr');
    press('rw');
    expect(goTo).toHaveBeenLastCalledWith('/rw');
    press('en');
    expect(goTo).toHaveBeenLastCalledWith('/');
  });

  it('keeps the section the person was reading', () => {
    open('/fr#faq');
    press('rw');
    expect(goTo).toHaveBeenCalledWith('/rw#faq');
  });

  it('does nothing when the language chosen is the one of the page', () => {
    open('/fr');
    press('fr');
    expect(goTo).not.toHaveBeenCalled();
  });

  it('tells the caller it worked', async () => {
    open('/');
    let result: unknown;
    function Probe() {
      const { choose } = useLanguagePicker();
      return <button onClick={() => void choose('fr').then((r) => (result = r))}>go</button>;
    }
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );
    await act(async () => screen.getAllByRole('button', { name: 'go' })[0].click());
    expect(result).toBe('ok');
  });
});

describe('choosing a language anywhere else', () => {
  it.each(['/login', '/farms', '/privacy', '/fr/privacy'])('changes the words in place at %s, with no navigation', (path) => {
    open(path);
    press('fr');
    expect(goTo).not.toHaveBeenCalled();
    expect(screen.getByTestId('locale')).toHaveTextContent('fr');
  });
});
