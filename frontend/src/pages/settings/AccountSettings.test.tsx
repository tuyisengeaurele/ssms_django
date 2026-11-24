import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const auth = vi.hoisted(() => ({
  user: { id: 'c19de39a0e5czzvf7u2sak0w3ttf', name: 'Auris Tuyisenge', email: 'auris@ssms.com', role: 'ADMIN', cooperativeId: null as string | null, cooperativeName: null as string | null, createdAt: '2026-05-01T10:00:00Z', phone: null as string | null },
  refreshUser: vi.fn(),
  updateUser: vi.fn(),
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));

const api = vi.hoisted(() => ({ updateProfile: vi.fn() }));
vi.mock('../../services/auth.service', () => ({ authService: api }));
const account = vi.hoisted(() => ({ getEmailChange: vi.fn(), cancelEmailChange: vi.fn(), startEmailChange: vi.fn() }));
vi.mock('../../services/account.service', () => ({ accountService: account }));
const coop = vi.hoisted(() => ({ mine: vi.fn(), options: vi.fn(), ask: vi.fn(), withdraw: vi.fn() }));
vi.mock('../../services/cooperativeRequest.service', () => ({ cooperativeRequestService: coop }));

import AccountSettings from './AccountSettings';

function open() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <AccountSettings />
      </ToastProvider>
    </LanguageProvider>,
  );
}

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  auth.user.cooperativeId = null;
  auth.user.cooperativeName = null;
  auth.user.phone = null;
  api.updateProfile.mockResolvedValue({ data: { data: { ...auth.user, name: 'Auris T' } } });
  account.getEmailChange.mockResolvedValue({ data: { data: null } });
  account.cancelEmailChange.mockResolvedValue({ data: { data: null } });
  auth.user.role = 'ADMIN';
  coop.mine.mockResolvedValue({ data: { data: null } });
  coop.options.mockResolvedValue({ data: { data: [{ id: 'c1', name: 'Old Coop' }, { id: 'c2', name: 'New Coop' }] } });
  coop.withdraw.mockResolvedValue({ data: { data: null } });
});

describe('Account settings', () => {
  it('refreshes the account from the server, so nothing shown is stale', () => {
    open();
    expect(auth.refreshUser).toHaveBeenCalled();
  });

  it('shows who you are, in words', () => {
    open();
    const card = screen.getByRole('region', { name: 'About you' });
    expect(within(card).getByText('Auris Tuyisenge')).toBeInTheDocument();
    expect(within(card).getByText('auris@ssms.com')).toBeInTheDocument();
    expect(within(card).getByText('Administrator')).toBeInTheDocument();
    expect(within(card).getByText('May 1, 2026')).toBeInTheDocument();
    expect(within(card).getByText('Not assigned')).toBeInTheDocument();
  });

  it('shows a farmer their supervisor with a call and a WhatsApp link', () => {
    (auth.user as Record<string, unknown>).supervisor = { id: 's1', name: 'Claire Uwimana', phone: '+250722000111' };
    open();
    const card = screen.getByRole('region', { name: 'About you' });
    expect(within(card).getByText('Claire Uwimana')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Call Claire Uwimana' })).toHaveAttribute('href', 'tel:+250722000111');
    delete (auth.user as Record<string, unknown>).supervisor;
  });

  it('shows no supervisor row when the account has none', () => {
    open();
    expect(screen.queryByText('Your supervisor')).not.toBeInTheDocument();
  });

  it('shows the cooperative when there is one', () => {
    auth.user.cooperativeName = 'Gatsibo Sericulture 1';
    open();
    expect(screen.getByText('Gatsibo Sericulture 1')).toBeInTheDocument();
  });

  describe('the email address', () => {
    const pending = { id: 'c1', newEmail: 'n***@example.rw', createdAt: '2026-11-23T10:00:00Z', expiresAt: '2026-11-24T10:00:00Z' };

    it('is shown as a field nobody can type over, with a Change button and no note about who to contact', () => {
      open();
      expect(screen.getByLabelText('Email address')).toHaveAttribute('readonly');
      expect(screen.getByRole('button', { name: 'Change email address' })).toBeInTheDocument();
      expect(screen.queryByText(/Contact the SSMS team/)).not.toBeInTheDocument();
    });

    it('opens the dialog from the button', async () => {
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Change email address' }));
      expect(await screen.findByRole('dialog', { name: 'Change your email address' })).toBeInTheDocument();
    });

    it('shows nothing about a request when none is pending', async () => {
      open();
      await waitFor(() => expect(account.getEmailChange).toHaveBeenCalled());
      expect(screen.queryByText(/We sent a link to/)).not.toBeInTheDocument();
    });

    it('says where the link went when a request is pending, with a way to cancel it', async () => {
      account.getEmailChange.mockResolvedValue({ data: { data: pending } });
      open();
      expect(await screen.findByText('We sent a link to n***@example.rw. Your email changes when you open it.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel request' })).toBeInTheDocument();
    });

    it('cancels the request and the notice goes', async () => {
      account.getEmailChange.mockResolvedValue({ data: { data: pending } });
      open();
      fireEvent.click(await screen.findByRole('button', { name: 'Cancel request' }));
      await waitFor(() => expect(account.cancelEmailChange).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByText(/We sent a link to/)).not.toBeInTheDocument());
      expect(await screen.findByText('The request was cancelled.', {}, { timeout: 5000 })).toBeInTheDocument();
    });

    it('shows the pending notice and a toast after the dialog sends the link', async () => {
      account.startEmailChange.mockResolvedValue({ data: { data: pending } });
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Change email address' }));
      const dialog = await screen.findByRole('dialog', { name: 'Change your email address' });
      fireEvent.change(within(dialog).getByLabelText('New email address'), { target: { value: 'new@example.rw' } });
      fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: 'Secret123' } });
      fireEvent.change(within(dialog).getByLabelText('Type auris@ssms.com to confirm'), { target: { value: 'auris@ssms.com' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Send the link' }));
      expect(await screen.findByText('We sent a link to n***@example.rw. Your email changes when you open it.', {}, { timeout: 5000 })).toBeInTheDocument();
      expect(await screen.findByText('We sent a link to n***@example.rw.', {}, { timeout: 5000 })).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
  });

  it.each([
    ['en', /SSMS team/],
    ['fr', /l'équipe SSMS/],
    ['rw', /itsinda rya SSMS/],
  ])('does not tell the person what the SSMS team sets, or send them to it (%s)', (locale, pattern) => {
    localStorage.setItem('ssms_locale', locale as string);
    auth.user.cooperativeId = null;
    auth.user.role = 'FARMER';
    const { container } = open();
    expect(container.textContent).not.toMatch(pattern as RegExp);
    auth.user.role = 'ADMIN';
  });

  it('saves a new name, and only when it changed', async () => {
    open();
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Auris T' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ name: 'Auris T' }));
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalled());
    expect(await screen.findByText('Your profile is updated.', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  describe('the phone number', () => {
    const save = () => screen.getByRole('button', { name: 'Save changes' });

    it('shows the number as text with a Change button, and no field to type over it', () => {
      auth.user.phone = '+250788123456';
      open();
      const card = screen.getByRole('group', { name: 'Phone number' });
      expect(within(card).getByText('0788123456')).toBeInTheDocument();
      expect(within(card).getByRole('button', { name: 'Change' })).toBeInTheDocument();
      expect(screen.queryByRole('textbox', { name: 'Phone number' })).not.toBeInTheDocument();
      expect(screen.getByText('A Rwandan mobile number, for example 0788123456.')).toBeInTheDocument();
      expect(screen.queryByText(/can see it/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Leave it empty to remove/)).not.toBeInTheDocument();
    });

    it('opens the confirmation dialog from Change, and takes the new number into the account', async () => {
      auth.user.phone = '+250788123456';
      api.updateProfile.mockResolvedValue({ data: { data: { ...auth.user, phone: '+250733000000' } } });
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Change' }));
      const dialog = await screen.findByRole('dialog', { name: 'Change your phone number' });
      fireEvent.change(within(dialog).getByLabelText('New phone number'), { target: { value: '0733 000 000' } });
      fireEvent.change(within(dialog).getByLabelText('Type 0788123456 to confirm'), { target: { value: '0788 123 456' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Change number' }));
      await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ phone: '0733 000 000', confirmPhone: '0788 123 456' }));
      await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith(expect.objectContaining({ phone: '+250733000000' })));
      expect(await screen.findByText('Your phone number is changed.', {}, { timeout: 5000 })).toBeInTheDocument();
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('leaves the saved number alone when the dialog is cancelled', async () => {
      auth.user.phone = '+250788123456';
      open();
      fireEvent.click(screen.getByRole('button', { name: 'Change' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      expect(api.updateProfile).not.toHaveBeenCalled();
    });

    it('saving the name never sends the number', async () => {
      auth.user.phone = '+250788123456';
      open();
      fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Auris T' } });
      fireEvent.click(save());
      await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ name: 'Auris T' }));
    });

    it('lets an account that has no number type one and save it, with no confirmation to give', async () => {
      open();
      const field = screen.getByLabelText('Phone number');
      expect(field).toHaveValue('');
      expect(field).toHaveAttribute('type', 'tel');
      expect(field).toHaveAttribute('autocomplete', 'tel');
      expect(save()).toBeDisabled();
      fireEvent.change(field, { target: { value: '0733 000 000' } });
      fireEvent.click(save());
      await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ phone: '0733 000 000' }));
    });

    it('says beside the field when that number is not a Rwandan mobile, and keeps what was typed', async () => {
      api.updateProfile.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 422, data: { code: 'invalid_phone', message: 'Please check what you entered.', errors: { phone: ['Enter a Rwandan mobile number, for example 0788123456.'] } },
      } as never));
      open();
      const field = screen.getByLabelText('Phone number');
      fireEvent.change(field, { target: { value: '12345' } });
      fireEvent.click(save());
      const message = await screen.findByText('Enter a Rwandan mobile number, for example 0788123456.');
      expect(message).toHaveAttribute('role', 'alert');
      expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(field).toHaveValue('12345');
      expect(auth.updateUser).not.toHaveBeenCalled();
      fireEvent.change(field, { target: { value: '0788 123 456' } });
      expect(field).not.toHaveAttribute('aria-invalid', 'true');
    });
  });

  describe('the cooperative', () => {
    const asked = (over = {}) => ({
      id: 'r1', status: 'requested', reason: 'Closer to my farm', from: { id: 'c1', name: 'Old Coop' }, to: { id: 'c2', name: 'New Coop' },
      decisionNote: '', createdAt: '2026-11-20T10:00:00Z', decidedAt: null, ...over,
    });
    const asFarmer = () => { auth.user.role = 'FARMER'; auth.user.cooperativeId = 'c1'; auth.user.cooperativeName = 'Old Coop'; };
    const change = () => screen.queryByRole('button', { name: 'Change cooperative' });

    it('has a Change cooperative button for a farmer and for a supervisor, and never for an admin', async () => {
      open();
      expect(change()).not.toBeInTheDocument();
      cleanup();
      asFarmer();
      open();
      expect(change()).toBeInTheDocument();
      cleanup();
      auth.user.role = 'SUPERVISOR';
      open();
      expect(change()).toBeInTheDocument();
      expect(coop.mine).toHaveBeenCalledTimes(2);
    });

    it('does not ask the server for a request when the person is an admin', () => {
      open();
      expect(coop.mine).not.toHaveBeenCalled();
    });

    it('opens the modal from the button', async () => {
      asFarmer();
      open();
      fireEvent.click(change()!);
      expect(await screen.findByRole('dialog', { name: 'Ask to change cooperative' })).toBeInTheDocument();
    });

    it('shows a waiting request with its date and the cooperative, and a way to withdraw it', async () => {
      asFarmer();
      coop.mine.mockResolvedValue({ data: { data: asked() } });
      open();
      expect(await screen.findByText(/Request waiting since .+, to join New Coop\./)).toBeInTheDocument();
      expect(change()).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Withdraw' })).toBeInTheDocument();
    });

    it('says a request to leave in its own words', async () => {
      asFarmer();
      coop.mine.mockResolvedValue({ data: { data: asked({ to: null }) } });
      open();
      expect(await screen.findByText(/Request waiting since .+, to leave your cooperative\./)).toBeInTheDocument();
    });

    it('withdraws the request, says so, and brings the button back', async () => {
      asFarmer();
      coop.mine.mockResolvedValue({ data: { data: asked() } });
      open();
      fireEvent.click(await screen.findByRole('button', { name: 'Withdraw' }));
      await waitFor(() => expect(coop.withdraw).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByText(/Request waiting since/)).not.toBeInTheDocument());
      expect(change()).toBeInTheDocument();
      expect(await screen.findByText('Your request was withdrawn.', {}, { timeout: 5000 })).toBeInTheDocument();
    });

    it('shows a refusal with its note once, and Got it takes it away for good', async () => {
      asFarmer();
      coop.mine.mockResolvedValue({ data: { data: asked({ status: 'declined', decisionNote: 'Please talk to your supervisor first.', decidedAt: '2026-11-21T10:00:00Z' }) } });
      open();
      expect(await screen.findByText(/Your request was not approved on /)).toBeInTheDocument();
      expect(screen.getByText('Note from the SSMS team: Please talk to your supervisor first.')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
      expect(screen.queryByText(/Your request was not approved on /)).not.toBeInTheDocument();
      cleanup();
      open();
      await waitFor(() => expect(coop.mine).toHaveBeenCalledTimes(2));
      expect(screen.queryByText(/Your request was not approved on /)).not.toBeInTheDocument();
    });

    it('shows an approval in the words of a move, or of a leave', async () => {
      asFarmer();
      coop.mine.mockResolvedValue({ data: { data: asked({ status: 'approved', decidedAt: '2026-11-21T10:00:00Z' }) } });
      open();
      expect(await screen.findByText(/Your request to join New Coop was approved on /)).toBeInTheDocument();
      cleanup();
      localStorage.clear();
      coop.mine.mockResolvedValue({ data: { data: asked({ id: 'r2', status: 'approved', to: null, decidedAt: '2026-11-21T10:00:00Z' }) } });
      open();
      expect(await screen.findByText(/Your request to leave your cooperative was approved on /)).toBeInTheDocument();
    });
  });

  it('does not repeat the title of the page, which the Settings page already has', () => {
    open();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });
});
