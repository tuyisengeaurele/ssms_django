import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Auris Tuyisenge', role: 'ADMIN', email: 'a@x.rw' }, logout: vi.fn() }),
}));
vi.mock('../../services/alert.service', () => ({ alertService: { getAll: vi.fn().mockResolvedValue({ data: { data: [] } }) } }));
vi.mock('../../services/contacts.service', () => ({
  contactsService: { getUnread: vi.fn().mockResolvedValue({ data: { data: { messages: [], count: 0 } } }) },
}));

import DashboardLayout from './DashboardLayout';

function open() {
  return render(
    <MemoryRouter initialEntries={['/admin']}>
      <LanguageProvider>
        <Routes>
          <Route element={<DashboardLayout />}>
            <Route path="/admin" element={<p>Page body</p>} />
          </Route>
        </Routes>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

const width = (px: number) => Object.defineProperty(window, 'innerWidth', { value: px, configurable: true, writable: true });
const rail = (container: HTMLElement) => container.querySelector('.app-sidebar')?.classList.contains('collapsed');

beforeEach(() => {
  localStorage.clear();
  setReducedMotion(true);
});
afterEach(() => width(1024));

describe('Navigation rail', () => {
  it('starts as a narrow icon rail on a laptop screen', () => {
    width(1280);
    const { container } = open();
    expect(rail(container)).toBe(true);
    expect(container.querySelector('.app-main')).toHaveClass('sidebar-collapsed');
  });

  it('starts open on a wide screen', () => {
    width(1700);
    expect(rail(open().container)).toBe(false);
  });

  it('opens from the top bar button and remembers the choice', () => {
    width(1280);
    const { container } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(rail(container)).toBe(false);
    expect(localStorage.getItem('ssms_nav')).toBe('open');
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(rail(container)).toBe(true);
    expect(localStorage.getItem('ssms_nav')).toBe('rail');
  });

  it('keeps what the person chose, whatever the screen width', () => {
    width(1700);
    localStorage.setItem('ssms_nav', 'rail');
    expect(rail(open().container)).toBe(true);
  });

  it('keeps the rail open when the person pinned it on a small screen', () => {
    width(1280);
    localStorage.setItem('ssms_nav', 'open');
    expect(rail(open().container)).toBe(false);
  });

  it('shows the quick bar for phones next to the page', () => {
    width(390);
    open();
    expect(screen.getByRole('navigation', { name: 'Quick menu' })).toBeInTheDocument();
    expect(screen.getByText('Page body')).toBeInTheDocument();
  });

  it('opens the full menu from More on a phone', () => {
    width(390);
    const { container } = open();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(container.querySelector('.app-sidebar')).toHaveClass('mobile-open');
  });
});
