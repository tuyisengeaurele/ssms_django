import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';

const auth = vi.hoisted(() => ({ value: { user: { name: 'Gad', role: 'FARMER' }, logout: () => {} } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth.value }));

import { MessagesContext } from '../../context/MessagesContext';
import BottomNav from './BottomNav';
import Sidebar, { getNavGroups } from './Sidebar';

function draw(node: JSX.Element, unread: number, path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <MessagesContext.Provider value={{ unread, watch: () => () => {}, setUnread: () => {} }}>{node}</MessagesContext.Provider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

const sidebar = (unread: number) => draw(<Sidebar collapsed={false} mobileOpen={false} onMobileClose={() => {}} />, unread);
const bar = (unread: number, path = '/') => draw(<BottomNav onMore={() => {}} />, unread, path);
const messagesLink = () => document.querySelector<HTMLAnchorElement>('a[href="/messages"]')!;

beforeEach(() => {
  localStorage.clear();
  auth.value = { user: { name: 'Gad', role: 'FARMER' }, logout: () => {} };
});

describe.each(['FARMER', 'SUPERVISOR'])('The menu of a %s', (role) => {
  beforeEach(() => { auth.value = { user: { name: 'Gad', role }, logout: () => {} }; });

  it('has Messages among the first pages', () => {
    sidebar(0);
    const overview = screen.getByRole('group', { name: 'Overview' });
    expect(within(overview).getByRole('link', { name: 'Messages' })).toHaveAttribute('href', '/messages');
    expect(messagesLink().querySelector('.sidebar-badge')).toBeNull();
  });

  it.each([[3, '3', 'Messages, 3 unread'], [120, '99+', 'Messages, 99+ unread']])('shows %i unread as %s and says so', (count, shown, name) => {
    sidebar(count);
    expect(screen.getByRole('link', { name })).toHaveAttribute('href', '/messages');
    expect(messagesLink().querySelector('.sidebar-badge')).toHaveTextContent(shown);
  });

  it('has Messages in the bottom bar of a phone, with the count', () => {
    bar(3);
    const link = screen.getByRole('link', { name: 'Messages, 3 unread' });
    expect(link).toHaveAttribute('href', '/messages');
    expect(link.querySelector('.bottom-nav-badge')).toHaveTextContent('3');
  });

  it('shows no number in the bar when nothing is unread, and marks the page when open', () => {
    bar(0, '/messages');
    const link = screen.getByRole('link', { name: 'Messages' });
    expect(link).toHaveAttribute('aria-current', 'page');
    expect(link.querySelector('.bottom-nav-badge')).toBeNull();
  });
});

describe('Pages that left the bottom bar', () => {
  // They stay one tap away, under More, which opens the whole menu.
  it.each([['FARMER', '/batches'], ['SUPERVISOR', '/detections/reports']])('are still in the %s menu', (role, path) => {
    const paths = getNavGroups(role as 'FARMER', 0, (key) => key).flatMap((group) => group.items.map((item) => item.to));
    expect(paths).toContain(path);
  });
});

describe('The admin', () => {
  beforeEach(() => { auth.value = { user: { name: 'Aline', role: 'ADMIN' }, logout: () => {} }; });

  // The admin's Messages is the contact form inbox. There is no way into anybody's conversations.
  it('has no link to conversations, in the menu or in the bar', () => {
    sidebar(5);
    expect(messagesLink()).toBeNull();
    bar(5);
    expect(messagesLink()).toBeNull();
  });
});
