import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const auth = vi.hoisted(() => ({ role: 'FARMER', id: 'me' }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: auth.id, role: auth.role } }) }));

const makeAlert = (i: number, over: object = {}) => ({
  id: `a${i}`, batchId: `b${i}`, type: 'TEMPERATURE', message: `Temperature too low: ${20 + i} C`, isRead: false,
  createdAt: new Date(Date.now() - i * 3600_000).toISOString(), farmerName: 'Claudine', farmName: "Claudine's Farm",
  batch: { id: `batch-${i}-abcdef`, stage: 'LARVA' }, acknowledgedBy: null, acknowledgedAt: null, commentCount: 0, ...over,
});

const api = vi.hoisted(() => ({
  getAll: vi.fn(), markRead: vi.fn(), markUnread: vi.fn(), markAllRead: vi.fn(),
  acknowledge: vi.fn(), unacknowledge: vi.fn(), getComments: vi.fn(), addComment: vi.fn(), deleteComment: vi.fn(),
}));
vi.mock('../../services/alert.service', () => ({ alertService: api }));

import AlertsPage from './AlertsPage';

function open() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <ToastProvider>
          <AlertsPage />
        </ToastProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  auth.role = 'FARMER';
  auth.id = 'me';
  api.getAll.mockResolvedValue({
    data: { data: [makeAlert(1), makeAlert(2, { type: 'HUMIDITY', message: 'Humidity too high: 90%' }), makeAlert(3, { isRead: true, type: 'DISEASE', message: 'Flacherie suspected' })] },
  });
  api.markRead.mockResolvedValue({ data: { data: {} } });
  api.markUnread.mockResolvedValue({ data: { data: {} } });
  api.markAllRead.mockResolvedValue({ data: { data: { updated: 2 } } });
  api.acknowledge.mockImplementation((id: string) => Promise.resolve({ data: { data: makeAlert(Number(id.slice(1)), { id, acknowledgedBy: { id: 'me', name: 'Claire Mukamana' }, acknowledgedAt: new Date().toISOString() }) } }));
  api.unacknowledge.mockImplementation((id: string) => Promise.resolve({ data: { data: makeAlert(Number(id.slice(1)), { id }) } }));
  api.getComments.mockResolvedValue({ data: { data: [] } });
  api.addComment.mockImplementation((_id: string, body: string) => Promise.resolve({ data: { data: { id: 'c9', body, createdAt: new Date().toISOString(), author: { id: 'me', name: 'Claire Mukamana' }, canDelete: true } } }));
});

describe('Alerts page', () => {
  it('has one title and counts what is unread', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Alerts' })).toBeInTheDocument();
    expect(await screen.findByText('2 unread')).toBeInTheDocument();
  });

  it('says when everything has been read', async () => {
    api.getAll.mockResolvedValue({ data: { data: [makeAlert(1, { isRead: true })] } });
    open();
    expect(await screen.findByText('You are all caught up.')).toBeInTheDocument();
  });

  it('shows each alert with its type, farmer, batch and time', async () => {
    open();
    const item = (await screen.findByText('Humidity too high: 90%')).closest('li') as HTMLElement;
    expect(within(item).getByText('Humidity')).toBeInTheDocument();
    expect(within(item).getByText(/Claudine/)).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: /Larva/ })).toHaveAttribute('href', '/batches/batch-2-abcdef');
    expect(within(item).getByText('2 hours ago')).toBeInTheDocument();
  });

  describe('an alert about a room', () => {
    const roomAlert = (over: object = {}) => makeAlert(7, {
      batchId: null, batch: null, roomId: 'r1', room: { id: 'r1', name: 'Rearing house 1' },
      batches: [{ id: 'b1-abcdefgh', stage: 'LARVA' }, { id: 'b2-12345678', stage: 'PUPA' }], message: 'Temperature too low: 20 C', ...over,
    });

    it('names the room and links each batch in it', async () => {
      api.getAll.mockResolvedValue({ data: { data: [roomAlert()] } });
      open();
      const item = (await screen.findByText('Temperature too low: 20 C')).closest('li') as HTMLElement;
      expect(within(item).getByText('Rearing house 1')).toBeInTheDocument();
      expect(within(item).getByRole('link', { name: '#ABCDEFGH (Larva)' })).toHaveAttribute('href', '/batches/b1-abcdefgh');
      expect(within(item).getByRole('link', { name: '#12345678 (Pupa)' })).toHaveAttribute('href', '/batches/b2-12345678');
    });

    it('shows no single-batch link, because the alert is not about one batch', async () => {
      api.getAll.mockResolvedValue({ data: { data: [roomAlert()] } });
      open();
      const item = (await screen.findByText('Temperature too low: 20 C')).closest('li') as HTMLElement;
      expect(within(item).queryByRole('link', { name: /^Batch/ })).not.toBeInTheDocument();
    });

    it('still reads well when the room has no batch left', async () => {
      api.getAll.mockResolvedValue({ data: { data: [roomAlert({ batches: [] })] } });
      open();
      const item = (await screen.findByText('Temperature too low: 20 C')).closest('li') as HTMLElement;
      expect(within(item).getByText('Rearing house 1')).toBeInTheDocument();
      expect(within(item).queryByRole('link')).not.toBeInTheDocument();
    });

    it('can be marked read like any other', async () => {
      api.getAll.mockResolvedValue({ data: { data: [roomAlert()] } });
      open();
      const item = (await screen.findByText('Temperature too low: 20 C')).closest('li') as HTMLElement;
      fireEvent.click(within(item).getByRole('button', { name: 'Mark as read' }));
      await waitFor(() => expect(api.markRead).toHaveBeenCalledWith('a7'));
    });
  });

  it('asks the server for unread alerts only when that tab is chosen', async () => {
    open();
    await screen.findByText('Humidity too high: 90%');
    expect(api.getAll).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole('tab', { name: 'Unread' }));
    await waitFor(() => expect(api.getAll).toHaveBeenLastCalledWith(true));
  });

  it('filters by type', async () => {
    open();
    await screen.findByText('Humidity too high: 90%');
    fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), { target: { value: 'HUMIDITY' } });
    expect(screen.getByText('Humidity too high: 90%')).toBeInTheDocument();
    expect(screen.queryByText('Flacherie suspected')).not.toBeInTheDocument();
  });

  it('marks one alert read', async () => {
    open();
    const item = (await screen.findByText('Humidity too high: 90%')).closest('li') as HTMLElement;
    fireEvent.click(within(item).getByRole('button', { name: 'Mark as read' }));
    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith('a2'));
    await waitFor(() => expect(within(item).queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument());
  });

  it('offers Undo after marking one alert read, and brings the button back', async () => {
    open();
    const item = (await screen.findByText('Humidity too high: 90%')).closest('li') as HTMLElement;
    fireEvent.click(within(item).getByRole('button', { name: 'Mark as read' }));
    expect(await screen.findByText('Marked as read.', {}, { timeout: 5000 })).toBeInTheDocument();
    await waitFor(() => expect(within(item).queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument());
    fireEvent.click(await screen.findByRole('button', { name: 'Undo' }, { timeout: 5000 }));
    await waitFor(() => expect(api.markUnread).toHaveBeenCalledWith('a2'));
    expect(await within(item).findByRole('button', { name: 'Mark as read' })).toBeInTheDocument();
    expect(screen.getByText('2 unread')).toBeInTheDocument();
  });

  it('asks, then marks all read and says so', async () => {
    open();
    await screen.findByText('2 unread');
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mark every alert as read?' });
    expect(api.markAllRead).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, mark them all' }));
    await waitFor(() => expect(api.markAllRead).toHaveBeenCalled());
    expect(await screen.findByText('All alerts are marked as read.', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
  });

  it('leaves the alerts unread when the question is cancelled', async () => {
    open();
    await screen.findByText('2 unread');
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    const dialog = await screen.findByRole('dialog', { name: 'Mark every alert as read?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.markAllRead).not.toHaveBeenCalled();
    expect(screen.getByText('2 unread')).toBeInTheDocument();
  });

  it('shows fifteen at a time and pages through the rest', async () => {
    api.getAll.mockResolvedValue({ data: { data: Array.from({ length: 20 }, (_, i) => makeAlert(i + 1, { message: `Alert number ${i + 1}` })) } });
    open();
    await screen.findByText('Alert number 1');
    expect(screen.getAllByRole('listitem')).toHaveLength(15);
    expect(screen.queryByText('Alert number 16')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Alert number 16')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });

  it('is kind when there is nothing to show', async () => {
    api.getAll.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No alerts')).toBeInTheDocument();
    expect(screen.getByText(/let you know here when something needs attention/)).toBeInTheDocument();
  });

  it('keeps the old purple and blue pills out', async () => {
    const { container } = open();
    await screen.findByText('Humidity too high: 90%');
    expect(container.innerHTML.toLowerCase()).not.toMatch(/#7c3aed|#2563eb|#d97706|#f3e8ff|#dbeafe/);
  });

  describe('acknowledging', () => {
    const li = async (text: string) => (await screen.findByText(text)).closest('li') as HTMLElement;

    it('offers no Acknowledge button to a farmer', async () => {
      open();
      await li('Temperature too low: 21 C');
      expect(screen.queryByRole('button', { name: 'Acknowledge' })).not.toBeInTheDocument();
    });

    it.each(['SUPERVISOR', 'ADMIN'])('shows Acknowledge to a %s', async (role) => {
      auth.role = role;
      open();
      const row = await li('Temperature too low: 21 C');
      expect(within(row).getByRole('button', { name: 'Acknowledge' })).toBeInTheDocument();
    });

    it('acknowledges, shows who and when, and offers to take it back', async () => {
      auth.role = 'SUPERVISOR';
      open();
      const row = await li('Temperature too low: 21 C');
      fireEvent.click(within(row).getByRole('button', { name: 'Acknowledge' }));
      await waitFor(() => expect(api.acknowledge).toHaveBeenCalledWith('a1'));
      expect(await within(row).findByText(/Acknowledged by Claire Mukamana/)).toBeInTheDocument();
      expect(within(row).getByRole('button', { name: 'Remove acknowledgement' })).toBeInTheDocument();
      expect(await screen.findByText('Alert acknowledged.', {}, { timeout: 5000 })).toBeInTheDocument();
    });

    it('does not mark the alert read when it is acknowledged', async () => {
      auth.role = 'SUPERVISOR';
      open();
      const row = await li('Temperature too low: 21 C');
      fireEvent.click(within(row).getByRole('button', { name: 'Acknowledge' }));
      await within(row).findByText(/Acknowledged by/);
      expect(api.markRead).not.toHaveBeenCalled();
      expect(within(row).getByRole('button', { name: 'Mark as read' })).toBeInTheDocument();
    });

    it('takes the acknowledgement back', async () => {
      auth.role = 'SUPERVISOR';
      api.getAll.mockResolvedValue({ data: { data: [makeAlert(1, { acknowledgedBy: { id: 'me', name: 'Claire Mukamana' }, acknowledgedAt: new Date().toISOString() })] } });
      open();
      const row = await li('Temperature too low: 21 C');
      fireEvent.click(within(row).getByRole('button', { name: 'Remove acknowledgement' }));
      await waitFor(() => expect(api.unacknowledge).toHaveBeenCalledWith('a1'));
      await waitFor(() => expect(within(row).queryByText(/Acknowledged by/)).not.toBeInTheDocument());
      expect(within(row).getByRole('button', { name: 'Acknowledge' })).toBeInTheDocument();
    });

    it('offers to take over what someone else acknowledged', async () => {
      auth.role = 'SUPERVISOR';
      api.getAll.mockResolvedValue({ data: { data: [makeAlert(1, { acknowledgedBy: { id: 'other', name: 'Eric Niyonzima' }, acknowledgedAt: new Date().toISOString() })] } });
      open();
      const row = await li('Temperature too low: 21 C');
      expect(within(row).getByText(/Acknowledged by Eric Niyonzima/)).toBeInTheDocument();
      fireEvent.click(within(row).getByRole('button', { name: 'Take over' }));
      await waitFor(() => expect(api.acknowledge).toHaveBeenCalledWith('a1'));
      expect(await within(row).findByText(/Acknowledged by Claire Mukamana/)).toBeInTheDocument();
    });

    it('lets the farmer see who is looking at their alert, without a button to change it', async () => {
      api.getAll.mockResolvedValue({ data: { data: [makeAlert(1, { acknowledgedBy: { id: 'u9', name: 'Claire Mukamana' }, acknowledgedAt: new Date().toISOString() })] } });
      open();
      const row = await li('Temperature too low: 21 C');
      expect(within(row).getByText(/Acknowledged by Claire Mukamana/)).toBeInTheDocument();
      expect(within(row).queryByRole('button', { name: /Acknowledge|Take over|Remove acknowledgement/ })).not.toBeInTheDocument();
    });

    it('changes nothing on the page when it cannot be acknowledged', async () => {
      auth.role = 'SUPERVISOR';
      api.acknowledge.mockRejectedValueOnce(new Error('x'));
      open();
      const row = await li('Temperature too low: 21 C');
      fireEvent.click(within(row).getByRole('button', { name: 'Acknowledge' }));
      await waitFor(() => expect(api.acknowledge).toHaveBeenCalled());
      expect(within(row).queryByText(/Acknowledged by/)).not.toBeInTheDocument();
    });
  });

  describe('comments', () => {
    const li = async (text: string) => (await screen.findByText(text)).closest('li') as HTMLElement;

    it('shows how many comments an alert has, to everyone', async () => {
      api.getAll.mockResolvedValue({ data: { data: [makeAlert(1, { commentCount: 2 }), makeAlert(2)] } });
      open();
      const row = await li('Temperature too low: 21 C');
      expect(within(row).getByRole('button', { name: 'Comments (2)' })).toHaveAttribute('aria-expanded', 'false');
      expect(within(await li('Temperature too low: 22 C')).getByRole('button', { name: 'Comments (0)' })).toBeInTheDocument();
    });

    it('opens the thread on request and closes it again', async () => {
      api.getComments.mockResolvedValue({ data: { data: [{ id: 'c1', body: 'Open the windows.', createdAt: new Date().toISOString(), author: { id: 'u1', name: 'Claire Mukamana' }, canDelete: false }] } });
      api.getAll.mockResolvedValue({ data: { data: [makeAlert(1, { commentCount: 1 })] } });
      open();
      const row = await li('Temperature too low: 21 C');
      expect(api.getComments).not.toHaveBeenCalled();
      fireEvent.click(within(row).getByRole('button', { name: 'Comments (1)' }));
      expect(await within(row).findByText('Open the windows.')).toBeInTheDocument();
      expect(api.getComments).toHaveBeenCalledWith('a1');
      fireEvent.click(within(row).getByRole('button', { name: 'Hide comments' }));
      expect(within(row).queryByText('Open the windows.')).not.toBeInTheDocument();
    });

    it('updates the count on the button when a comment is added', async () => {
      api.getAll.mockResolvedValue({ data: { data: [makeAlert(1, { commentCount: 1 })] } });
      open();
      const row = await li('Temperature too low: 21 C');
      fireEvent.click(within(row).getByRole('button', { name: 'Comments (1)' }));
      fireEvent.change(await within(row).findByLabelText('Write a comment'), { target: { value: 'Thank you.' } });
      fireEvent.click(within(row).getByRole('button', { name: 'Add comment' }));
      await waitFor(() => expect(within(row).getByText('Thank you.')).toBeInTheDocument());
      fireEvent.click(within(row).getByRole('button', { name: 'Hide comments' }));
      expect(within(row).getByRole('button', { name: 'Comments (2)' })).toBeInTheDocument();
    });
  });
});
