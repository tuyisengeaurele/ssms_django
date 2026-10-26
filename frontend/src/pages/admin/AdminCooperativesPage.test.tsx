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

const api = vi.hoisted(() => ({
  getAll: vi.fn(), getById: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(),
  getUsers: vi.fn(), updateCooperative: vi.fn(),
}));

vi.mock('../../services/cooperative.service', () => ({
  cooperativeService: { getAll: api.getAll, getById: api.getById, create: api.create, update: api.update, delete: api.remove },
}));
vi.mock('../../services/admin.service', () => ({ adminService: { getUsers: api.getUsers, updateCooperative: api.updateCooperative } }));

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

const detail = {
  ...coop(coops[0]),
  members: [{ id: 'm1', name: 'Bruce Ishimwe', email: 'bruce@gmail.com', role: 'FARMER', createdAt: '2026-05-01T00:00:00Z' }],
  farms: [{ id: 'f1', name: "Bruce's Farm", location: 'Gatsibo', ownerId: 'm1', ownerName: 'Bruce Ishimwe' }],
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.getAll.mockResolvedValue({ data: { data: coops.map(coop) } });
  api.getById.mockResolvedValue({ data: { data: detail } });
  api.getUsers.mockResolvedValue({
    data: {
      data: [
        { id: 'm1', name: 'Bruce Ishimwe', email: 'bruce@gmail.com', role: 'FARMER' },
        { id: 'm2', name: 'Gad Anaclet', email: 'gad@ssms.com', role: 'FARMER' },
        { id: 'a1', name: 'Auris', email: 'auris@ssms.com', role: 'ADMIN' },
      ],
    },
  });
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

  it('adds up cooperatives, members and farms', async () => {
    open();
    await screen.findByText('Gatsibo Sericulture 1');
    const tile = (label: string) => screen.getAllByText(label).map((e) => e.closest('.stat-tile')).find(Boolean) as HTMLElement;
    expect(within(tile('Cooperatives')).getByText('2')).toBeInTheDocument();
    expect(within(tile('Members')).getByText('6')).toBeInTheDocument();
    expect(within(tile('Farms')).getByText('5')).toBeInTheDocument();
  });

  it('lists each cooperative with its place and counts', async () => {
    open();
    const row = await rowOf('Gatsibo Sericulture 1');
    expect(within(row).getByText('Gatsibo District, Rwanda')).toBeInTheDocument();
    expect(within(row).getByText('5')).toBeInTheDocument();
    expect(within(row).getByText('4')).toBeInTheDocument();
  });

  it('filters by name or place and says when nothing matches', async () => {
    open();
    await screen.findByText('Gatsibo Sericulture 1');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search cooperatives' }), { target: { value: 'nyama' } });
    expect(screen.queryByText('Gatsibo Sericulture 1')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search cooperatives' }), { target: { value: 'zzz' } });
    expect(screen.getByText('Nothing matches "zzz". Try a different name or place.')).toBeInTheDocument();
  });

  it('invites the first cooperative when there are none', async () => {
    api.getAll.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No cooperatives yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create a cooperative' })).toBeInTheDocument();
  });

  it('creates a cooperative and shows it first', async () => {
    api.create.mockResolvedValue({ data: { data: coop({ id: 'c3', name: 'Huye Silk', location: 'Huye', memberCount: 0, farmCount: 0 }) } });
    open();
    await screen.findByText('Gatsibo Sericulture 1');
    fireEvent.click(screen.getByRole('button', { name: 'New cooperative' }));
    const dialog = await screen.findByRole('dialog', { name: 'New cooperative' });
    fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: 'Huye Silk' } });
    fireEvent.change(within(dialog).getByLabelText('Location'), { target: { value: 'Huye' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ name: 'Huye Silk', description: '', location: 'Huye' }));
    expect(await screen.findByText('Huye Silk')).toBeInTheDocument();
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

  it('opens the edit form filled in and saves changes', async () => {
    api.update.mockResolvedValue({ data: { data: coop({ ...coops[1], name: 'Nyamagabe Silk', memberCount: 1, farmCount: 1 }) } });
    open();
    const row = await rowOf('Nyamagabe Silk Cooperative');
    fireEvent.click(within(row).getByRole('button', { name: /^Edit/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit cooperative' });
    const name = within(dialog).getByLabelText(/^Name/) as HTMLInputElement;
    expect(name.value).toBe('Nyamagabe Silk Cooperative');
    fireEvent.change(name, { target: { value: 'Nyamagabe Silk' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('c2', expect.objectContaining({ name: 'Nyamagabe Silk' })));
  });

  it('asks before turning a cooperative off', async () => {
    api.remove.mockResolvedValue({ data: { data: null } });
    open();
    const row = await rowOf('Nyamagabe Silk Cooperative');
    fireEvent.click(within(row).getByRole('button', { name: /^Turn off/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Turn off this cooperative?' });
    expect(api.remove).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, turn off' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('c2'));
    await waitFor(() => expect(screen.queryByText('Nyamagabe Silk Cooperative')).not.toBeInTheDocument());
  });

  it('shows members and farms in the detail view', async () => {
    open();
    const row = await rowOf('Gatsibo Sericulture 1');
    fireEvent.click(within(row).getByRole('button', { name: /^View/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Gatsibo Sericulture 1' });
    expect(await within(dialog).findByText('bruce@gmail.com')).toBeInTheDocument();
    expect(within(dialog).getByText("Bruce's Farm")).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Open farm' })).toHaveAttribute('href', '/farms/f1');
  });

  it('adds a member, leaving admins out of the choices', async () => {
    api.updateCooperative.mockResolvedValue({ data: { data: {} } });
    open();
    const row = await rowOf('Gatsibo Sericulture 1');
    fireEvent.click(within(row).getByRole('button', { name: /^View/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Gatsibo Sericulture 1' });
    const select = await within(dialog).findByRole('combobox', { name: 'Person to add' });
    const options = within(select).getAllByRole('option').map((o) => o.textContent);
    expect(options.join(' ')).toContain('Gad Anaclet');
    expect(options.join(' ')).not.toContain('Auris');
    expect(options.join(' ')).not.toContain('Bruce Ishimwe');
    fireEvent.change(select, { target: { value: 'm2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add' }));
    await waitFor(() => expect(api.updateCooperative).toHaveBeenCalledWith('m2', 'c1'));
  });

  it('removes a member', async () => {
    api.updateCooperative.mockResolvedValue({ data: { data: {} } });
    open();
    const row = await rowOf('Gatsibo Sericulture 1');
    fireEvent.click(within(row).getByRole('button', { name: /^View/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Gatsibo Sericulture 1' });
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Remove Bruce Ishimwe' }));
    await waitFor(() => expect(api.updateCooperative).toHaveBeenCalledWith('m1', null));
  });

  it('keeps the old purple icon tiles and gradients out', async () => {
    const { container } = open();
    await screen.findByText('Gatsibo Sericulture 1');
    expect(container.querySelector('[style*="gradient"], .stat-card, .stat-card-icon')).toBeNull();
  });
});
