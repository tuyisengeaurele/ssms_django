import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const base = { cooperativeId: null, cooperativeName: null, isEmailVerified: true, createdAt: '2026-05-01T10:00:00Z', updatedAt: '2026-05-01T10:00:00Z' };
const people = vi.hoisted(() => [
  { id: 'me', name: 'Auris Tuyisenge', email: 'auris@ssms.com', role: 'ADMIN', isActive: true },
  { id: 's1', name: 'Coop Supervisor', email: 'supervisor@ssms.com', role: 'SUPERVISOR', isActive: true, cooperativeId: 'c1', cooperativeName: 'Gatsibo 1' },
  { id: 'f1', name: 'Bruce Ishimwe', email: 'bruce@gmail.com', role: 'FARMER', isActive: true },
  { id: 'f2', name: 'Gad Anaclet', email: 'gad@ssms.com', role: 'FARMER', isActive: false },
]);

const api = vi.hoisted(() => ({
  getUsers: vi.fn(),
  createUser: vi.fn(),
  updateRole: vi.fn(),
  updateCooperative: vi.fn(),
  deactivateUser: vi.fn(),
  getCoops: vi.fn(),
}));

vi.mock('../../services/admin.service', () => ({ adminService: api }));
vi.mock('../../services/cooperative.service', () => ({ cooperativeService: { getAll: api.getCoops } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', role: 'ADMIN' } }) }));

import AdminUsersPage from './AdminUsersPage';

const withBase = (u: object) => ({ ...base, ...u });

function open() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <ToastProvider>
          <AdminUsersPage />
        </ToastProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

// The toast list loads on the first toast. Load it once up front so a busy machine cannot make a test time out.
beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.getUsers.mockResolvedValue({ data: { data: people.map(withBase) } });
  api.getCoops.mockResolvedValue({ data: { data: [{ id: 'c1', name: 'Gatsibo 1' }, { id: 'c2', name: 'Nyamagabe' }] } });
});

const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr') as HTMLElement;

describe('Users page', () => {
  it('has one title, a subtitle and a create button', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Users' })).toBeInTheDocument();
    expect(screen.getByText('Create accounts, assign roles and manage access.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create user' })).toBeInTheDocument();
    await screen.findByText('Bruce Ishimwe');
  });

  it('counts people by role', async () => {
    open();
    await screen.findByText('Bruce Ishimwe');
    const tile = (label: string) => screen.getByText(label).closest('.stat-tile') as HTMLElement;
    expect(within(tile('Administrators')).getByText('1')).toBeInTheDocument();
    expect(within(tile('Supervisors')).getByText('1')).toBeInTheDocument();
    expect(within(tile('Farmers')).getByText('2')).toBeInTheDocument();
  });

  it('shows who is switched on and who is not', async () => {
    open();
    expect(within(await rowOf('Bruce Ishimwe')).getByText('Active')).toBeInTheDocument();
    expect(within(await rowOf('Gad Anaclet')).getByText('Turned off')).toBeInTheDocument();
  });

  it('marks the signed in admin and gives them no controls', async () => {
    open();
    const row = await rowOf('Auris Tuyisenge');
    expect(within(row).getByText('you')).toBeInTheDocument();
    expect(within(row).queryByRole('combobox')).not.toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });

  it('filters by name, email or role', async () => {
    open();
    await screen.findByText('Bruce Ishimwe');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search users' }), { target: { value: 'gad@' } });
    expect(screen.queryByText('Bruce Ishimwe')).not.toBeInTheDocument();
    expect(screen.getByText('Gad Anaclet')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search users' }), { target: { value: 'zzz' } });
    expect(screen.getByText('No users found')).toBeInTheDocument();
    expect(screen.getByText('Nothing matches "zzz". Try a different name or email.')).toBeInTheDocument();
  });

  it('changes a role and says so', async () => {
    api.updateRole.mockResolvedValue({ data: { data: withBase({ ...people[2], role: 'SUPERVISOR' }) } });
    open();
    const row = await rowOf('Bruce Ishimwe');
    fireEvent.change(within(row).getByRole('combobox', { name: 'Role for Bruce Ishimwe' }), { target: { value: 'SUPERVISOR' } });
    await waitFor(() => expect(api.updateRole).toHaveBeenCalledWith('f1', 'SUPERVISOR'));
    expect(await screen.findByText('Bruce Ishimwe is now Supervisor.', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('moves a person to another cooperative', async () => {
    api.updateCooperative.mockResolvedValue({ data: { data: withBase({ ...people[2], cooperativeId: 'c2', cooperativeName: 'Nyamagabe' }) } });
    open();
    const row = await rowOf('Bruce Ishimwe');
    fireEvent.change(within(row).getByRole('combobox', { name: 'Cooperative for Bruce Ishimwe' }), { target: { value: 'c2' } });
    await waitFor(() => expect(api.updateCooperative).toHaveBeenCalledWith('f1', 'c2'));
  });

  it('asks before turning an account off, then marks it off', async () => {
    api.deactivateUser.mockResolvedValue({ data: { data: null } });
    open();
    const row = await rowOf('Bruce Ishimwe');
    fireEvent.click(within(row).getByRole('button', { name: /^Turn off/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Turn off this account?' });
    expect(dialog).toHaveTextContent('Bruce Ishimwe (bruce@gmail.com) will not be able to sign in any more.');
    expect(api.deactivateUser).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, turn off' }));
    await waitFor(() => expect(api.deactivateUser).toHaveBeenCalledWith('f1'));
    await waitFor(() => expect(within(row).getByText('Turned off')).toBeInTheDocument());
  });

  it('does not offer to turn off an account that is already off', async () => {
    open();
    expect(within(await rowOf('Gad Anaclet')).queryByRole('button', { name: /^Turn off/ })).not.toBeInTheDocument();
  });

  it('creates a user and adds them to the list', async () => {
    api.createUser.mockResolvedValue({ data: { data: withBase({ id: 'n1', name: 'Aline Uwase', email: 'aline@x.rw', role: 'FARMER', isActive: true }) } });
    open();
    await screen.findByText('Bruce Ishimwe');
    fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create a new user' });
    fireEvent.change(within(dialog).getByLabelText('Full name'), { target: { value: 'Aline Uwase' } });
    fireEvent.change(within(dialog).getByLabelText('Email address'), { target: { value: 'aline@x.rw' } });
    fireEvent.change(within(dialog).getByLabelText('Password'), { target: { value: 'Secret123' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create user' }));
    await waitFor(() => expect(api.createUser).toHaveBeenCalledWith({ name: 'Aline Uwase', email: 'aline@x.rw', password: 'Secret123', role: 'FARMER' }));
    expect(await screen.findByText('Aline Uwase')).toBeInTheDocument();
  });

  it('asks for every field before creating', async () => {
    open();
    await screen.findByText('Bruce Ishimwe');
    fireEvent.click(screen.getByRole('button', { name: 'Create user' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create a new user' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create user' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Please fill in every field.');
    expect(api.createUser).not.toHaveBeenCalled();
  });

  it('keeps the old gradient avatars and coloured stat tiles out', async () => {
    const { container } = open();
    await screen.findByText('Bruce Ishimwe');
    expect(container.querySelector('[style*="gradient"], .stat-card, .stat-card-icon')).toBeNull();
  });
});
