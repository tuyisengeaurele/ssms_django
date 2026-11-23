import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';

const auth = vi.hoisted(() => ({
  value: {} as Record<string, unknown>,
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth.value }));
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

describe('The route guard and the phone number', () => {
  it('shows the gate instead of the page when the account has no number', async () => {
    auth.value = { ...auth.value, user: { ...farmer, phoneRequired: true } };
    open();
    // The gate is loaded on demand, so a busy machine can take longer than the default second.
    expect(await screen.findByRole('heading', { level: 1, name: 'Add your phone number' }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByText('Farmer dashboard')).not.toBeInTheDocument();
  });

  it('shows the page when the account has a number', () => {
    auth.value = { ...auth.value, user: { ...farmer, phoneRequired: false } };
    open();
    expect(screen.getByText('Farmer dashboard')).toBeInTheDocument();
  });

  it('shows the page when the answer says nothing about it, as an older server does', () => {
    open();
    expect(screen.getByText('Farmer dashboard')).toBeInTheDocument();
  });

  it('does not stop an administrator who is looking at the account with its consent', () => {
    auth.value = { ...auth.value, user: { ...farmer, phoneRequired: true }, acting: { id: 's1', mode: 'view', endsAt: '2026-11-06T12:00:00Z', person: farmer } };
    open();
    expect(screen.getByText('Farmer dashboard')).toBeInTheDocument();
  });

  it('still sends a signed out visitor to sign in', () => {
    auth.value = { ...auth.value, user: null, isAuthenticated: false };
    open();
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });
});
