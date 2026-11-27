import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import type { Announcement } from '../../types';

const service = vi.hoisted(() => ({ current: vi.fn(), visitor: vi.fn() }));
vi.mock('../../services/announcement.service', () => ({ announcementService: service }));

import SiteAnnouncements from './SiteAnnouncements';

const row: Announcement = {
  id: 1, kind: 'maintenance', version: 1, text: { en: 'Off on Saturday.', fr: '', rw: '' }, showUntil: '2027-01-01T00:00:00+00:00',
};
const height = () => document.documentElement.style.getPropertyValue('--announcement-height');
const gone = () => document.documentElement.style.getPropertyValue('--announcement-gone');
const scrolledTo = (y: number) => {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
  act(() => { window.dispatchEvent(new Event('scroll')); });
};

async function open(inHeader = false) {
  const view = render(
    <MemoryRouter><LanguageProvider><SiteAnnouncements mode="visitor-once" inHeader={inHeader} /></LanguageProvider></MemoryRouter>,
  );
  await act(async () => {});
  return view;
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  service.visitor.mockResolvedValue([row]);
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(52);
});

afterEach(() => vi.restoreAllMocks());

describe('SiteAnnouncements', () => {
  it('draws what there is and closes what is closed', async () => {
    await open();
    expect(screen.getByRole('region', { name: 'Announcements' })).toHaveTextContent('Off on Saturday.');
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Close announcement' })); });
    expect(screen.queryByRole('region', { name: 'Announcements' })).not.toBeInTheDocument();
  });

  // The public header is fixed, so the page under it has to be told how much room the banners took.
  it('says how tall it is in the public header, and takes that back when closed', async () => {
    await open(true);
    expect(height()).toBe('52px');
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Close announcement' })); });
    expect(height()).toBe('');
    expect(document.querySelector('.l-nav__announcements')).toBeNull();
  });

  it('takes the height back when the page goes away', async () => {
    const view = await open(true);
    view.unmount();
    expect(height()).toBe('');
  });

  it('leaves the height alone where it scrolls with the page', async () => {
    await open();
    expect(height()).toBe('');
  });

  it('says how much of itself has been scrolled past, and never more than all of it', async () => {
    const view = await open(true);
    expect(gone()).toBe('0px');
    scrolledTo(20);
    expect(gone()).toBe('20px');
    scrolledTo(900);
    expect(gone()).toBe('52px');
    // A phone that lets the page be pulled past its top.
    scrolledTo(-30);
    expect(gone()).toBe('0px');
    view.unmount();
    expect(gone()).toBe('');
    scrolledTo(10);
    expect(gone()).toBe('');
  });

  it('is right from the start on a page opened part of the way down', async () => {
    Object.defineProperty(window, 'scrollY', { value: 400, configurable: true });
    await open(true);
    expect(gone()).toBe('52px');
  });

  // A browser cannot scroll to something in a fixed header, so the focus would sit where nobody can see it.
  it('comes back into view when the keyboard reaches it', async () => {
    const jump = vi.spyOn(window, 'scrollTo');
    await open(true);
    const close = screen.getByRole('button', { name: 'Close announcement' });
    act(() => { close.focus(); });
    expect(jump).not.toHaveBeenCalled();
    act(() => { close.blur(); });
    scrolledTo(900);
    act(() => { close.focus(); });
    expect(jump).toHaveBeenCalledWith({ top: 0 });
  });

  it('adds nothing to the header when there is nothing to say', async () => {
    service.visitor.mockResolvedValue(null);
    const view = await open(true);
    expect(view.container).toBeEmptyDOMElement();
    expect(height()).toBe('');
  });
});
