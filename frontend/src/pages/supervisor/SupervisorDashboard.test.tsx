import { act, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setAccessToken } from '../../services/session';
import { setReducedMotion } from '../../test/setup';

const auth = vi.hoisted(() => ({ user: { id: 'u', role: 'ADMIN', cooperativeId: null as string | null, cooperativeName: null as string | null } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));

const api = vi.hoisted(() => ({ decisions: vi.fn(), farms: vi.fn(), risk: vi.fn(), alerts: vi.fn(), chart: vi.fn(), active: vi.fn(), recent: vi.fn(), ticketUrl: vi.fn(), events: vi.fn() }));
vi.mock('../../services/supply.service', () => ({ supplyService: { decisionCount: api.decisions } }));
vi.mock('../../services/calendar.service', () => ({ calendarService: { events: api.events } }));
vi.mock('../../services/farm.service', () => ({ farmService: { getAll: api.farms, getRisk: api.risk } }));
vi.mock('../../services/alert.service', () => ({ alertService: { getAll: api.alerts }, getAlertStreamUrl: api.ticketUrl }));
vi.mock('../../services/sensor.service', () => ({
  sensorService: { getChart: api.chart },
  batchSupervisorService: { getActive: api.active },
  detectionService2: { getRecent: api.recent },
}));

import SupervisorDashboard from './SupervisorDashboard';

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  onmessage: ((e: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeEventSource.instances.push(this);
  }
  close() {
    this.closed = true;
  }
}

const batch = (i: number, stage: string, n: number) => ({
  id: `b${i}`, farmId: `f${i}`, stage, startDate: '', expectedHarvestDate: '', isActive: true, createdAt: '',
  farm: { id: `f${i}`, name: `Farm ${i}`, location: 'Gatsibo' }, detectionCount: n,
});

function open() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <ToastProvider>
          <SupervisorDashboard />
        </ToastProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal('EventSource', FakeEventSource);
  let n = 0;
  api.ticketUrl.mockImplementation(async () => `http://x/stream?ticket=t${++n}`);
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  auth.user = { id: 'u', role: 'ADMIN', cooperativeId: null, cooperativeName: null };
  api.events.mockResolvedValue({ data: { data: { events: [], from: '', to: '', truncated: false } } });
  api.decisions.mockResolvedValue({ data: { data: { count: 1, rooms: 1, allowance: 0 } } });
  api.farms.mockResolvedValue({ data: { data: [{ id: 'f1' }, { id: 'f2' }, { id: 'f3' }] } });
  api.risk.mockResolvedValue({
    data: { data: [{ id: 'f1', name: 'Hill Farm', ownerName: 'Serge', location: 'Gatsibo', level: 'HIGH', score: 5, diseaseAlerts: 1, openAirAlerts: 0, offlineDevices: 0, activeBatches: 1 }] },
  });
  api.alerts.mockResolvedValue({
    data: { data: [
      { id: 'a1', type: 'TEMPERATURE', message: 'Temperature too low: 21 C', isRead: false, createdAt: new Date(Date.now() - 600_000).toISOString(), batchId: 'b1' },
      { id: 'a2', type: 'HUMIDITY', message: 'Humidity too high: 90%', isRead: true, createdAt: new Date(Date.now() - 7200_000).toISOString(), batchId: 'b1' },
    ] },
  });
  api.chart.mockResolvedValue({ data: { data: [{ hour: '08:00', avgTemp: 24, avgHumidity: 78 }, { hour: '09:00', avgTemp: 25, avgHumidity: 80 }] } });
  api.active.mockResolvedValue({ data: { data: [batch(1, 'LARVA', 4), batch(2, 'EGG', 0)] } });
  api.recent.mockResolvedValue({
    data: { data: [
      { id: 'd1', result: 'Healthy', confidence: 0.97, detectedAt: '2026-10-06T09:00:00Z', batchId: 'b1', farmName: 'Farm 1', farmId: 'f1' },
      { id: 'd2', result: 'Flacherie', confidence: 0.81, detectedAt: '2026-10-05T09:00:00Z', batchId: 'b2', farmName: 'Farm 2', farmId: 'f2' },
    ] },
  });
});

const tile = (label: string) => screen.getAllByText(label).map((e) => e.closest('.stat-tile')).find(Boolean) as HTMLElement;

describe('Supervisor dashboard, the layout', () => {
  it('offers a supervisor their quick actions and an admin looking at every farm the monitoring ones', async () => {
    auth.user = { id: 'u', role: 'SUPERVISOR', cooperativeId: 'c1', cooperativeName: 'Silk Coop' };
    const first = open();
    const supervisorNav = within(await screen.findByRole('navigation', { name: 'Quick actions' }));
    expect(supervisorNav.getAllByRole('link').map((l) => l.getAttribute('href'))).toContain('/decisions');
    expect(supervisorNav.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    first.unmount();
    auth.user = { id: 'u', role: 'ADMIN', cooperativeId: null, cooperativeName: null };
    open();
    const adminNav = within(await screen.findByRole('navigation', { name: 'Quick actions' }));
    expect(adminNav.getByRole('link', { name: /Alerts/ })).toHaveAttribute('href', '/alerts');
    expect(adminNav.getByRole('link', { name: 'Cooperatives' })).toHaveAttribute('href', '/admin/cooperatives');
    expect(adminNav.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
  });

  it('does not offer the same places again in the header', async () => {
    open();
    await screen.findByRole('navigation', { name: 'Quick actions' });
    expect(screen.queryByRole('link', { name: /Full reports/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /^Alerts/ })).toHaveLength(1);
  });

  it('puts the calendar in a rail beside the data and links a round for staff', async () => {
    api.events.mockResolvedValue({ data: { data: { events: [{ id: 'e1', date: new Date().toISOString().slice(0, 10), kind: 'round_deadline', expected: false, batchId: null, farmId: null, farmName: '', detail: { name: 'November round', roundId: 'r1' } }], from: '', to: '', truncated: false } } });
    const { container } = open();
    const agenda = within(await screen.findByTestId('agenda'));
    expect(await agenda.findByRole('link', { name: /November round: requests close/ })).toHaveAttribute('href', '/supply/r1');
    expect(container.querySelector('.dash-body > .dash-rail')!.contains(screen.getByRole('region', { name: 'Calendar' }))).toBe(true);
    expect(container.querySelector('.dash-body > .dash-main')!.contains(await screen.findByText('Active batches'))).toBe(true);
  });

  it('still shows the rest when the calendar cannot load', async () => {
    api.events.mockRejectedValue(new Error('down'));
    open();
    expect(await screen.findByText('We could not load the calendar.')).toBeInTheDocument();
    expect(screen.getByText('Active batches')).toBeInTheDocument();
  });
});

describe('Supervisor dashboard page', () => {
  it('has one title and says what it covers', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Farm monitoring' })).toBeInTheDocument();
    expect(await screen.findByText(/Numbers from every cooperative\./)).toBeInTheDocument();
  });

  it('is called Dashboard for a supervisor', async () => {
    auth.user.role = 'SUPERVISOR';
    auth.user.cooperativeId = 'c1';
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    auth.user.role = 'ADMIN';
    auth.user.cooperativeId = null;
    await screen.findAllByText(/./);
  });

  it('counts farms, running batches, unread alerts and disease checks', async () => {
    open();
    await screen.findByText('Total farms');
    expect(within(tile('Total farms')).getByText('3')).toBeInTheDocument();
    expect(within(tile('Active batches')).getByText('2')).toBeInTheDocument();
    expect(within(tile('Unread alerts')).getByText('1')).toBeInTheDocument();
    expect(within(tile('Disease checks')).getByText('4')).toBeInTheDocument();
  });

  it('shows the farms that need a look first, near the top', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 2, name: 'Farms that need a look first' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Hill Farm' })).toHaveAttribute('href', '/farms/f1');
    expect(api.risk).toHaveBeenCalledTimes(1);
  });

  it('keeps the rest of the page when the ranking cannot be loaded', async () => {
    api.risk.mockRejectedValue(new Error('x'));
    open();
    expect(await screen.findByText("We couldn't load the farm ranking. Please try again.")).toBeInTheDocument();
    expect(await screen.findByText('Total farms')).toBeInTheDocument();
  });

  it('describes a supervisor by their cooperative', async () => {
    auth.user = { id: 'u', role: 'SUPERVISOR', cooperativeId: 'c1', cooperativeName: 'Gatsibo 1' };
    open();
    expect(await screen.findByText(/Numbers from Gatsibo 1\./)).toBeInTheDocument();
    expect(screen.queryByText(/not part of a cooperative yet/)).not.toBeInTheDocument();
  });

  it('tells a supervisor with no cooperative what to do', async () => {
    auth.user = { id: 'u', role: 'SUPERVISOR', cooperativeId: null, cooperativeName: null };
    open();
    expect(await screen.findByText(/not part of a cooperative yet/)).toBeInTheDocument();
  });

  it('gives each reading chart a table of its numbers', async () => {
    open();
    await screen.findByText('Total farms');
    const temperature = screen.getByRole('img', { name: 'Temperature, last 24 hours' });
    expect(within(temperature).getAllByRole('row')).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'Humidity, last 24 hours' })).toBeInTheDocument();
    expect(screen.getByText('Healthy range: 22 to 28 °C')).toBeInTheDocument();
  });

  it('says when there are no sensor readings yet', async () => {
    api.chart.mockResolvedValue({ data: { data: [] } });
    open();
    expect((await screen.findAllByText('No sensor readings yet.')).length).toBe(2);
  });

  it('lists active batches with a stage and a link', async () => {
    open();
    const panel = (await screen.findByRole('heading', { name: 'Active batches (2)' })).closest('section') as HTMLElement;
    const row = within(panel).getByText('Farm 1').closest('tr') as HTMLElement;
    expect(within(row).getByText('Larva')).toBeInTheDocument();
    expect(within(row).getByText('4')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: /Open/ })).toHaveAttribute('href', '/batches/b1');
  });

  it('offers to compare batches from the active batches panel, in place of the link to the farms', async () => {
    open();
    const panel = (await screen.findByRole('heading', { name: 'Active batches (2)' })).closest('section') as HTMLElement;
    expect(within(panel).getByRole('link', { name: /Compare batches/ })).toHaveAttribute('href', '/batches/compare');
    expect(within(panel).queryByRole('link', { name: /View farms/ })).not.toBeInTheDocument();
  });

  it('lists recent alerts with plain times', async () => {
    open();
    const alerts = await screen.findByRole('list', { name: 'Recent alerts' });
    expect(within(alerts).getByText('Temperature too low: 21 C')).toBeInTheDocument();
    expect(within(alerts).getByText('10 minutes ago')).toBeInTheDocument();
    expect(within(screen.getByRole('navigation', { name: 'Quick actions' })).getByRole('link', { name: /Alerts.*1/ })).toHaveAttribute('href', '/alerts');
  });

  it('shows disease checks with a plain percentage, not a progress bar', async () => {
    const { container } = open();
    const row = (await screen.findByText('Flacherie')).closest('tr') as HTMLElement;
    expect(within(row).getByText('81%')).toBeInTheDocument();
    expect(container.querySelector('.progress-bar, .progress-fill')).toBeNull();
  });

  it('drops the model name, the gradients and the old coloured tiles', async () => {
    const { container } = open();
    await screen.findByText('Total farms');
    await waitFor(() => expect(screen.getAllByRole('row').length).toBeGreaterThan(2));
    expect(container.textContent).not.toMatch(/ResNet|Powered by/i);
    expect(container.innerHTML.toLowerCase()).not.toMatch(/gradient|#7c3aed|#2563eb|#d97706|stat-card/);
  });
});

describe('Live alerts', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('connects with a short-lived ticket and never puts the sign in token in the address', async () => {
    setAccessToken('secret-jwt');
    open();
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const url = FakeEventSource.instances[0].url;
    expect(url).toContain('ticket=t1');
    expect(url).not.toContain('secret-jwt');
    expect(url).not.toContain('token=');
  });

  it('shows an alert that arrives as a single message', async () => {
    open();
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const alert = { id: 'live1', type: 'TEMPERATURE', message: 'Temperature too high: 31 C', batchId: 'b1', isRead: false, createdAt: new Date().toISOString() };
    act(() => FakeEventSource.instances[0].onmessage?.({ data: JSON.stringify(alert) }));
    const list = await screen.findByRole('list', { name: 'Recent alerts' });
    expect(within(list).getByText('Temperature too high: 31 C')).toBeInTheDocument();
  });

  it('does not show the same alert twice', async () => {
    open();
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    const alert = { id: 'live2', type: 'HUMIDITY', message: 'Humidity too low: 55%', batchId: 'b1', isRead: false, createdAt: new Date().toISOString() };
    act(() => FakeEventSource.instances[0].onmessage?.({ data: JSON.stringify(alert) }));
    act(() => FakeEventSource.instances[0].onmessage?.({ data: JSON.stringify(alert) }));
    const list = await screen.findByRole('list', { name: 'Recent alerts' });
    expect(within(list).getAllByText('Humidity too low: 55%')).toHaveLength(1);
  });

  it('closes the stream and asks for a fresh ticket when the connection drops', async () => {
    open();
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    vi.useFakeTimers({ shouldAdvanceTime: true });
    act(() => FakeEventSource.instances[0].onerror?.());
    expect(FakeEventSource.instances[0].closed).toBe(true);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(api.ticketUrl).toHaveBeenCalledTimes(2);
    expect(FakeEventSource.instances).toHaveLength(2);
    expect(FakeEventSource.instances[1].url).toContain('ticket=t2');
  });

  it('closes the stream when the person leaves the page', async () => {
    const { unmount } = open();
    await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
    unmount();
    expect(FakeEventSource.instances[0].closed).toBe(true);
  });

  it('keeps working when no ticket can be had', async () => {
    api.ticketUrl.mockRejectedValue(new Error('offline'));
    open();
    expect(await screen.findByText('Total farms')).toBeInTheDocument();
    expect(FakeEventSource.instances).toHaveLength(0);
  });
});

describe('Supervisor dashboard, decisions', () => {
  it('says how many decisions wait, in the singular for one, and links to them', async () => {
    open();
    expect(await screen.findByRole('link', { name: '1 decision waits for you' })).toHaveAttribute('href', '/decisions');
  });
});
