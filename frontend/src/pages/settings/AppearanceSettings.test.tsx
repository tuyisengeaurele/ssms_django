import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';

import AppearanceSettings from './AppearanceSettings';

function open() {
  return render(
    <LanguageProvider>
      <AppearanceSettings />
    </LanguageProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
});

describe('Appearance settings', () => {
  it('lets the person pick a language and shows which one is on', () => {
    open();
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(localStorage.getItem('ssms_locale')).toBe('fr');
    expect(screen.getByRole('button', { name: 'Français' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('follows the device by default and lets the person choose light or dark', () => {
    open();
    expect(screen.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Dark' }));
    expect(localStorage.getItem('ssms_theme')).toBe('dark');
    expect(screen.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(localStorage.getItem('ssms_theme')).toBe('light');
  });

  it('has a heading for each choice', () => {
    open();
    expect(screen.getByRole('heading', { level: 2, name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Light or dark' })).toBeInTheDocument();
  });
});
