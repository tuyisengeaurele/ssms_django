import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const inbox = vi.hoisted(() => [
  { id: 'm1', language: 'en', replies: [], name: 'Aline Uwase', email: 'aline@coop.rw', subject: 'Visit to our farm', message: 'Can someone visit our farm next week?\nThank you.', isRead: false, createdAt: '2026-10-07T09:30:00Z' },
  { id: 'm2', language: 'en', replies: [], name: 'Jean Bosco', email: 'jean@x.rw', subject: 'Pricing question', message: 'Is the platform free for cooperatives?', isRead: true, createdAt: '2026-10-05T14:10:00Z' },
  { id: 'm3', language: 'en', replies: [], name: 'Chantal M', email: 'chantal@x.rw', subject: 'Photos not loading', message: 'The disease photos do not upload.', isRead: false, createdAt: '2026-10-06T08:00:00Z' },
]);

const api = vi.hoisted(() => ({ getAll: vi.fn(), markRead: vi.fn(), reply: vi.fn() }));
vi.mock('../../services/contacts.service', () => ({ contactsService: api }));

import AdminContactsPage from './AdminContactsPage';

function open() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <AdminContactsPage />
      </ToastProvider>
    </LanguageProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.getAll.mockResolvedValue({ data: { data: inbox } });
  api.markRead.mockResolvedValue({ data: { data: {} } });
});

const answeredByEric = { id: 'm4', language: 'en', replies: [], name: 'Chantal M', email: 'chantal@x.rw', subject: 'Training request', message: 'Can you train our group?', isRead: true, createdAt: '2026-10-04T10:00:00Z', repliedAt: '2026-10-08T10:00:00Z', repliedBy: { id: 'u1', name: 'Eric Niyonzima' } };

const rowFor = async (words: RegExp) => (await screen.findByText(words)).closest('button') as HTMLElement;
const VISIT = /Can someone visit our farm/;
const PRICE = /Is the platform free/;
const PHOTOS = /disease photos do not upload/;
const TRAIN = /Can you train our group/;

describe('Messages page', () => {
  it('has one title and says how many are unread', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Messages' })).toBeInTheDocument();
    expect(await screen.findByText('3 messages, 2 unread.')).toBeInTheDocument();
  });

  it('says message in the singular for one message', async () => {
    api.getAll.mockResolvedValue({ data: { data: [inbox[0]] } });
    open();
    expect(await screen.findByText('1 message, 1 unread.')).toBeInTheDocument();
  });

  it('does not repeat the page title inside the panel', async () => {
    open();
    await screen.findByText(VISIT);
    expect(screen.getAllByText('Messages')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Inbox' })).toBeInTheDocument();
  });

  it('filters with tabs that show their counts', async () => {
    open();
    await screen.findByText(VISIT);
    expect(screen.getByRole('tab', { name: 'All (3)' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Unread (2)' }));
    expect(screen.queryByText(PRICE)).not.toBeInTheDocument();
    expect(screen.getByText(PHOTOS)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Read (1)' }));
    expect(screen.getByText(PRICE)).toBeInTheDocument();
    expect(screen.queryByText(PHOTOS)).not.toBeInTheDocument();
  });

  it('searches names, emails, the message and the reply', async () => {
    const withReply = { ...inbox[2], repliedAt: '2026-10-08T11:00:00Z', replies: [{ id: 'r1', body: 'Try a smaller picture.', sentAt: '2026-10-08T11:00:00Z', sentBy: null }] };
    api.getAll.mockResolvedValue({ data: { data: [inbox[0], inbox[1], withReply] } });
    open();
    await screen.findByText(VISIT);
    const search = screen.getByRole('searchbox', { name: 'Search messages' });
    for (const [typed, found] of [['cooperatives', PRICE], ['jean@x.rw', PRICE], ['Aline', VISIT], ['smaller picture', PHOTOS]] as const) {
      fireEvent.change(search, { target: { value: typed } });
      expect(screen.getByText(found)).toBeInTheDocument();
      expect(screen.getAllByRole('listitem')).toHaveLength(1);
    }
    // A subject is not shown any more, so it is not searched either.
    fireEvent.change(search, { target: { value: 'Pricing question' } });
    expect(screen.getByText('No messages match')).toBeInTheDocument();
  });

  it('shows no subject in the list, because every new message has the same one', async () => {
    open();
    const row = await rowFor(VISIT);
    expect(within(row).getByText('Aline Uwase')).toBeInTheDocument();
    expect(screen.queryByText('Visit to our farm')).not.toBeInTheDocument();
    expect(screen.queryByText('Pricing question')).not.toBeInTheDocument();
  });

  it('answers only in the app: no link to a mail app and no mark to set by hand', async () => {
    open();
    fireEvent.click(await rowFor(VISIT));
    const dialog = await screen.findByRole('dialog', { name: 'Visit to our farm' });
    expect(dialog.querySelector('a[href^="mailto:"]')).toBeNull();
    expect(within(dialog).queryByRole('button', { name: /mark/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByText('After replying, mark the message as answered.')).not.toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Reply' })).toBeInTheDocument();
  });

  it('marks unread messages and shows a short preview', async () => {
    open();
    const row = await rowFor(VISIT);
    expect(within(row).getByText('New')).toBeInTheDocument();
    expect(within(row).getByText(/Can someone visit our farm next week/)).toBeInTheDocument();
    const read = await rowFor(PRICE);
    expect(within(read).queryByText('New')).not.toBeInTheDocument();
  });

  it('opens a message and marks it read at the same time', async () => {
    open();
    fireEvent.click(await rowFor(VISIT));
    const dialog = await screen.findByRole('dialog', { name: 'Visit to our farm' });
    expect(within(dialog).getByText('Aline Uwase')).toBeInTheDocument();
    expect(within(dialog).getByText(/Can someone visit our farm next week/)).toBeInTheDocument();
    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith('m1'));
    await waitFor(() => expect(screen.getByText('3 messages, 1 unread.')).toBeInTheDocument());
  });

  it('does not mark a message that is already read', async () => {
    open();
    fireEvent.click(await rowFor(PRICE));
    await screen.findByRole('dialog', { name: 'Pricing question' });
    expect(api.markRead).not.toHaveBeenCalled();
  });

  it('asks, then marks everything read in one go', async () => {
    open();
    await screen.findByText(VISIT);
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mark every message as read?' });
    expect(api.markRead).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, mark them all' }));
    await waitFor(() => expect(api.markRead).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('3 messages, 0 unread.')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
  });

  it('explains where messages come from when there are none', async () => {
    api.getAll.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No messages yet')).toBeInTheDocument();
    expect(screen.getByText(/Messages from the contact form/)).toBeInTheDocument();
  });

  it('keeps the old coloured tiles and blue links out', async () => {
    const { container } = open();
    await screen.findByText(VISIT);
    expect(container.querySelector('.stat-card, .stat-card-glow, [style*="#2563eb"]')).toBeNull();
  });

  describe('answering', () => {
    it('has an Unanswered and an Answered tab with their counts', async () => {
      api.getAll.mockResolvedValue({ data: { data: [...inbox, answeredByEric] } });
      open();
      await screen.findByText(VISIT);
      expect(screen.getByRole('tab', { name: 'Unanswered (3)' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Answered (1)' })).toBeInTheDocument();
    });

    it('filters by whether a message was answered', async () => {
      api.getAll.mockResolvedValue({ data: { data: [...inbox, answeredByEric] } });
      open();
      await screen.findByText(VISIT);
      fireEvent.click(screen.getByRole('tab', { name: 'Answered (1)' }));
      expect(screen.getByText(TRAIN)).toBeInTheDocument();
      expect(screen.queryByText(VISIT)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('tab', { name: 'Unanswered (3)' }));
      expect(screen.queryByText(TRAIN)).not.toBeInTheDocument();
      expect(screen.getByText(VISIT)).toBeInTheDocument();
    });

    it('shows an Answered badge, in words, on the messages that were answered', async () => {
      api.getAll.mockResolvedValue({ data: { data: [...inbox, answeredByEric] } });
      open();
      expect(within(await rowFor(TRAIN)).getByText('Answered')).toBeInTheDocument();
      expect(within(await rowFor(VISIT)).queryByText('Answered')).not.toBeInTheDocument();
    });

    it('says who marked a message answered by hand before, and when', async () => {
      api.getAll.mockResolvedValue({ data: { data: [answeredByEric] } });
      open();
      fireEvent.click(await rowFor(TRAIN));
      const dialog = await screen.findByRole('dialog', { name: 'Training request' });
      expect(within(dialog).getByText(/Answered by Eric Niyonzima, /)).toBeInTheDocument();
    });

    it('reads in French', async () => {
      localStorage.setItem('ssms_locale', 'fr');
      api.getAll.mockResolvedValue({ data: { data: [answeredByEric] } });
      open();
      fireEvent.click(await rowFor(TRAIN));
      const dialog = await screen.findByRole('dialog', { name: 'Training request' });
      expect(within(dialog).getByText(/Répondu par Eric Niyonzima, /)).toBeInTheDocument();
    });
  });
});

describe('Messages page when the messages cannot be loaded', () => {
  it('says so, and does not show the empty inbox', async () => {
    api.getAll.mockRejectedValueOnce(new Error('boom'));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load this page');
    expect(screen.queryByText('No messages yet')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });
});
