import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import type { Announcement } from '../../types';

// Where the banners sit on each kind of page, and which way each one asks.

const service = vi.hoisted(() => ({ current: vi.fn(), visitor: vi.fn() }));
vi.mock('../../services/announcement.service', () => ({ announcementService: service }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Aline', role: 'FARMER', email: 'a@x.rw', cooperativeId: null }, logout: () => {}, acting: false }),
}));
vi.mock('../../services/alert.service', () => ({ alertService: { getAll: vi.fn().mockResolvedValue({ data: { data: [] } }) } }));
vi.mock('../../services/sessions.service', () => ({ sessionsService: { ping: vi.fn().mockReturnValue(new Promise(() => {})) } }));
vi.mock('../../services/support.service', () => ({ supportService: { pending: vi.fn().mockReturnValue(new Promise(() => {})) } }));
vi.mock('../../services/farm.service', () => ({ farmService: { getAll: vi.fn().mockReturnValue(new Promise(() => {})) } }));

import { AuthShell } from '../../landing/auth/AuthShell';
import { Nav } from '../../landing/Nav';
import { renderLanding } from '../../entry-server';
import { setAccessToken } from '../../services/session';
import DashboardLayout from '../layout/DashboardLayout';

const row: Announcement = {
  id: 1, kind: 'urgent', version: 1, text: { en: 'Save your work.', fr: '', rw: '' }, showUntil: '2027-01-01T00:00:00+00:00',
};
const banners = () => screen.findByRole('region', { name: 'Announcements' });
const comesBefore = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

const draw = (node: JSX.Element, path = '/') =>
  render(<MemoryRouter initialEntries={[path]}><LanguageProvider>{node}</LanguageProvider></MemoryRouter>);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setAccessToken(null);
  service.current.mockResolvedValue([row]);
  service.visitor.mockResolvedValue([row]);
});

describe('In the signed in app', () => {
  // The support access banner has to stay right against the top bar (support.css), so ours comes after the bar.
  it('comes after the top bar and before the page', async () => {
    const { container } = draw(
      <Routes><Route element={<DashboardLayout />}><Route path="/farmer" element={<p>Page body</p>} /></Route></Routes>,
      '/farmer',
    );
    const region = await banners();
    const bar = container.querySelector('.app-topbar')!;
    const page = container.querySelector('.app-content')!;
    expect(bar.nextElementSibling).toBe(region);
    expect(comesBefore(region, page)).toBe(true);
    expect(page.contains(region)).toBe(false);
    expect(service.current).toHaveBeenCalled();
    expect(service.visitor).not.toHaveBeenCalled();
  });
});

describe('On the sign in and account pages', () => {
  const shell = <AuthShell title="Log in"><p>form</p></AuthShell>;

  it('tops the form column and asks as a visitor', async () => {
    const { container } = draw(shell);
    const region = await banners();
    expect(container.querySelector('.l-auth__side')!.firstElementChild).toBe(region);
    expect(service.visitor).toHaveBeenCalledTimes(1);
    expect(service.current).not.toHaveBeenCalled();
  });

  // The phone and account closure screens use the same frame while the person is signed in.
  it('asks as the person on a screen they are signed in to', async () => {
    setAccessToken('held');
    draw(shell);
    await banners();
    expect(service.current).toHaveBeenCalledTimes(1);
    expect(service.visitor).not.toHaveBeenCalled();
  });
});

describe('On the home, legal and lot pages', () => {
  it('sits inside the fixed header, above the menu', async () => {
    const { container } = draw(<Nav />);
    const region = await banners();
    const header = container.querySelector('header.l-nav')!;
    expect(header.contains(region)).toBe(true);
    expect(comesBefore(region, header.querySelector('.l-nav__pill')!)).toBe(true);
    expect(service.visitor).toHaveBeenCalledTimes(1);
  });
});

// The home page is drawn on the build machine. A banner drawn there would be old news baked into the site.
describe('Drawing the home page ahead of time', () => {
  it('asks for nothing and draws no banner', async () => {
    const html = await renderLanding('en');
    expect(html).toContain('l-nav');
    expect(html).not.toContain('announcement');
    // A part left for the browser to finish would leave this marker and a script note in the written page.
    expect(html).not.toContain('<!--$!-->');
    expect(service.visitor).not.toHaveBeenCalled();
    expect(service.current).not.toHaveBeenCalled();
  });
});
