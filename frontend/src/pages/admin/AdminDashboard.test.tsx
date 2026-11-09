import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';

const farms = vi.hoisted(() => [
  { id: 'f1', name: "Eden's Farm", ownerId: 'u1', owner: { name: 'Eden B' }, location: 'Gatsibo, Rwanda', counts: { batches: 1 } },
  { id: 'f2', name: "Serge's farm", ownerId: 'u2', owner: { name: 'Mugisha Serge' }, location: 'Gatsibo', counts: { batches: 5 } },
  { id: 'f3', name: "Serge's 2nd farm", ownerId: 'u2', owner: { name: 'Mugisha Serge' }, location: 'Gatsibo', counts: { batches: 2 } },
]);

const getFarms = vi.hoisted(() => vi.fn());
const getAlerts = vi.hoisted(() => vi.fn());
const getDecisions = vi.hoisted(() => vi.fn());
const getEvents = vi.hoisted(() => vi.fn());
vi.mock('../../services/supply.service', () => ({ supplyService: { decisionCount: getDecisions } }));
vi.mock('../../services/calendar.service', () => ({ calendarService: { events: getEvents } }));
vi.mock('../../services/farm.service', () => ({ farmService: { getAll: getFarms } }));
vi.mock('../../services/alert.service', () => ({ alertService: { getAll: getAlerts } }));

import AdminDashboard from './AdminDashboard';

function open() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <AdminDashboard />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  setReducedMotion(true);
  getFarms.mockResolvedValue({ data: { data: farms } });
  getAlerts.mockResolvedValue({ data: { data: [{ id: 'a1' }, { id: 'a2' }, { id: 'a3' }] } });
  getEvents.mockResolvedValue({ data: { data: { events: [], from: '', to: '', truncated: false } } });
  getDecisions.mockResolvedValue({ data: { data: { count: 2, rooms: 1, allowance: 1 } } });
});

describe('Admin dashboard, decisions', () => {
  it('says how many decisions wait and links to them', async () => {
    open();
    expect(await screen.findByRole('link', { name: '2 decisions wait for you' })).toHaveAttribute('href', '/decisions');
  });

  it('shows no card when nothing waits', async () => {
    getDecisions.mockResolvedValue({ data: { data: { count: 0, rooms: 0, allowance: 0 } } });
    open();
    await waitFor(() => expect(getDecisions).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /decisions? waits? for you/ })).not.toBeInTheDocument();
  });
});

describe('Admin dashboard', () => {
  it('has one title and offers each place once, as a quick action', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Admin Dashboard' })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Users' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Farm monitoring' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/admin/users');
    expect(screen.getByRole('link', { name: 'Farm monitoring' })).toHaveAttribute('href', '/supervisor');
    await waitFor(() => expect(getFarms).toHaveBeenCalled());
  });

  it('counts farms, batches, farmers and unread alerts from real data', async () => {
    open();
    expect(await screen.findByText('Total farms')).toBeInTheDocument();
    const tile = (label: string) => screen.getByText(label).closest('.stat-tile') as HTMLElement;
    expect(within(tile('Total farms')).getByText('3')).toBeInTheDocument();
    expect(within(tile('Total batches')).getByText('8')).toBeInTheDocument();
    expect(within(tile('Unique farmers')).getByText('2')).toBeInTheDocument();
    expect(within(tile('Unread alerts')).getByText('3')).toBeInTheDocument();
  });

  it('no longer claims a system status it does not measure', async () => {
    open();
    await screen.findByText('Total farms');
    expect(screen.queryByText('Online')).not.toBeInTheDocument();
    expect(screen.queryByText(/All services healthy/)).not.toBeInTheDocument();
  });

  it('lists the farms with their owner, place and batches', async () => {
    open();
    const row = (await screen.findByRole('link', { name: "Serge's farm" })).closest('tr') as HTMLElement;
    expect(within(row).getByText('Mugisha Serge')).toBeInTheDocument();
    expect(within(row).getByText('5')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Serge's farm" })).toHaveAttribute('href', '/farms/f2');
  });

  it('offers quick actions as a list of links, with the unread alerts counted', async () => {
    open();
    await screen.findByText('Total farms');
    const nav = screen.getByRole('navigation', { name: 'Quick actions' });
    const links = within(nav).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/admin/users', '/admin/cooperatives', '/admin/contacts', '/admin/system', '/alerts', '/admin/system/logs', '/detections/reports', '/supervisor']);
    expect(await within(nav).findByRole('link', { name: /Alerts.*3/ })).toBeInTheDocument();
  });

  it('puts the calendar in a rail beside the numbers and the farm list', async () => {
    const { container } = open();
    await screen.findByText('Total farms');
    expect(container.querySelector('.dash-main')!.contains(screen.getByText('Total farms'))).toBe(true);
    expect(container.querySelector('.dash-rail')!.contains(screen.getByRole('region', { name: 'Calendar' }))).toBe(true);
  });

  it('still shows the numbers and the farms when the calendar cannot load', async () => {
    getEvents.mockRejectedValue(new Error('down'));
    open();
    expect(await screen.findByText('We could not load the calendar.')).toBeInTheDocument();
    expect(screen.getByText('Total farms')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: "Serge's farm" })).toBeInTheDocument();
  });

  it('says so, kindly, when there are no farms', async () => {
    getFarms.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No farms yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a farm' })).toHaveAttribute('href', '/farms/new');
  });

  it('keeps the old pastel icon tiles and gradient bars out', async () => {
    const { container } = open();
    await screen.findByText('Total farms');
    expect(container.querySelector('.stat-card, .stat-card-icon, [style*="linear-gradient"]')).toBeNull();
  });

  it('shows a calm message when the farms cannot be loaded', async () => {
    getFarms.mockRejectedValue(new Error('x'));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the farms. Please try again.");
  });
});
