import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const auth = vi.hoisted(() => ({ user: { id: 'u', name: 'Serge Karenzi', role: 'FARMER' } as { id: string; name?: string; role: string } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));

const api = vi.hoisted(() => ({ farms: vi.fn(), active: vi.fn(), chart: vi.fn(), alerts: vi.fn(), markRead: vi.fn() }));
vi.mock('../../services/farm.service', () => ({ farmService: { getAll: api.farms } }));
vi.mock('../../services/alert.service', () => ({ alertService: { getAll: api.alerts, markRead: api.markRead } }));
vi.mock('../../services/sensor.service', () => ({
  sensorService: { getChart: api.chart },
  batchSupervisorService: { getActive: api.active },
}));

import FarmerDashboard from './FarmerDashboard';

const batch = (i: number, stage: string, farmId = `f${i}`) => ({
  id: `b${i}`, farmId, stage, startDate: '2026-05-01T00:00:00Z', expectedHarvestDate: '2026-06-01T00:00:00Z', isActive: true, createdAt: '',
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
  api.farms.mockResolvedValue({ data: { data: [{ id: 'f1', isActive: true }, { id: 'f2', isActive: true }] } });
  api.active.mockResolvedValue({ data: { data: [batch(1, 'LARVA'), batch(2, 'EGG')] } });
  api.chart.mockResolvedValue({ data: { data: [{ hour: '08:00', avgTemp: 24, avgHumidity: 78 }, { hour: '09:00', avgTemp: 25, avgHumidity: 80 }] } });
  api.alerts.mockResolvedValue({
    data: { data: [{ id: 'a1', type: 'TEMPERATURE', message: 'Temperature too low: 21 C', isRead: false, createdAt: new Date(Date.now() - 600_000).toISOString(), batchId: 'b1' }] },
  });
});

describe('Farmer dashboard', () => {
  it('greets the farmer by first name', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back, Serge' })).toBeInTheDocument();
    expect(await screen.findByText('Here is how your farms are doing today.')).toBeInTheDocument();
  });

  it('still greets someone whose name is missing', async () => {
    auth.user = { id: 'u', role: 'FARMER' };
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument();
  });

  it('counts farms, running batches and unread alerts, each with a short hint', async () => {
    open();
    await screen.findByText('Here is how your farms are doing today.');
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
    await screen.findByText('Here is how your farms are doing today.');
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
    await screen.findByText('Here is how your farms are doing today.');
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

  it('links to the reports, a new farm and the farm list', async () => {
    open();
    await screen.findByText('Here is how your farms are doing today.');
    expect(screen.getByRole('link', { name: 'Disease reports' })).toHaveAttribute('href', '/detections/reports');
    expect(screen.getByRole('link', { name: 'New farm' })).toHaveAttribute('href', '/farms/new');
    expect(screen.getByRole('link', { name: 'My farms' })).toHaveAttribute('href', '/farms');
  });

  it('drops the gradient cards, letter chips, short time forms and old colours', async () => {
    const { container } = open();
    await screen.findByText('Temperature too low: 21 C');
    expect(container.querySelector('.stat-card, .stat-card-glow')).toBeNull();
    expect(container.textContent).not.toMatch(/\d+[smh] ago/);
    expect(container.innerHTML.toLowerCase()).not.toMatch(/gradient|#d97706|#2563eb|#dc2626|#16a34a|#1e40af|#7c3aed|brand-50/);
  });
});
