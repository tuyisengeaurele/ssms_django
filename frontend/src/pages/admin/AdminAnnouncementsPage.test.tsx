import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AxiosError } from 'axios';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';
import type { AdminAnnouncement } from '../../types';

const api = vi.hoisted(() => ({ all: vi.fn(), create: vi.fn(), update: vi.fn(), end: vi.fn() }));
vi.mock('../../services/announcement.service', () => ({ announcementService: api }));

import AdminAnnouncementsPage from './AdminAnnouncementsPage';

const row = (id: number, over: Partial<AdminAnnouncement> = {}): AdminAnnouncement => ({
  id, kind: 'information', version: 1, text: { en: `Notice ${id}`, fr: '', rw: '' }, showPublic: false,
  showFrom: '2026-12-05T20:00:00+00:00', showUntil: '2026-12-06T21:30:00+00:00', endedAt: null, status: 'showing',
  createdBy: { id: 'a1', name: 'Aline Admin' }, ...over,
});

const rows = [
  row(3, { kind: 'maintenance', status: 'scheduled' }),
  row(2, { kind: 'urgent', status: 'showing', showPublic: true }),
  row(1, { status: 'ended', endedAt: '2026-11-01T10:00:00+00:00' }),
];

const answer = (data: unknown) => ({ data: { data } });
const open = () => render(<LanguageProvider><ToastProvider><AdminAnnouncementsPage /></ToastProvider></LanguageProvider>);
const rowOf = async (text: string) => (await screen.findByText(text)).closest('tr') as HTMLElement;

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.all.mockResolvedValue(answer(rows));
  api.end.mockResolvedValue(answer(row(2, { status: 'ended' })));
  api.create.mockResolvedValue(answer(row(4)));
});

describe('The announcements page', () => {
  it('lists the type, the words, the Kigali times, who sees it and how it stands', async () => {
    open();
    const first = await rowOf('Notice 3');
    for (const words of ['Maintenance', 'Signed in people', 'Scheduled']) expect(within(first).getByText(words)).toBeInTheDocument();
    expect(first).toHaveTextContent(/5 Dec 2026|Dec 5, 2026/);
    expect(first).toHaveTextContent(/10:00\s?PM|22:00/);
    expect(first).toHaveTextContent(/11:30\s?PM|23:30/);
    expect(within(await rowOf('Notice 2')).getByText('Signed in people and visitors')).toBeInTheDocument();
    expect(within(await rowOf('Notice 2')).getByText('Showing')).toBeInTheDocument();
    expect(within(await rowOf('Notice 1')).getByText('Ended')).toBeInTheDocument();
    expect(screen.getByText('Kigali time')).toBeInTheDocument();
  });

  it('offers Edit and End now only while there is something left to change', async () => {
    open();
    for (const text of ['Notice 3', 'Notice 2']) {
      const line = await rowOf(text);
      expect(within(line).getByRole('button', { name: 'Edit' })).toHaveAccessibleDescription(text);
      expect(within(line).getByRole('button', { name: 'End now' })).toHaveAccessibleDescription(text);
    }
    expect(within(await rowOf('Notice 1')).queryByRole('button')).not.toBeInTheDocument();
  });

  it('asks before ending one, and can be told to leave it', async () => {
    open();
    fireEvent.click(within(await rowOf('Notice 2')).getByRole('button', { name: 'End now' }));
    const ask = screen.getByRole('dialog', { name: 'End this announcement now?' });
    expect(api.end).not.toHaveBeenCalled();
    fireEvent.click(within(ask).getByRole('button', { name: 'Keep' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.end).not.toHaveBeenCalled();
  });

  it('ends one and shows it ended', async () => {
    open();
    fireEvent.click(within(await rowOf('Notice 2')).getByRole('button', { name: 'End now' }));
    api.all.mockResolvedValue(answer([rows[0], row(2, { status: 'ended' }), rows[2]]));
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'End now' })); });
    expect(api.end).toHaveBeenCalledWith(2);
    expect(within(await rowOf('Notice 2')).getByText('Ended')).toBeInTheDocument();
    expect(await screen.findByText('Announcement ended')).toBeInTheDocument();
  });

  it('says so, and reads the list again, when somebody else ended it first', async () => {
    api.end.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 409, data: { code: 'announcement_ended' }, headers: {},
    } as never));
    open();
    fireEvent.click(within(await rowOf('Notice 2')).getByRole('button', { name: 'End now' }));
    await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'End now' })); });
    expect(await screen.findByText('This announcement has already ended.')).toBeInTheDocument();
    expect(api.all).toHaveBeenCalledTimes(2);
  });

  it('writes a new one and reads the list again', async () => {
    open();
    await rowOf('Notice 3');
    fireEvent.click(screen.getByRole('button', { name: 'New announcement' }));
    const dialog = screen.getByRole('dialog', { name: 'New announcement' });
    fireEvent.change(within(dialog).getByLabelText('Text (English)'), { target: { value: 'Hello.' } });
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })); });
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.all).toHaveBeenCalledTimes(2);
    expect(await screen.findByText('Announcement saved')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens one for editing with its own words', async () => {
    open();
    fireEvent.click(within(await rowOf('Notice 2')).getByRole('button', { name: 'Edit' }));
    expect(within(screen.getByRole('dialog', { name: 'Edit announcement' })).getByLabelText('Text (English)')).toHaveValue('Notice 2');
  });

  it('says there are none yet, and offers to write the first', async () => {
    api.all.mockResolvedValue(answer([]));
    open();
    expect(await screen.findByText('No announcements yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New announcement' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  // A list that failed to load must never read as "there are none".
  it('offers another try when the list does not load', async () => {
    api.all.mockRejectedValueOnce(new Error('no'));
    open();
    const alert = await screen.findByRole('alert');
    expect(screen.queryByText('No announcements yet.')).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(within(alert).getByRole('button')); });
    expect(await screen.findByText('Notice 3')).toBeInTheDocument();
  });

  it('can be worked with the keyboard alone', async () => {
    const user = userEvent.setup();
    open();
    await rowOf('Notice 3');
    await user.tab();
    expect(screen.getByRole('button', { name: 'New announcement' })).toHaveFocus();
    await user.keyboard('{Enter}');
    const dialog = screen.getByRole('dialog', { name: 'New announcement' });
    expect(within(dialog).getByLabelText('Type')).toHaveFocus();
    await user.tab();
    await user.keyboard('Hi.');
    expect(within(dialog).getByLabelText('Text (English)')).toHaveValue('Hi.');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'New announcement' })).toHaveFocus();
  });
});
