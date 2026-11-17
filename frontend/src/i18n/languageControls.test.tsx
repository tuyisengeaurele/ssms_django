import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LanguageSwitcher from '../components/ui/LanguageSwitcher';
import { LanguageProvider } from '../context/LanguageContext';
import { AuthShell } from '../landing/auth/AuthShell';
import { Nav } from '../landing/Nav';
import AppearanceSettings from '../pages/settings/AppearanceSettings';
import { prefetchCatalog } from './catalog';

vi.mock('./catalog', async (original) => ({ ...(await original<typeof import('./catalog')>()), prefetchCatalog: vi.fn() }));

// Every place that changes the language fetches it ahead of time, in the same way.

const inApp = (node: JSX.Element) =>
  render(
    <MemoryRouter>
      <LanguageProvider>{node}</LanguageProvider>
    </MemoryRouter>,
  );
const fetched = () => vi.mocked(prefetchCatalog).mock.calls.map(([code]) => code).sort();

beforeEach(() => {
  localStorage.clear();
  vi.mocked(prefetchCatalog).mockClear();
});

describe('the language controls fetch ahead of time', () => {
  it('the short codes in the top bar fetch the language the pointer reaches', () => {
    inApp(<LanguageSwitcher />);
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Kinyarwanda' }));
    expect(fetched()).toEqual(['rw']);
  });

  it('the buttons in settings fetch the language the pointer reaches', () => {
    inApp(<AppearanceSettings />);
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Français' }));
    expect(fetched()).toEqual(['fr']);
  });

  it('the menu on the landing page fetches the other languages when it is opened', () => {
    inApp(<Nav />);
    const menu = screen.getByRole('combobox', { name: 'Language' });
    fireEvent.pointerEnter(menu);
    expect(fetched()).toEqual([]);
    fireEvent.pointerDown(menu);
    expect(fetched()).toEqual(['fr', 'rw']);
  });

  it('the menu on the sign in pages fetches the other languages when it is opened', () => {
    inApp(
      <AuthShell title="Welcome back">
        <p>form</p>
      </AuthShell>,
    );
    fireEvent.focus(screen.getByRole('combobox', { name: 'Language' }));
    expect(fetched()).toEqual(['fr', 'rw']);
  });
});
