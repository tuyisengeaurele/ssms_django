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

const api = vi.hoisted(() => ({ updateProfile: vi.fn(), changePassword: vi.fn() }));
vi.mock('../../services/auth.service', () => ({ authService: api }));

import ProfilePage from './ProfilePage';

function open() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <ProfilePage />
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
  api.changePassword.mockResolvedValue({ data: { data: null } });
});

describe('Profile page', () => {
  it('has one title and refreshes the account from the server', () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByText('See and update your account details.')).toBeInTheDocument();
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
    expect(screen.getByText('You cannot change your email here. Ask an administrator if it needs to change.')).toBeInTheDocument();
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

  it('changes the password after checking the two new ones match', async () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    fireEvent.change(screen.getByLabelText('Current password'), { target: { value: 'Old12345' } });
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'NewPass123' } });
    fireEvent.change(screen.getByLabelText('Repeat the new password'), { target: { value: 'Different1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    expect(screen.getByRole('alert')).toHaveTextContent("The two passwords don't match.");
    expect(api.changePassword).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Repeat the new password'), { target: { value: 'NewPass123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() => expect(api.changePassword).toHaveBeenCalledWith({ currentPassword: 'Old12345', newPassword: 'NewPass123', confirmPassword: 'NewPass123' }));
    await waitFor(() => expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument());
  });

  it('lets the person pick a language and shows which one is on', () => {
    open();
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(localStorage.getItem('ssms_locale')).toBe('fr');
    expect(screen.getByRole('button', { name: 'Français' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('uses no technical wording and no old gradients', () => {
    const { container } = open();
    expect(container.textContent).not.toMatch(/JWT|token/i);
    expect(container.innerHTML.toLowerCase()).not.toMatch(/gradient|#7c3aed|#d97706|#f3e8ff/);
  });
});
