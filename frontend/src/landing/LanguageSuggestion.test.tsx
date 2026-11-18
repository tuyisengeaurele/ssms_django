import { act, fireEvent, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageSuggestion, SHOW_AFTER_MS } from './LanguageSuggestion';

// One quiet line for a first time visitor whose browser prefers French or Kinyarwanda. It is written in the language it offers
// (and marked as that language, so a screen reader says it properly), it can be dismissed for good, and it never moves the page.

const browser = (languages: string[]) => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);
  vi.spyOn(navigator, 'language', 'get').mockReturnValue(languages[0] ?? '');
};
const open = (path = '/') => window.history.pushState({}, '', path);
const later = () => act(() => void vi.advanceTimersByTime(SHOW_AFTER_MS + 10));

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  open('/');
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  open('/');
});

describe('for a visitor whose browser prefers French', () => {
  beforeEach(() => browser(['fr-FR', 'en']));

  it('waits a moment, so it does not compete with the page that is loading', () => {
    render(<LanguageSuggestion />);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    later();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('offers the page in French, in French', () => {
    render(<LanguageSuggestion />);
    later();
    expect(screen.getByText('Voir ce site en français ?')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voir en français' })).toHaveAttribute('href', '/fr');
    expect(screen.getByRole('button', { name: 'Non merci' })).toBeInTheDocument();
  });

  it('is marked as French, so a screen reader pronounces it as French', () => {
    render(<LanguageSuggestion />);
    later();
    expect(screen.getByRole('complementary')).toHaveAttribute('lang', 'fr');
    expect(screen.getByRole('complementary', { name: 'Langue du site' })).toBeInTheDocument();
  });

  it('is a link to the French page and not a redirect: nothing moves until the person chooses', () => {
    render(<LanguageSuggestion />);
    later();
    expect(window.location.pathname).toBe('/');
    expect(localStorage.getItem('ssms_locale')).toBeNull();
  });

  it('goes away for good when it is dismissed, without choosing a language', () => {
    const { unmount } = render(<LanguageSuggestion />);
    later();
    fireEvent.click(screen.getByRole('button', { name: 'Non merci' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(localStorage.getItem('ssms_locale')).toBeNull();
    unmount();
    render(<LanguageSuggestion />);
    later();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('can be dismissed with Escape from inside it', () => {
    render(<LanguageSuggestion />);
    later();
    fireEvent.keyDown(screen.getByRole('link', { name: 'Voir en français' }), { key: 'Escape' });
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('still goes away for this visit when the browser will not remember that it was dismissed', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(<LanguageSuggestion />);
    later();
    fireEvent.click(screen.getByRole('button', { name: 'Non merci' }));
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});

describe('for a visitor whose browser prefers Kinyarwanda', () => {
  it('offers the page in Kinyarwanda, in Kinyarwanda', () => {
    browser(['rw-RW']);
    render(<LanguageSuggestion />);
    later();
    expect(screen.getByRole('complementary')).toHaveAttribute('lang', 'rw');
    expect(screen.getByRole('link', { name: 'Yego, mu Kinyarwanda' })).toHaveAttribute('href', '/rw');
    expect(screen.getByRole('button', { name: 'Oya, urakoze' })).toBeInTheDocument();
  });
});

describe('when it is not wanted', () => {
  it.each([
    ['an English browser', ['en-US']],
    ['a browser that ranks English first', ['en-GB', 'fr']],
    ['a language the app does not speak', ['de-DE']],
  ])('stays away for %s', (_name, languages) => {
    browser(languages);
    render(<LanguageSuggestion />);
    later();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('stays away for someone who chose a language, kept in storage', () => {
    browser(['fr']);
    localStorage.setItem('ssms_locale', 'en');
    render(<LanguageSuggestion />);
    later();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('stays away for someone who chose a language, kept only in the cookie', () => {
    browser(['fr']);
    vi.spyOn(document, 'cookie', 'get').mockImplementation(() => 'ssms_locale=en');
    render(<LanguageSuggestion />);
    later();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it.each(['/fr', '/rw', '/login', '/privacy'])('stays away at %s, which is not the English page of the landing page', (path) => {
    browser(['fr']);
    open(path);
    render(<LanguageSuggestion />);
    later();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('is not part of the page the build writes, since it depends on who is looking', () => {
    browser(['fr']);
    expect(renderToString(<LanguageSuggestion />)).toBe('');
  });

  it('does not appear after the page was left', () => {
    browser(['fr']);
    const { unmount } = render(<LanguageSuggestion />);
    unmount();
    later();
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});
