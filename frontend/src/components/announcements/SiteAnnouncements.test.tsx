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

  it('adds nothing to the header when there is nothing to say', async () => {
    service.visitor.mockResolvedValue(null);
    const view = await open(true);
    expect(view.container).toBeEmptyDOMElement();
    expect(height()).toBe('');
  });
});
