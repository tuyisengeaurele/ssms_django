import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const auth = vi.hoisted(() => ({
  user: { id: 'c19de39a0e5czzvf7u2sak0w3ttf', name: 'Auris Tuyisenge', email: 'auris@ssms.com', role: 'ADMIN', cooperativeId: null as string | null, cooperativeName: null as string | null, createdAt: '2026-05-01T10:00:00Z' },
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

  it('does not repeat the title of the page, which the Settings page already has', () => {
    open();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });
});
