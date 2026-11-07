import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'sup', name: 'Claire Uwimana', role: 'SUPERVISOR' } }) }));

const api = vi.hoisted(() => ({
  get: vi.fn(), update: vi.fn(), action: vi.fn(), proposal: vi.fn(), confirm: vi.fn(), receive: vi.fn(), notCollected: vi.fn(),
}));
vi.mock('../../services/supply.service', () => ({
  supplyService: {
    getRound: api.get, updateRound: api.update, roundAction: api.action, roundProposal: api.proposal, confirmRound: api.confirm,
    receive: api.receive, notCollected: api.notCollected,
  },
}));

import SupplyRoundPage from './SupplyRoundPage';

const round = (over: object = {}) => ({
  id: 'r1', name: 'November round', stockBoxes: 10, requestDeadline: '2026-11-10T12:00:00Z', deliveryDate: '2026-11-14', deliveryPlace: 'Cooperative store',
  expectedHarvestDate: '2026-12-20', lotCode: 'L2611-AB12', status: 'open', paused: false, createdAt: '2026-11-01T10:00:00Z', allocatedAt: null, ...over,
});
const request = (id: string, name: string, over: object = {}) => ({
  id, status: 'submitted', boxesAsked: 2, note: '', boxesApproved: null, decisionNote: '', boxesReceived: null, condition: '', receivedAt: null, batchId: null,
  createdAt: '2026-11-02T10:00:00Z', farmer: { id: `u-${id}`, name, email: `${id}@x.rw` }, room: { id: `room-${id}`, name: 'Room A' }, farm: { id: 'f1', name: 'Hillside' }, ...over,
});
const row = (id: string, name: string, over: object = {}) => ({
  id, farmer: { id: `u-${id}`, name, email: `${id}@x.rw` }, room: { id: `room-${id}`, name: 'Room A' }, asked: 3, allowance: 3, roomFree: 5, ceiling: 3, proposed: 3, note: '', createdAt: '2026-11-02T10:00:00Z', ...over,
});

const serve = (r: object, requests: object[] = []) => api.get.mockResolvedValue({ data: { data: { round: r, requests } } });
const open = () => render(
  <MemoryRouter initialEntries={['/supply/r1']}>
    <LanguageProvider>
      <ToastProvider>
        <Routes><Route path="/supply/:id" element={<SupplyRoundPage />} /></Routes>
      </ToastProvider>
    </LanguageProvider>
  </MemoryRouter>,
);
const conflict = () => new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status: 409, data: { message: 'This round was already confirmed.' } } as never);

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  serve(round());
});

describe('A supply round', () => {
  it('shows its facts, its lot code and its status', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 2, name: 'November round' })).toBeInTheDocument();
    expect(screen.getByText('Open for requests')).toBeInTheDocument();
    expect(screen.getByText('10 boxes')).toBeInTheDocument();
    expect(screen.getByText('Cooperative store')).toBeInTheDocument();
    expect(screen.getByText('L2611-AB12')).toBeInTheDocument();
    expect(screen.getByText(/Nov 14, 2026/)).toBeInTheDocument();
  });

  it('says it could not load, with a way to try again', async () => {
    api.get.mockRejectedValueOnce(new Error('down'));
    open();
    expect(await screen.findByText('We could not load this round.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'November round' })).toBeInTheDocument();
  });

  it('says a round that is not there is not found', async () => {
    api.get.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status: 404, data: { message: 'We could not find that round.' } } as never));
    open();
    expect(await screen.findByText('We could not load this round.')).toBeInTheDocument();
  });

  describe('a draft', () => {
    beforeEach(() => serve(round({ status: 'draft', lotCode: null })));

    it('offers to open it, asks first, and tells the farmers', async () => {
      api.action.mockResolvedValue({ data: { data: round() } });
      open();
      fireEvent.click(await screen.findByRole('button', { name: 'Open round' }));
      const dialog = await screen.findByRole('dialog', { name: 'Open this round?' });
      serve(round());
      fireEvent.click(within(dialog).getByRole('button', { name: 'Open round' }));
      await waitFor(() => expect(api.action).toHaveBeenCalledWith('r1', { action: 'open' }));
      expect(await screen.findByText('Round opened. Your farmers are told.', {}, { timeout: 5000 })).toBeInTheDocument();
    });

    it('can be changed', async () => {
      open();
      fireEvent.click(await screen.findByRole('button', { name: 'Change' }));
      expect(await screen.findByRole('dialog', { name: 'Change round' })).toBeInTheDocument();
    });

    it('shows no lot code before it opens', async () => {
      open();
      await screen.findByRole('heading', { level: 2, name: 'November round' });
      expect(screen.queryByText('Lot code')).not.toBeInTheDocument();
    });
  });

  describe('an open round', () => {
    it('lists the requests with their farmer, room and boxes, as plain text', async () => {
      serve(round(), [request('q1', '<b>Aline</b> Uwase', { boxesAsked: 3, note: '<i>new house</i>' })]);
      const { container } = open();
      const rowEl = (await screen.findByText('<b>Aline</b> Uwase')).closest('tr') as HTMLElement;
      expect(within(rowEl).getByText('Room A')).toBeInTheDocument();
      expect(within(rowEl).getByText('3')).toBeInTheDocument();
      expect(screen.getByText('<i>new house</i>')).toBeInTheDocument();
      expect(container.querySelector('b, i')).toBeNull();
    });

    it('says nobody asked yet', async () => {
      open();
      expect(await screen.findByText('Nobody has asked yet.')).toBeInTheDocument();
    });

    it('closes the requests after asking', async () => {
      api.action.mockResolvedValue({ data: { data: round({ status: 'closed' }) } });
      open();
      fireEvent.click(await screen.findByRole('button', { name: 'Close requests' }));
      const dialog = await screen.findByRole('dialog', { name: 'Close the requests?' });
      serve(round({ status: 'closed' }));
      api.proposal.mockResolvedValue({ data: { data: { requests: [], stock: 10, total: 0 } } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close requests' }));
      await waitFor(() => expect(api.action).toHaveBeenCalledWith('r1', { action: 'close' }));
    });

    it('pauses and resumes', async () => {
      api.action.mockResolvedValue({ data: { data: round({ paused: true }) } });
      open();
      fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
      await waitFor(() => expect(api.action).toHaveBeenCalledWith('r1', { action: 'pause' }));
    });

    it('shows a paused round as paused with a way to resume', async () => {
      serve(round({ paused: true }));
      open();
      expect(await screen.findByText('Paused')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    });

    it('is cancelled only with a reason, and tells the farmers', async () => {
      api.action.mockResolvedValue({ data: { data: round({ status: 'cancelled' }) } });
      open();
      fireEvent.click(await screen.findByRole('button', { name: 'Cancel round' }));
      const dialog = await screen.findByRole('dialog', { name: 'Cancel this round' });
      const send = within(dialog).getByRole('button', { name: 'Cancel round' });
      expect(send).toBeDisabled();
      fireEvent.change(within(dialog).getByLabelText('Why? The farmers read this.'), { target: { value: '  No eggs this month  ' } });
      serve(round({ status: 'cancelled' }));
      fireEvent.click(send);
      await waitFor(() => expect(api.action).toHaveBeenCalledWith('r1', { action: 'cancel', note: 'No eggs this month' }));
      expect(await screen.findByText('Round cancelled. The farmers are told.', {}, { timeout: 5000 })).toBeInTheDocument();
    });
  });

  describe('a closed round, to split', () => {
    beforeEach(() => {
      serve(round({ status: 'closed', stockBoxes: 3 }), [request('q1', 'Aline Uwase'), request('q2', 'Bruce Ishimwe')]);
      api.proposal.mockResolvedValue({ data: { data: { requests: [row('q1', 'Aline Uwase', { proposed: 2 }), row('q2', 'Bruce Ishimwe', { proposed: 1, asked: 2, ceiling: 2 })], stock: 3, total: 3 } } });
    });

    it('shows the proposed split with what each can take, and the live total against the stock', async () => {
      open();
      const aline = (await screen.findByText('Aline Uwase', { selector: '.cell-strong' })).closest('tr') as HTMLElement;
      expect(within(aline).getByLabelText('Give to Aline Uwase')).toHaveValue(2);
      expect(within(aline).getByText('5')).toBeInTheDocument();
      expect(screen.getByText('3 of 3 boxes')).toBeInTheDocument();
    });

    it('says the room space is not known when it is not', async () => {
      api.proposal.mockResolvedValue({ data: { data: { requests: [row('q1', 'Aline Uwase', { roomFree: null })], stock: 3, total: 3 } } });
      open();
      expect(await screen.findByText('not known')).toBeInTheDocument();
    });

    it('moves the live total as numbers are edited and refuses more than the stock', async () => {
      open();
      const give = await screen.findByLabelText('Give to Aline Uwase');
      fireEvent.change(give, { target: { value: '3' } });
      expect(screen.getByText('4 of 3 boxes')).toBeInTheDocument();
      expect(screen.getByText('That is more than the boxes in the round.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirm split' })).toBeDisabled();
      fireEvent.change(give, { target: { value: '1' } });
      expect(screen.getByText('2 of 3 boxes')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirm split' })).toBeEnabled();
    });

    it.each([['-1'], ['2.5'], ['']])('does not allow %s as a number of boxes', async (value) => {
      open();
      fireEvent.change(await screen.findByLabelText('Give to Aline Uwase'), { target: { value } });
      expect(screen.getByRole('button', { name: 'Confirm split' })).toBeDisabled();
    });

    it('does not allow more than the farmer asked for', async () => {
      open();
      fireEvent.change(await screen.findByLabelText('Give to Bruce Ishimwe'), { target: { value: '3' } });
      expect(screen.getByRole('button', { name: 'Confirm split' })).toBeDisabled();
    });

    it('asks before confirming, then sends every row with the edited numbers and the reasons', async () => {
      api.confirm.mockResolvedValue({ data: { data: { round: round({ status: 'allocated' }), total: 2 } } });
      open();
      fireEvent.change(await screen.findByLabelText('Give to Bruce Ishimwe'), { target: { value: '0' } });
      fireEvent.change(screen.getByLabelText('Reason for Bruce Ishimwe'), { target: { value: 'No space in your room' } });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm split' }));
      const dialog = await screen.findByRole('dialog', { name: 'Confirm the split?' });
      serve(round({ status: 'allocated' }), []);
      fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm split' }));
      await waitFor(() => expect(api.confirm).toHaveBeenCalledWith('r1', [
        { id: 'q1', boxes: 2 },
        { id: 'q2', boxes: 0, declineNote: 'No space in your room' },
      ]));
      expect(await screen.findByText('Split confirmed. The farmers are told.', {}, { timeout: 5000 })).toBeInTheDocument();
    });

    it('says someone confirmed it already, and refreshes, when another supervisor was first', async () => {
      api.confirm.mockRejectedValue(conflict());
      open();
      await screen.findByLabelText('Give to Aline Uwase');
      fireEvent.click(screen.getByRole('button', { name: 'Confirm split' }));
      const dialog = await screen.findByRole('dialog', { name: 'Confirm the split?' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm split' }));
      expect(await screen.findByText('Someone did this already.', {}, { timeout: 5000 })).toBeInTheDocument();
      await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    });

    it('shows the message of the server inside the dialog for any other refusal', async () => {
      api.confirm.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status: 422, data: { message: 'That is 4 boxes, and only 3 boxes are in this round.' } } as never));
      open();
      await screen.findByLabelText('Give to Aline Uwase');
      fireEvent.click(screen.getByRole('button', { name: 'Confirm split' }));
      const dialog = await screen.findByRole('dialog', { name: 'Confirm the split?' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm split' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('That is 4 boxes, and only 3 boxes are in this round.');
    });

    it('says nobody asked when there is nothing to split', async () => {
      serve(round({ status: 'closed' }), []);
      api.proposal.mockResolvedValue({ data: { data: { requests: [], stock: 10, total: 0 } } });
      open();
      expect(await screen.findByText('Nobody asked for eggs in this round.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Confirm split' })).not.toBeInTheDocument();
    });
  });

  describe('a round that is handing out eggs', () => {
    beforeEach(() => {
      serve(round({ status: 'allocated', allocatedAt: '2026-11-11T10:00:00Z' }), [
        request('q1', 'Aline Uwase', { status: 'approved', boxesApproved: 2 }),
        request('q2', 'Bruce Ishimwe', { status: 'part_approved', boxesApproved: 1, boxesAsked: 3 }),
        request('q3', 'Chantal Mukamana', { status: 'waitlisted', boxesApproved: 0 }),
        request('q4', 'Didier Habimana', { status: 'declined', boxesApproved: 0, decisionNote: 'No space' }),
        request('q5', 'Eric Niyonzima', { status: 'received', boxesApproved: 2, boxesReceived: 2, condition: 'good' }),
      ]);
    });

    it('shows each result in words', async () => {
      open();
      const result = async (name: string) => (await screen.findByText(name)).closest('tr') as HTMLElement;
      expect(within(await result('Aline Uwase')).getByText('Approved: 2 boxes')).toBeInTheDocument();
      expect(within(await result('Bruce Ishimwe')).getByText('Partly approved: 1 box of 3')).toBeInTheDocument();
      expect(within(await result('Chantal Mukamana')).getByText('On the waiting list')).toBeInTheDocument();
      expect(within(await result('Didier Habimana')).getByText('Not approved: No space')).toBeInTheDocument();
      expect(within(await result('Eric Niyonzima')).getByText('Received: 2 boxes, in good condition')).toBeInTheDocument();
    });

    it('offers receipt and not collected only where eggs are waiting', async () => {
      open();
      const aline = (await screen.findByText('Aline Uwase')).closest('tr') as HTMLElement;
      expect(within(aline).getByRole('button', { name: 'Record receipt for Aline Uwase' })).toBeInTheDocument();
      expect(within(aline).getByRole('button', { name: 'Not collected: Aline Uwase' })).toBeInTheDocument();
      for (const name of ['Chantal Mukamana', 'Didier Habimana', 'Eric Niyonzima']) {
        const other = (await screen.findByText(name)).closest('tr') as HTMLElement;
        expect(within(other).queryByRole('button')).not.toBeInTheDocument();
      }
    });

    it('records the receipt for a farmer, with the quantity and the condition', async () => {
      api.receive.mockResolvedValue({ data: { data: { id: 'q1', batchId: 'b1' } } });
      open();
      fireEvent.click(await screen.findByRole('button', { name: 'Record receipt for Aline Uwase' }));
      const dialog = await screen.findByRole('dialog', { name: 'Confirm received' });
      fireEvent.change(within(dialog).getByLabelText('Boxes received'), { target: { value: '1' } });
      fireEvent.change(within(dialog).getByLabelText('Condition'), { target: { value: 'damaged' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
      await waitFor(() => expect(api.receive).toHaveBeenCalledWith('q1', { boxes: 1, condition: 'damaged' }));
      expect(await screen.findByText('Receipt recorded for Aline Uwase.', {}, { timeout: 5000 })).toBeInTheDocument();
    });

    it('marks eggs as not collected after asking', async () => {
      api.notCollected.mockResolvedValue({ data: { data: { id: 'q1', status: 'not_collected' } } });
      open();
      fireEvent.click(await screen.findByRole('button', { name: 'Not collected: Aline Uwase' }));
      const dialog = await screen.findByRole('dialog', { name: 'Mark as not collected?' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Not collected' }));
      await waitFor(() => expect(api.notCollected).toHaveBeenCalledWith('q1'));
      expect(await screen.findByText('Marked as not collected.', {}, { timeout: 5000 })).toBeInTheDocument();
    });

    it('says handing out is paused, and shows no receipt buttons, while the round is paused', async () => {
      serve(round({ status: 'allocated', paused: true }), [request('q1', 'Aline Uwase', { status: 'approved', boxesApproved: 2 })]);
      open();
      expect(await screen.findByText('Handing out eggs is paused for now.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Record receipt for Aline Uwase' })).not.toBeInTheDocument();
    });
  });

  describe('a finished round', () => {
    it.each(['done', 'cancelled'])('is read only when %s', async (status) => {
      serve(round({ status }), [request('q1', 'Aline Uwase', { status: status === 'done' ? 'received' : 'cancelled', boxesReceived: 2, boxesApproved: 2, condition: 'good' })]);
      open();
      await screen.findByText('Aline Uwase');
      for (const name of ['Open round', 'Change', 'Close requests', 'Pause', 'Cancel round', 'Confirm split']) {
        expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
      }
    });
  });
});
