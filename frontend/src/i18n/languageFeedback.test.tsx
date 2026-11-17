import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LanguageSwitcher from '../components/ui/LanguageSwitcher';
import { LanguageProvider } from '../context/LanguageContext';
import { AuthShell } from '../landing/auth/AuthShell';
import { Nav } from '../landing/Nav';
import AppearanceSettings from '../pages/settings/AppearanceSettings';
import { fakeCatalog as fake } from '../test/fakeCatalog';

vi.mock('../i18n/catalog', async () => (await import('../test/fakeCatalog')).fakeCatalogModule);

// While a language downloads, the control that asked for it says it is busy, so a person who sees nothing change yet knows it is
// working, and a screen reader hears the same.

const inApp = (node: JSX.Element) =>
  render(
    <MemoryRouter>
      <LanguageProvider>{node}</LanguageProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  fake.reset();
  localStorage.clear();
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
});

describe('a language control while a language downloads', () => {
  it('marks only the short code that was pressed as busy, and clears it on arrival', async () => {
    inApp(<LanguageSwitcher />);
    const french = screen.getByRole('button', { name: 'Français' });
    fireEvent.click(french);
    expect(french).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Kinyarwanda' })).not.toHaveAttribute('aria-busy', 'true');
    await act(async () => fake.arrive('fr'));
    expect(french).not.toHaveAttribute('aria-busy', 'true');
  });

  it('marks the button in settings as busy', async () => {
    inApp(<AppearanceSettings />);
    const rw = screen.getByRole('button', { name: 'Kinyarwanda' });
    fireEvent.click(rw);
    expect(rw).toHaveAttribute('aria-busy', 'true');
    await act(async () => fake.arrive('rw'));
    expect(rw).not.toHaveAttribute('aria-busy', 'true');
  });

  it('marks the menu on the landing page as busy', async () => {
    inApp(<Nav />);
    const menu = screen.getByRole('combobox', { name: 'Language' });
    fireEvent.change(menu, { target: { value: 'fr' } });
    expect(menu).toHaveAttribute('aria-busy', 'true');
    await act(async () => fake.arrive('fr'));
    expect(menu).not.toHaveAttribute('aria-busy', 'true');
  });

  it('marks the menu on the sign in pages as busy', async () => {
    inApp(
      <AuthShell title="Welcome back">
        <p>form</p>
      </AuthShell>,
    );
    const menu = screen.getByRole('combobox', { name: 'Language' });
    fireEvent.change(menu, { target: { value: 'rw' } });
    expect(menu).toHaveAttribute('aria-busy', 'true');
    await act(async () => fake.arrive('rw'));
    expect(menu).not.toHaveAttribute('aria-busy', 'true');
  });
});
