import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import LanguageSwitcher from './LanguageSwitcher';

const show = (node = <LanguageSwitcher />) => render(<LanguageProvider>{node}</LanguageProvider>);

beforeEach(() => localStorage.clear());

describe('LanguageSwitcher', () => {
  it('is one group with a short code for each language', () => {
    show();
    const group = screen.getByRole('group', { name: 'Language' });
    expect(within(group).getAllByRole('button').map((b) => b.textContent)).toEqual(['EN', 'FR', 'RW']);
  });

  it('names each language in full for screen readers, in its own language', () => {
    show();
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('lang', 'en');
    expect(screen.getByRole('button', { name: 'Français' })).toHaveAttribute('lang', 'fr');
    expect(screen.getByRole('button', { name: 'Kinyarwanda' })).toHaveAttribute('lang', 'rw');
  });

  it('shows the full name as a tooltip on the short code', () => {
    show();
    expect(screen.getByRole('button', { name: 'Français' })).toHaveAttribute('title', 'Français');
  });

  it('marks the language in use', () => {
    show();
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Français' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switches the words and remembers the choice', () => {
    show(<><LanguageSwitcher /><p>{'x'}</p></>);
    fireEvent.click(screen.getByRole('button', { name: 'Kinyarwanda' }));
    expect(localStorage.getItem('ssms_locale')).toBe('rw');
    expect(screen.getByRole('button', { name: 'Kinyarwanda' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('names its own group in the chosen language', () => {
    localStorage.setItem('ssms_locale', 'fr');
    show();
    expect(screen.getByRole('group', { name: 'Langue' })).toBeInTheDocument();
  });

  it('stays one tab stop per language, so the keyboard reaches each', () => {
    show();
    for (const button of screen.getAllByRole('button')) expect(button).not.toHaveAttribute('tabindex', '-1');
  });

  describe('inside a menu', () => {
    it('uses the roles a menu expects', () => {
      show(<div role="menu"><LanguageSwitcher inMenu /></div>);
      const group = screen.getByRole('group', { name: 'Language' });
      const items = within(group).getAllByRole('menuitemradio');
      expect(items.map((b) => b.textContent)).toEqual(['EN', 'FR', 'RW']);
      expect(items[0]).toHaveAttribute('aria-checked', 'true');
      expect(items[1]).toHaveAttribute('aria-checked', 'false');
    });

    it('switches language and stays open', () => {
      show(<div role="menu"><LanguageSwitcher inMenu /></div>);
      fireEvent.click(screen.getByRole('menuitemradio', { name: 'Français' }));
      expect(localStorage.getItem('ssms_locale')).toBe('fr');
      expect(screen.getByRole('menu')).toBeInTheDocument();
    });
  });
});
