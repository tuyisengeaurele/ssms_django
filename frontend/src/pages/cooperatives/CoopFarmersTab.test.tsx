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
  farmers: vi.fn(), invitations: vi.fn(), create: vi.fn(), revoke: vi.fn(), remove: vi.fn(), settings: vi.fn(), setBoxes: vi.fn(),
}));
vi.mock('../../services/supply.service', () => ({ supplyService: { getSettings: api.settings, setForFarmer: api.setBoxes } }));
vi.mock('../../services/team.service', () => ({
  teamService: { getFarmers: api.farmers, getInvitations: api.invitations, createInvitation: api.create, revokeInvitation: api.revoke, removeFarmer: api.remove },
}));

import CoopFarmersTab from './CoopFarmersTab';

const farmers = [
  { id: 'f1', name: 'Bruce Ishimwe', email: 'bruce@gmail.com', joinedAt: '2026-05-01T10:00:00Z', farmCount: 2, allowance: { boxes: 3, source: 'set' } },
  { id: 'f2', name: 'Gad Anaclet', email: 'gad@ssms.com', joinedAt: '2026-06-10T10:00:00Z', farmCount: 1, allowance: { boxes: 2, source: 'default' } },
];
const invitations = [
  { id: 'i1', email: '', status: 'pending', createdAt: '2026-10-20T10:00:00Z', expiresAt: '2026-10-27T10:00:00Z', invitedByName: 'Claire Uwimana', acceptedByName: '', starterBoxes: null },
  { id: 'i2', email: 'aline@example.rw', status: 'accepted', createdAt: '2026-10-10T10:00:00Z', expiresAt: '2026-10-17T10:00:00Z', invitedByName: 'Claire Uwimana', acceptedByName: 'Aline Uwase', starterBoxes: 3 },
  { id: 'i3', email: 'old@example.rw', status: 'expired', createdAt: '2026-09-01T10:00:00Z', expiresAt: '2026-09-08T10:00:00Z', invitedByName: 'Claire Uwimana', acceptedByName: '' },
];

const open = () => render(
  <MemoryRouter>
    <LanguageProvider>
      <ToastProvider>
        <CoopFarmersTab />
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
  api.settings.mockResolvedValue({ data: { data: { starterBoxes: 2, m2PerBox: null } } });
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});

describe('The farmers of my cooperative', () => {
  it('has an invite button and no title of its own, because the cooperative page has one', async () => {
    open();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
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
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ starterBoxes: 2 }));
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
    api.create.mockResolvedValue({ data: { data: { id: 'i9', email: 'aline@example.rw', status: 'pending', createdAt: '2026-10-27T08:00:00Z', expiresAt: '2026-11-03T08:00:00Z', invitedByName: '', acceptedByName: '', link: 'http://localhost:5173/join/zzz' } } });
    open();
    await screen.findByText('Bruce Ishimwe');
    fireEvent.click(screen.getByRole('button', { name: 'Invite a farmer' }));
    const dialog = await screen.findByRole('dialog', { name: 'Invite a farmer' });
    fireEvent.change(within(dialog).getByLabelText(/^Email address/), { target: { value: ' aline@example.rw ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create link' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ email: 'aline@example.rw', starterBoxes: 2 }));
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

  describe('the amount a new farmer starts with', () => {
    const openInvite = async () => {
      open();
      await screen.findByText('Bruce Ishimwe');
      fireEvent.click(screen.getByRole('button', { name: 'Invite a farmer' }));
      return screen.findByRole('dialog', { name: 'Invite a farmer' });
    };
    const made = { data: { data: { id: 'i9', email: '', status: 'pending', createdAt: '2026-10-27T08:00:00Z', expiresAt: '2026-11-03T08:00:00Z', invitedByName: '', acceptedByName: '', starterBoxes: 4, link: 'http://localhost:5173/join/abc' } } };

    it('starts at the cooperative default and says what it is', async () => {
      const dialog = await openInvite();
      await waitFor(() => expect(within(dialog).getByLabelText('Boxes per round')).toHaveValue(2));
      expect(within(dialog).getByText('What this farmer may take in one round. You can lower it later.')).toBeInTheDocument();
    });

    it('sends the amount that was typed', async () => {
      api.create.mockResolvedValue(made);
      const dialog = await openInvite();
      await waitFor(() => expect(within(dialog).getByLabelText('Boxes per round')).toHaveValue(2));
      fireEvent.change(within(dialog).getByLabelText('Boxes per round'), { target: { value: '4' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create link' }));
      await waitFor(() => expect(api.create).toHaveBeenCalledWith({ starterBoxes: 4 }));
    });

    it('sends zero as zero', async () => {
      api.create.mockResolvedValue(made);
      const dialog = await openInvite();
      await waitFor(() => expect(within(dialog).getByLabelText('Boxes per round')).toHaveValue(2));
      fireEvent.change(within(dialog).getByLabelText('Boxes per round'), { target: { value: '0' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create link' }));
      await waitFor(() => expect(api.create).toHaveBeenCalledWith({ starterBoxes: 0 }));
    });

    it.each([['-1'], ['101'], ['2.5']])('refuses %s boxes before sending', async (boxes) => {
      const dialog = await openInvite();
      await waitFor(() => expect(within(dialog).getByLabelText('Boxes per round')).toHaveValue(2));
      fireEvent.change(within(dialog).getByLabelText('Boxes per round'), { target: { value: boxes } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create link' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please enter a whole number of boxes from 0 to 100.');
      expect(api.create).not.toHaveBeenCalled();
    });

    it('sends no amount when the field is left empty, so the cooperative default applies', async () => {
      api.create.mockResolvedValue(made);
      const dialog = await openInvite();
      await waitFor(() => expect(within(dialog).getByLabelText('Boxes per round')).toHaveValue(2));
      fireEvent.change(within(dialog).getByLabelText('Boxes per round'), { target: { value: '' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create link' }));
      await waitFor(() => expect(api.create).toHaveBeenCalledWith({}));
    });

    it('still works when the default could not be loaded, leaving the field empty', async () => {
      api.settings.mockRejectedValue(new Error('down'));
      api.create.mockResolvedValue(made);
      const dialog = await openInvite();
      expect(within(dialog).getByLabelText('Boxes per round')).toHaveValue(null);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create link' }));
      await waitFor(() => expect(api.create).toHaveBeenCalledWith({}));
    });

    it('shows what an invitation starts with in the list', async () => {
      open();
      const row = await rowOf('aline@example.rw');
      expect(within(row).getByText('Starts with 3 boxes')).toBeInTheDocument();
      expect(within(await rowOf('Link only')).queryByText(/Starts with/)).not.toBeInTheDocument();
    });
  });

  describe('the allowance of each farmer', () => {
    it("shows each farmer's amount and says when it is only the cooperative default", async () => {
      open();
      const bruce = await rowOf('Bruce Ishimwe');
      expect(within(bruce).getByText('3 boxes')).toBeInTheDocument();
      expect(within(bruce).queryByText('Cooperative default')).not.toBeInTheDocument();
      const gad = await rowOf('Gad Anaclet');
      expect(within(gad).getByText('2 boxes')).toBeInTheDocument();
      expect(within(gad).getByText('Cooperative default')).toBeInTheDocument();
    });

    it('offers to lower an amount, and no lowering of zero', async () => {
      api.farmers.mockResolvedValue({ data: { data: [{ ...farmers[0], allowance: { boxes: 0, source: 'set' } }, farmers[1]] } });
      open();
      expect(within(await rowOf('Gad Anaclet')).getByRole('button', { name: 'Lower the allowance of Gad Anaclet' })).toBeInTheDocument();
      expect(within(await rowOf('Bruce Ishimwe')).queryByRole('button', { name: /^Lower the allowance/ })).not.toBeInTheDocument();
    });

    const openLower = async () => {
      open();
      fireEvent.click(within(await rowOf('Bruce Ishimwe')).getByRole('button', { name: 'Lower the allowance of Bruce Ishimwe' }));
      return screen.findByRole('dialog', { name: 'Lower the allowance of Bruce Ishimwe' });
    };
    const fillIn = (dialog: HTMLElement, boxes: string, reason: string) => {
      fireEvent.change(within(dialog).getByLabelText('New amount (boxes)'), { target: { value: boxes } });
      fireEvent.change(within(dialog).getByLabelText(/^Why/), { target: { value: reason } });
    };

    it.each([['3'], ['4'], ['-1'], ['2.5'], ['']])('refuses %s as a lower amount before sending', async (boxes) => {
      const dialog = await openLower();
      fillIn(dialog, boxes, 'Outbreak last month');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Lower allowance' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please enter a whole number below 3.');
      expect(api.setBoxes).not.toHaveBeenCalled();
    });

    it('asks for a reason of at least ten characters', async () => {
      const dialog = await openLower();
      fillIn(dialog, '1', 'short');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Lower allowance' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please say why, in 10 to 500 characters.');
      expect(api.setBoxes).not.toHaveBeenCalled();
    });

    it('lowers the amount, shows it at once and says the farmer is told', async () => {
      api.setBoxes.mockResolvedValue({ data: { data: { boxes: 1 } } });
      const dialog = await openLower();
      fillIn(dialog, '1', '  Outbreak last month  ');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Lower allowance' }));
      await waitFor(() => expect(api.setBoxes).toHaveBeenCalledWith('f1', { boxes: 1, reason: 'Outbreak last month' }));
      expect(await screen.findByText('Allowance lowered. Bruce Ishimwe is told.', {}, { timeout: 5000 })).toBeInTheDocument();
      expect(within(await rowOf('Bruce Ishimwe')).getByText('1 box')).toBeInTheDocument();
    });

    it('shows the answer of the server in the dialog', async () => {
      api.setBoxes.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status: 422, data: { message: 'That is the amount the farmer has now.' } } as never));
      const dialog = await openLower();
      fillIn(dialog, '1', 'Outbreak last month');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Lower allowance' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('That is the amount the farmer has now.');
    });
  });
});

describe('The farmers of my cooperative when they cannot be loaded', () => {
  // "0 farmers" and "No farmers yet" would tell a supervisor their cooperative is empty.
  it('says so, and does not claim there are no farmers', async () => {
    api.farmers.mockRejectedValueOnce(new Error('boom'));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load this page');
    expect(screen.queryByText('No farmers yet')).not.toBeInTheDocument();
    expect(screen.queryByText(/Farmers \(0\)/)).not.toBeInTheDocument();
  });

  it('loads again with Try again', async () => {
    api.farmers.mockRejectedValueOnce(new Error('boom'));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Bruce Ishimwe')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
