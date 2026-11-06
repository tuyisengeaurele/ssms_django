import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '../../types';
import { setAccessToken } from '../../services/session';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../../services/api', () => ({ default: api }));
vi.mock('../../services/auth.service', () => ({ authService: { logout: vi.fn().mockResolvedValue(undefined) } }));

import { AuthProvider, useAuth } from '../../context/AuthContext';
import ProtectedRoute from './ProtectedRoute';

const admin = { id: 'a1', name: 'Ange Admin', email: 'admin@example.rw', role: 'ADMIN' } as User;
const aline = { id: 'p1', name: 'Aline Uwase', email: 'aline@example.rw', role: 'FARMER' } as User;
const info = { id: 's1', mode: 'view' as const, endsAt: '2026-11-06T12:00:00Z' };

/** Buttons that sign in, move around and switch, the way the pages do, inside real routes and the real guard. */
function Controls() {
  const { login, startActing, stopActing } = useAuth();
  const navigate = useNavigate();
  return (
    <div>
      <button onClick={() => login(admin, 'admin.token')}>admin in</button>
      <button onClick={() => navigate('/admin/users')}>go to users</button>
      <button onClick={() => navigate('/farmer')}>go to farmer</button>
      <button onClick={() => { startActing('support.token', info).catch(() => undefined); }}>start</button>
      <button onClick={() => stopActing()}>stop</button>
    </div>
  );
}

function open() {
  render(
    <AuthProvider>
      <MemoryRouter initialEntries={['/login']}>
        <Controls />
        <Routes>
          <Route element={<ProtectedRoute allowedRoles={['ADMIN']} />}>
            <Route path="/admin/users" element={<p>Users page</p>} />
          </Route>
          <Route element={<ProtectedRoute allowedRoles={['FARMER']} />}>
            <Route path="/farmer" element={<p>Farmer dashboard</p>} />
          </Route>
          <Route path="/app" element={<p>Home of whoever is signed in</p>} />
          <Route path="/unauthorized" element={<p>Not allowed here</p>} />
          <Route path="/login" element={<p>Login page</p>} />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  setAccessToken(null);
  api.get.mockResolvedValue({ data: { data: aline } });
});

describe('The route guard while an admin starts or stops acting', () => {
  it('still sends a person to "not allowed" for a page their role may not open, as always', async () => {
    open();
    await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument());
    fireEvent.click(screen.getByText('admin in'));
    fireEvent.click(screen.getByText('go to farmer'));
    await waitFor(() => expect(screen.getByText('Not allowed here')).toBeInTheDocument());
  });

  it('sends the person to a home page, not to "not allowed", when the visit starts on an admin only page', async () => {
    open();
    await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument());
    fireEvent.click(screen.getByText('admin in'));
    fireEvent.click(screen.getByText('go to users'));
    expect(await screen.findByText('Users page')).toBeInTheDocument();

    fireEvent.click(screen.getByText('start'));
    expect(await screen.findByText('Home of whoever is signed in')).toBeInTheDocument();
    expect(screen.queryByText('Not allowed here')).not.toBeInTheDocument();
  });

  it('sends the admin to a home page, not to "not allowed", when the visit ends on a page only the person may open', async () => {
    open();
    await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument());
    fireEvent.click(screen.getByText('admin in'));
    fireEvent.click(screen.getByText('go to users'));
    await screen.findByText('Users page');
    fireEvent.click(screen.getByText('start'));
    await screen.findByText('Home of whoever is signed in');
    fireEvent.click(screen.getByText('go to farmer'));
    expect(await screen.findByText('Farmer dashboard')).toBeInTheDocument();

    fireEvent.click(screen.getByText('stop'));
    expect(await screen.findByText('Home of whoever is signed in')).toBeInTheDocument();
    expect(screen.queryByText('Not allowed here')).not.toBeInTheDocument();
  });

  it('goes back to being strict once the switch is done', async () => {
    open();
    await waitFor(() => expect(screen.getByText('Login page')).toBeInTheDocument());
    fireEvent.click(screen.getByText('admin in'));
    fireEvent.click(screen.getByText('go to users'));
    await screen.findByText('Users page');
    fireEvent.click(screen.getByText('start'));
    await screen.findByText('Home of whoever is signed in');
    // Once the moment of the switch has passed, the person asks for an admin page by hand. That is a real mismatch.
    await new Promise((resolve) => setTimeout(resolve, 1700));
    fireEvent.click(screen.getByText('go to users'));
    expect(await screen.findByText('Not allowed here')).toBeInTheDocument();
  }, 8000);
});
