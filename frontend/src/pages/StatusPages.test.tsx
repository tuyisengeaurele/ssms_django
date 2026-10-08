import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../context/LanguageContext';

const auth = vi.hoisted(() => ({ value: { isAuthenticated: false, user: null as null | { role: string } } }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => auth.value }));

import NotFoundPage from './NotFoundPage';
import UnauthorizedPage from './UnauthorizedPage';

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function renderPage(page: JSX.Element, path = '/nowhere') {
  return render(
    <MemoryRouter initialEntries={['/start', path]} initialIndex={1}>
      <LanguageProvider>
        <Routes>
          <Route path="/nowhere" element={page} />
          <Route path="/unauthorized" element={page} />
          <Route path="*" element={<Where />} />
        </Routes>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  auth.value = { isAuthenticated: false, user: null };
});

describe('Not found page', () => {
  it('says the page is missing and keeps the site navigation and footer', () => {
    renderPage(<NotFoundPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'This page is not here.' })).toBeInTheDocument();
    expect(screen.getByText('The link may be old, or the address may have a typo.')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument();
  });

  it('offers the home page to a visitor', () => {
    renderPage(<NotFoundPage />);
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: 'Open dashboard' })).not.toBeInTheDocument();
  });

  it.each([
    ['ADMIN', '/admin'],
    ['SUPERVISOR', '/supervisor'],
    ['FARMER', '/farmer'],
  ])('offers the %s dashboard to a signed in person', (role, href) => {
    auth.value = { isAuthenticated: true, user: { role } };
    renderPage(<NotFoundPage />);
    expect(screen.getByRole('link', { name: 'Open dashboard' })).toHaveAttribute('href', href);
  });

  it('goes back one step', () => {
    renderPage(<NotFoundPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Go back' }));
    expect(screen.getByTestId('where')).toHaveTextContent('/start');
  });
});

describe('Access denied page', () => {
  it('explains that the account has no access and links home', () => {
    renderPage(<UnauthorizedPage />, '/unauthorized');
    expect(screen.getByRole('heading', { level: 1, name: "You can't open this page." })).toBeInTheDocument();
    expect(screen.getByText(/does not have access to it/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go home' })).toHaveAttribute('href', '/');
  });

  it('shows the French copy after a language change', () => {
    localStorage.setItem('ssms_locale', 'fr');
    renderPage(<UnauthorizedPage />, '/unauthorized');
    expect(screen.getByRole('heading', { level: 1, name: 'Vous ne pouvez pas ouvrir cette page.' })).toBeInTheDocument();
  });
});
