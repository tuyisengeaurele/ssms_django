import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { getAccessToken } from '../../services/session';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ changePassword: vi.fn() }));
vi.mock('../../services/auth.service', () => ({ authService: api }));
const who = vi.hoisted(() => ({ role: 'FARMER', acting: false }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', role: who.role }, acting: who.acting ? { id: 's1' } : null }),
}));
vi.mock('../../services/mfa.service', () => ({
  mfaService: { status: vi.fn().mockResolvedValue({ data: { data: { enabled: true, enabledAt: '2026-11-05T10:00:00Z', recoveryCodesLeft: 8 } } }) },
}));
vi.mock('../../services/support.service', () => ({
  supportService: { history: vi.fn().mockResolvedValue({ data: { data: [] } }) },
}));
vi.mock('../../services/sessions.service', () => ({
  sessionsService: { list: vi.fn().mockResolvedValue({ data: { data: [] } }) },
}));

import SecuritySettings from './SecuritySettings';

function open() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <SecuritySettings />
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
  who.role = 'FARMER';
  api.changePassword.mockResolvedValue({ data: { data: { token: 'fresh-jwt' } } });
});

describe('Security settings, SSMS support visits', () => {
  it.each(['FARMER', 'SUPERVISOR'])('lists the visits of SSMS support for a %s', async (role) => {
    who.role = role;
    open();
    expect(await screen.findByRole('heading', { level: 2, name: 'SSMS support visits' })).toBeInTheDocument();
    expect(await screen.findByText('No one from SSMS support has asked to view your account.')).toBeInTheDocument();
  });

  it('does not show the list while an admin acts as the person, because the server refuses it to them', async () => {
    who.role = 'FARMER';
    who.acting = true;
    open();
    await screen.findByRole('heading', { level: 2, name: 'Signed in devices' });
    expect(screen.queryByRole('heading', { name: 'SSMS support visits' })).not.toBeInTheDocument();
    who.acting = false;
  });

  it('does not show the list to an admin, who is never the one asked', async () => {
    who.role = 'ADMIN';
    open();
    await screen.findByRole('heading', { level: 2, name: 'Signed in devices' });
    expect(screen.queryByRole('heading', { name: 'SSMS support visits' })).not.toBeInTheDocument();
  });
});

describe('Security settings', () => {
  it('holds the password and the signed in devices', async () => {
    open();
    expect(screen.getByRole('heading', { level: 2, name: 'Password' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 2, name: 'Signed in devices' })).toBeInTheDocument();
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
    // The server ended every other session, so this device keeps the fresh one it was given.
    expect(getAccessToken()).toBe('fresh-jwt');
    expect(JSON.stringify({ ...localStorage, ...sessionStorage })).not.toContain('fresh-jwt');
  });

  it('closes the password form on Cancel without sending anything', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it('shows an admin the authenticator app next to the password', async () => {
    who.role = 'ADMIN';
    open();
    expect(await screen.findByRole('heading', { level: 2, name: 'Authenticator app' })).toBeInTheDocument();
  });

  it.each(['FARMER', 'SUPERVISOR'])('does not show a %s the authenticator app', async (role) => {
    who.role = role;
    open();
    await screen.findByRole('heading', { level: 2, name: 'Signed in devices' });
    expect(screen.queryByRole('heading', { name: 'Authenticator app' })).not.toBeInTheDocument();
  });
});
