import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ list: vi.fn(), decide: vi.fn() }));
vi.mock('../../services/cooperativeRequest.service', () => ({ cooperativeRequestService: api }));

import AdminRequestsPage from './AdminRequestsPage';

const farmer = {
  id: 'r1', status: 'requested', reason: 'My farm is closer to the other store.', from: { id: 'c1', name: 'Old Coop' }, to: { id: 'c2', name: 'New Coop' },
  decisionNote: '', createdAt: '2026-11-20T10:00:00Z', decidedAt: null, decidedBy: null, onlySupervisor: false,
  person: { id: 'u1', name: 'Aline Uwase', email: 'aline@example.rw', phone: '+250788000001', role: 'FARMER' },
};
const supervisor = {
  ...farmer, id: 'r2', reason: 'I am moving.', to: null, onlySupervisor: true,
  person: { id: 'u2', name: 'Claire Uwimana', email: 'claire@example.rw', phone: '+250722000111', role: 'SUPERVISOR' },
};

function open() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <AdminRequestsPage />
      </ToastProvider>
    </LanguageProvider>,
  );
}
const card = async (name: string) => (await screen.findByText(name)).closest('li') as HTMLElement;

function refused(status: number, code: string, message: string) {
  return new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status, data: { code, message } } as never);
}

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.list.mockResolvedValue({ data: { data: { requests: [farmer, supervisor], count: 2 } } });
  api.decide.mockResolvedValue({ data: { data: { id: 'r1', status: 'approved' } } });
});

describe('The cooperative requests page', () => {
  it('has one title and says how many wait', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Cooperative requests' })).toBeInTheDocument();
    expect(await screen.findByText('2 waiting for a decision.')).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledWith('requested');
  });

  it('shows the person, their number, where from and to, the reason and the date', async () => {
    open();
    const item = within(await card('Aline Uwase'));
    expect(item.getByText('aline@example.rw')).toBeInTheDocument();
    expect(item.getByRole('link', { name: 'Call Aline Uwase' })).toHaveAttribute('href', 'tel:+250788000001');
    expect(item.getByRole('link', { name: 'Message Aline Uwase on WhatsApp' })).toBeInTheDocument();
    expect(item.getByText('Old Coop')).toBeInTheDocument();
    expect(item.getByText('New Coop')).toBeInTheDocument();
    expect(item.getByText('My farm is closer to the other store.')).toBeInTheDocument();
    expect(item.getByText(/Asked on /)).toBeInTheDocument();
  });

  it('says No cooperative for a leave request and flags the only supervisor of a cooperative', async () => {
    open();
    const item = within(await card('Claire Uwimana'));
    expect(item.getByText('No cooperative')).toBeInTheDocument();
    expect(item.getByText('This is the only supervisor of Old Coop.')).toBeInTheDocument();
    expect(within(await card('Aline Uwase')).queryByText(/only supervisor/)).not.toBeInTheDocument();
  });

  it('says so when nothing waits', async () => {
    api.list.mockResolvedValue({ data: { data: { requests: [], count: 0 } } });
    open();
    expect(await screen.findByText('No requests are waiting.')).toBeInTheDocument();
  });

  it('says so, with a way to try again, when the list cannot be loaded', async () => {
    api.list.mockRejectedValueOnce(new Error('offline'));
    open();
    expect(await screen.findByText('We could not load the requests.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Aline Uwase')).toBeInTheDocument();
  });

  it('asks before approving, says what will happen, and then the request leaves the list', async () => {
    open();
    fireEvent.click(within(await card('Aline Uwase')).getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve this request?' });
    expect(within(dialog).getByText('Aline Uwase will move from Old Coop to New Coop.')).toBeInTheDocument();
    expect(within(dialog).getByText(/open egg requests of this farmer in Old Coop are cancelled/)).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Note for the person (optional)'), { target: { value: 'Welcome.' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(api.decide).toHaveBeenCalledWith('r1', { decision: 'approve', note: 'Welcome.' }));
    await waitFor(() => expect(screen.queryByText('Aline Uwase')).not.toBeInTheDocument());
    expect(screen.getByText('Claire Uwimana')).toBeInTheDocument();
    expect(await screen.findByText('The request was approved.', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('does not mention egg requests or an allowance when a supervisor is approved', async () => {
    open();
    fireEvent.click(within(await card('Claire Uwimana')).getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve this request?' });
    expect(within(dialog).getByText('Claire Uwimana will move from Old Coop to No cooperative.')).toBeInTheDocument();
    expect(within(dialog).queryByText(/egg requests/)).not.toBeInTheDocument();
  });

  it('needs a note to decline, then sends it and the request leaves the list', async () => {
    api.decide.mockResolvedValue({ data: { data: { id: 'r1', status: 'declined' } } });
    open();
    fireEvent.click(within(await card('Aline Uwase')).getByRole('button', { name: 'Decline' }));
    const dialog = await screen.findByRole('dialog', { name: 'Decline this request?' });
    const send = within(dialog).getByRole('button', { name: 'Decline request' });
    expect(send).toBeDisabled();
    fireEvent.change(within(dialog).getByLabelText('Why are you declining? Aline Uwase reads this.'), { target: { value: 'Please talk to your supervisor first.' } });
    fireEvent.click(send);
    await waitFor(() => expect(api.decide).toHaveBeenCalledWith('r1', { decision: 'decline', note: 'Please talk to your supervisor first.' }));
    await waitFor(() => expect(screen.queryByText('Aline Uwase')).not.toBeInTheDocument());
  });

  it('shows a refusal inside the dialog and keeps the request in the list', async () => {
    api.decide.mockRejectedValue(refused(409, 'coop_cooperative_inactive', 'That cooperative is no longer active.'));
    open();
    fireEvent.click(within(await card('Aline Uwase')).getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve this request?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('That cooperative is no longer active.');
    expect(screen.getAllByText('Aline Uwase').length).toBeGreaterThan(0);
  });

  it('refreshes the list when somebody decided first', async () => {
    api.decide.mockRejectedValue(refused(409, 'coop_already_decided', 'This request was already decided.'));
    open();
    fireEvent.click(within(await card('Aline Uwase')).getByRole('button', { name: 'Approve' }));
    const dialog = await screen.findByRole('dialog', { name: 'Approve this request?' });
    api.list.mockResolvedValue({ data: { data: { requests: [supervisor], count: 1 } } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Approve' }));
    await waitFor(() => expect(screen.queryByText('Aline Uwase')).not.toBeInTheDocument());
    expect(api.list).toHaveBeenCalledTimes(2);
  });
});
