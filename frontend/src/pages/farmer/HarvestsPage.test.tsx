import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ list: vi.fn(), exportCsv: vi.fn() }));
vi.mock('../../services/harvest.service', () => ({ harvestService: { getAll: api.list, exportCsv: api.exportCsv } }));

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
  api.list.mockResolvedValue({ data: { data: records } });
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

  it('ranks the farms by cocoon weight and names a batch that has no farm', async () => {
    open();
    const list = await screen.findByRole('list', { name: 'Cocoons by farm' });
    const rows = within(list).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual(["Serge's farm20.5 kg", "Gad's farm4.5 kg", 'Batch #QQQQQQQQ1 kg']);
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

  it('searches by farm, grade or note, and can be cleared', async () => {
    open();
    await screen.findByText('First picking');
    const box = screen.getByRole('searchbox', { name: 'Search by farm, grade or note' });
    fireEvent.change(box, { target: { value: 'odd' } });
    expect(screen.queryByText('First picking')).not.toBeInTheDocument();
    expect(screen.getByText('Odd tray')).toBeInTheDocument();
    fireEvent.change(box, { target: { value: 'zzz' } });
    expect(screen.getByText('No records match')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(await screen.findByText('First picking')).toBeInTheDocument();
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
    api.list.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No harvest records yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  });

  it('offers a retry when the records cannot load', async () => {
    api.list.mockRejectedValueOnce(new Error('x'));
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
