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
});

describe('Admin dashboard', () => {
  it('has one title, a subtitle and two main actions', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Admin Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('href', '/admin/users');
    expect(screen.getByRole('link', { name: 'System overview' })).toHaveAttribute('href', '/supervisor');
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

  it('offers quick actions as a list of links', async () => {
    open();
    await screen.findByText('Total farms');
    const list = screen.getByRole('list', { name: 'Quick actions' });
    const links = within(list).getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(links).toEqual(['/admin/users', '/detections/reports', '/supervisor', '/farms/new', '/alerts', '/admin/audit-log']);
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
