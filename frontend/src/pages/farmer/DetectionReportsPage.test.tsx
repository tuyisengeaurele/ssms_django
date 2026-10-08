import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const auth = vi.hoisted(() => ({ role: 'ADMIN' }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', role: auth.role } }) }));

const api = vi.hoisted(() => ({ history: vi.fn(), stats: vi.fn(), exportCsv: vi.fn(), farms: vi.fn() }));
vi.mock('../../services/admin.service', () => ({
  detectionReportService: { getHistory: api.history, getStats: api.stats, exportCsv: api.exportCsv },
}));
vi.mock('../../services/farm.service', () => ({ farmService: { getAll: api.farms } }));

import DetectionReportsPage from './DetectionReportsPage';

const history = [
  { id: 'd1', result: 'Healthy', confidence: 0.97, detectedAt: '2026-09-30T08:00:00Z', batchId: 'b1-abcdefgh', farmName: "Serge's farm", farmId: 'f1', notes: 'Looks fine' },
  { id: 'd2', result: 'Flacherie', confidence: 0.82, detectedAt: '2026-09-29T08:00:00Z', batchId: 'b2-zyxwvuts', farmName: "Gad's farm", farmId: 'f2' },
  { id: 'd3', result: 'Flacherie', confidence: 0.6, detectedAt: '2026-09-28T08:00:00Z', batchId: 'b2-zyxwvuts', farmName: "Gad's farm", farmId: 'f2' },
];
const stats = [{ result: 'Healthy', count: 1 }, { result: 'Flacherie', count: 2 }];

const open = () => render(
  <MemoryRouter>
    <LanguageProvider>
      <ToastProvider>
        <DetectionReportsPage />
      </ToastProvider>
    </LanguageProvider>
  </MemoryRouter>,
);

const tile = (label: string) => screen.getAllByText(label).map((el) => el.closest('.stat-tile')).find(Boolean) as HTMLElement;

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  auth.role = 'ADMIN';
  setReducedMotion(true);
  api.history.mockResolvedValue({ data: { data: history } });
  api.stats.mockResolvedValue({ data: { data: stats } });
  api.farms.mockResolvedValue({ data: { data: [{ id: 'f1', name: "Serge's farm" }, { id: 'f2', name: "Gad's farm" }] } });
});

describe('Detection reports page', () => {
  it('has one title and the last month as the default dates', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Detection reports' })).toBeInTheDocument();
    await waitFor(() => expect(api.history).toHaveBeenCalledWith(expect.objectContaining({ limit: 200, dateFrom: expect.any(String), dateTo: expect.any(String) })));
    const { dateFrom, dateTo } = api.history.mock.calls[0][0];
    expect(dateFrom < dateTo).toBe(true);
    expect(screen.getByLabelText('From')).toHaveValue(dateFrom);
  });

  it('counts the checks in plain tiles', async () => {
    open();
    await screen.findByText("Serge's farm", { selector: 'a' });
    expect(tile('Total checks')).toHaveTextContent('3');
    expect(tile('Healthy')).toHaveTextContent('1');
    expect(tile('Needs attention')).toHaveTextContent('2');
  });

  it('shows how often each condition appeared, most often first, as a bar list', async () => {
    open();
    const list = await screen.findByRole('list', { name: 'Conditions found' });
    const rows = within(list).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual(['Flacherie2', 'Healthy1']);
  });

  it('says "1 check shown" and not "1 checks shown"', async () => {
    api.history.mockResolvedValue({ data: { data: [history[0]] } });
    open();
    await screen.findByText("Serge's farm", { selector: 'a' });
    expect(screen.getByText('1 check shown')).toBeInTheDocument();
  });

  it('lists each check with links, a plain percentage and the date', async () => {
    open();
    const row = (await screen.findAllByText("Gad's farm", { selector: 'a' }))[0].closest('tr') as HTMLElement;
    expect(within(row).getByRole('link', { name: "Gad's farm" })).toHaveAttribute('href', '/farms/f2');
    expect(within(row).getByRole('link', { name: '#ZYXWVUTS' })).toHaveAttribute('href', '/batches/b2-zyxwvuts');
    expect(within(row).getByText('82%')).toBeInTheDocument();
    expect(within(row).getByText('Flacherie')).toBeInTheDocument();
  });

  it('lets an admin pick a farm and only fetches again when they apply', async () => {
    open();
    await screen.findByText("Serge's farm", { selector: 'a' });
    api.history.mockClear();
    fireEvent.change(screen.getByLabelText('Farm'), { target: { value: 'f2' } });
    expect(api.history).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(api.history).toHaveBeenCalledWith(expect.objectContaining({ farmId: 'f2' })));
    expect(api.stats).toHaveBeenLastCalledWith(expect.objectContaining({ farmId: 'f2' }));
  });

  it('puts the dates back with Reset', async () => {
    open();
    await screen.findByText("Serge's farm", { selector: 'a' });
    const from = screen.getByLabelText('From') as HTMLInputElement;
    const first = from.value;
    fireEvent.change(from, { target: { value: '2026-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(from.value).toBe(first);
  });

  it('does not offer a farm filter to a farmer', async () => {
    auth.role = 'FARMER';
    open();
    await screen.findByText("Serge's farm", { selector: 'a' });
    expect(screen.queryByLabelText('Farm')).not.toBeInTheDocument();
    expect(api.farms).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Back to the dashboard' })).toHaveAttribute('href', '/farmer');
  });

  it('sends a supervisor back to their own dashboard', async () => {
    auth.role = 'SUPERVISOR';
    open();
    expect(await screen.findByRole('link', { name: 'Back to the dashboard' })).toHaveAttribute('href', '/supervisor');
  });

  it('exports with the chosen filters', async () => {
    api.exportCsv.mockResolvedValue(undefined);
    open();
    await screen.findByText("Serge's farm", { selector: 'a' });
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(api.exportCsv).toHaveBeenCalledWith(expect.objectContaining({ limit: 500 })));
  });

  it('is kind when nothing matches', async () => {
    api.history.mockResolvedValue({ data: { data: [] } });
    api.stats.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No checks found')).toBeInTheDocument();
    expect(screen.getByText('No checks in these dates')).toBeInTheDocument();
  });

  it('offers a retry when the reports cannot load', async () => {
    api.history.mockRejectedValueOnce(new Error('x'));
    open();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("We couldn't load the reports");
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText("Serge's farm", { selector: 'a' })).toBeInTheDocument();
  });

  it('keeps the gradient cards, progress bars and old colours out', async () => {
    const { container } = open();
    await screen.findByText("Serge's farm", { selector: 'a' });
    expect(container.querySelector('.stat-card, .stat-card-glow, .progress-bar')).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toMatch(/gradient|#16a34a|#dc2626|#d97706|#2563eb|#7c3aed|#0284c7/);
  });
});
