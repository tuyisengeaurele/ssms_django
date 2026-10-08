import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const inbox = vi.hoisted(() => [
  { id: 'm1', name: 'Aline Uwase', email: 'aline@coop.rw', subject: 'Visit to our farm', message: 'Can someone visit our farm next week?\nThank you.', isRead: false, createdAt: '2026-10-07T09:30:00Z' },
  { id: 'm2', name: 'Jean Bosco', email: 'jean@x.rw', subject: 'Pricing question', message: 'Is the platform free for cooperatives?', isRead: true, createdAt: '2026-10-05T14:10:00Z' },
  { id: 'm3', name: 'Chantal M', email: 'chantal@x.rw', subject: 'Photos not loading', message: 'The disease photos do not upload.', isRead: false, createdAt: '2026-10-06T08:00:00Z' },
]);

const api = vi.hoisted(() => ({ getAll: vi.fn(), markRead: vi.fn() }));
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

const rowFor = async (subject: string) => (await screen.findByText(subject)).closest('button') as HTMLElement;

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
    await screen.findByText('Visit to our farm');
    expect(screen.getAllByText('Messages')).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 2, name: 'Inbox' })).toBeInTheDocument();
  });

  it('filters with tabs that show their counts', async () => {
    open();
    await screen.findByText('Visit to our farm');
    expect(screen.getByRole('tab', { name: 'All (3)' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Unread (2)' }));
    expect(screen.queryByText('Pricing question')).not.toBeInTheDocument();
    expect(screen.getByText('Photos not loading')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Read (1)' }));
    expect(screen.getByText('Pricing question')).toBeInTheDocument();
    expect(screen.queryByText('Photos not loading')).not.toBeInTheDocument();
  });

  it('searches names, emails, subjects and the message', async () => {
    open();
    await screen.findByText('Visit to our farm');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search messages' }), { target: { value: 'cooperatives' } });
    expect(screen.getByText('Pricing question')).toBeInTheDocument();
    expect(screen.queryByText('Visit to our farm')).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search messages' }), { target: { value: 'zzz' } });
    expect(screen.getByText('No messages match')).toBeInTheDocument();
  });

  it('marks unread messages and shows a short preview', async () => {
    open();
    const row = await rowFor('Visit to our farm');
    expect(within(row).getByText('New')).toBeInTheDocument();
    expect(within(row).getByText(/Can someone visit our farm next week/)).toBeInTheDocument();
    const read = await rowFor('Pricing question');
    expect(within(read).queryByText('New')).not.toBeInTheDocument();
  });

  it('opens a message and marks it read at the same time', async () => {
    open();
    fireEvent.click(await rowFor('Visit to our farm'));
    const dialog = await screen.findByRole('dialog', { name: 'Visit to our farm' });
    expect(within(dialog).getByText('Aline Uwase')).toBeInTheDocument();
    expect(within(dialog).getByText(/Can someone visit our farm next week/)).toBeInTheDocument();
    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith('m1'));
    await waitFor(() => expect(screen.getByText('3 messages, 1 unread.')).toBeInTheDocument());
  });

  it('does not mark a message that is already read', async () => {
    open();
    fireEvent.click(await rowFor('Pricing question'));
    await screen.findByRole('dialog', { name: 'Pricing question' });
    expect(api.markRead).not.toHaveBeenCalled();
  });

  it('offers a reply by email that keeps the subject', async () => {
    open();
    fireEvent.click(await rowFor('Visit to our farm'));
    const dialog = await screen.findByRole('dialog', { name: 'Visit to our farm' });
    const reply = within(dialog).getByRole('link', { name: 'Reply by email' });
    expect(reply).toHaveAttribute('href', 'mailto:aline@coop.rw?subject=Re%3A%20Visit%20to%20our%20farm');
  });

  it('marks everything read in one go', async () => {
    open();
    await screen.findByText('Visit to our farm');
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => expect(api.markRead).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText('3 messages, 0 unread.')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
  });

  it('explains where messages come from when there are none', async () => {
    api.getAll.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No messages yet')).toBeInTheDocument();
    expect(screen.getByText(/contact form on the public site/)).toBeInTheDocument();
  });

  it('keeps the old coloured tiles and blue links out', async () => {
    const { container } = open();
    await screen.findByText('Visit to our farm');
    expect(container.querySelector('.stat-card, .stat-card-glow, [style*="#2563eb"]')).toBeNull();
  });
});
