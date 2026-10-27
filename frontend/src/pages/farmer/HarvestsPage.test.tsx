import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ page: vi.fn(), stats: vi.fn(), exportCsv: vi.fn() }));
vi.mock('../../services/harvest.service', () => ({ harvestService: { getPage: api.page, getStats: api.stats, exportCsv: api.exportCsv } }));

import HarvestsPage from './HarvestsPage';

// The API sends decimals as strings.
const record = (id: string, batch: string, farm: string | null, kg: string, silk: string | null, grade: string, notes: string | null = null) => ({
  id, batchId: batch, farmId: farm ? `f-${farm}` : null, farmName: farm, cocoonWeightKg: kg, silkYieldG: silk, qualityGrade: grade, notes, harvestedAt: '2026-10-01T09:00:00Z', createdAt: '',
});
const records = [
  record('r1', 'b1-abcdefgh', "Serge's farm", '12.50', '800.00', 'A', 'First picking'),
  record('r2', 'b1-abcdefgh', "Serge's farm", '8.00', null, 'B'),
  record('r3', 'b2-ijklmnop', "Gad's farm", '4.50', '200.00', 'A'),
  record('r4', 'b3-qqqqqqqq', null, '1.00', null, 'C', 'Odd tray'),
];

// The totals come from the stats endpoint, so they cover every record and not only the page on screen.
const stats = {
  totalWeightKg: 26, totalSilkG: 1000, avgWeightKg: 6.5, recordCount: 4,
  byGrade: [{ grade: 'A', count: 2, totalKg: 17 }, { grade: 'B', count: 1, totalKg: 8 }, { grade: 'C', count: 1, totalKg: 1 }],
  byFarm: [
    { farm: "Serge's farm", count: 2, totalKg: 20.5 },
    { farm: "Gad's farm", count: 1, totalKg: 4.5 },
    { farm: 'Hill farm', count: 1, totalKg: 1 },
  ],
};
const meta = (over: Record<string, unknown> = {}) => ({ page: 1, pageSize: 20, totalItems: 4, totalPages: 1, hasNext: false, hasPrev: false, ...over });
const answer = (rows: unknown[], over: Record<string, unknown> = {}) => ({ data: { data: rows, pagination: meta({ totalItems: rows.length, ...over }) } });

const open = () => render(
  <MemoryRouter>
    <LanguageProvider>
      <ToastProvider>
        <HarvestsPage />
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
  setReducedMotion(true);
  api.stats.mockResolvedValue({ data: { data: stats } });
  api.page.mockImplementation((_page: number, search = '') => {
    const q = search.toLowerCase();
    const rows = records.filter((r) => !q || (r.farmName ?? '').toLowerCase().includes(q) || r.qualityGrade.toLowerCase().includes(q) || (r.notes ?? '').toLowerCase().includes(q));
    return Promise.resolve(answer(rows));
  });
});

describe('Harvests page', () => {
  it('has one title and counts the records', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Harvests' })).toBeInTheDocument();
    expect(await screen.findByText('4 records across all your batches.')).toBeInTheDocument();
  });

  it('adds up the totals and the average in plain tiles', async () => {
    open();
    await screen.findByText('First picking');
    expect(tile('Records')).toHaveTextContent('4');
    expect(tile('Total cocoons')).toHaveTextContent('26 kg');
    expect(tile('Total silk')).toHaveTextContent('1000 g');
    expect(tile('Average per record')).toHaveTextContent('6.5 kg');
  });

  it('ranks the farms by cocoon weight, from the totals of every record', async () => {
    open();
    const list = await screen.findByRole('list', { name: 'Cocoons by farm' });
    const rows = within(list).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual(["Serge's farm20.5 kg", "Gad's farm4.5 kg", 'Hill farm1 kg']);
  });

  it('counts the records for every grade', async () => {
    open();
    const list = await screen.findByRole('list', { name: 'Quality grades' });
    expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Grade A2', 'Grade B1', 'Grade C1']);
  });

  it('lists each record and links to its batch', async () => {
    open();
    const row = (await screen.findByText('First picking')).closest('tr') as HTMLElement;
    expect(within(row).getByText("Serge's farm")).toBeInTheDocument();
    expect(within(row).getByText('12.5 kg')).toBeInTheDocument();
    expect(within(row).getByText('800 g')).toBeInTheDocument();
    expect(within(row).getByText('Grade A')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: /^Open batch/ })).toHaveAttribute('href', '/batches/b1-abcdefgh/harvest');
  });

  it('searches by farm, grade or note on the server, and can be cleared', async () => {
    open();
    await screen.findByText('First picking');
    const box = screen.getByRole('searchbox', { name: 'Search by farm, grade or note' });
    fireEvent.change(box, { target: { value: 'odd' } });
    await waitFor(() => expect(api.page).toHaveBeenLastCalledWith(1, 'odd'));
    expect(await screen.findByText('Odd tray')).toBeInTheDocument();
    expect(screen.queryByText('First picking')).not.toBeInTheDocument();
    fireEvent.change(box, { target: { value: 'zzz' } });
    expect(await screen.findByText('No records match')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(await screen.findByText('First picking')).toBeInTheDocument();
  });

  it('asks for one search a pause after typing, not one per key', async () => {
    open();
    await screen.findByText('First picking');
    api.page.mockClear();
    const box = screen.getByRole('searchbox', { name: 'Search by farm, grade or note' });
    for (const text of ['o', 'od', 'odd']) fireEvent.change(box, { target: { value: text } });
    await waitFor(() => expect(api.page).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(api.page.mock.calls).toEqual([[1, 'odd']]);
  });

  it('says "1 record" when the search leaves one', async () => {
    open();
    await screen.findByText('First picking');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search by farm, grade or note' }), { target: { value: 'odd' } });
    expect(await screen.findByText('1 record')).toBeInTheDocument();
  });

  it('shows one page and moves between pages', async () => {
    api.page.mockImplementation((page: number) => Promise.resolve(answer(
      [page === 1 ? records[0] : records[2]],
      { page, pageSize: 1, totalItems: 3, totalPages: 3, hasNext: page < 3, hasPrev: page > 1 },
    )));
    open();
    await screen.findByText('First picking');
    expect(screen.getByText('3 records')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(api.page).toHaveBeenLastCalledWith(2, ''));
    expect(await screen.findByText("Gad's farm", { selector: 'td' })).toBeInTheDocument();
    expect(screen.queryByText('First picking')).not.toBeInTheDocument();
  });

  it('goes back to the first page when the search changes', async () => {
    api.page.mockImplementation((page: number) => Promise.resolve(answer(
      [records[0]], { page, pageSize: 1, totalItems: 3, totalPages: 3, hasNext: page < 3, hasPrev: page > 1 },
    )));
    open();
    await screen.findByText('First picking');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(api.page).toHaveBeenLastCalledWith(2, ''));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search by farm, grade or note' }), { target: { value: 'serge' } });
    await waitFor(() => expect(api.page).toHaveBeenLastCalledWith(1, 'serge'));
  });

  it('keeps the search placeholder short enough to read', async () => {
    open();
    await screen.findByText('First picking');
    expect(screen.getByRole('searchbox', { name: 'Search by farm, grade or note' })).toHaveAttribute('placeholder', 'Search records');
  });

  it('downloads the records as a file', async () => {
    api.exportCsv.mockResolvedValue({ data: 'a,b' });
    const create = vi.fn(() => 'blob:harvests');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    open();
    await screen.findByText('First picking');
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(api.exportCsv).toHaveBeenCalled());
    await waitFor(() => expect(revoke).toHaveBeenCalledWith('blob:harvests'));
  });

  it('explains when nothing has been harvested yet, and offers no export', async () => {
    api.stats.mockResolvedValue({ data: { data: { ...stats, recordCount: 0, byGrade: [], byFarm: [] } } });
    api.page.mockResolvedValue(answer([]));
    open();
    expect(await screen.findByText('No harvest records yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  });

  it('offers a retry when the records cannot load', async () => {
    api.page.mockRejectedValueOnce(new Error('x'));
    open();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("We couldn't load the harvest records");
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('First picking')).toBeInTheDocument();
  });

  it('keeps the pie chart, coloured numbers and gradient cards out', async () => {
    const { container } = open();
    await screen.findByText('First picking');
    expect(container.querySelector('.recharts-pie, .stat-card, .stat-card-glow')).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toMatch(/gradient|#16a34a|#d97706|#dc2626|#2563eb|#7c3aed/);
  });
});
