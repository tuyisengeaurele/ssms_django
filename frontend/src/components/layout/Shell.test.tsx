import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';

const auth = vi.hoisted(() => ({
  value: { user: { name: 'Auris Tuyisenge', role: 'ADMIN', email: 'auris@ssms.com' }, logout: vi.fn() } as {
    user: { name: string; role: string; email: string } | null;
    logout: ReturnType<typeof vi.fn>;
  },
}));

vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth.value }));
vi.mock('../../services/alert.service', () => ({
  alertService: { getAll: vi.fn().mockResolvedValue({ data: { data: [] } }) },
}));
vi.mock('../../services/contacts.service', () => ({
  contactsService: { getUnread: vi.fn().mockResolvedValue({ data: { data: { messages: [], count: 0 } } }) },
}));

import Sidebar from './Sidebar';
import TopBar from './TopBar';

function renderAt(path: string, node: JSX.Element) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>{node}</LanguageProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  auth.value = { user: { name: 'Auris Tuyisenge', role: 'ADMIN', email: 'auris@ssms.com' }, logout: vi.fn() };
});

const sidebar = (path = '/admin', alertCount = 0) =>
  renderAt(path, <Sidebar collapsed={false} mobileOpen={false} onMobileClose={() => {}} alertCount={alertCount} />);

describe('Sidebar for an administrator', () => {
  it('groups the menu under plain headings', () => {
    sidebar();
    const nav = screen.getByRole('navigation', { name: 'Main menu' });
    const groups = within(nav).getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Overview', 'People', 'Farming', 'System']);
  });

  it('lists every admin page in order', () => {
    sidebar();
    const nav = screen.getByRole('navigation', { name: 'Main menu' });
    const names = within(nav).getAllByRole('link').map((a) => a.textContent?.replace(/\d+$/, '').trim());
    expect(names).toEqual([
      'Dashboard', 'System overview',
      'Users', 'Cooperatives', 'Messages',
      'Farms', 'Harvests', 'Detection reports', 'Devices',
      'Alerts', 'Cooperative report', 'Audit log', 'System report', 'Safe ranges', 'System health',
    ]);
  });

  it('marks the page you are on', () => {
    sidebar('/admin/users');
    expect(screen.getByRole('link', { name: 'Users' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('shows the unread alert count and says what it means', () => {
    sidebar('/admin', 82);
    const link = screen.getByRole('link', { name: /Alerts/ });
    expect(link).toHaveTextContent('82');
    expect(within(link).getByText('82')).toHaveAttribute('aria-label', '82 unread');
  });

  it('leaves the profile to the top bar', () => {
    const { container } = sidebar();
    expect(screen.queryByText('Auris Tuyisenge')).not.toBeInTheDocument();
    expect(screen.queryByText('Administrator')).not.toBeInTheDocument();
    expect(container.querySelector('.sidebar-user, .sidebar-footer')).toBeNull();
  });

  it('ends the list with Sign Out, in the same list as the pages', () => {
    sidebar();
    const nav = screen.getByRole('navigation', { name: 'Main menu' });
    const links = within(nav).getAllByRole('link');
    const buttons = within(nav).getAllByRole('button');
    const signOut = buttons[buttons.length - 1];
    expect(signOut).toHaveAccessibleName('Sign Out');
    expect(signOut.closest('[role="group"]')).toBe(links[links.length - 1].closest('[role="group"]'));
  });

  it('gives every item a tooltip name for the narrow rail', () => {
    renderAt('/admin', <Sidebar collapsed mobileOpen={false} onMobileClose={() => {}} alertCount={0} />);
    const nav = screen.getByRole('navigation', { name: 'Main menu' });
    for (const link of within(nav).getAllByRole('link')) {
      expect(link).toHaveAttribute('data-tip', link.getAttribute('aria-label'));
      expect(link.getAttribute('aria-label')).toBeTruthy();
    }
    const buttons = within(nav).getAllByRole('button');
    expect(buttons[buttons.length - 1]).toHaveAttribute('data-tip', 'Sign Out');
  });

  it('asks before signing out', () => {
    sidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Sign Out' }));
    expect(auth.value.logout).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Sign Out' }));
    expect(auth.value.logout).toHaveBeenCalledTimes(1);
  });
});

describe('Sidebar for other roles', () => {
  it('gives a farmer only farming pages', () => {
    auth.value = { user: { name: 'Gad', role: 'FARMER', email: 'g@x.rw' }, logout: vi.fn() };
    sidebar('/farmer');
    expect(screen.getByRole('link', { name: 'My Farms' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Users' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Audit log' })).not.toBeInTheDocument();
  });

  it('gives a supervisor the overview', () => {
    auth.value = { user: { name: 'Sup', role: 'SUPERVISOR', email: 's@x.rw' }, logout: vi.fn() };
    sidebar('/supervisor');
    expect(screen.getByRole('link', { name: 'System overview' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cooperatives' })).not.toBeInTheDocument();
  });

  it('gives a supervisor their farmers, and nobody else', () => {
    auth.value = { user: { name: 'Sup', role: 'SUPERVISOR', email: 's@x.rw' }, logout: vi.fn() };
    sidebar('/supervisor');
    expect(screen.getByRole('link', { name: 'My farmers' })).toHaveAttribute('href', '/supervisor/farmers');
  });

  it('gives a supervisor and an admin the cooperative report, and a farmer not', () => {
    auth.value = { user: { name: 'Sup', role: 'SUPERVISOR', email: 's@x.rw' }, logout: vi.fn() };
    const view = sidebar('/supervisor');
    expect(screen.getByRole('link', { name: 'Cooperative report' })).toHaveAttribute('href', '/reports/cooperative');
    view.unmount();
    auth.value = { user: { name: 'Far', role: 'FARMER', email: 'f@x.rw' }, logout: vi.fn() };
    sidebar('/farmer');
    expect(screen.queryByRole('link', { name: 'Cooperative report' })).not.toBeInTheDocument();
  });

  it('does not show My farmers to a farmer or an admin', () => {
    auth.value = { user: { name: 'Far', role: 'FARMER', email: 'f@x.rw' }, logout: vi.fn() };
    sidebar('/farmer');
    expect(screen.queryByRole('link', { name: 'My farmers' })).not.toBeInTheDocument();
  });
});

describe('TopBar', () => {
  const topbar = (path: string, alertCount = 0) => renderAt(path, <TopBar onMenuToggle={() => {}} alertCount={alertCount} />);

  it('names the section and the page you are on', () => {
    topbar('/admin/cooperatives');
    expect(screen.getByText('Administration')).toBeInTheDocument();
    expect(screen.getByTestId('page-title')).toHaveTextContent('Cooperatives');
  });

  it('changes with the page and the language', () => {
    localStorage.setItem('ssms_locale', 'fr');
    topbar('/admin/audit-log');
    expect(screen.getByTestId('page-title')).toHaveTextContent("Journal d'audit");
  });

  it('does not add a second page heading', () => {
    topbar('/admin/users');
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('opens the menu and closes the notifications from the keyboard', () => {
    const onMenuToggle = vi.fn();
    renderAt('/admin', <TopBar onMenuToggle={onMenuToggle} alertCount={3} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(onMenuToggle).toHaveBeenCalled();
    const bell = screen.getByRole('button', { name: /Notifications/ });
    expect(bell).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(bell);
    expect(bell).toHaveAttribute('aria-expanded', 'true');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(bell).toHaveAttribute('aria-expanded', 'false');
  });

  it('lets the person change language', () => {
    topbar('/admin');
    fireEvent.change(screen.getByRole('combobox', { name: 'Language' }), { target: { value: 'fr' } });
    expect(localStorage.getItem('ssms_locale')).toBe('fr');
  });

  it('shows the account menu with profile and sign out', () => {
    topbar('/admin');
    const trigger = screen.getByRole('button', { name: /Auris Tuyisenge/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(trigger);
    expect(screen.getByRole('menuitem', { name: 'My Profile' })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('menuitem', { name: 'Sign Out' })).toBeInTheDocument();
  });
});
