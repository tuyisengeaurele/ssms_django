import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const auth = vi.hoisted(() => ({ user: { id: 'u', name: 'Serge Karenzi', role: 'FARMER' } as { id: string; name?: string; role: string } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));

const api = vi.hoisted(() => ({ onboarding: vi.fn(), events: vi.fn(), currentRound: vi.fn(), allowance: vi.fn(), farms: vi.fn(), active: vi.fn(), chart: vi.fn(), alerts: vi.fn(), markRead: vi.fn(), thresholds: vi.fn() }));
vi.mock('../../services/supply.service', () => ({ supplyService: { getAllowance: api.allowance, currentRound: api.currentRound, onboarding: api.onboarding } }));
vi.mock('../../services/calendar.service', () => ({ calendarService: { events: api.events } }));
vi.mock('../../services/farm.service', () => ({ farmService: { getAll: api.farms } }));
vi.mock('../../services/alert.service', () => ({ alertService: { getAll: api.alerts, markRead: api.markRead, getThresholds: api.thresholds } }));
vi.mock('../../services/sensor.service', () => ({
  sensorService: { getChart: api.chart },
  batchSupervisorService: { getActive: api.active },
}));

import FarmerDashboard from './FarmerDashboard';

const batch = (i: number, stage: string, farmId = `f${i}`) => ({
  id: `b${i}`, farmId, stage, startDate: '2026-05-01T00:00:00Z', expectedHarvestDate: new Date(Date.now() + 60 * 86_400_000).toISOString(), isActive: true, createdAt: '',
  farm: { id: farmId, name: `Farm ${i}`, location: 'Gatsibo' },
});

const open = () => render(
  <MemoryRouter>
    <LanguageProvider>
      <ToastProvider>
        <FarmerDashboard />
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
  auth.user = { id: 'u', name: 'Serge Karenzi', role: 'FARMER' };
  api.events.mockResolvedValue({ data: { data: { events: [], from: '', to: '', truncated: false } } });
  api.onboarding.mockResolvedValue({ data: { data: { complete: true, steps: [] } } });
  api.currentRound.mockResolvedValue({ data: { data: { round: null, myRequest: null, rooms: [] } } });
  api.allowance.mockResolvedValue({ data: { data: { boxes: 2, source: 'default', since: null, history: [], openRequest: null, capacityBoxes: null, starterBoxes: 2 } } });
  api.farms.mockResolvedValue({ data: { data: [{ id: 'f1', isActive: true }, { id: 'f2', isActive: true }] } });
  api.active.mockResolvedValue({ data: { data: [batch(1, 'LARVA'), batch(2, 'EGG')] } });
  api.thresholds.mockResolvedValue({ data: { data: [{ stage: 'LARVA', tempMin: 22, tempMax: 28, humMin: 70, humMax: 85 }] } });
  api.chart.mockResolvedValue({ data: { data: [{ hour: '08:00', avgTemp: 24, avgHumidity: 78 }, { hour: '09:00', avgTemp: 25, avgHumidity: 80 }] } });
  api.alerts.mockResolvedValue({
    data: { data: [{ id: 'a1', type: 'TEMPERATURE', message: 'Temperature too low: 21 C', isRead: false, createdAt: new Date(Date.now() - 600_000).toISOString(), batchId: 'b1' }] },
  });
});

describe('Farmer dashboard, the allowance', () => {
  it('shows the allowance card with the amount and the way to ask for another', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 2, name: 'Your allowance' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByText('2 boxes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ask for a different amount' })).toBeInTheDocument();
  });

  it('still shows the rest of the page when the allowance cannot be loaded', async () => {
    api.allowance.mockRejectedValue(new Error('down'));
    open();
    expect(await screen.findByText('Active batches')).toBeInTheDocument();
    expect(screen.queryByText('Your allowance')).not.toBeInTheDocument();
  });
});

describe('Farmer dashboard, the layout', () => {
  it('shows quick actions with the number of unread alerts, and the calendar in a rail next to the data', async () => {
    const { container } = open();
    await screen.findByText('Active batches');
    expect(within(screen.getByRole('navigation', { name: 'Quick actions' })).getByRole('link', { name: /Alerts.*1/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Calendar' })).toBeInTheDocument();
    const body = container.querySelector('.dash-body')!;
    expect(body.querySelector('.dash-main')).not.toBeNull();
    expect(body.querySelector('.dash-rail')).not.toBeNull();
    expect(body.querySelector('.dash-main')!.contains(screen.getByText('Active batches'))).toBe(true);
    expect(body.querySelector('.dash-rail')!.contains(screen.getByRole('region', { name: 'Calendar' }))).toBe(true);
  });

  it('asks the calendar for the farmer, who gets no link to a supply round', async () => {
    api.events.mockResolvedValue({ data: { data: { events: [{ id: 'e1', date: new Date().toISOString().slice(0, 10), kind: 'round_deadline', expected: false, batchId: null, farmId: null, farmName: '', detail: { name: 'November round', roundId: 'r1' } }], from: '', to: '', truncated: false } } });
    open();
    const agenda = await screen.findByTestId('agenda');
    expect(await within(agenda).findByText(/November round: requests close/)).toBeInTheDocument();
    expect(within(agenda).queryByRole('link')).not.toBeInTheDocument();
  });

  it('still shows everything else when the calendar cannot load', async () => {
    api.events.mockRejectedValue(new Error('down'));
    open();
    expect(await screen.findByText('We could not load the calendar.')).toBeInTheDocument();
    expect(screen.getByText('Active batches')).toBeInTheDocument();
    expect(screen.getByText('Temperature too low: 21 C')).toBeInTheDocument();
  });

  it('does not show the calendar to a farmer who has nothing yet, only the first steps', async () => {
    api.farms.mockResolvedValue({ data: { data: [] } });
    api.active.mockResolvedValue({ data: { data: [] } });
    api.chart.mockResolvedValue({ data: { data: [] } });
    api.alerts.mockResolvedValue({ data: { data: [] } });
    open();
    await screen.findByRole('heading', { level: 2, name: "Let's get your first batch going" });
    expect(screen.queryByRole('region', { name: 'Calendar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Quick actions' })).not.toBeInTheDocument();
  });
});

describe('Farmer dashboard, getting started', () => {
  const steps = [
    { key: 'cooperative', state: 'done', detail: {} },
    { key: 'farm', state: 'todo', detail: {} },
    { key: 'room', state: 'todo', detail: {} },
    { key: 'eggs', state: 'no_round', detail: {} },
  ];

  it('shows the getting started list to a farmer who is not past every step', async () => {
    api.onboarding.mockResolvedValue({ data: { data: { complete: false, steps } } });
    open();
    expect(await screen.findByRole('heading', { level: 2, name: 'Getting started' }, { timeout: 5000 })).toBeInTheDocument();
  });

  it('shows the list on the first-run page too, where a new farmer needs it most', async () => {
    api.onboarding.mockResolvedValue({ data: { data: { complete: false, steps } } });
    api.farms.mockResolvedValue({ data: { data: [] } });
    api.active.mockResolvedValue({ data: { data: [] } });
    api.chart.mockResolvedValue({ data: { data: [] } });
    api.alerts.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByRole('heading', { level: 2, name: 'Getting started' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: "Let's get your first batch going" })).toBeInTheDocument();
  });

  it('leaves the list out once the farmer is past every step', async () => {
    open();
    await screen.findByText('Active batches');
    expect(screen.queryByText('Getting started')).not.toBeInTheDocument();
  });
});

describe('Farmer dashboard, first run', () => {
  const firstRun = () => {
    api.farms.mockResolvedValue({ data: { data: [] } });
    api.active.mockResolvedValue({ data: { data: [] } });
    api.chart.mockResolvedValue({ data: { data: [] } });
    api.alerts.mockResolvedValue({ data: { data: [] } });
  };

  it('welcomes a farmer with no farm and offers the first step, instead of a page of zeros', async () => {
    firstRun();
    open();
    expect(await screen.findByRole('heading', { level: 2, name: "Let's get your first batch going" })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add your farm' })).toHaveAttribute('href', '/farms/new');
    expect(screen.queryByText('Active batches')).not.toBeInTheDocument();
    expect(screen.queryByText('Unread alerts')).not.toBeInTheDocument();
    expect(screen.queryByText('No sensor readings yet.')).not.toBeInTheDocument();
    expect(screen.queryByText('No active batches')).not.toBeInTheDocument();
  });

  it('lists the steps in order, with the farm first', async () => {
    firstRun();
    open();
    const steps = await screen.findByRole('list', { name: 'First steps' });
    expect(within(steps).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      expect.stringMatching(/^Add your farm/),
      expect.stringMatching(/^Start a batch/),
      expect.stringMatching(/^Follow it day by day/),
    ]);
  });

  it('keeps the greeting and drops the header buttons that have nothing to open yet', async () => {
    firstRun();
    open();
    await screen.findByRole('heading', { level: 2, name: "Let's get your first batch going" });
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back, Serge' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Disease reports' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'My farms' })).not.toBeInTheDocument();
  });

  it.each(['farms', 'active'])('does not welcome an existing farmer as new when the %s request fails', async (which) => {
    firstRun();
    api[which as 'farms'].mockRejectedValue(new Error('x'));
    open();
    expect(await screen.findByText('Active batches')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: "Let's get your first batch going" })).not.toBeInTheDocument();
  });

  it('shows the normal page as soon as there is a farm', async () => {
    firstRun();
    api.farms.mockResolvedValue({ data: { data: [{ id: 'f1', isActive: true }] } });
    open();
    expect(await screen.findByText('Active batches')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2, name: "Let's get your first batch going" })).not.toBeInTheDocument();
  });

  it('leaves out the empty reading charts while the farm has no batch', async () => {
    api.farms.mockResolvedValue({ data: { data: [{ id: 'f1', isActive: true }] } });
    api.active.mockResolvedValue({ data: { data: [] } });
    api.chart.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No active batches')).toBeInTheDocument();
    expect(screen.queryByText('No sensor readings yet.')).not.toBeInTheDocument();
  });
});

describe('Farmer dashboard', () => {
  it('says what needs attention today, from the latest reading and the harvest date', async () => {
    api.active.mockResolvedValue({
      data: { data: [{ ...batch(1, 'LARVA'), latestReading: { temperature: 20.5, humidity: 78, timestamp: new Date().toISOString() } }, batch(2, 'EGG')] },
    });
    open();
    const link = await screen.findByRole('link', { name: 'Farm 1: temperature is 20.5 °C, below the safe 22 to 28 °C.' });
    expect(link).toHaveAttribute('href', '/batches/b1');
  });

  it('says everything is in order when the batches are fine', async () => {
    open();
    expect(await screen.findByText('Everything is in order today.')).toBeInTheDocument();
  });

  it('shows no card when there are no batches at all', async () => {
    api.active.mockResolvedValue({ data: { data: [] } });
    open();
    await screen.findByText('No active batches');
    expect(screen.queryByRole('heading', { name: 'Needs attention today' })).not.toBeInTheDocument();
  });

  it('still loads when the safe ranges cannot be fetched', async () => {
    api.thresholds.mockRejectedValue(new Error('nope'));
    open();
    expect(await screen.findByText('Everything is in order today.')).toBeInTheDocument();
  });

  it('greets the farmer by first name', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back, Serge' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /New farm/ })).toBeInTheDocument();
    expect(screen.queryByText('Here is how your farms are doing today.')).not.toBeInTheDocument();
  });

  it('still greets someone whose name is missing', async () => {
    auth.user = { id: 'u', role: 'FARMER' };
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument();
  });

  it('counts farms, running batches and unread alerts, each with a short hint', async () => {
    open();
    await screen.findByRole('link', { name: /New farm/ });
    expect(tile('Active batches')).toHaveTextContent('2');
    expect(tile('Active batches')).toHaveTextContent('Across 2 farms');
    expect(tile('Unread alerts')).toHaveTextContent('1');
    expect(tile('Unread alerts')).toHaveTextContent('Needs attention');
    expect(tile('My farms')).toHaveTextContent('2 active');
  });

  it('says "1 farm" in the singular, and invites a first farm when there is none', async () => {
    api.farms.mockResolvedValue({ data: { data: [] } });
    api.active.mockResolvedValue({ data: { data: [batch(1, 'EGG')] } });
    open();
    await screen.findByRole('link', { name: /New farm/ });
    expect(tile('My farms')).toHaveTextContent('Create your first farm');
    expect(tile('Active batches')).toHaveTextContent('Across 1 farm');
  });

  it('gives each reading chart a table of its numbers and the healthy range', async () => {
    open();
    const temperature = await screen.findByRole('img', { name: 'Temperature, last 24 hours' });
    expect(within(temperature).getAllByRole('row')).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'Humidity, last 24 hours' })).toBeInTheDocument();
    expect(screen.getByText('Healthy range: 22 to 28 °C')).toBeInTheDocument();
  });

  it('says when there are no readings yet', async () => {
    api.chart.mockResolvedValue({ data: { data: [] } });
    open();
    expect((await screen.findAllByText('No sensor readings yet.')).length).toBe(2);
  });

  it('keeps the rest of the page when one request fails', async () => {
    api.chart.mockRejectedValue(new Error('x'));
    open();
    await screen.findByRole('link', { name: /New farm/ });
    expect(tile('Active batches')).toHaveTextContent('2');
    expect(screen.getAllByText('No sensor readings yet.').length).toBe(2);
  });

  it('lists active batches with a stage and two ways in', async () => {
    open();
    const panel = (await screen.findByRole('heading', { name: 'Active batches (2)' })).closest('section') as HTMLElement;
    const row = within(panel).getByText('Farm 1').closest('tr') as HTMLElement;
    expect(within(row).getByText('Larva')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: /^Details/ })).toHaveAttribute('href', '/batches/b1');
    expect(within(row).getByRole('link', { name: /^Check for disease/ })).toHaveAttribute('href', '/batches/b1/detect');
  });

  it('points to the farms when no batch is running', async () => {
    api.active.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No active batches')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Go to your farms' })[0]).toHaveAttribute('href', '/farms');
  });

  it('lists alerts with plain times, and marks one read on request', async () => {
    api.markRead.mockResolvedValue({ data: { data: {} } });
    open();
    const alerts = await screen.findByRole('list', { name: 'Recent alerts' });
    expect(within(alerts).getByText('Temperature too low: 21 C')).toBeInTheDocument();
    expect(within(alerts).getByText('10 minutes ago')).toBeInTheDocument();
    fireEvent.click(within(alerts).getByRole('button', { name: 'Mark as read' }));
    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith('a1'));
    await waitFor(() => expect(within(tile('Unread alerts')).getByText('0')).toBeInTheDocument());
    expect(within(alerts).queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument();
  });

  it('is calm when no alert is waiting', async () => {
    api.alerts.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No unread alerts')).toBeInTheDocument();
    expect(tile('Unread alerts')).toHaveTextContent('All clear');
  });

  it('keeps the one action that makes something new in the header, and the places in the quick actions', async () => {
    open();
    await screen.findByRole('link', { name: /New farm/ });
    expect(screen.getByRole('link', { name: 'New farm' })).toHaveAttribute('href', '/farms/new');
    const quick = within(screen.getByRole('navigation', { name: 'Quick actions' }));
    expect(quick.getByRole('link', { name: 'Disease checks' })).toHaveAttribute('href', '/detections/reports');
    expect(quick.getByRole('link', { name: 'Farms' })).toHaveAttribute('href', '/farms');
    // Nothing is offered twice: the places moved out of the header.
    expect(screen.queryByRole('link', { name: 'My farms' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Disease reports' })).not.toBeInTheDocument();
  });

  it('drops the gradient cards, letter chips, short time forms and old colours', async () => {
    const { container } = open();
    await screen.findByText('Temperature too low: 21 C');
    expect(container.querySelector('.stat-card, .stat-card-glow')).toBeNull();
    expect(container.textContent).not.toMatch(/\d+[smh] ago/);
    expect(container.innerHTML.toLowerCase()).not.toMatch(/gradient|#d97706|#2563eb|#dc2626|#16a34a|#1e40af|#7c3aed|brand-50/);
  });
});
