import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'sup', name: 'Claire Uwimana', role: 'SUPERVISOR', cooperativeName: 'Gatsibo Silk' } }),
}));

const api = vi.hoisted(() => ({
  farmers: vi.fn(), invitations: vi.fn(), create: vi.fn(), revoke: vi.fn(), remove: vi.fn(),
}));
vi.mock('../../services/team.service', () => ({
  teamService: { getFarmers: api.farmers, getInvitations: api.invitations, createInvitation: api.create, revokeInvitation: api.revoke, removeFarmer: api.remove },
}));

import SupervisorFarmersPage from './SupervisorFarmersPage';

const farmers = [
  { id: 'f1', name: 'Bruce Ishimwe', email: 'bruce@gmail.com', joinedAt: '2026-05-01T10:00:00Z', farmCount: 2 },
  { id: 'f2', name: 'Gad Anaclet', email: 'gad@ssms.com', joinedAt: '2026-06-10T10:00:00Z', farmCount: 1 },
];
const invitations = [
  { id: 'i1', email: '', status: 'pending', createdAt: '2026-10-20T10:00:00Z', expiresAt: '2026-10-27T10:00:00Z', invitedByName: 'Claire Uwimana', acceptedByName: '' },
  { id: 'i2', email: 'aline@example.rw', status: 'accepted', createdAt: '2026-10-10T10:00:00Z', expiresAt: '2026-10-17T10:00:00Z', invitedByName: 'Claire Uwimana', acceptedByName: 'Aline Uwase' },
  { id: 'i3', email: 'old@example.rw', status: 'expired', createdAt: '2026-09-01T10:00:00Z', expiresAt: '2026-09-08T10:00:00Z', invitedByName: 'Claire Uwimana', acceptedByName: '' },
];

const open = () => render(
  <MemoryRouter>
    <LanguageProvider>
      <ToastProvider>
        <SupervisorFarmersPage />
      </ToastProvider>
    </LanguageProvider>
  </MemoryRouter>,
);

const rowOf = async (text: string) => (await screen.findByText(text)).closest('tr') as HTMLElement;

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.farmers.mockResolvedValue({ data: { data: farmers } });
  api.invitations.mockResolvedValue({ data: { data: invitations } });
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe('My farmers page', () => {
  it('has one title, a subtitle and an invite button', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'My farmers' })).toBeInTheDocument();
    expect(screen.getByText('The farmers in your cooperative, and the links you sent to invite more.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Invite a farmer' })).toBeInTheDocument();
    await screen.findByText('Bruce Ishimwe');
  });

  it('counts the farmers and the invitations still waiting', async () => {
    open();
    await screen.findByText('Bruce Ishimwe');
    const tile = (label: string) => screen.getByText(label).closest('.stat-tile') as HTMLElement;
    expect(within(tile('Farmers')).getByText('2')).toBeInTheDocument();
    expect(within(tile('Pending invitations')).getByText('1')).toBeInTheDocument();
  });

  it('lists each farmer with their email, their farms and the day they joined', async () => {
    open();
    const row = await rowOf('Bruce Ishimwe');
    expect(within(row).getByText('bruce@gmail.com')).toBeInTheDocument();
    expect(within(row).getByText('2')).toBeInTheDocument();
    expect(within(row).getByText('May 1, 2026')).toBeInTheDocument();
  });

  it('invites the first farmer when there are none', async () => {
    api.farmers.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No farmers yet')).toBeInTheDocument();
    expect(screen.getByText('Invite a farmer with a link, and they appear here when they join.')).toBeInTheDocument();
  });

  // ── removing ──
  it('asks before removing a farmer, then removes them', async () => {
    api.remove.mockResolvedValue({ data: { data: null } });
    open();
    const row = await rowOf('Bruce Ishimwe');
    fireEvent.click(within(row).getByRole('button', { name: 'Remove Bruce Ishimwe' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove Bruce Ishimwe from the cooperative?' });
    expect(dialog).toHaveTextContent('keeps their farms');
    expect(api.remove).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, remove' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('f1'));
    await waitFor(() => expect(screen.queryByText('Bruce Ishimwe')).not.toBeInTheDocument());
    expect(await screen.findByText('Bruce Ishimwe was removed.', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('keeps the farmer when the question is cancelled', async () => {
    open();
    const row = await rowOf('Bruce Ishimwe');
    fireEvent.click(within(row).getByRole('button', { name: 'Remove Bruce Ishimwe' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.remove).not.toHaveBeenCalled();
    expect(screen.getByText('Bruce Ishimwe')).toBeInTheDocument();
  });

  // ── invitations ──
  it('lists the invitations in plain words, and offers Revoke only on a pending one', async () => {
    open();
    const pending = await rowOf('Link only');
    expect(within(pending).getByText('Pending')).toBeInTheDocument();
    expect(within(pending).getByRole('button', { name: /^Revoke/ })).toBeInTheDocument();
    const used = await rowOf('aline@example.rw');
    expect(within(used).getByText('Used')).toBeInTheDocument();
    expect(within(used).getByText('Aline Uwase')).toBeInTheDocument();
    expect(within(used).queryByRole('button')).not.toBeInTheDocument();
    expect(within(await rowOf('old@example.rw')).getByText('Expired')).toBeInTheDocument();
  });

  it('asks before revoking, then marks it revoked', async () => {
    api.revoke.mockResolvedValue({ data: { data: null } });
    open();
    const row = await rowOf('Link only');
    fireEvent.click(within(row).getByRole('button', { name: /^Revoke/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Revoke this invitation?' });
    expect(api.revoke).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, revoke' }));
    await waitFor(() => expect(api.revoke).toHaveBeenCalledWith('i1'));
    await waitFor(() => expect(within(row).getByText('Revoked')).toBeInTheDocument());
    expect(within(row).queryByRole('button', { name: /^Revoke/ })).not.toBeInTheDocument();
  });

  it('makes a link, shows it once, and lets the supervisor copy it or share it on WhatsApp', async () => {
    api.create.mockResolvedValue({
      data: { data: { id: 'i9', email: '', status: 'pending', createdAt: '2026-10-27T08:00:00Z', expiresAt: '2026-11-03T08:00:00Z', invitedByName: 'Claire Uwimana', acceptedByName: '', link: 'http://localhost:5173/join/abc123' } },
    });
    open();
    await screen.findByText('Bruce Ishimwe');
    fireEvent.click(screen.getByRole('button', { name: 'Invite a farmer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invite a farmer' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create link' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith(undefined));
    const link = await within(dialog).findByLabelText('Invitation link');
    expect(link).toHaveValue('http://localhost:5173/join/abc123');
    expect(link).toHaveAttribute('readonly');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Copy link' }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost:5173/join/abc123'));
    expect(await screen.findByText('Link copied.', {}, { timeout: 5000 })).toBeInTheDocument();

    const share = within(dialog).getByRole('link', { name: 'Share on WhatsApp' });
    expect(share.getAttribute('href')).toMatch(/^https:\/\/wa\.me\/\?text=/);
    expect(decodeURIComponent(share.getAttribute('href') as string)).toContain('Claire Uwimana invites you to join Gatsibo Silk on SSMS: http://localhost:5173/join/abc123');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // The new invitation is now in the list.
    expect(screen.getAllByText('Link only').length).toBe(2);
  });

  it('sends the address when one is typed', async () => {
    api.create.mockResolvedValue({ data: { data: { id: 'i9', email: 'aline@example.rw', status: 'pending', createdAt: '', expiresAt: '', invitedByName: '', acceptedByName: '', link: 'http://localhost:5173/join/zzz' } } });
    open();
    await screen.findByText('Bruce Ishimwe');
    fireEvent.click(screen.getByRole('button', { name: 'Invite a farmer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invite a farmer' });
    fireEvent.change(within(dialog).getByLabelText(/^Email address/), { target: { value: ' aline@example.rw ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create link' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith('aline@example.rw'));
  });

  it('shows the server answer inside the dialog when the address is refused', async () => {
    api.create.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status: 422, data: { message: 'Please enter a valid email address.' } } as never));
    open();
    await screen.findByText('Bruce Ishimwe');
    fireEvent.click(screen.getByRole('button', { name: 'Invite a farmer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invite a farmer' });
    fireEvent.change(within(dialog).getByLabelText(/^Email address/), { target: { value: 'nope' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create link' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please enter a valid email address.');
  });

  it('uses no dots or pills for the status', async () => {
    const { container } = open();
    await screen.findByText('Bruce Ishimwe');
    expect(container.querySelector('[class*="dot"], [class*="pill"]')).toBeNull();
  });
});
