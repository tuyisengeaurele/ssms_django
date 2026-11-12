import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setReducedMotion } from '../../test/setup';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', name: 'Auris', role: 'ADMIN' }, isAuthenticated: true, isLoading: false }),
}));

const api = vi.hoisted(() => ({ getById: vi.fn(), users: vi.fn(), updateCooperative: vi.fn(), report: vi.fn() }));
vi.mock('../../services/cooperative.service', () => ({ cooperativeService: { getById: api.getById, getAll: vi.fn(), getDeleted: vi.fn() } }));
vi.mock('../../services/admin.service', () => ({ adminService: { getUsers: api.users, updateCooperative: api.updateCooperative } }));
vi.mock('../../services/coopReport.service', () => ({ coopReportService: { get: api.report, download: vi.fn() } }));

import { detail, renderCoop } from './coopTestKit';

configure({ asyncUtilTimeout: 5000 });

const PATH = '/admin/cooperatives/c1/members';
const gad = { id: 'm2', name: 'Gad Anaclet', email: 'gad@ssms.com', role: 'FARMER', createdAt: '2026-06-01T00:00:00Z' };

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.getById.mockResolvedValue({ data: { data: detail() } });
  api.updateCooperative.mockResolvedValue({ data: { data: {} } });
  api.users.mockResolvedValue({
    data: {
      data: [
        { id: 'm1', name: 'Bruce Ishimwe', email: 'bruce@gmail.com', role: 'FARMER' },
        { id: 'm2', name: 'Gad Anaclet', email: 'gad@ssms.com', role: 'FARMER' },
        { id: 'a1', name: 'Auris', email: 'auris@ssms.com', role: 'ADMIN' },
      ],
    },
  });
});

const ready = () => screen.findByRole('heading', { level: 2, name: 'Members (1)' });

describe('The members of a cooperative', () => {
  it('lists the members with their email and their role in words', async () => {
    renderCoop(PATH);
    await ready();
    const row = screen.getByText('Bruce Ishimwe').closest('li') as HTMLElement;
    expect(within(row).getByText('bruce@gmail.com')).toBeInTheDocument();
    expect(within(row).getByText('Farmer')).toBeInTheDocument();
  });

  it('says so when nobody belongs to it yet', async () => {
    api.getById.mockResolvedValue({ data: { data: detail({ members: [], memberCount: 0 }) } });
    renderCoop(PATH);
    expect(await screen.findByRole('heading', { level: 2, name: 'Members (0)' })).toBeInTheDocument();
    expect(screen.getByText('No members yet. Add people from the list above.')).toBeInTheDocument();
  });

  it('adds a member, leaving admins and people who already belong out of the choices', async () => {
    renderCoop(PATH);
    await ready();
    const select = await screen.findByRole('combobox', { name: 'Person to add' });
    const options = within(select).getAllByRole('option').map((o) => o.textContent).join(' ');
    expect(options).toContain('Gad Anaclet');
    expect(options).not.toContain('Auris');
    expect(options).not.toContain('Bruce Ishimwe');
    fireEvent.change(select, { target: { value: 'm2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    const ask = await screen.findByRole('dialog', { name: 'Add Gad Anaclet to Gatsibo Sericulture 1?' });
    expect(api.updateCooperative).not.toHaveBeenCalled();
    fireEvent.click(within(ask).getByRole('button', { name: 'Yes, add' }));
    await waitFor(() => expect(api.updateCooperative).toHaveBeenCalledWith('m2', 'c1'));
  });

  it('shows the new member once they are added', async () => {
    renderCoop(PATH);
    await ready();
    api.getById.mockResolvedValue({ data: { data: detail({ members: [...detail().members, gad], memberCount: 2 }) } });
    fireEvent.change(await screen.findByRole('combobox', { name: 'Person to add' }), { target: { value: 'm2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Yes, add' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Members (2)' })).toBeInTheDocument();
    expect(screen.getByText('gad@ssms.com')).toBeInTheDocument();
  });

  it('asks before removing a member, then removes them', async () => {
    renderCoop(PATH);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Bruce Ishimwe' }));
    const ask = await screen.findByRole('dialog', { name: 'Remove Bruce Ishimwe from Gatsibo Sericulture 1?' });
    expect(ask).toHaveTextContent('Their account and farms stay in the system.');
    expect(api.updateCooperative).not.toHaveBeenCalled();
    fireEvent.click(within(ask).getByRole('button', { name: 'Yes, remove' }));
    await waitFor(() => expect(api.updateCooperative).toHaveBeenCalledWith('m1', null));
  });

  it('keeps the member when the question is cancelled or Escape is pressed', async () => {
    renderCoop(PATH);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Bruce Ishimwe' }));
    const ask = await screen.findByRole('dialog', { name: /^Remove Bruce/ });
    fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Remove Bruce Ishimwe' }));
    await screen.findByRole('dialog', { name: /^Remove Bruce/ });
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.updateCooperative).not.toHaveBeenCalled();
    expect(screen.getByText('Bruce Ishimwe')).toBeInTheDocument();
  });

  it('does not ask for the report, which this section does not use', async () => {
    renderCoop(PATH);
    await ready();
    expect(api.report).not.toHaveBeenCalled();
  });

  it('reads in French', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    renderCoop(PATH);
    expect(await screen.findByRole('heading', { level: 2, name: 'Membres (1)' })).toBeInTheDocument();
  });
});

describe('The members of a cooperative when the people to add cannot be loaded', () => {
  // The members are still shown. Only the choice of a person to add is missing, and the page says so.
  it('keeps the members, says the list to add from is missing, and loads it again', async () => {
    api.users.mockRejectedValueOnce(new Error('boom'));
    renderCoop(PATH);
    await ready();
    expect(screen.getByText('Bruce Ishimwe')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load the people you can add');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('combobox', { name: 'Person to add' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
