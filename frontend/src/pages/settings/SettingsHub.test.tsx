import { configure, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const auth = vi.hoisted(() => ({
  user: { id: 'c19de39a0e5czzvf7u2sak0w3ttf', name: 'Auris Tuyisenge', email: 'auris@ssms.com', role: 'FARMER', cooperativeId: null, cooperativeName: null, createdAt: '2026-05-01T10:00:00Z' },
  isAuthenticated: true,
  isLoading: false,
  refreshUser: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('../../services/auth.service', () => ({ authService: { updateProfile: vi.fn(), changePassword: vi.fn() } }));
vi.mock('../../services/sessions.service', () => ({ sessionsService: { list: vi.fn().mockResolvedValue({ data: { data: [] } }) } }));
vi.mock('../../services/alert.service', () => ({
  alertService: { getThresholds: vi.fn().mockResolvedValue({ data: { data: [] } }), updateThreshold: vi.fn() },
}));

import { settingsRoutes } from './settingsRoutes';

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function openAt(path: string, role = 'FARMER') {
  auth.user.role = role;
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <ToastProvider>
          <Routes>
            {settingsRoutes()}
            <Route path="/unauthorized" element={<p>Not allowed here</p>} />
          </Routes>
          <Where />
        </ToastProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

const ready = () => screen.findByRole('navigation', { name: 'Settings sections' });
// The first test of a run loads each page from disk, which is slow when the whole suite runs at once.
configure({ asyncUtilTimeout: 5000 });

const sections = (name = 'Settings sections') => within(screen.getByRole('navigation', { name })).getAllByRole('link');

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
});

describe('Settings hub', () => {
  it('opens on Account when asked for Settings', async () => {
    openAt('/settings');
    expect(await screen.findByRole('heading', { level: 2, name: 'Account details' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/settings/account');
  });

  it.each(['/settings/account', '/settings/security', '/settings/appearance'])('has exactly one title on %s', async (path) => {
    openAt(path);
    await screen.findByRole('navigation', { name: 'Settings sections' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument();
  });

  it('lists three sections for a farmer and a supervisor', async () => {
    for (const role of ['FARMER', 'SUPERVISOR']) {
      const { unmount } = openAt('/settings/account', role);
      await ready();
      expect(sections().map((a) => a.textContent)).toEqual(['Account', 'Security', 'Appearance']);
      unmount();
    }
  });

  it('adds Safe ranges for an admin', async () => {
    openAt('/settings/account', 'ADMIN');
    await ready();
    expect(sections().map((a) => a.textContent)).toEqual(['Account', 'Security', 'Appearance', 'Safe ranges']);
    expect(sections()[3]).toHaveAttribute('href', '/settings/safe-ranges');
  });

  it('marks the open section for screen readers and moves between sections', async () => {
    openAt('/settings/account');
    await ready();
    expect(sections()[0]).toHaveAttribute('aria-current', 'page');
    fireEvent.click(sections()[1]);
    expect(await screen.findByRole('heading', { level: 2, name: 'Password' })).toBeInTheDocument();
    expect(sections()[1]).toHaveAttribute('aria-current', 'page');
    expect(sections()[0]).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('where')).toHaveTextContent('/settings/security');
  });

  it.each(['FARMER', 'SUPERVISOR'])('does not let a %s open Safe ranges', async (role) => {
    openAt('/settings/safe-ranges', role);
    expect(await screen.findByText('Not allowed here')).toBeInTheDocument();
  });

  it('shows Safe ranges to an admin inside Settings, under the one title', async () => {
    openAt('/settings/safe-ranges', 'ADMIN');
    expect(await screen.findByRole('heading', { level: 2, name: 'Safe ranges' })).toBeInTheDocument();
    await ready();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(sections()[3]).toHaveAttribute('aria-current', 'page');
  });

  it('keeps the old addresses working', async () => {
    const first = openAt('/profile');
    expect(await screen.findByRole('heading', { level: 2, name: 'Account details' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/settings/account');
    first.unmount();
    openAt('/admin/thresholds', 'ADMIN');
    expect(await screen.findByRole('heading', { level: 2, name: 'Safe ranges' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/settings/safe-ranges');
  });

  it('uses no technical wording and no old gradients on any section', async () => {
    for (const path of ['/settings/account', '/settings/security', '/settings/appearance']) {
      const { container, unmount } = openAt(path);
      await screen.findByRole('navigation', { name: 'Settings sections' });
      expect(container.textContent).not.toMatch(/JWT|token/i);
      expect(container.innerHTML.toLowerCase()).not.toMatch(/gradient|#7c3aed|#d97706|#f3e8ff/);
      unmount();
    }
  });

  it('reads in French', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    openAt('/settings/account');
    expect(await screen.findByRole('heading', { level: 1, name: 'Paramètres' })).toBeInTheDocument();
    expect(sections('Sections des paramètres').map((a) => a.textContent)).toEqual(['Compte', 'Sécurité', 'Apparence']);
  });

  it('reads in Kinyarwanda', async () => {
    localStorage.setItem('ssms_locale', 'rw');
    openAt('/settings/account');
    expect(await screen.findByRole('heading', { level: 1, name: 'Igenamiterere' })).toBeInTheDocument();
    expect(sections("Ibice by'igenamiterere").map((a) => a.textContent)).toEqual(['Konti', 'Umutekano', 'Isura']);
  });
});
