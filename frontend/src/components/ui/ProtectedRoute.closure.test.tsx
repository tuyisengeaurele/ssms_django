import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';

const auth = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth.value }));
vi.mock('../../services/account.service', () => ({ accountService: { cancelClosure: vi.fn() } }));
vi.mock('../../services/auth.service', () => ({ authService: { updateProfile: vi.fn() } }));

import ProtectedRoute from './ProtectedRoute';

const farmer = { id: 'u1', name: 'Aline', email: 'a@b.rw', role: 'FARMER' };

function open() {
  return render(
    <MemoryRouter initialEntries={['/farmer']}>
      <LanguageProvider>
        <Routes>
          <Route element={<ProtectedRoute allowedRoles={['FARMER']} />}>
            <Route path="/farmer" element={<p>Farmer dashboard</p>} />
          </Route>
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.value = { user: farmer, isAuthenticated: true, isLoading: false, switching: false, acting: null, updateUser: vi.fn(), logout: vi.fn() };
});

describe('The route guard and a scheduled closure', () => {
  it('shows the closure screen instead of the page when the account is scheduled to be removed', async () => {
    auth.value = { ...auth.value, user: { ...farmer, deletionDate: '2026-12-24' } };
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Your account will be removed' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText('Farmer dashboard')).not.toBeInTheDocument();
  });

  it('shows the closure screen before the phone screen when the account has both reasons', async () => {
    auth.value = { ...auth.value, user: { ...farmer, deletionDate: '2026-12-24', phoneRequired: true } };
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Your account will be removed' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Add your phone number' })).not.toBeInTheDocument();
  });

  it('shows the page when no closure is scheduled', () => {
    auth.value = { ...auth.value, user: { ...farmer, deletionDate: null } };
    open();
    expect(screen.getByText('Farmer dashboard')).toBeInTheDocument();
  });

  it('does not stop an administrator who is looking at the account with its consent', () => {
    auth.value = { ...auth.value, user: { ...farmer, deletionDate: '2026-12-24' }, acting: { id: 's1', mode: 'view', endsAt: '2026-11-06T12:00:00Z', person: farmer } };
    open();
    expect(screen.getByText('Farmer dashboard')).toBeInTheDocument();
  });
});
