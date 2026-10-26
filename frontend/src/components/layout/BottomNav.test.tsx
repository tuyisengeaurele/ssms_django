import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';

const auth = vi.hoisted(() => ({ value: { user: { name: 'Gad', role: 'FARMER' } } as { user: { name: string; role: string } | null } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth.value }));

import BottomNav from './BottomNav';

function renderAt(path: string, onMore = () => {}, alertCount = 0) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <BottomNav alertCount={alertCount} onMore={onMore} />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  auth.value = { user: { name: 'Gad', role: 'FARMER' } };
});

const names = () => within(screen.getByRole('navigation', { name: 'Quick menu' })).getAllByRole('link').map((a) => a.getAttribute('aria-label'));

describe('Bottom tab bar', () => {
  it('gives a farmer the four pages they use most, then More', () => {
    renderAt('/farmer');
    expect(names()).toEqual(['Dashboard', 'My Farms', 'Batches', 'Alerts']);
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
  });

  it('gives a supervisor their own four', () => {
    auth.value = { user: { name: 'Sup', role: 'SUPERVISOR' } };
    renderAt('/supervisor');
    expect(names()).toEqual(['System overview', 'Farms', 'Detection reports', 'Alerts']);
  });

  it('gives an administrator their own four', () => {
    auth.value = { user: { name: 'Auris', role: 'ADMIN' } };
    renderAt('/admin');
    expect(names()).toEqual(['Dashboard', 'Users', 'Farms', 'Alerts']);
  });

  it('marks the page you are on', () => {
    renderAt('/batches');
    expect(screen.getByRole('link', { name: 'Batches' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'My Farms' })).not.toHaveAttribute('aria-current');
  });

  it('shows how many alerts are waiting, and says what the number means', () => {
    renderAt('/farmer', () => {}, 7);
    const link = screen.getByRole('link', { name: 'Alerts' });
    expect(within(link).getByText('7')).toHaveAttribute('aria-label', '7 unread');
  });

  it('opens the full menu from More', () => {
    const onMore = vi.fn();
    renderAt('/farmer', onMore);
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(onMore).toHaveBeenCalledTimes(1);
  });

  it('shows nothing before anyone is signed in', () => {
    auth.value = { user: null };
    const { container } = renderAt('/login');
    expect(container).toBeEmptyDOMElement();
  });
});
