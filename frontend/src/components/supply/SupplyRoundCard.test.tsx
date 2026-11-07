import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ current: vi.fn(), request: vi.fn(), cancel: vi.fn(), receive: vi.fn() }));
vi.mock('../../services/supply.service', () => ({
  supplyService: { currentRound: api.current, requestEggs: api.request, cancelRequest: api.cancel, receive: api.receive },
}));

import SupplyRoundCard from './SupplyRoundCard';

const round = (over: object = {}) => ({
  id: 'r1', name: 'November round', stockBoxes: 10, requestDeadline: '2026-11-10T12:00:00Z', deliveryDate: '2026-11-14', deliveryPlace: 'Cooperative store',
  expectedHarvestDate: '2026-12-20', lotCode: 'L2611-AB12', status: 'open', paused: false, createdAt: '2026-11-01T10:00:00Z', allocatedAt: null, ...over,
});
const request = (over: object = {}) => ({
  id: 'q1', status: 'submitted', boxesAsked: 2, note: '', boxesApproved: null, decisionNote: '', boxesReceived: null, condition: '', receivedAt: null, batchId: null,
  createdAt: '2026-11-02T10:00:00Z', farmer: { id: 'u', name: 'Aline', email: 'a@x.rw' }, room: { id: 'room1', name: 'Room A' }, farm: { id: 'f1', name: 'Hillside' }, ...over,
});
const room = (over: object = {}) => ({ id: 'room1', name: 'Room A', farmName: 'Hillside', limit: 2, allowance: 2, roomFree: 3, stock: 10, binding: 'allowance', ...over });

const answer = (data: { round?: object | null; myRequest?: object | null; rooms?: object[] }) =>
  api.current.mockResolvedValue({ data: { data: { round: null, myRequest: null, rooms: [], ...data } } });
const show = () => render(<LanguageProvider><ToastProvider><SupplyRoundCard /></ToastProvider></LanguageProvider>);

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  answer({ round: round(), rooms: [room()] });
});

describe('SupplyRoundCard', () => {
  it('shows nothing when no round is open, or when it cannot load', async () => {
    answer({ round: null });
    const first = show();
    await waitFor(() => expect(api.current).toHaveBeenCalled());
    expect(screen.queryByText('Egg supply')).not.toBeInTheDocument();
    first.unmount();
    api.current.mockRejectedValue(new Error('down'));
    show();
    await waitFor(() => expect(api.current).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Egg supply')).not.toBeInTheDocument();
  });

  it('says what the round is, until when to ask, and where and when it is handed over', async () => {
    show();
    expect(await screen.findByText('November round')).toBeInTheDocument();
    expect(screen.getByText(/Ask before Nov 10, 2026/)).toBeInTheDocument();
    expect(screen.getByText(/Handed over on Nov 14, 2026 at Cooperative store/)).toBeInTheDocument();
  });

  it('offers one main button to request eggs when the round is open and the farmer has an approved room', async () => {
    show();
    expect(await screen.findByRole('button', { name: 'Request eggs' })).toBeInTheDocument();
  });

  it('says a room is needed, and offers no button, when no room is approved', async () => {
    answer({ round: round(), rooms: [] });
    show();
    expect(await screen.findByText('You need an approved room to ask for eggs.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request eggs' })).not.toBeInTheDocument();
  });

  it('says no room has space, instead of offering a request that cannot work, when every limit is zero', async () => {
    answer({ round: round(), rooms: [room({ limit: 0, roomFree: 0, binding: 'room' })] });
    show();
    expect(await screen.findByText('None of your rooms has space for eggs now.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request eggs' })).not.toBeInTheDocument();
  });

  it('still offers the request when at least one room has space', async () => {
    answer({ round: round(), rooms: [room({ limit: 0, roomFree: 0, binding: 'room' }), room({ id: 'room2', name: 'Room B' })] });
    show();
    expect(await screen.findByRole('button', { name: 'Request eggs' })).toBeInTheDocument();
    expect(screen.queryByText('None of your rooms has space for eggs now.')).not.toBeInTheDocument();
  });

  it('says requests are closed once the round is closed', async () => {
    answer({ round: round({ status: 'closed' }) });
    show();
    expect(await screen.findByText('Requests are closed for this round.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Request eggs' })).not.toBeInTheDocument();
  });

  describe('the request dialog', () => {
    const openDialog = async () => {
      show();
      fireEvent.click(await screen.findByRole('button', { name: 'Request eggs' }));
      return screen.findByRole('dialog', { name: 'Request eggs' });
    };

    it('says what the farmer can ask for and why, for each bound', async () => {
      answer({ round: round(), rooms: [room({ binding: 'allowance' })] });
      const dialog = await openDialog();
      expect(within(dialog).getByText('You can ask for up to 2 boxes. Your allowance is 2.')).toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('names the room as the reason when the room sets the limit', async () => {
      answer({ round: round(), rooms: [room({ limit: 1, roomFree: 1, binding: 'room' })] });
      const dialog = await openDialog();
      expect(within(dialog).getByText('You can ask for up to 1 box. Room A has space for 1.')).toBeInTheDocument();
    });

    it('names the stock as the reason when the stock sets the limit', async () => {
      answer({ round: round(), rooms: [room({ limit: 3, stock: 3, binding: 'stock' })] });
      const dialog = await openDialog();
      expect(within(dialog).getByText('You can ask for up to 3 boxes. Only 3 boxes are in this round.')).toBeInTheDocument();
    });

    it('says when the space of the room is not counted yet', async () => {
      answer({ round: round(), rooms: [room({ roomFree: null })] });
      const dialog = await openDialog();
      expect(within(dialog).getByText('The size of your room is not counted yet.')).toBeInTheDocument();
    });

    it('lets the farmer choose among several rooms and shows the limit of the chosen one', async () => {
      answer({ round: round(), rooms: [room(), room({ id: 'room2', name: 'Room B', limit: 1, roomFree: 1, binding: 'room' })] });
      const dialog = await openDialog();
      const choice = within(dialog).getByLabelText('Room') as HTMLSelectElement;
      expect(choice.value).toBe('');
      fireEvent.change(choice, { target: { value: 'room2' } });
      expect(within(dialog).getByText('You can ask for up to 1 box. Room B has space for 1.')).toBeInTheDocument();
    });

    it.each([['0'], ['3'], ['-1'], ['1.5'], ['']])('refuses %s boxes before sending', async (boxes) => {
      const dialog = await openDialog();
      fireEvent.change(within(dialog).getByLabelText('Boxes'), { target: { value: boxes } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please ask for a whole number of boxes from 1 up to 2.');
      expect(api.request).not.toHaveBeenCalled();
    });

    it('refuses sending without a room when there are several', async () => {
      answer({ round: round(), rooms: [room(), room({ id: 'room2', name: 'Room B' })] });
      const dialog = await openDialog();
      fireEvent.change(within(dialog).getByLabelText('Boxes'), { target: { value: '1' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please choose a room.');
      expect(api.request).not.toHaveBeenCalled();
    });

    it('sends the room, the boxes and the note, then shows the waiting request', async () => {
      api.request.mockResolvedValue({ data: { data: { id: 'q1' } } });
      const dialog = await openDialog();
      fireEvent.change(within(dialog).getByLabelText('Boxes'), { target: { value: '2' } });
      fireEvent.change(within(dialog).getByLabelText(/^Note/), { target: { value: '  For the new house  ' } });
      answer({ round: round(), myRequest: request() });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));
      await waitFor(() => expect(api.request).toHaveBeenCalledWith('r1', { roomId: 'room1', boxes: 2, note: 'For the new house' }));
      expect(await screen.findByText('Request sent. Your supervisor will decide.', {}, { timeout: 5000 })).toBeInTheDocument();
      expect(await screen.findByText('Asked: 2 boxes in Room A')).toBeInTheDocument();
    });

    it('leaves the note out when it is empty', async () => {
      api.request.mockResolvedValue({ data: { data: { id: 'q1' } } });
      const dialog = await openDialog();
      fireEvent.change(within(dialog).getByLabelText('Boxes'), { target: { value: '1' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));
      await waitFor(() => expect(api.request).toHaveBeenCalledWith('r1', { roomId: 'room1', boxes: 1 }));
    });

    it('shows the answer of the server inside the dialog and keeps what was typed', async () => {
      api.request.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status: 409, data: { message: 'The deadline for this round has passed.' } } as never));
      const dialog = await openDialog();
      fireEvent.change(within(dialog).getByLabelText('Boxes'), { target: { value: '2' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('The deadline for this round has passed.');
      expect(within(dialog).getByLabelText('Boxes')).toHaveValue(2);
    });
  });

  describe('a request that was made', () => {
    it('shows it as a short timeline in plain words, and the one thing to do: cancel', async () => {
      answer({ round: round(), myRequest: request() });
      show();
      expect(await screen.findByText('Asked: 2 boxes in Room A')).toBeInTheDocument();
      expect(screen.getByText('Waiting for your supervisor to decide.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel request' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Request eggs' })).not.toBeInTheDocument();
    });

    it('cancels the request', async () => {
      answer({ round: round(), myRequest: request() });
      api.cancel.mockResolvedValue({ data: { data: null } });
      show();
      fireEvent.click(await screen.findByRole('button', { name: 'Cancel request' }));
      answer({ round: round(), rooms: [room()] });
      await waitFor(() => expect(api.cancel).toHaveBeenCalledWith('q1'));
      expect(await screen.findByText('Request cancelled.', {}, { timeout: 5000 })).toBeInTheDocument();
      expect(await screen.findByRole('button', { name: 'Request eggs' })).toBeInTheDocument();
    });

    it('says the result, with the delivery, once approved', async () => {
      answer({ round: round({ status: 'allocated' }), myRequest: request({ status: 'approved', boxesApproved: 2 }) });
      show();
      expect(await screen.findByText('Approved: 2 boxes')).toBeInTheDocument();
      expect(screen.getByText(/On the way: handed over on Nov 14, 2026 at Cooperative store/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Confirm received' })).toBeInTheDocument();
    });

    it('says what part of the request was approved', async () => {
      answer({ round: round({ status: 'allocated' }), myRequest: request({ status: 'part_approved', boxesApproved: 1, boxesAsked: 3 }) });
      show();
      expect(await screen.findByText('Partly approved: 1 box of 3')).toBeInTheDocument();
    });

    it('says the farmer is on the waiting list, and shows no receipt button', async () => {
      answer({ round: round({ status: 'allocated' }), myRequest: request({ status: 'waitlisted', boxesApproved: 0 }) });
      show();
      expect(await screen.findByText('On the waiting list')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Confirm received' })).not.toBeInTheDocument();
    });

    it('shows the reason as plain text when the request was not approved', async () => {
      answer({ round: round({ status: 'allocated' }), myRequest: request({ status: 'declined', boxesApproved: 0, decisionNote: '<b>Rooms</b> are full' }) });
      const { container } = show();
      expect(await screen.findByText('Not approved: <b>Rooms</b> are full')).toBeInTheDocument();
      expect(container.querySelector('b')).toBeNull();
    });

    it('says handing out is paused, and offers no receipt, while the round is paused', async () => {
      answer({ round: round({ status: 'allocated', paused: true }), myRequest: request({ status: 'approved', boxesApproved: 2 }) });
      show();
      expect(await screen.findByText('Handing out eggs is paused for now.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Confirm received' })).not.toBeInTheDocument();
    });

    it('shows a received request as done', async () => {
      answer({ round: round({ status: 'allocated' }), myRequest: request({ status: 'received', boxesApproved: 2, boxesReceived: 2, condition: 'good' }) });
      show();
      expect(await screen.findByText('Received: 2 boxes, in good condition')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Confirm received' })).not.toBeInTheDocument();
    });

    it('shows a note of the farmer as plain text', async () => {
      answer({ round: round(), myRequest: request({ note: '<i>for the new house</i>' }) });
      const { container } = show();
      expect(await screen.findByText('<i>for the new house</i>')).toBeInTheDocument();
      expect(container.querySelector('i')).toBeNull();
    });
  });

  describe('confirming that the eggs arrived', () => {
    const openReceipt = async (over: object = {}) => {
      answer({ round: round({ status: 'allocated' }), myRequest: request({ status: 'approved', boxesApproved: 3, boxesAsked: 3, ...over }) });
      show();
      fireEvent.click(await screen.findByRole('button', { name: 'Confirm received' }));
      return screen.findByRole('dialog', { name: 'Confirm received' });
    };

    it('starts at what was promised and in good condition, and sends both', async () => {
      api.receive.mockResolvedValue({ data: { data: { id: 'q1', batchId: 'b1' } } });
      const dialog = await openReceipt();
      expect(within(dialog).getByLabelText('Boxes received')).toHaveValue(3);
      expect(within(dialog).getByLabelText('Condition')).toHaveValue('good');
      fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
      await waitFor(() => expect(api.receive).toHaveBeenCalledWith('q1', { boxes: 3, condition: 'good' }));
      expect(await screen.findByText('Eggs received. A batch was started in Room A.', {}, { timeout: 5000 })).toBeInTheDocument();
    });

    it('sends a smaller quantity and a damaged condition when that is what arrived', async () => {
      api.receive.mockResolvedValue({ data: { data: { id: 'q1', batchId: 'b1' } } });
      const dialog = await openReceipt();
      fireEvent.change(within(dialog).getByLabelText('Boxes received'), { target: { value: '2' } });
      fireEvent.change(within(dialog).getByLabelText('Condition'), { target: { value: 'damaged' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
      await waitFor(() => expect(api.receive).toHaveBeenCalledWith('q1', { boxes: 2, condition: 'damaged' }));
    });

    it.each([['0'], ['4'], ['2.5'], ['']])('refuses %s boxes before sending', async (boxes) => {
      const dialog = await openReceipt();
      fireEvent.change(within(dialog).getByLabelText('Boxes received'), { target: { value: boxes } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please enter the boxes you received, from 1 up to 3.');
      expect(api.receive).not.toHaveBeenCalled();
    });

    it('shows the answer of the server inside the dialog', async () => {
      api.receive.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status: 409, data: { message: 'These eggs were already recorded as received.' } } as never));
      const dialog = await openReceipt();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('These eggs were already recorded as received.');
    });
  });
});
