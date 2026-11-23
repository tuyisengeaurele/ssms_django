import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

  it('keeps the email fixed and explains why', () => {
    open();
    expect(screen.getByLabelText('Email address')).toHaveAttribute('readonly');
    expect(screen.getByText('You cannot change your email here. Contact the SSMS team if it needs to change.')).toBeInTheDocument();
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

  it('does not repeat the title of the page, which the Settings page already has', () => {
    open();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });
});
