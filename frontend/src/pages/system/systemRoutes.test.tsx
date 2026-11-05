import { configure, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const auth = vi.hoisted(() => ({ role: 'ADMIN' }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', name: 'Someone', role: auth.role }, isAuthenticated: true, isLoading: false }),
}));

const api = vi.hoisted(() => ({ health: vi.fn(), audit: vi.fn(), summary: vi.fn() }));
vi.mock('../../services/health.service', () => ({
  healthService: { get: api.health, history: vi.fn().mockResolvedValue({ data: { data: { services: {} } } }), runTest: vi.fn() },
}));
vi.mock('../../services/admin.service', () => ({
  auditLogService: { getList: api.audit, exportCsv: vi.fn(), exportPdf: vi.fn() },
  reportService: { getSummary: api.summary, exportCsv: vi.fn(), exportPdf: vi.fn() },
}));

import { systemRoutes } from './systemRoutes';

// The Activity page brings in the charts, which is slow to load the first time when the whole suite runs at once.
configure({ asyncUtilTimeout: 15000 });
vi.setConfig({ testTimeout: 30000 });

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function openAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <ToastProvider>
          <Routes>
            {systemRoutes()}
            <Route path="/unauthorized" element={<p>Not allowed here</p>} />
          </Routes>
          <Where />
        </ToastProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

const tabs = () => within(screen.getByRole('navigation', { name: 'System sections' })).getAllByRole('link');
const ready = () => screen.findByRole('navigation', { name: 'System sections' });

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  auth.role = 'ADMIN';
  api.health.mockResolvedValue({ data: { data: { checkedAt: '2026-11-04T10:00:00Z', overall: 'ok', checks: [], numbers: { unreadAlerts: 0, openAirAlerts: 0, unansweredMessages: 0 } } } });
  api.audit.mockResolvedValue({ data: { data: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 1 } } });
  api.summary.mockReturnValue(new Promise(() => {}));
});

describe('The System hub', () => {
  it('has one title, System, with the sections Health, Logs and Activity', async () => {
    openAt('/admin/system/health');
    await ready();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'System' })).toBeInTheDocument();
    expect(tabs().map((a) => a.textContent)).toEqual(['Health', 'Logs', 'Activity']);
    expect(tabs().map((a) => a.getAttribute('href'))).toEqual(['/admin/system/health', '/admin/system/logs', '/admin/system/activity']);
  });

  it('opens on Health when asked for System', async () => {
    openAt('/admin/system');
    await ready();
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/system/health');
    expect(tabs()[0]).toHaveAttribute('aria-current', 'page');
  });

  it.each([
    ['/admin/system/health', 0, 'System health'],
    ['/admin/system/logs', 1, 'Audit log'],
    ['/admin/system/activity', 2, 'Activity'],
  ])('shows %s as the open tab with its own section title', async (path, index, title) => {
    openAt(path);
    await ready();
    expect(tabs()[index]).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('heading', { level: 2, name: title })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('moves between the tabs', async () => {
    openAt('/admin/system/health');
    await ready();
    fireEvent.click(tabs()[1]);
    expect(await screen.findByRole('heading', { level: 2, name: 'Audit log' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/system/logs');
  });

  it.each([
    ['/admin/health', '/admin/system/health'],
    ['/admin/audit-log', '/admin/system/logs'],
    ['/admin/reports', '/admin/system/activity'],
  ])('keeps the old address %s working, and lands on %s', async (oldPath, newPath) => {
    openAt(oldPath);
    await ready();
    expect(screen.getByTestId('where')).toHaveTextContent(newPath);
  });

  it.each(['FARMER', 'SUPERVISOR'])('sends a %s away from every page of it', async (role) => {
    for (const path of ['/admin/system', '/admin/system/logs', '/admin/health']) {
      auth.role = role;
      const { unmount } = openAt(path);
      expect(await screen.findByText('Not allowed here')).toBeInTheDocument();
      unmount();
    }
  });

  it('reads in French', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    openAt('/admin/system/health');
    await screen.findByRole('navigation', { name: 'Sections du système' });
    expect(within(screen.getByRole('navigation', { name: 'Sections du système' })).getAllByRole('link').map((a) => a.textContent))
      .toEqual(['État', 'Journaux', 'Activité']);
  });
});
