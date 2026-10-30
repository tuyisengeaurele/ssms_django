import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({ value: { user: null, isAuthenticated: false, isLoading: false } as { user: { role: string } | null; isAuthenticated: boolean; isLoading: boolean } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth.value }));

import AppHome from './AppHome';

function open() {
  return render(
    <MemoryRouter initialEntries={['/app']}>
      <Routes>
        <Route path="/app" element={<AppHome />} />
        <Route path="/login" element={<p>Login page</p>} />
        <Route path="/admin" element={<p>Admin home</p>} />
        <Route path="/supervisor" element={<p>Supervisor home</p>} />
        <Route path="/farmer" element={<p>Farmer home</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  auth.value = { user: null, isAuthenticated: false, isLoading: false };
});

describe('AppHome, the page an installed app opens', () => {
  it('waits while the sign in is being restored, and goes nowhere yet', () => {
    auth.value = { user: null, isAuthenticated: false, isLoading: true };
    open();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
    expect(screen.queryByText('Farmer home')).not.toBeInTheDocument();
  });

  it('sends someone who is not signed in to the login page', () => {
    open();
    expect(screen.getByText('Login page')).toBeInTheDocument();
  });

  it.each([
    ['ADMIN', 'Admin home'],
    ['SUPERVISOR', 'Supervisor home'],
    ['FARMER', 'Farmer home'],
  ])('sends a signed in %s to their own home', (role, text) => {
    auth.value = { user: { role }, isAuthenticated: true, isLoading: false };
    open();
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});
