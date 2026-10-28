import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const auth = vi.hoisted(() => ({ role: 'SUPERVISOR' }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', role: auth.role, cooperativeName: 'Gatsibo Silk' } }) }));

const api = vi.hoisted(() => ({ get: vi.fn(), download: vi.fn(), coops: vi.fn() }));
vi.mock('../../services/coopReport.service', () => ({ coopReportService: { get: api.get, download: api.download } }));
vi.mock('../../services/cooperative.service', () => ({ cooperativeService: { getAll: api.coops } }));

import CooperativeReportPage from './CooperativeReportPage';

const farm = (id: string, name: string, level: 'HIGH' | 'MEDIUM' | 'OK', over: object = {}) => ({
  id, name, ownerName: `Owner of ${name}`, location: 'Gatsibo', level, score: 0, diseaseAlerts: 0, openAirAlerts: 0, offlineDevices: 0,
  activeBatches: 2, harvestKg: 0, alerts: 0, ...over,
});

const report = (over: object = {}) => ({
  generatedAt: '2026-10-28T12:00:00Z',
  cooperative: { id: 'c1', name: 'Gatsibo Silk' },
  period: { from: '2026-09-29', to: '2026-10-28' },
  totals: { farms: 3, farmers: 2, batchesRunning: 6, batchesStarted: 4 },
  harvest: { records: 3, totalKg: 24.5, silkG: 900, byGrade: [{ grade: 'A', count: 2, totalKg: 20.5 }, { grade: 'B', count: 1, totalKg: 4 }] },
  checks: { total: 3, found: 1, byResult: [{ result: 'Healthy', count: 2 }, { result: 'Pebrine', count: 1 }] },
  alerts: { total: 3, acknowledged: 1, resolved: 1, byType: [{ type: 'DISEASE', count: 2 }, { type: 'TEMPERATURE', count: 1 }] },
  farms: [
    farm('f1', 'Hill Farm', 'HIGH', { diseaseAlerts: 1, harvestKg: 20.5, alerts: 2 }),
    farm('f2', 'River Farm', 'MEDIUM', { offlineDevices: 2, harvestKg: 4, alerts: 1 }),
    farm('f3', 'Quiet Farm', 'OK'),
  ],
  ...over,
});

function open() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <ToastProvider>
          <CooperativeReportPage />
        </ToastProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 28, 12, 0, 0));
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  auth.role = 'SUPERVISOR';
  api.get.mockResolvedValue({ data: { data: report() } });
  api.download.mockResolvedValue(undefined);
  api.coops.mockResolvedValue({ data: { data: [{ id: 'c1', name: 'Gatsibo Silk' }, { id: 'c2', name: 'Nyagatare Silk' }] } });
});

afterEach(() => {
  vi.useRealTimers();
});

const section = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('section') as HTMLElement;

describe('Cooperative report page', () => {
  it('has one title and says what it is for', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Cooperative report' })).toBeInTheDocument();
    expect(await screen.findByText('The farms of your cooperative, between the dates you choose.')).toBeInTheDocument();
  });

  it('opens on the last thirty days', async () => {
    open();
    await screen.findAllByText('Hill Farm');
    expect(api.get).toHaveBeenCalledWith({ from: '2026-09-29', to: '2026-10-28' });
    expect(screen.getByLabelText('From')).toHaveValue('2026-09-29');
    expect(screen.getByLabelText('To')).toHaveValue('2026-10-28');
  });

  it('counts farms, farmers and batches', async () => {
    open();
    await screen.findAllByText('Hill Farm');
    const tile = (label: string) => screen.getByText(label).closest('.stat-tile') as HTMLElement;
    expect(within(tile('Farms')).getByText('3')).toBeInTheDocument();
    expect(within(tile('Farmers with a farm')).getByText('2')).toBeInTheDocument();
    expect(within(tile('Batches running now')).getByText('6')).toBeInTheDocument();
    expect(within(tile('Batches started in the period')).getByText('4')).toBeInTheDocument();
  });

  it('sums the harvest with its grades', async () => {
    open();
    await screen.findAllByText('Hill Farm');
    const harvest = within(section('Harvest in the period'));
    expect(harvest.getByText('3 records, 24.5 kg of cocoons, 900 g of silk.')).toBeInTheDocument();
    expect(harvest.getByText('Grade A: 2, Grade B: 1, Grade C: 0')).toBeInTheDocument();
  });

  it('says so when there was no harvest, no check and no alert', async () => {
    api.get.mockResolvedValue({ data: { data: report({
      harvest: { records: 0, totalKg: 0, silkG: 0, byGrade: [] }, checks: { total: 0, found: 0, byResult: [] }, alerts: { total: 0, acknowledged: 0, resolved: 0, byType: [] },
    }) } });
    open();
    await screen.findAllByText('Hill Farm');
    expect(screen.getByText('No harvest recorded in the period.')).toBeInTheDocument();
    expect(screen.getByText('No disease checks in the period.')).toBeInTheDocument();
    expect(screen.getByText('No alerts in the period.')).toBeInTheDocument();
  });

  it('lists the disease checks and the alerts by their kind, in words', async () => {
    open();
    await screen.findAllByText('Hill Farm');
    const checks = within(section('Disease checks in the period'));
    expect(checks.getByText('3 checks, 1 found a disease.')).toBeInTheDocument();
    expect(checks.getByText('Pebrine')).toBeInTheDocument();
    const alerts = within(section('Alerts in the period'));
    expect(alerts.getByText('3 alerts, 1 acknowledged, 1 resolved.')).toBeInTheDocument();
    expect(alerts.getByText('Disease')).toBeInTheDocument();
    expect(alerts.getByText('Temperature')).toBeInTheDocument();
  });

  it('ranks the farms by risk today with the level in words and the reasons, and says the levels are for today', async () => {
    open();
    await screen.findAllByText('Hill Farm');
    const risk = within(section('Farms by risk today'));
    const rows = risk.getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual(['Hill Farm', 'River Farm', 'Quiet Farm']);
    expect(within(rows[0]).getByText('High')).toBeInTheDocument();
    expect(within(rows[0]).getByText('1 disease alert in the last 14 days')).toBeInTheDocument();
    expect(within(rows[1]).getByText('2 sensors offline')).toBeInTheDocument();
    expect(risk.getByText('The levels are as of the day the report was made, not for the period.')).toBeInTheDocument();
  });

  it('shows each farm with its batches, cocoons and alerts', async () => {
    open();
    await screen.findAllByText('Hill Farm');
    const table = within(section('Each farm in the period'));
    const hill = table.getByText('Hill Farm').closest('tr') as HTMLElement;
    expect(within(hill).getAllByRole('cell').map((c) => c.textContent)).toEqual(['Hill Farm', '2', '20.5', '2']);
  });

  it('says so when the cooperative has no farms', async () => {
    api.get.mockResolvedValue({ data: { data: report({ farms: [], totals: { farms: 0, farmers: 0, batchesRunning: 0, batchesStarted: 0 } }) } });
    open();
    expect((await screen.findAllByText('No farms yet.')).length).toBeGreaterThan(0);
  });

  describe('choosing the dates', () => {
    it('asks again when a date changes', async () => {
      open();
      await screen.findAllByText('Hill Farm');
      fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });
      await waitFor(() => expect(api.get).toHaveBeenLastCalledWith({ from: '2026-10-01', to: '2026-10-28' }));
    });

    it('says kindly, and asks nothing, when the end is before the start', async () => {
      open();
      await screen.findAllByText('Hill Farm');
      api.get.mockClear();
      fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-01' } });
      expect(await screen.findByText('The end date cannot be before the start date.')).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 450));
      expect(api.get).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    });

    it('says kindly, and asks nothing, when the period is longer than a year', async () => {
      open();
      await screen.findAllByText('Hill Farm');
      api.get.mockClear();
      fireEvent.change(screen.getByLabelText('From'), { target: { value: '2025-01-01' } });
      expect(await screen.findByText('A report can cover up to one year.')).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 450));
      expect(api.get).not.toHaveBeenCalled();
    });

    it('asks for both dates when one is cleared', async () => {
      open();
      await screen.findAllByText('Hill Farm');
      fireEvent.change(screen.getByLabelText('From'), { target: { value: '' } });
      expect(await screen.findByText('Please choose a start date and an end date.')).toBeInTheDocument();
    });

    it('offers Reset only after a change, and puts the last thirty days back', async () => {
      open();
      await screen.findAllByText('Hill Farm');
      expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });
      fireEvent.click(await screen.findByRole('button', { name: 'Reset' }));
      expect(screen.getByLabelText('From')).toHaveValue('2026-09-29');
      await waitFor(() => expect(api.get).toHaveBeenLastCalledWith({ from: '2026-09-29', to: '2026-10-28' }));
    });
  });

  describe('downloading', () => {
    it('downloads the PDF for the dates shown, in the language of the screen', async () => {
      open();
      await screen.findAllByText('Hill Farm');
      fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
      await waitFor(() => expect(api.download).toHaveBeenCalledWith({ from: '2026-09-29', to: '2026-10-28' }, 'pdf', 'en'));
    });

    it('downloads the CSV', async () => {
      open();
      await screen.findAllByText('Hill Farm');
      fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
      await waitFor(() => expect(api.download).toHaveBeenCalledWith({ from: '2026-09-29', to: '2026-10-28' }, 'csv', 'en'));
    });

    it('holds both buttons while a file is made', async () => {
      let finish: () => void = () => {};
      api.download.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
      open();
      await screen.findAllByText('Hill Farm');
      fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
      expect(await screen.findByRole('button', { name: 'Preparing' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
      finish();
      expect(await screen.findByRole('button', { name: 'Download PDF' })).toBeEnabled();
    });

    it('tells the person kindly when the file cannot be made', async () => {
      api.download.mockRejectedValue(new Error('x'));
      open();
      await screen.findAllByText('Hill Farm');
      fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
      expect(await screen.findByText("We couldn't create the file. Please try again.", {}, { timeout: 5000 })).toBeInTheDocument();
    });

    it('asks for French when the screen is French', async () => {
      localStorage.setItem('ssms_locale', 'fr');
      open();
      await screen.findAllByText('Hill Farm');
      fireEvent.click(screen.getByRole('button', { name: 'Télécharger le PDF' }));
      await waitFor(() => expect(api.download).toHaveBeenCalledWith({ from: '2026-09-29', to: '2026-10-28' }, 'pdf', 'fr'));
    });
  });

  describe('for an admin', () => {
    it('can choose a cooperative, and starts with all of them', async () => {
      auth.role = 'ADMIN';
      open();
      await screen.findAllByText('Hill Farm');
      const select = screen.getByLabelText('Cooperative');
      expect(select).toHaveValue('');
      expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['All cooperatives', 'Gatsibo Silk', 'Nyagatare Silk']);
      expect(api.get).toHaveBeenCalledWith({ from: '2026-09-29', to: '2026-10-28' });
    });

    it('asks again for the cooperative that is chosen, and downloads for it', async () => {
      auth.role = 'ADMIN';
      open();
      await screen.findAllByText('Hill Farm');
      await within(screen.getByLabelText('Cooperative')).findByRole('option', { name: 'Nyagatare Silk' });
      fireEvent.change(screen.getByLabelText('Cooperative'), { target: { value: 'c2' } });
      await waitFor(() => expect(api.get).toHaveBeenLastCalledWith({ from: '2026-09-29', to: '2026-10-28', cooperative: 'c2' }));
      fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
      await waitFor(() => expect(api.download).toHaveBeenCalledWith({ from: '2026-09-29', to: '2026-10-28', cooperative: 'c2' }, 'pdf', 'en'));
    });

    it('is told what the report is for', async () => {
      auth.role = 'ADMIN';
      open();
      expect(await screen.findByText('The farms of one cooperative or all of them, between the dates you choose.')).toBeInTheDocument();
    });
  });

  it('gives a supervisor no choice of cooperative', async () => {
    open();
    await screen.findAllByText('Hill Farm');
    expect(screen.queryByLabelText('Cooperative')).not.toBeInTheDocument();
    expect(api.coops).not.toHaveBeenCalled();
  });

  it('shows an error and a way to try again when the report cannot be loaded', async () => {
    api.get.mockRejectedValueOnce(new Error('x'));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the report. Please try again.");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect((await screen.findAllByText('Hill Farm')).length).toBeGreaterThan(0);
  });

  it('reads in French', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Rapport de la coopérative' })).toBeInTheDocument();
    expect(screen.getByLabelText('Du')).toBeInTheDocument();
  });
});
