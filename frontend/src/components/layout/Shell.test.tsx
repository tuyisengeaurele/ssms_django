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

import { reloadThemeChoice } from '../../utils/theme';
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
  reloadThemeChoice();
  auth.value = { user: { name: 'Auris Tuyisenge', role: 'ADMIN', email: 'auris@ssms.com' }, logout: vi.fn() };
});

const sidebar = (path = '/admin', alertCount = 0, decisionCount = 0) =>
  renderAt(path, <Sidebar collapsed={false} mobileOpen={false} onMobileClose={() => {}} alertCount={alertCount} decisionCount={decisionCount} />);

describe('Sidebar for an administrator', () => {
  it('groups the menu under plain headings', () => {
    sidebar();
    const nav = screen.getByRole('navigation', { name: 'Main menu' });
    const groups = within(nav).getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Overview', 'Farming', 'Administration', 'Account']);
  });

  it('lists every admin page in order', () => {
    sidebar();
    const nav = screen.getByRole('navigation', { name: 'Main menu' });
    const names = within(nav).getAllByRole('link').map((a) => a.textContent?.replace(/\d+$/, '').trim());
    expect(names).toEqual([
      'Dashboard', 'Decisions', 'Farm monitoring',
      'Farms', 'Harvests', 'Disease checks', 'Devices', 'Alerts',
      'Users', 'Cooperatives', 'Messages', 'System',
      'Settings',
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

describe('The admin menu after the cleanup', () => {
  it('has 12 pages and Settings, the Decisions page included', () => {
    sidebar();
    const nav = screen.getByRole('navigation', { name: 'Main menu' });
    expect(within(nav).getAllByRole('link')).toHaveLength(13);
  });

  it('shows the all-farms view as Farm monitoring, at the address the supervisor dashboard has', () => {
    sidebar('/supervisor');
    const link = screen.getByRole('link', { name: 'Farm monitoring' });
    expect(link).toHaveAttribute('href', '/supervisor');
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'System overview' })).not.toBeInTheDocument();
  });

  it('has one System link in place of Audit log, System report and System health', () => {
    sidebar('/admin');
    expect(screen.getByRole('link', { name: 'System' })).toHaveAttribute('href', '/admin/system');
    for (const name of ['Audit log', 'System report', 'System health']) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
    }
  });

  it.each(['/admin/system/health', '/admin/system/logs', '/admin/system/activity'])('keeps System marked on %s', (path) => {
    sidebar(path);
    expect(screen.getByRole('link', { name: 'System' })).toHaveAttribute('aria-current', 'page');
  });

  it('puts the admin pages in a group called Administration', () => {
    sidebar();
    const group = screen.getByRole('group', { name: 'Administration' });
    expect(within(group).getAllByRole('link').map((a) => a.textContent)).toEqual(['Users', 'Cooperatives', 'Messages', 'System']);
  });
});

describe('The Decisions item', () => {
  it.each(['SUPERVISOR', 'ADMIN'])('is in the %s menu right under the dashboard and goes to the Decisions page', (role) => {
    auth.value = { user: { name: 'Someone', role, email: 'a@x.rw' }, logout: vi.fn() };
    sidebar('/supervisor');
    const nav = screen.getByRole('navigation', { name: 'Main menu' });
    const names = within(nav).getAllByRole('link').map((a) => a.getAttribute('aria-label'));
    expect(names.indexOf('Decisions')).toBe(names.indexOf('Dashboard') + 1);
    expect(screen.getByRole('link', { name: 'Decisions' })).toHaveAttribute('href', '/decisions');
  });

  it('is not in a farmer menu', () => {
    auth.value = { user: { name: 'Farmer', role: 'FARMER', email: 'f@x.rw' }, logout: vi.fn() };
    sidebar('/farmer');
    expect(screen.queryByRole('link', { name: 'Decisions' })).not.toBeInTheDocument();
  });

  it('shows how many wait, in words for a screen reader, and nothing at zero', () => {
    auth.value = { user: { name: 'Sup', role: 'SUPERVISOR', email: 's@x.rw' }, logout: vi.fn() };
    const first = sidebar('/supervisor', 0, 3);
    expect(screen.getByLabelText('3 waiting')).toHaveTextContent('3');
    first.unmount();
    sidebar('/supervisor', 0, 0);
    expect(screen.queryByLabelText(/waiting/)).not.toBeInTheDocument();
  });

  it('caps a long count at 99+', () => {
    auth.value = { user: { name: 'Sup', role: 'SUPERVISOR', email: 's@x.rw' }, logout: vi.fn() };
    sidebar('/supervisor', 0, 120);
    expect(screen.getByLabelText('99+ waiting')).toHaveTextContent('99+');
  });
});

describe('The supervisor and farmer menus after the cleanup', () => {
  it('calls the supervisor landing page Dashboard, and no longer System overview', () => {
    auth.value = { user: { name: 'Sup', role: 'SUPERVISOR', email: 's@x.rw' }, logout: vi.fn() };
    sidebar('/supervisor');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/supervisor');
    expect(screen.queryByRole('link', { name: 'System overview' })).not.toBeInTheDocument();
  });

  it.each(['SUPERVISOR', 'FARMER', 'ADMIN'])('calls the disease checks page Disease checks for a %s', (role) => {
    auth.value = { user: { name: 'Someone', role, email: 'a@x.rw' }, logout: vi.fn() };
    sidebar('/farmer');
    expect(screen.getByRole('link', { name: 'Disease checks' })).toHaveAttribute('href', '/detections/reports');
    expect(screen.queryByRole('link', { name: 'Detection reports' })).not.toBeInTheDocument();
  });
});

describe('Settings in the sidebar', () => {
  it.each([['FARMER', '/farmer'], ['SUPERVISOR', '/supervisor'], ['ADMIN', '/admin']])('ends the %s menu with Settings', (role, path) => {
    auth.value = { user: { name: 'Someone', role, email: 'a@x.rw' }, logout: vi.fn() };
    sidebar(path);
    const nav = screen.getByRole('navigation', { name: 'Main menu' });
    const links = within(nav).getAllByRole('link');
    expect(links[links.length - 1]).toHaveAccessibleName('Settings');
    expect(links[links.length - 1]).toHaveAttribute('href', '/settings');
  });

  it('keeps Settings marked on every section of the Settings page', () => {
    sidebar('/settings/security');
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');
  });

  it('does not mark Settings on other pages', () => {
    sidebar('/admin/users');
    expect(screen.getByRole('link', { name: 'Settings' })).not.toHaveAttribute('aria-current');
  });

  it('no longer lists Safe ranges as a page of its own, because it lives in Settings', () => {
    sidebar('/admin');
    expect(screen.queryByRole('link', { name: 'Safe ranges' })).not.toBeInTheDocument();
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

  it('gives a supervisor the dashboard', () => {
    auth.value = { user: { name: 'Sup', role: 'SUPERVISOR', email: 's@x.rw' }, logout: vi.fn() };
    sidebar('/supervisor');
    expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cooperatives' })).not.toBeInTheDocument();
  });

  it('gives a supervisor My cooperative, which holds their farmers and their report', () => {
    auth.value = { user: { name: 'Sup', role: 'SUPERVISOR', email: 's@x.rw' }, logout: vi.fn() };
    sidebar('/supervisor/cooperative');
    const link = screen.getByRole('link', { name: 'My cooperative' });
    expect(link).toHaveAttribute('href', '/supervisor/cooperative');
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('keeps My cooperative marked on each of its sections', () => {
    auth.value = { user: { name: 'Sup', role: 'SUPERVISOR', email: 's@x.rw' }, logout: vi.fn() };
    sidebar('/supervisor/cooperative/farmers');
    expect(screen.getByRole('link', { name: 'My cooperative' })).toHaveAttribute('aria-current', 'page');
  });

  it('has no separate cooperative report or My farmers link for anyone, because both are in the cooperative page', () => {
    for (const role of ['SUPERVISOR', 'ADMIN', 'FARMER']) {
      auth.value = { user: { name: 'Someone', role, email: 'a@x.rw' }, logout: vi.fn() };
      const view = sidebar('/farmer');
      expect(screen.queryByRole('link', { name: 'Cooperative report' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'My farmers' })).not.toBeInTheDocument();
      view.unmount();
    }
  });

  it('keeps Cooperatives marked on one cooperative of the admin', () => {
    sidebar('/admin/cooperatives/abc123/members');
    expect(screen.getByRole('link', { name: 'Cooperatives' })).toHaveAttribute('aria-current', 'page');
  });

  it('does not show My cooperative to a farmer or an admin', () => {
    for (const role of ['FARMER', 'ADMIN']) {
      auth.value = { user: { name: 'Someone', role, email: 'a@x.rw' }, logout: vi.fn() };
      const view = sidebar('/farmer');
      expect(screen.queryByRole('link', { name: 'My cooperative' })).not.toBeInTheDocument();
      view.unmount();
    }
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
    topbar('/admin/system/logs');
    expect(screen.getByTestId('page-title')).toHaveTextContent('Système');
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

  it('lets the person change language from the small switcher', () => {
    topbar('/admin');
    expect(screen.queryByRole('combobox', { name: 'Language' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Français' }));
    expect(localStorage.getItem('ssms_locale')).toBe('fr');
    expect(screen.getByRole('button', { name: 'Français' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows the person as one link to Settings, with no menu to open', () => {
    topbar('/admin');
    const link = screen.getByRole('link', { name: /Auris Tuyisenge/ });
    expect(link).toHaveAttribute('href', '/settings/account');
    expect(link).toHaveTextContent('Auris Tuyisenge');
    expect(link).toHaveTextContent('Administrator');
    fireEvent.click(link);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Auris Tuyisenge/ })).not.toBeInTheDocument();
  });

  it('says in its name that the link opens Settings', () => {
    topbar('/admin');
    expect(screen.getByRole('link', { name: 'Auris Tuyisenge, Settings' })).toBeInTheDocument();
  });

  it('keeps Sign Out in the sidebar only, and no second Alerts link beside the bell', () => {
    topbar('/admin');
    expect(screen.queryByRole('button', { name: 'Sign Out' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Alerts' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Notifications/ })).toBeInTheDocument();
  });

  it('reads in French', () => {
    localStorage.setItem('ssms_locale', 'fr');
    topbar('/admin');
    expect(screen.getByRole('link', { name: 'Auris Tuyisenge, Paramètres' })).toHaveAttribute('href', '/settings/account');
  });
});
