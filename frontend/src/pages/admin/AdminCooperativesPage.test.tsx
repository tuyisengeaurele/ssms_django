import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const coop = (o: object) => ({
  description: '', location: '', isActive: true, createdAt: '2026-05-08T10:00:00Z', updatedAt: '2026-05-08T10:00:00Z', ...o,
});
const coops = vi.hoisted(() => [
  { id: 'c1', name: 'Gatsibo Sericulture 1', location: 'Gatsibo District, Rwanda', description: 'The first silk cooperative.', memberCount: 5, farmCount: 4 },
  { id: 'c2', name: 'Nyamagabe Silk Cooperative', location: 'Nyamagabe', description: '', memberCount: 1, farmCount: 1 },
]);

const api = vi.hoisted(() => ({ getAll: vi.fn(), getDeleted: vi.fn(), create: vi.fn(), restore: vi.fn() }));
vi.mock('../../services/cooperative.service', () => ({
  cooperativeService: { getAll: api.getAll, getDeleted: api.getDeleted, create: api.create, restore: api.restore },
}));

import AdminCooperativesPage from './AdminCooperativesPage';

function open() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <ToastProvider>
          <AdminCooperativesPage />
        </ToastProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.getAll.mockResolvedValue({ data: { data: coops.map(coop) } });
  api.getDeleted.mockResolvedValue({ data: { data: [coop({ id: 'c3', name: 'Old Silk Group', location: 'Huye', memberCount: 0, farmCount: 0, isActive: false })] } });
});

const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr') as HTMLElement;

describe('Cooperatives page', () => {
  it('has one title, a subtitle and a new cooperative button', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Cooperatives' })).toBeInTheDocument();
    expect(screen.getByText('Group farmers and supervisors, and see who belongs where.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New cooperative' })).toBeInTheDocument();
    await screen.findByText('Gatsibo Sericulture 1');
  });

  it('lists each cooperative with its place and counts, and opens it from its name', async () => {
    open();
    const row = await rowOf('Gatsibo Sericulture 1');
    expect(within(row).getByText('Gatsibo District, Rwanda')).toBeInTheDocument();
    expect(within(row).getByText('5')).toBeInTheDocument();
    expect(within(row).getByText('4')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Gatsibo Sericulture 1' })).toHaveAttribute('href', '/admin/cooperatives/c1');
    expect(within(row).getByRole('link', { name: 'View Gatsibo Sericulture 1' })).toHaveAttribute('href', '/admin/cooperatives/c1');
  });

  it('has a first row for all the cooperatives together, with their totals', async () => {
    open();
    const row = await rowOf('Every cooperative together').then((el) => el);
    expect(within(row).getByRole('link', { name: 'All cooperatives' })).toHaveAttribute('href', '/admin/cooperatives/all');
    expect(within(row).getByText('6')).toBeInTheDocument();
    expect(within(row).getByText('5')).toBeInTheDocument();
    const body = within(screen.getAllByRole('table')[0]).getAllByRole('row').slice(1);
    expect(body[0]).toBe(row);
  });

  it('gives no tiles of its own, because the dashboard has the totals', async () => {
    const { container } = open();
    await screen.findByText('Gatsibo Sericulture 1');
    expect(container.querySelector('.stat-tile')).toBeNull();
  });

  it('has no edit or delete in its rows, because those are on the cooperative page', async () => {
    open();
    const row = await rowOf('Gatsibo Sericulture 1');
    expect(within(row).queryByRole('button', { name: /Edit|Delete/ })).not.toBeInTheDocument();
  });

  it('filters by name or place, hides the all row, and says when nothing matches', async () => {
    open();
    await screen.findByText('Gatsibo Sericulture 1');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search cooperatives' }), { target: { value: 'nyama' } });
    expect(screen.queryByText('Gatsibo Sericulture 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Every cooperative together')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search cooperatives' }), { target: { value: 'zzz' } });
    expect(screen.getByText('Nothing matches "zzz". Try a different name or place.')).toBeInTheDocument();
  });

  it('invites the first cooperative when there are none, with no all row', async () => {
    api.getAll.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No cooperatives yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a cooperative' })).toBeInTheDocument();
    expect(screen.queryByText('Every cooperative together')).not.toBeInTheDocument();
  });

  it('creates a cooperative and shows it first among the cooperatives', async () => {
    api.create.mockResolvedValue({ data: { data: coop({ id: 'c4', name: 'Huye Silk', location: 'Huye', memberCount: 0, farmCount: 0 }) } });
    open();
    await screen.findByText('Gatsibo Sericulture 1');
    fireEvent.click(screen.getByRole('button', { name: 'New cooperative' }));
    const dialog = await screen.findByRole('dialog', { name: 'New cooperative' });
    fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: 'Huye Silk' } });
    fireEvent.change(within(dialog).getByLabelText('Location'), { target: { value: 'Huye' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ name: 'Huye Silk', description: '', location: 'Huye' }));
    expect(await screen.findByText('Huye Silk')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('needs a name before it creates', async () => {
    open();
    await screen.findByText('Gatsibo Sericulture 1');
    fireEvent.click(screen.getByRole('button', { name: 'New cooperative' }));
    const dialog = await screen.findByRole('dialog', { name: 'New cooperative' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Please enter a name for the cooperative.');
    expect(api.create).not.toHaveBeenCalled();
  });

  it('keeps deleted cooperatives under their own tab, with only a Restore button', async () => {
    open();
    await screen.findByText('Gatsibo Sericulture 1');
    expect(screen.queryByText('Old Silk Group')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Deleted/ }));
    const row = await rowOf('Old Silk Group');
    expect(within(row).getByRole('button', { name: 'Restore Old Silk Group' })).toBeInTheDocument();
    expect(within(row).queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('Gatsibo Sericulture 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Every cooperative together')).not.toBeInTheDocument();
  });

  it('asks before restoring, then moves the cooperative back to the Active tab', async () => {
    api.restore.mockResolvedValue({ data: { data: coop({ id: 'c3', name: 'Old Silk Group', location: 'Huye', memberCount: 0, farmCount: 0 }) } });
    open();
    await screen.findByText('Gatsibo Sericulture 1');
    fireEvent.click(screen.getByRole('tab', { name: /Deleted/ }));
    const row = await rowOf('Old Silk Group');
    fireEvent.click(within(row).getByRole('button', { name: 'Restore Old Silk Group' }));
    const dialog = await screen.findByRole('dialog', { name: 'Restore this cooperative?' });
    expect(api.restore).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, restore' }));
    await waitFor(() => expect(api.restore).toHaveBeenCalledWith('c3'));
    await waitFor(() => expect(screen.queryByText('Old Silk Group')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /Active/ }));
    expect(await screen.findByText('Old Silk Group')).toBeInTheDocument();
  });

  it('says so when no cooperative has been deleted', async () => {
    api.getDeleted.mockResolvedValue({ data: { data: [] } });
    open();
    await screen.findByText('Gatsibo Sericulture 1');
    fireEvent.click(screen.getByRole('tab', { name: /Deleted/ }));
    expect(await screen.findByText('No cooperatives have been deleted')).toBeInTheDocument();
  });

  it('does not use the words turn off anywhere, and keeps the old gradients out', async () => {
    const { container } = open();
    await screen.findByText('Gatsibo Sericulture 1');
    expect(screen.queryByText(/turn off|turned off/i)).not.toBeInTheDocument();
    expect(container.querySelector('[style*="gradient"], .stat-card, .stat-card-icon')).toBeNull();
  });
});
