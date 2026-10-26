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
  restoreUser: vi.fn(),
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

  it('counts the people who can sign in, by role', async () => {
    open();
    await screen.findByText('Bruce Ishimwe');
    const tile = (label: string) => screen.getByText(label).closest('.stat-tile') as HTMLElement;
    expect(within(tile('Administrators')).getByText('1')).toBeInTheDocument();
    expect(within(tile('Supervisors')).getByText('1')).toBeInTheDocument();
    expect(within(tile('Farmers')).getByText('1')).toBeInTheDocument();
  });

  it('lists active people first and keeps deleted people under their own tab', async () => {
    open();
    expect(within(await rowOf('Bruce Ishimwe')).getByText('Active')).toBeInTheDocument();
    expect(screen.queryByText('Gad Anaclet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Deleted/ }));
    expect(within(await rowOf('Gad Anaclet')).getByText('Deleted')).toBeInTheDocument();
    expect(screen.queryByText('Bruce Ishimwe')).not.toBeInTheDocument();
  });

  it('shows the role and cooperative as words, with no select boxes in the table', async () => {
    open();
    const row = await rowOf('Coop Supervisor');
    expect(within(row).getByText('Supervisor')).toBeInTheDocument();
    expect(within(row).getByText('Gatsibo 1')).toBeInTheDocument();
    expect(within(row).queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('marks the signed in admin and gives them no controls', async () => {
    open();
    const row = await rowOf('Auris Tuyisenge');
    expect(within(row).getByText('you')).toBeInTheDocument();
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });

  it('filters by name, email or role', async () => {
    open();
    await screen.findByText('Bruce Ishimwe');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search users' }), { target: { value: 'supervisor@' } });
    expect(screen.queryByText('Bruce Ishimwe')).not.toBeInTheDocument();
    expect(screen.getByText('Coop Supervisor')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search users' }), { target: { value: 'zzz' } });
    expect(screen.getByText('No users found')).toBeInTheDocument();
    expect(screen.getByText('Nothing matches "zzz". Try a different name or email.')).toBeInTheDocument();
  });

  describe('Edit access', () => {
    async function openEditor(name = 'Bruce Ishimwe') {
      open();
      const row = await rowOf(name);
      fireEvent.click(within(row).getByRole('button', { name: `Edit access for ${name}` }));
      return screen.findByRole('dialog', { name: `Edit access for ${name}` });
    }

    it('opens a dialog with the current role and cooperative, and cannot save until something changes', async () => {
      const dialog = await openEditor();
      expect(within(dialog).getByLabelText('Role')).toHaveValue('FARMER');
      expect(within(dialog).getByLabelText('Cooperative')).toHaveValue('');
      expect(within(dialog).getByRole('button', { name: 'Review changes' })).toBeDisabled();
    });

    it('shows what will change and asks again before saving a new role', async () => {
      api.updateRole.mockResolvedValue({ data: { data: withBase({ ...people[2], role: 'SUPERVISOR' }) } });
      const dialog = await openEditor();
      fireEvent.change(within(dialog).getByLabelText('Role'), { target: { value: 'SUPERVISOR' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Review changes' }));
      expect(dialog).toHaveTextContent('Role: Farmer to Supervisor');
      expect(api.updateRole).not.toHaveBeenCalled();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, save' }));
      await waitFor(() => expect(api.updateRole).toHaveBeenCalledWith('f1', 'SUPERVISOR'));
      expect(await screen.findByText('Access updated for Bruce Ishimwe.', {}, { timeout: 5000 })).toBeInTheDocument();
      expect(api.updateCooperative).not.toHaveBeenCalled();
    });

    it('goes back from the review to the form without saving', async () => {
      const dialog = await openEditor();
      fireEvent.change(within(dialog).getByLabelText('Role'), { target: { value: 'SUPERVISOR' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Review changes' }));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Back' }));
      expect(within(dialog).getByLabelText('Role')).toHaveValue('SUPERVISOR');
      expect(api.updateRole).not.toHaveBeenCalled();
    });

    it('moves a person to another cooperative after confirming', async () => {
      api.updateCooperative.mockResolvedValue({ data: { data: withBase({ ...people[2], cooperativeId: 'c2', cooperativeName: 'Nyamagabe' }) } });
      const dialog = await openEditor();
      fireEvent.change(within(dialog).getByLabelText('Cooperative'), { target: { value: 'c2' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Review changes' }));
      expect(dialog).toHaveTextContent('Cooperative: No cooperative to Nyamagabe');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, save' }));
      await waitFor(() => expect(api.updateCooperative).toHaveBeenCalledWith('f1', 'c2'));
      expect(api.updateRole).not.toHaveBeenCalled();
    });

    it('saves the role first and then the cooperative when both change', async () => {
      const order: string[] = [];
      api.updateRole.mockImplementation(async () => { order.push('role'); return { data: { data: withBase({ ...people[2], role: 'SUPERVISOR' }) } }; });
      api.updateCooperative.mockImplementation(async () => { order.push('coop'); return { data: { data: withBase({ ...people[2], role: 'SUPERVISOR', cooperativeId: 'c2', cooperativeName: 'Nyamagabe' }) } }; });
      const dialog = await openEditor();
      fireEvent.change(within(dialog).getByLabelText('Role'), { target: { value: 'SUPERVISOR' } });
      fireEvent.change(within(dialog).getByLabelText('Cooperative'), { target: { value: 'c2' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Review changes' }));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, save' }));
      await waitFor(() => expect(order).toEqual(['role', 'coop']));
    });

    it('does not offer a cooperative to an administrator', async () => {
      const dialog = await openEditor();
      fireEvent.change(within(dialog).getByLabelText('Role'), { target: { value: 'ADMIN' } });
      expect(within(dialog).queryByLabelText('Cooperative')).not.toBeInTheDocument();
    });

    it('shows the server error inside the dialog and keeps it open', async () => {
      api.updateRole.mockRejectedValue({ response: { data: { message: 'Something went wrong on our side.' } } });
      const dialog = await openEditor();
      fireEvent.change(within(dialog).getByLabelText('Role'), { target: { value: 'SUPERVISOR' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Review changes' }));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, save' }));
      expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Edit access for Bruce Ishimwe' })).toBeInTheDocument();
    });

    it('closes with Cancel and changes nothing', async () => {
      const dialog = await openEditor();
      fireEvent.change(within(dialog).getByLabelText('Role'), { target: { value: 'SUPERVISOR' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(api.updateRole).not.toHaveBeenCalled();
    });

    it('has no edit button for a deleted account', async () => {
      open();
      await screen.findByText('Bruce Ishimwe');
      fireEvent.click(screen.getByRole('tab', { name: /Deleted/ }));
      expect(within(await rowOf('Gad Anaclet')).queryByRole('button', { name: /^Edit access/ })).not.toBeInTheDocument();
    });
  });

  it('asks before deleting, then moves the person to the Deleted tab', async () => {
    api.deactivateUser.mockResolvedValue({ data: { data: null } });
    open();
    const row = await rowOf('Bruce Ishimwe');
    fireEvent.click(within(row).getByRole('button', { name: 'Delete Bruce Ishimwe' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this user?' });
    expect(dialog).toHaveTextContent('Bruce Ishimwe (bruce@gmail.com) will not be able to sign in any more.');
    expect(dialog).toHaveTextContent('you can restore the account');
    expect(api.deactivateUser).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, delete' }));
    await waitFor(() => expect(api.deactivateUser).toHaveBeenCalledWith('f1'));
    await waitFor(() => expect(screen.queryByText('Bruce Ishimwe')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /Deleted/ }));
    expect(await screen.findByText('Bruce Ishimwe')).toBeInTheDocument();
  });

  it('does not use the words turn off anywhere', async () => {
    open();
    await screen.findByText('Bruce Ishimwe');
    expect(screen.queryByText(/turn off|turned off/i)).not.toBeInTheDocument();
  });

  it('asks before restoring, then moves the person back to the Active tab', async () => {
    api.restoreUser.mockResolvedValue({ data: { data: withBase({ ...people[3], isActive: true }) } });
    open();
    await screen.findByText('Bruce Ishimwe');
    fireEvent.click(screen.getByRole('tab', { name: /Deleted/ }));
    const row = await rowOf('Gad Anaclet');
    fireEvent.click(within(row).getByRole('button', { name: 'Restore Gad Anaclet' }));
    const dialog = await screen.findByRole('dialog', { name: 'Restore this user?' });
    expect(api.restoreUser).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, restore' }));
    await waitFor(() => expect(api.restoreUser).toHaveBeenCalledWith('f2'));
    await waitFor(() => expect(screen.queryByText('Gad Anaclet')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('tab', { name: /Active/ }));
    expect(await screen.findByText('Gad Anaclet')).toBeInTheDocument();
  });

  it('says so when nobody has been deleted', async () => {
    api.getUsers.mockResolvedValue({ data: { data: people.filter((p) => p.isActive).map(withBase) } });
    open();
    await screen.findByText('Bruce Ishimwe');
    fireEvent.click(screen.getByRole('tab', { name: /Deleted/ }));
    expect(await screen.findByText('Nobody has been deleted')).toBeInTheDocument();
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
