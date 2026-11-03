import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setReducedMotion } from '../../test/setup';

const auth = vi.hoisted(() => ({ role: 'SUPERVISOR' }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', name: 'Someone', role: auth.role, cooperativeId: 'c1' }, isAuthenticated: true, isLoading: false }),
}));

const api = vi.hoisted(() => ({ get: vi.fn(), download: vi.fn(), getById: vi.fn(), getAll: vi.fn() }));
vi.mock('../../services/coopReport.service', () => ({ coopReportService: { get: api.get, download: api.download } }));
vi.mock('../../services/cooperative.service', () => ({ cooperativeService: { getById: api.getById, getAll: api.getAll, getDeleted: vi.fn() } }));

import { detail, renderCoop, report } from './coopTestKit';

configure({ asyncUtilTimeout: 5000 });

const PATH = '/supervisor/cooperative';
const RANGE = { from: '2026-09-29', to: '2026-10-28' };

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
  api.getById.mockResolvedValue({ data: { data: detail() } });
  api.getAll.mockResolvedValue({ data: { data: [] } });
});

afterEach(() => {
  vi.useRealTimers();
});

const loaded = () => screen.findByText('3 records, 24.5 kg of cocoons, 900 g of silk.');
const section = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('section') as HTMLElement;

describe('The report of a cooperative', () => {
  it('opens on the last thirty days', async () => {
    renderCoop(PATH);
    await loaded();
    expect(api.get).toHaveBeenCalledWith(RANGE);
    expect(screen.getByLabelText('From')).toHaveValue('2026-09-29');
    expect(screen.getByLabelText('To')).toHaveValue('2026-10-28');
  });

  it('counts farms, farmers and batches', async () => {
    renderCoop(PATH);
    await loaded();
    const tile = (label: string) => screen.getAllByText(label).map((e) => e.closest('.stat-tile')).find(Boolean) as HTMLElement;
    expect(within(tile('Farms')).getByText('3')).toBeInTheDocument();
    expect(within(tile('Farmers with a farm')).getByText('2')).toBeInTheDocument();
    expect(within(tile('Batches running now')).getByText('6')).toBeInTheDocument();
    expect(within(tile('Batches started in the period')).getByText('4')).toBeInTheDocument();
  });

  it('sums the harvest with its grades', async () => {
    renderCoop(PATH);
    await loaded();
    const harvest = within(section('Harvest in the period'));
    expect(harvest.getByText('3 records, 24.5 kg of cocoons, 900 g of silk.')).toBeInTheDocument();
    expect(harvest.getByText('Grade A: 2, Grade B: 1, Grade C: 0')).toBeInTheDocument();
  });

  it('says so when there was no harvest, no check and no alert', async () => {
    api.get.mockResolvedValue({ data: { data: report({
      harvest: { records: 0, totalKg: 0, silkG: 0, byGrade: [] }, checks: { total: 0, found: 0, byResult: [] }, alerts: { total: 0, acknowledged: 0, resolved: 0, byType: [] },
    }) } });
    renderCoop(PATH);
    expect(await screen.findByText('No harvest recorded in the period.')).toBeInTheDocument();
    expect(screen.getByText('No disease checks in the period.')).toBeInTheDocument();
    expect(screen.getByText('No alerts in the period.')).toBeInTheDocument();
  });

  it('lists the disease checks and the alerts by their kind, in words', async () => {
    renderCoop(PATH);
    await loaded();
    const checks = within(section('Disease checks in the period'));
    expect(checks.getByText('3 checks, 1 found a disease.')).toBeInTheDocument();
    expect(checks.getByText('Pebrine')).toBeInTheDocument();
    const alerts = within(section('Alerts in the period'));
    expect(alerts.getByText('3 alerts, 1 acknowledged, 1 resolved.')).toBeInTheDocument();
    expect(alerts.getByText('Disease')).toBeInTheDocument();
    expect(alerts.getByText('Temperature')).toBeInTheDocument();
  });

  it('does not list the farms here, because the Farms section has them', async () => {
    renderCoop(PATH);
    await loaded();
    expect(screen.queryByText('Hill Farm')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Farms by risk today' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: 'Each farm in the period' })).not.toBeInTheDocument();
  });

  it('has no choice of cooperative, because the cooperative is the page that is open', async () => {
    auth.role = 'ADMIN';
    renderCoop('/admin/cooperatives/c1');
    await loaded();
    expect(screen.queryByLabelText('Cooperative')).not.toBeInTheDocument();
  });

  it('shows an error and a way to try again when the report cannot be loaded', async () => {
    api.get.mockRejectedValueOnce(new Error('x'));
    renderCoop(PATH);
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the report. Please try again.");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await loaded();
  });

  describe('choosing the dates', () => {
    it('asks again when a date changes', async () => {
      renderCoop(PATH);
      await loaded();
      fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });
      await waitFor(() => expect(api.get).toHaveBeenLastCalledWith({ from: '2026-10-01', to: '2026-10-28' }));
    });

    it('says kindly, and asks nothing, when the end is before the start', async () => {
      renderCoop(PATH);
      await loaded();
      api.get.mockClear();
      fireEvent.change(screen.getByLabelText('To'), { target: { value: '2026-09-01' } });
      expect(await screen.findByText('The end date cannot be before the start date.')).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 450));
      expect(api.get).not.toHaveBeenCalled();
      expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
    });

    it('says kindly, and asks nothing, when the period is longer than a year', async () => {
      renderCoop(PATH);
      await loaded();
      api.get.mockClear();
      fireEvent.change(screen.getByLabelText('From'), { target: { value: '2025-01-01' } });
      expect(await screen.findByText('A report can cover up to one year.')).toBeInTheDocument();
      await new Promise((resolve) => setTimeout(resolve, 450));
      expect(api.get).not.toHaveBeenCalled();
    });

    it('asks for both dates when one is cleared', async () => {
      renderCoop(PATH);
      await loaded();
      fireEvent.change(screen.getByLabelText('From'), { target: { value: '' } });
      expect(await screen.findByText('Please choose a start date and an end date.')).toBeInTheDocument();
    });

    it('offers Reset only after a change, and puts the last thirty days back', async () => {
      renderCoop(PATH);
      await loaded();
      expect(screen.queryByRole('button', { name: 'Reset' })).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });
      fireEvent.click(await screen.findByRole('button', { name: 'Reset' }));
      expect(screen.getByLabelText('From')).toHaveValue('2026-09-29');
      await waitFor(() => expect(api.get).toHaveBeenLastCalledWith(RANGE));
    });

    it('keeps the dates when the person moves to the Farms section and back', async () => {
      renderCoop(PATH);
      await loaded();
      fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-10-01' } });
      await waitFor(() => expect(api.get).toHaveBeenLastCalledWith({ from: '2026-10-01', to: '2026-10-28' }));
      fireEvent.click(screen.getByRole('link', { name: 'Farms' }));
      await screen.findByRole('heading', { level: 2, name: 'Farms, riskiest first' });
      expect(screen.getByLabelText('From')).toHaveValue('2026-10-01');
    });
  });

  describe('downloading', () => {
    it('downloads the PDF for the dates shown, in the language of the screen', async () => {
      renderCoop(PATH);
      await loaded();
      fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
      await waitFor(() => expect(api.download).toHaveBeenCalledWith(RANGE, 'pdf', 'en'));
    });

    it('downloads the CSV', async () => {
      renderCoop(PATH);
      await loaded();
      fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
      await waitFor(() => expect(api.download).toHaveBeenCalledWith(RANGE, 'csv', 'en'));
    });

    it('downloads for the cooperative that is open, for an admin', async () => {
      auth.role = 'ADMIN';
      renderCoop('/admin/cooperatives/c1');
      await loaded();
      fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
      await waitFor(() => expect(api.download).toHaveBeenCalledWith({ ...RANGE, cooperative: 'c1' }, 'pdf', 'en'));
    });

    it('downloads for all the cooperatives together, for an admin', async () => {
      auth.role = 'ADMIN';
      renderCoop('/admin/cooperatives/all');
      await loaded();
      fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
      await waitFor(() => expect(api.download).toHaveBeenCalledWith(RANGE, 'csv', 'en'));
    });

    it('holds both buttons while a file is made', async () => {
      let finish: () => void = () => {};
      api.download.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
      renderCoop(PATH);
      await loaded();
      fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
      expect(await screen.findByRole('button', { name: 'Preparing' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
      finish();
      expect(await screen.findByRole('button', { name: 'Download PDF' })).toBeEnabled();
    });

    it('tells the person kindly when the file cannot be made', async () => {
      api.download.mockRejectedValue(new Error('x'));
      renderCoop(PATH);
      await loaded();
      fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
      expect(await screen.findByText("We couldn't create the file. Please try again.", {}, { timeout: 5000 })).toBeInTheDocument();
    });

    it('asks for French when the screen is French', async () => {
      localStorage.setItem('ssms_locale', 'fr');
      renderCoop(PATH);
      await waitFor(() => expect(screen.getByRole('button', { name: 'Télécharger le PDF' })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: 'Télécharger le PDF' }));
      await waitFor(() => expect(api.download).toHaveBeenCalledWith(RANGE, 'pdf', 'fr'));
    });
  });

  it('reads in French', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    renderCoop(PATH);
    expect(await screen.findByLabelText('Du')).toBeInTheDocument();
  });
});
