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
    const phone = () => screen.getByLabelText('Phone number');
    const save = () => screen.getByRole('button', { name: 'Save changes' });

    it('is empty for someone who has not given one, with the hint that says who sees it', () => {
      open();
      expect(phone()).toHaveValue('');
      expect(phone()).toHaveAttribute('type', 'tel');
      expect(phone()).toHaveAttribute('autocomplete', 'tel');
      expect(screen.getByText(/Only you and the staff who look after your account can see it\./)).toBeInTheDocument();
    });

    it('shows the saved number the way a person writes it', () => {
      auth.user.phone = '+250788123456';
      open();
      expect(phone()).toHaveValue('0788 123 456');
    });

    it('saves a new number alone, and sends only what changed', async () => {
      open();
      expect(save()).toBeDisabled();
      fireEvent.change(phone(), { target: { value: '0733 000 000' } });
      expect(save()).toBeEnabled();
      fireEvent.click(save());
      await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ phone: '0733 000 000' }));
      expect(await screen.findByText('Your profile is updated.', {}, { timeout: 5000 })).toBeInTheDocument();
    });

    it('saves the name and the number together', async () => {
      open();
      fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Auris T' } });
      fireEvent.change(phone(), { target: { value: '0788 123 456' } });
      fireEvent.click(save());
      await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ name: 'Auris T', phone: '0788 123 456' }));
    });

    it('removes the number when the field is emptied, and says how', async () => {
      auth.user.phone = '+250788123456';
      open();
      expect(screen.getByText(/Leave it empty to remove your number\./)).toBeInTheDocument();
      fireEvent.change(phone(), { target: { value: '' } });
      fireEvent.click(save());
      await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ phone: null }));
    });

    it('is not saved again when it is only written another way', () => {
      auth.user.phone = '+250788123456';
      open();
      fireEvent.change(phone(), { target: { value: '0788 123 456 ' } });
      expect(save()).toBeDisabled();
    });

    it('says beside the field when the number is not a Rwandan mobile, and keeps what was typed', async () => {
      api.updateProfile.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, {
        status: 422, data: { code: 'invalid_phone', message: 'Please check what you entered.', errors: { phone: ['Enter a Rwandan mobile number, for example 0788 123 456.'] } },
      } as never));
      open();
      fireEvent.change(phone(), { target: { value: '12345' } });
      fireEvent.click(save());
      const message = await screen.findByText('Enter a Rwandan mobile number, for example 0788 123 456.');
      expect(message).toHaveAttribute('role', 'alert');
      expect(phone()).toHaveAttribute('aria-invalid', 'true');
      expect(phone()).toHaveValue('12345');
      expect(auth.updateUser).not.toHaveBeenCalled();
      fireEvent.change(phone(), { target: { value: '0788 123 456' } });
      expect(phone()).not.toHaveAttribute('aria-invalid', 'true');
    });
  });

  it('does not repeat the title of the page, which the Settings page already has', () => {
    open();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });
});
