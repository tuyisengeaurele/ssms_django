import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const summary = vi.hoisted(() => ({
  generatedAt: '2026-10-08T15:17:27Z',
  users: {
    total: 9,
    byRole: [{ role: 'ADMIN', count: 1 }, { role: 'FARMER', count: 6 }, { role: 'SUPERVISOR', count: 2 }],
    registrations30d: [{ day: '2026-09-20', count: 2 }, { day: '2026-09-21', count: 1 }],
  },
  farms: { total: 6 },
  batches: { total: 12, byStage: [{ stage: 'EGG', count: 3 }, { stage: 'LARVA', count: 6 }, { stage: 'PUPA', count: 3 }] },
  harvests: { total: 6, totalKg: 8, totalSilkG: 5600, avgKg: 1.333, byGrade: [{ grade: 'A', count: 2, totalKg: 3 }, { grade: 'B', count: 3, totalKg: 4 }, { grade: 'C', count: 1, totalKg: 1 }] },
  detections: {
    total: 32,
    byResult: [{ result: 'Healthy', count: 20 }, { result: 'Flacherie', count: 10 }, { result: 'Grasserie', count: 2 }],
    detections30d: [{ day: '2026-09-22', count: 4 }],
  },
  audit: { actions30d: [{ action: 'LOGIN', count: 40 }, { action: 'CREATE', count: 5 }] },
  topFarmers: [{ name: 'Mugisha Serge', email: 'serge@gmail.com', farmCount: 2 }, { name: 'Bruce Ishimwe', email: 'bruce@gmail.com', farmCount: 1 }],
}));

const api = vi.hoisted(() => ({ getSummary: vi.fn(), exportCsv: vi.fn() }));
vi.mock('../../services/admin.service', () => ({ reportService: api }));

import AdminReportsPage from './AdminReportsPage';

function open() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <AdminReportsPage />
      </ToastProvider>
    </LanguageProvider>,
  );
}

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.getSummary.mockResolvedValue({ data: { data: summary } });
  api.exportCsv.mockResolvedValue(undefined);
});

const tile = (label: string) => screen.getByText(label).closest('.stat-tile') as HTMLElement;

describe('System report page', () => {
  it('has one title and says when it was made', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'System report' })).toBeInTheDocument();
    expect(screen.getByText(/^Generated at:/)).toBeInTheDocument();
  });

  it('shows the headline numbers with a short note', async () => {
    open();
    await screen.findByText('Total users');
    expect(within(tile('Total users')).getByText('9')).toBeInTheDocument();
    expect(within(tile('Total users')).getByText('6 farmers')).toBeInTheDocument();
    expect(within(tile('Active farms')).getByText('6')).toBeInTheDocument();
    expect(within(tile('Active batches')).getByText('12')).toBeInTheDocument();
    expect(within(tile('Harvest records')).getByText('8.0 kg in total')).toBeInTheDocument();
    expect(within(tile('Total disease checks')).getByText('32')).toBeInTheDocument();
  });

  it('shows categories as bar lists, never as pie charts', async () => {
    const { container } = open();
    await screen.findByText('Total users');
    const stages = screen.getByRole('list', { name: 'Batches by stage' });
    expect(within(stages).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Egg3', 'Larva6', 'Pupa3']);
    const results = screen.getByRole('list', { name: 'Disease check results' });
    expect(within(results).getByText('Healthy')).toBeInTheDocument();
    expect(within(results).getByText('20')).toBeInTheDocument();
    expect(container.querySelector('.recharts-pie, .recharts-legend-wrapper')).toBeNull();
  });

  it('names roles and actions in plain words', async () => {
    open();
    await screen.findByText('Total users');
    const roles = screen.getByRole('list', { name: 'Users by role' });
    expect(within(roles).getByText('Administrator')).toBeInTheDocument();
    expect(within(roles).getByText('Farmer')).toBeInTheDocument();
    const actions = screen.getByRole('list', { name: 'Activity by type (30 days)' });
    expect(within(actions).getByText('Signed in')).toBeInTheDocument();
    expect(within(actions).getByText('Created')).toBeInTheDocument();
  });

  it('shows harvest grades and the harvest totals', async () => {
    open();
    await screen.findByText('Total users');
    const grades = screen.getByRole('list', { name: 'Harvest by grade' });
    expect(within(grades).getByText('Grade B')).toBeInTheDocument();
    expect(screen.getByText('8.0 kg')).toBeInTheDocument();
    expect(screen.getByText('5600 g')).toBeInTheDocument();
    expect(screen.getByText('1.33 kg')).toBeInTheDocument();
  });

  it('gives the time charts a table of the same numbers for screen readers', async () => {
    open();
    await screen.findByText('Total users');
    const chart = screen.getByRole('img', { name: 'New accounts (30 days)' });
    const rows = within(chart).getAllByRole('row');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('2026-09-202');
  });

  it('ranks the farmers with the most farms', async () => {
    open();
    const row = (await screen.findByText('Mugisha Serge')).closest('tr') as HTMLElement;
    expect(within(row).getByText('serge@gmail.com')).toBeInTheDocument();
    expect(within(row).getByText('2')).toBeInTheDocument();
  });

  it('says so when there is nothing to chart yet', async () => {
    api.getSummary.mockResolvedValue({
      data: {
        data: {
          ...summary,
          users: { ...summary.users, registrations30d: [] },
          batches: { total: 0, byStage: [] },
          detections: { total: 0, byResult: [], detections30d: [] },
          audit: { actions30d: [] },
          harvests: { ...summary.harvests, byGrade: [] },
          topFarmers: [],
        },
      },
    });
    open();
    expect(await screen.findByText('No new accounts in the last 30 days.')).toBeInTheDocument();
    expect(screen.getByText('No active batches yet.')).toBeInTheDocument();
    expect(screen.getByText('No harvests recorded yet.')).toBeInTheDocument();
    expect(screen.getByText('No activity in the last 30 days.')).toBeInTheDocument();
  });

  it('prints and exports', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    open();
    await screen.findByText('Total users');
    fireEvent.click(screen.getByRole('button', { name: 'Print / PDF' }));
    expect(print).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(api.exportCsv).toHaveBeenCalled());
  });

  it('tells the person kindly when the CSV cannot be made', async () => {
    api.exportCsv.mockRejectedValue(new Error('x'));
    open();
    await screen.findByText('Total users');
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(await screen.findByText("We couldn't create the CSV file. Please try again.", {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('tells the person kindly when the report cannot be loaded', async () => {
    api.getSummary.mockRejectedValue(new Error('x'));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the report data. Please try again.");
  });

  it('keeps the old rainbow colours out', async () => {
    const { container } = open();
    await screen.findByText('Total users');
    const html = container.innerHTML.toLowerCase();
    for (const bad of ['#7c3aed', '#2563eb', '#16a34a', '#dc2626', '#f97316', '#a3e635']) expect(html).not.toContain(bad);
  });
});
