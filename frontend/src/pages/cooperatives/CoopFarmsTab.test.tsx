import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setReducedMotion } from '../../test/setup';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', name: 'Someone', role: 'SUPERVISOR', cooperativeId: 'c1' }, isAuthenticated: true, isLoading: false }),
}));

const api = vi.hoisted(() => ({ get: vi.fn(), download: vi.fn() }));
vi.mock('../../services/coopReport.service', () => ({ coopReportService: { get: api.get, download: api.download } }));
vi.mock('../../services/cooperative.service', () => ({ cooperativeService: { getById: vi.fn(), getAll: vi.fn(), getDeleted: vi.fn() } }));

import { renderCoop, report } from './coopTestKit';

configure({ asyncUtilTimeout: 5000 });

const PATH = '/supervisor/cooperative/farms';

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 28, 12, 0, 0));
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.get.mockResolvedValue({ data: { data: report() } });
  api.download.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

const loaded = () => screen.findByRole('link', { name: 'Hill Farm' });
const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);

describe('The farms of a cooperative', () => {
  it('lists every farm once, riskiest first, in one table', async () => {
    renderCoop(PATH);
    await loaded();
    expect(screen.getAllByRole('table')).toHaveLength(1);
    expect(rows().map((r) => within(r).getAllByRole('link')[0].textContent)).toEqual(['Hill Farm', 'River Farm', 'Quiet Farm']);
  });

  it('has one column each for the farm, the risk, the batches, the cocoons and the alerts', async () => {
    renderCoop(PATH);
    await loaded();
    expect(within(screen.getByRole('table')).getAllByRole('columnheader').map((c) => c.textContent))
      .toEqual(['Farm', 'Risk today', 'Batches running', 'Cocoons (kg)', 'Alerts']);
  });

  it('shows the owner under the farm, and the farm opens from its name', async () => {
    renderCoop(PATH);
    await loaded();
    const hill = rows()[0];
    expect(within(hill).getByText('Owner of Hill Farm')).toBeInTheDocument();
    expect(within(hill).getByRole('link', { name: 'Hill Farm' })).toHaveAttribute('href', '/farms/f1');
  });

  it('says the risk in words, with the reasons under it', async () => {
    renderCoop(PATH);
    await loaded();
    const [hill, river, quiet] = rows();
    expect(within(hill).getByText('High')).toBeInTheDocument();
    expect(within(hill).getByText('1 disease alert in the last 14 days')).toBeInTheDocument();
    expect(within(river).getByText('Medium')).toBeInTheDocument();
    expect(within(river).getByText('2 sensors offline')).toBeInTheDocument();
    expect(within(quiet).getByText('OK')).toBeInTheDocument();
    expect(within(quiet).queryByText(/alert|offline/)).not.toBeInTheDocument();
  });

  it('shows the batches, the cocoons and the alerts of each farm', async () => {
    renderCoop(PATH);
    await loaded();
    const cells = within(rows()[0]).getAllByRole('cell').map((c) => c.textContent ?? '');
    expect(cells[2]).toBe('2');
    expect(cells[3]).toBe('20.5');
    expect(cells[4]).toBe('2');
  });

  it('says the levels are for the day of the report, not for the period', async () => {
    renderCoop(PATH);
    await loaded();
    expect(screen.getByText('The levels are as of the day the report was made, not for the period.')).toBeInTheDocument();
  });

  it('has the dates and the downloads, so what is shown can be kept', async () => {
    renderCoop(PATH);
    await loaded();
    expect(screen.getByLabelText('From')).toHaveValue('2026-09-29');
    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    await waitFor(() => expect(api.download).toHaveBeenCalledWith({ from: '2026-09-29', to: '2026-10-28' }, 'csv', 'en'));
  });

  it('says so when there are no farms', async () => {
    api.get.mockResolvedValue({ data: { data: report({ farms: [] }) } });
    renderCoop(PATH);
    expect(await screen.findByText('No farms yet.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('shows an error and a way to try again', async () => {
    api.get.mockRejectedValueOnce(new Error('x'));
    renderCoop(PATH);
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the report. Please try again.");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await loaded();
  });

  it('reads in French', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    renderCoop(PATH);
    expect(await screen.findByRole('heading', { level: 2, name: "Fermes, les plus à risque d'abord" })).toBeInTheDocument();
  });
});
