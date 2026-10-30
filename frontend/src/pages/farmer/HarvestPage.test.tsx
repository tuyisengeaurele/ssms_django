import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const auth = vi.hoisted(() => ({ role: 'FARMER' }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', role: auth.role } }) }));

const api = vi.hoisted(() => ({ batch: vi.fn(), list: vi.fn(), create: vi.fn(), remove: vi.fn() }));
vi.mock('../../services/batch.service', () => ({ batchService: { getById: api.batch } }));
vi.mock('../../services/harvest.service', () => ({
  harvestService: { getByBatch: api.list, create: api.create, delete: api.remove },
}));

// The dialog has its own tests. Here it only has to open for the right record.
vi.mock('./LotQrModal', () => ({
  default: ({ record }: { record: { id: string } | null }) => (record ? <div role="dialog" aria-label="QR dialog">QR for {record.id}</div> : null),
}));

import HarvestPage from './HarvestPage';

// The API sends decimals as strings.
const record = (id: string, kg: string, silk: string | null, grade: string, day: string, notes: string | null = null) => ({
  id, batchId: 'b1-9sieo7cv', cocoonWeightKg: kg, silkYieldG: silk, qualityGrade: grade, notes, harvestedAt: `${day}T09:00:00Z`, createdAt: '',
});
const records = [
  record('r1', '12.50', '800.00', 'A', '2026-10-01', 'First picking'),
  record('r2', '8.00', null, 'B', '2026-10-01'),
  record('r3', '4.50', '200.00', 'A', '2026-09-28'),
];

function open() {
  return render(
    <MemoryRouter initialEntries={['/batches/b1-9sieo7cv/harvest']}>
      <LanguageProvider>
        <ToastProvider>
          <Routes>
            <Route path="/batches/:id/harvest" element={<HarvestPage />} />
          </Routes>
        </ToastProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

const tile = (label: string) => screen.getAllByText(label).map((el) => el.closest('.stat-tile')).find(Boolean) as HTMLElement;

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  auth.role = 'FARMER';
  setReducedMotion(true);
  api.batch.mockResolvedValue({ data: { data: { id: 'b1-9sieo7cv', farmId: 'f1', stage: 'HARVEST', farm: { id: 'f1', name: "Serge's farm", location: 'Gatsibo' } } } });
  api.list.mockResolvedValue({ data: { data: records } });
});

describe('Harvest page', () => {
  it('has one title, names the batch and farm, and links back to the batch', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Harvest records' })).toBeInTheDocument();
    expect(await screen.findByText("Batch #9SIEO7CV on Serge's farm")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to the batch/ })).toHaveAttribute('href', '/batches/b1-9sieo7cv');
  });

  it('adds up the records, the cocoons and the silk in plain tiles', async () => {
    open();
    await screen.findByText('First picking');
    expect(tile('Records')).toHaveTextContent('3');
    expect(tile('Total cocoons')).toHaveTextContent('25 kg');
    expect(tile('Total silk')).toHaveTextContent('1000 g');
  });

  it('shows the weight for each harvest day, oldest first', async () => {
    open();
    const list = await screen.findByRole('list', { name: 'Cocoons by harvest day' });
    const rows = within(list).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual(['Sep 284.5 kg', 'Oct 120.5 kg']);
  });

  it('counts the records for every grade', async () => {
    open();
    const list = await screen.findByRole('list', { name: 'Quality grades' });
    const rows = within(list).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual(['Grade A2', 'Grade B1', 'Grade C0']);
  });

  it('says "1 record" and not "1 records"', async () => {
    api.list.mockResolvedValue({ data: { data: [records[0]] } });
    open();
    await screen.findByText('First picking');
    expect(screen.getByText('1 record')).toBeInTheDocument();
    expect(screen.queryByText('1 records')).not.toBeInTheDocument();
  });

  it('lists each record with plain numbers and a dash for missing silk', async () => {
    open();
    const row = (await screen.findByText('First picking')).closest('tr') as HTMLElement;
    expect(within(row).getByText('12.5 kg')).toBeInTheDocument();
    expect(within(row).getByText('800 g')).toBeInTheDocument();
    expect(within(row).getByText('Grade A')).toBeInTheDocument();
    const second = screen.getByText('8 kg').closest('tr') as HTMLElement;
    expect(within(second).getByText('-', { selector: 'td[data-label="Silk"]' })).toBeInTheDocument();
  });

  it('logs a harvest and shows it at once', async () => {
    api.create.mockResolvedValue({ data: { data: record('r9', '6.00', null, 'B', '2026-10-05', 'Late tray') } });
    open();
    await screen.findByText('First picking');
    fireEvent.click(screen.getByRole('button', { name: 'Log harvest' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log a harvest' });
    fireEvent.change(within(dialog).getByLabelText(/^Cocoon weight/), { target: { value: '6' } });
    fireEvent.change(within(dialog).getByLabelText(/^Quality grade/), { target: { value: 'B' } });
    fireEvent.change(within(dialog).getByLabelText(/^Notes/), { target: { value: 'Late tray' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save record' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith('b1-9sieo7cv', { cocoonWeightKg: 6, silkYieldG: null, qualityGrade: 'B', notes: 'Late tray' }));
    expect(await screen.findByText('Late tray')).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  const logOne = async () => {
    open();
    await screen.findByText('First picking');
    fireEvent.click(screen.getByRole('button', { name: 'Log harvest' }));
    const dialog = await screen.findByRole('dialog', { name: 'Log a harvest' });
    fireEvent.change(within(dialog).getByLabelText(/^Cocoon weight/), { target: { value: '6' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save record' }));
  };

  it('says a quiet word on the first harvest the farmer has recorded', async () => {
    api.create.mockResolvedValue({ data: { data: { ...record('r9', '6.00', null, 'B', '2026-10-05'), milestone: 'FIRST_HARVEST' } } });
    await logOne();
    expect(await screen.findByText('Your first harvest is recorded. The totals are on the Harvests page.')).toBeInTheDocument();
    expect(screen.queryByText('Harvest record saved.')).not.toBeInTheDocument();
  });

  it('keeps the usual message for every harvest after the first', async () => {
    api.create.mockResolvedValue({ data: { data: { ...record('r9', '6.00', null, 'B', '2026-10-05'), milestone: null } } });
    await logOne();
    expect(await screen.findByText('Harvest record saved.')).toBeInTheDocument();
  });

  it('asks before deleting a record', async () => {
    api.remove.mockResolvedValue({ data: { data: null } });
    open();
    const row = (await screen.findByText('First picking')).closest('tr') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /^Delete/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this record?' });
    expect(api.remove).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, delete' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(screen.queryByText('First picking')).not.toBeInTheDocument());
  });

  it('keeps logging and deleting from a supervisor', async () => {
    auth.role = 'SUPERVISOR';
    open();
    await screen.findByText('First picking');
    expect(screen.queryByRole('button', { name: 'Log harvest' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete/ })).not.toBeInTheDocument();
  });

  it('invites the first harvest when there are no records', async () => {
    api.list.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No harvest records yet')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Log the first harvest' }));
    expect(await screen.findByRole('dialog', { name: 'Log a harvest' })).toBeInTheDocument();
  });

  it('only describes the empty state to someone who cannot log', async () => {
    auth.role = 'SUPERVISOR';
    api.list.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No harvest records yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Log the first harvest' })).not.toBeInTheDocument();
  });

  it('says so, with a way back, when the records cannot load', async () => {
    api.list.mockRejectedValue(new Error('x'));
    open();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to the batch/ })).toBeInTheDocument();
  });

  it('keeps the pie chart, coloured numbers and gradient cards out', async () => {
    const { container } = open();
    await screen.findByText('First picking');
    expect(container.querySelector('.recharts-pie, .stat-card, .stat-card-glow')).toBeNull();
    expect(container.innerHTML.toLowerCase()).not.toMatch(/gradient|#16a34a|#d97706|#dc2626|#2563eb|#7c3aed/);
  });

  describe('before the cocoons are made', () => {
    const atStage = (stage: string) => api.batch.mockResolvedValue({ data: { data: { id: 'b1-9sieo7cv', farmId: 'f1', stage, farm: { id: 'f1', name: "Serge's farm" } } } });

    it.each(['EGG', 'LARVA', 'PUPA'])('offers no way to log a harvest at the %s stage, and says when it will be possible', async (stage) => {
      atStage(stage);
      api.list.mockResolvedValue({ data: { data: [] } });
      open();
      expect(await screen.findByText('You can log a harvest once the batch has reached the cocoon stage.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Log harvest' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Log the first harvest' })).not.toBeInTheDocument();
    });

    it.each(['COCOON', 'HARVEST'])('offers it at the %s stage', async (stage) => {
      atStage(stage);
      open();
      await screen.findByText('First picking');
      expect(screen.getByRole('button', { name: 'Log harvest' })).toBeInTheDocument();
      expect(screen.queryByText(/once the batch has reached the cocoon stage/)).not.toBeInTheDocument();
    });

    it('does not tell a supervisor about a button they never had', async () => {
      auth.role = 'SUPERVISOR';
      atStage('LARVA');
      open();
      await screen.findByText('First picking');
      expect(screen.queryByText(/once the batch has reached the cocoon stage/)).not.toBeInTheDocument();
    });
  });
});

describe('QR codes on lots', () => {
  it('gives each record of the owner a QR code button that opens the dialog for that record', async () => {
    open();
    await screen.findByText('First picking');
    const buttons = screen.getAllByRole('button', { name: /^QR code/ });
    expect(buttons).toHaveLength(3);
    fireEvent.click(screen.getByRole('button', { name: /^QR code.*Sep 28/ }));
    expect(await screen.findByRole('dialog', { name: 'QR dialog' })).toHaveTextContent('QR for r3');
  });

  it('says which lots are already shared', async () => {
    api.list.mockResolvedValue({ data: { data: [{ ...records[0], isShared: true }, records[1]] } });
    open();
    const shared = (await screen.findByText('First picking')).closest('tr') as HTMLElement;
    expect(within(shared).getByText('Shared')).toBeInTheDocument();
    const other = screen.getByText('8 kg').closest('tr') as HTMLElement;
    expect(within(other).queryByText('Shared')).not.toBeInTheDocument();
  });

  it('gives a supervisor none, since they may read lots but not share them', async () => {
    auth.role = 'SUPERVISOR';
    open();
    await screen.findByText('First picking');
    expect(screen.queryByRole('button', { name: /^QR code/ })).not.toBeInTheDocument();
  });
});
