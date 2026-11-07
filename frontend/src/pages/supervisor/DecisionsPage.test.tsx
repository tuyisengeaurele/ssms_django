import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'sup', name: 'Claire Uwimana', role: 'SUPERVISOR' } }) }));

const api = vi.hoisted(() => ({
  rooms: vi.fn(), review: vi.fn(), requests: vi.fn(), decide: vi.fn(), evidence: vi.fn(), rounds: vi.fn(),
}));
vi.mock('../../services/room.service', () => ({ roomService: { waiting: api.rooms, review: api.review } }));
vi.mock('../../services/supply.service', () => ({
  supplyService: { waiting: api.requests, decide: api.decide, getFarmerAllowance: api.evidence, listRounds: api.rounds },
}));

import DecisionsPage from './DecisionsPage';

const newRoom = {
  id: 'r1', name: 'North house', kind: 'new', approvalStatus: 'pending', areaM2: 14.5, pendingAreaM2: null, createdAt: '2026-11-05T10:00:00Z',
  farm: { id: 'f1', name: 'Hillside' }, owner: { name: 'Aline Uwase', email: 'aline@example.rw' },
};
const sizeChange = {
  id: 'r2', name: 'Cocoon room', kind: 'size', approvalStatus: 'approved', areaM2: 12, pendingAreaM2: 20, createdAt: '2026-11-06T09:00:00Z',
  farm: { id: 'f2', name: 'Riverside' }, owner: { name: 'Bruce Ishimwe', email: 'bruce@example.rw' },
};
const request = {
  id: 'q1', boxesAsked: 4, currentBoxes: 2, reason: 'I built a second house', createdAt: '2026-11-04T10:00:00Z',
  farmer: { id: 'u1', name: 'Gad Anaclet', email: 'gad@example.rw' },
};
const evidence = {
  boxes: 2, source: 'set', since: '2026-10-01T10:00:00Z', openRequest: null, capacityBoxes: 5, starterBoxes: 2,
  history: [
    { oldBoxes: 3, newBoxes: 2, kind: 'reduction', reason: 'Outbreak last month', byName: 'Claire Uwimana', at: '2026-10-20T10:00:00Z' },
    { oldBoxes: null, newBoxes: 3, kind: 'start', reason: '', byName: 'Claire Uwimana', at: '2026-10-01T10:00:00Z' },
  ],
  farmer: { id: 'u1', name: 'Gad Anaclet', email: 'gad@example.rw' },
  rooms: [
    { id: 'r9', name: 'Main house', approvalStatus: 'approved', areaM2: 20, pendingAreaM2: null, capacityBoxes: 5 },
    { id: 'r8', name: 'Shed', approvalStatus: 'pending', areaM2: 6, pendingAreaM2: null, capacityBoxes: null },
  ],
};

const open = () => render(
  <MemoryRouter>
    <LanguageProvider>
      <ToastProvider>
        <DecisionsPage />
      </ToastProvider>
    </LanguageProvider>
  </MemoryRouter>,
);

const listed = (rooms: object[], requests: object[]) => {
  api.rooms.mockResolvedValue({ data: { data: { rooms, count: rooms.length } } });
  api.requests.mockResolvedValue({ data: { data: { requests, count: requests.length } } });
};

const item = async (text: string) => (await screen.findByText(text)).closest('li') as HTMLElement;
const conflict = () => new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status: 409, data: { message: 'Nothing waits for a decision on that room.' } } as never);

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  listed([newRoom, sizeChange], [request]);
  api.evidence.mockResolvedValue({ data: { data: evidence } });
  api.rounds.mockResolvedValue({ data: { data: { rounds: [] } } });
});

const aRound = (over: object = {}) => ({
  id: 'r1', name: 'November round', stockBoxes: 10, requestDeadline: '2026-11-03T12:00:00Z', deliveryDate: '2026-11-14', deliveryPlace: 'Store',
  expectedHarvestDate: '2026-12-20', lotCode: 'L2611-AB12', status: 'closed', paused: false, createdAt: '2026-11-01T10:00:00Z', allocatedAt: null, requestCount: 3, approvedBoxes: 0, ...over,
});

describe('Decisions, supply rounds', () => {
  it('shows a closed round with requests, how many wait, and a way to open it', async () => {
    api.rounds.mockResolvedValue({ data: { data: { rounds: [aRound()] } } });
    open();
    const li = (await screen.findByText('November round')).closest('li') as HTMLElement;
    expect(within(li).getByText('November round is closed. 3 requests wait for the split.')).toBeInTheDocument();
    expect(within(li).getByRole('link', { name: 'Open round' })).toHaveAttribute('href', '/supply/r1');
  });

  it('says it in the singular for one request', async () => {
    api.rounds.mockResolvedValue({ data: { data: { rounds: [aRound({ requestCount: 1 })] } } });
    open();
    expect(await screen.findByText('November round is closed. 1 request waits for the split.')).toBeInTheDocument();
  });

  it('leaves out rounds that are open, finished or without requests', async () => {
    api.rounds.mockResolvedValue({ data: { data: { rounds: [aRound({ id: 'a', name: 'Open one', status: 'open' }), aRound({ id: 'b', name: 'Empty one', requestCount: 0 }), aRound({ id: 'c', name: 'Done one', status: 'done' })] } } });
    open();
    await screen.findByText('Gad Anaclet');
    for (const name of ['Open one', 'Empty one', 'Done one']) expect(screen.queryByText(name)).not.toBeInTheDocument();
  });

  it('counts and filters the supply items', async () => {
    api.rounds.mockResolvedValue({ data: { data: { rounds: [aRound()] } } });
    open();
    await screen.findByText('Gad Anaclet');
    expect(screen.getByRole('button', { name: 'All (4)' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Supply (1)' }));
    expect(screen.getByText('November round')).toBeInTheDocument();
    expect(screen.queryByText('Gad Anaclet')).not.toBeInTheDocument();
  });

  it('still shows the rest when the rounds cannot be loaded', async () => {
    api.rounds.mockRejectedValue(new Error('down'));
    open();
    expect(await screen.findByText('Gad Anaclet')).toBeInTheDocument();
  });

  it('shows a round name as plain text', async () => {
    api.rounds.mockResolvedValue({ data: { data: { rounds: [aRound({ name: '<b>Big</b> round' })] } } });
    const { container } = open();
    expect(await screen.findByText('<b>Big</b> round')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });
});

describe('Decisions', () => {
  it('lists rooms and requests together, the one waiting longest first, with what each is about', async () => {
    open();
    await screen.findByText('Gad Anaclet');
    const names = screen.getAllByRole('listitem').map((li) => li.querySelector('.cell-strong')?.textContent);
    expect(names).toEqual(['Gad Anaclet', 'Aline Uwase', 'Bruce Ishimwe']);
    const room = await item('Aline Uwase');
    expect(within(room).getByText('New room: North house on Hillside')).toBeInTheDocument();
    expect(within(room).getByText('14.5 m²')).toBeInTheDocument();
    const size = await item('Bruce Ishimwe');
    expect(within(size).getByText('Size change for Cocoon room on Riverside')).toBeInTheDocument();
    expect(within(size).getByText('12 m² now, 20 m² asked')).toBeInTheDocument();
    const ask = await item('Gad Anaclet');
    expect(within(ask).getByText('Asks for 4 boxes, has 2 boxes')).toBeInTheDocument();
    expect(within(ask).getByText('I built a second house')).toBeInTheDocument();
  });

  it('filters by kind and counts each', async () => {
    open();
    await screen.findByText('Gad Anaclet');
    expect(screen.getByRole('button', { name: 'All (3)' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Rooms (2)' }));
    expect(screen.queryByText('Gad Anaclet')).not.toBeInTheDocument();
    expect(screen.getByText('Aline Uwase')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Allowance (1)' }));
    expect(screen.getByText('Gad Anaclet')).toBeInTheDocument();
    expect(screen.queryByText('Aline Uwase')).not.toBeInTheDocument();
  });

  it('says calmly that nothing waits', async () => {
    listed([], []);
    open();
    expect(await screen.findByText('Nothing waits for you.')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('says it could not load and offers to try again, instead of showing a blank page', async () => {
    api.rooms.mockRejectedValueOnce(new Error('down'));
    open();
    expect(await screen.findByText('We could not load your decisions.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Gad Anaclet')).toBeInTheDocument();
  });

  it('shows names, reasons and notes as plain text', async () => {
    listed([{ ...newRoom, owner: { name: '<i>Aline</i>', email: 'a@x.rw' } }], [{ ...request, reason: '<b>more</b> room please' }]);
    const { container } = open();
    expect(await screen.findByText('<i>Aline</i>')).toBeInTheDocument();
    expect(screen.getByText('<b>more</b> room please')).toBeInTheDocument();
    expect(container.querySelector('b, i')).toBeNull();
  });

  describe('a room', () => {
    it('is approved at once, leaves the list, and tells the menu to recount', async () => {
      api.review.mockResolvedValue({ data: { data: {} } });
      const recount = vi.fn();
      window.addEventListener('ssms:decisions', recount);
      open();
      fireEvent.click(within(await item('Aline Uwase')).getByRole('button', { name: 'Approve' }));
      await waitFor(() => expect(api.review).toHaveBeenCalledWith('r1', { decision: 'approve', note: '' }));
      expect(await screen.findByText('Room approved. Aline Uwase is told.', {}, { timeout: 5000 })).toBeInTheDocument();
      expect(screen.queryByText('New room: North house on Hillside')).not.toBeInTheDocument();
      expect(recount).toHaveBeenCalled();
      window.removeEventListener('ssms:decisions', recount);
    });

    it('is rejected only with a reason', async () => {
      api.review.mockResolvedValue({ data: { data: {} } });
      open();
      fireEvent.click(within(await item('Aline Uwase')).getByRole('button', { name: 'Reject' }));
      const dialog = await screen.findByRole('dialog', { name: 'Reject this room' });
      const send = within(dialog).getByRole('button', { name: 'Reject room' });
      expect(send).toBeDisabled();
      fireEvent.change(within(dialog).getByLabelText('Why? Aline Uwase reads this.'), { target: { value: '   ' } });
      expect(send).toBeDisabled();
      fireEvent.change(within(dialog).getByLabelText('Why? Aline Uwase reads this.'), { target: { value: '  Too small for a batch  ' } });
      expect(send).toBeEnabled();
      fireEvent.click(send);
      await waitFor(() => expect(api.review).toHaveBeenCalledWith('r1', { decision: 'reject', note: 'Too small for a batch' }));
      expect(await screen.findByText('Room not approved. Aline Uwase is told.', {}, { timeout: 5000 })).toBeInTheDocument();
    });

    it('shows the answer of the server inside the reject dialog and keeps the item', async () => {
      api.review.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status: 422, data: { message: 'Please say why, so the farmer knows what to change.' } } as never));
      open();
      fireEvent.click(within(await item('Aline Uwase')).getByRole('button', { name: 'Reject' }));
      const dialog = await screen.findByRole('dialog', { name: 'Reject this room' });
      fireEvent.change(within(dialog).getByLabelText('Why? Aline Uwase reads this.'), { target: { value: 'Too small for a batch' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Reject room' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please say why, so the farmer knows what to change.');
      expect(screen.getByText('New room: North house on Hillside')).toBeInTheDocument();
    });

    it('says someone decided it already when another supervisor was first, and refreshes the list', async () => {
      api.review.mockRejectedValue(conflict());
      open();
      fireEvent.click(within(await item('Aline Uwase')).getByRole('button', { name: 'Approve' }));
      expect(await screen.findByText('Someone decided this already.', {}, { timeout: 5000 })).toBeInTheDocument();
      await waitFor(() => expect(api.rooms).toHaveBeenCalledTimes(2));
    });

    it('keeps the item and shows the message when the approval fails for another reason', async () => {
      api.review.mockRejectedValue(new AxiosError('x', 'ERR_NETWORK'));
      open();
      fireEvent.click(within(await item('Aline Uwase')).getByRole('button', { name: 'Approve' }));
      await waitFor(() => expect(api.review).toHaveBeenCalled());
      expect(await screen.findByText('New room: North house on Hillside')).toBeInTheDocument();
      expect(api.rooms).toHaveBeenCalledTimes(1);
    });
  });

  describe('an allowance request', () => {
    it('is approved at the amount asked', async () => {
      api.decide.mockResolvedValue({ data: { data: {} } });
      open();
      fireEvent.click(within(await item('Gad Anaclet')).getByRole('button', { name: 'Approve 4 boxes' }));
      await waitFor(() => expect(api.decide).toHaveBeenCalledWith('q1', { decision: 'approve' }));
      expect(await screen.findByText('Allowance approved. Gad Anaclet is told.', {}, { timeout: 5000 })).toBeInTheDocument();
      expect(screen.queryByText('Asks for 4 boxes, has 2 boxes')).not.toBeInTheDocument();
    });

    it('can be approved at another amount, with a note that may be left empty', async () => {
      api.decide.mockResolvedValue({ data: { data: {} } });
      open();
      fireEvent.click(within(await item('Gad Anaclet')).getByRole('button', { name: 'Approve another amount' }));
      const dialog = await screen.findByRole('dialog', { name: 'Approve another amount' });
      fireEvent.change(within(dialog).getByLabelText('Boxes to grant'), { target: { value: '3' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Approve amount' }));
      await waitFor(() => expect(api.decide).toHaveBeenCalledWith('q1', { decision: 'approve', boxes: 3 }));
    });

    it('sends the note of another amount when there is one', async () => {
      api.decide.mockResolvedValue({ data: { data: {} } });
      open();
      fireEvent.click(within(await item('Gad Anaclet')).getByRole('button', { name: 'Approve another amount' }));
      const dialog = await screen.findByRole('dialog', { name: 'Approve another amount' });
      fireEvent.change(within(dialog).getByLabelText('Boxes to grant'), { target: { value: '0' } });
      fireEvent.change(within(dialog).getByLabelText(/^Note/), { target: { value: ' Three for now ' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Approve amount' }));
      await waitFor(() => expect(api.decide).toHaveBeenCalledWith('q1', { decision: 'approve', boxes: 0, note: 'Three for now' }));
    });

    it.each([['-1'], ['101'], ['2.5'], ['']])('refuses %s boxes before sending', async (boxes) => {
      open();
      fireEvent.click(within(await item('Gad Anaclet')).getByRole('button', { name: 'Approve another amount' }));
      const dialog = await screen.findByRole('dialog', { name: 'Approve another amount' });
      fireEvent.change(within(dialog).getByLabelText('Boxes to grant'), { target: { value: boxes } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Approve amount' }));
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please enter a whole number of boxes from 0 to 100.');
      expect(api.decide).not.toHaveBeenCalled();
    });

    it('is declined only with a reason', async () => {
      api.decide.mockResolvedValue({ data: { data: {} } });
      open();
      fireEvent.click(within(await item('Gad Anaclet')).getByRole('button', { name: 'Decline' }));
      const dialog = await screen.findByRole('dialog', { name: 'Decline this request' });
      const send = within(dialog).getByRole('button', { name: 'Decline request' });
      expect(send).toBeDisabled();
      fireEvent.change(within(dialog).getByLabelText('Why? Gad Anaclet reads this.'), { target: { value: 'Not this season' } });
      fireEvent.click(send);
      await waitFor(() => expect(api.decide).toHaveBeenCalledWith('q1', { decision: 'decline', note: 'Not this season' }));
      expect(await screen.findByText('Request declined. Gad Anaclet is told.', {}, { timeout: 5000 })).toBeInTheDocument();
    });

    it('says someone decided it already, and refreshes the list', async () => {
      api.decide.mockRejectedValue(conflict());
      open();
      fireEvent.click(within(await item('Gad Anaclet')).getByRole('button', { name: 'Approve 4 boxes' }));
      expect(await screen.findByText('Someone decided this already.', {}, { timeout: 5000 })).toBeInTheDocument();
      await waitFor(() => expect(api.requests).toHaveBeenCalledTimes(2));
    });

    it('shows the evidence on request: history, rooms and what they can hold', async () => {
      open();
      const ask = await item('Gad Anaclet');
      expect(api.evidence).not.toHaveBeenCalled();
      fireEvent.click(within(ask).getByRole('button', { name: 'See details' }));
      expect(await within(ask).findByText('Lowered to 2 boxes by Claire Uwimana: Outbreak last month')).toBeInTheDocument();
      expect(within(ask).getByText('Started with 3 boxes')).toBeInTheDocument();
      expect(within(ask).getByText('Main house: 20 m², holds about 5 boxes')).toBeInTheDocument();
      expect(within(ask).getByText('Shed: 6 m², not approved yet')).toBeInTheDocument();
      expect(api.evidence).toHaveBeenCalledWith('u1');
      fireEvent.click(within(ask).getByRole('button', { name: 'Hide details' }));
      fireEvent.click(within(ask).getByRole('button', { name: 'See details' }));
      expect(api.evidence).toHaveBeenCalledTimes(1);
    });

    it('says there are no changes yet instead of an empty history for a farmer still on the default', async () => {
      api.evidence.mockResolvedValue({ data: { data: { ...evidence, source: 'default', since: null, history: [] } } });
      open();
      const ask = await item('Gad Anaclet');
      fireEvent.click(within(ask).getByRole('button', { name: 'See details' }));
      expect(await within(ask).findByText('No changes yet.')).toBeInTheDocument();
    });

    it('says when what a room can hold is not known yet', async () => {
      api.evidence.mockResolvedValue({ data: { data: { ...evidence, rooms: [{ id: 'r9', name: 'Main house', approvalStatus: 'approved', areaM2: 20, pendingAreaM2: null, capacityBoxes: null }] } } });
      open();
      const ask = await item('Gad Anaclet');
      fireEvent.click(within(ask).getByRole('button', { name: 'See details' }));
      expect(await within(ask).findByText('Main house: 20 m², what it holds is not known yet')).toBeInTheDocument();
    });

    it('says so when the details cannot be loaded, and the decision buttons still work', async () => {
      api.evidence.mockRejectedValue(new Error('down'));
      open();
      const ask = await item('Gad Anaclet');
      fireEvent.click(within(ask).getByRole('button', { name: 'See details' }));
      expect(await within(ask).findByText('We could not load the details.')).toBeInTheDocument();
      expect(within(ask).getByRole('button', { name: 'Approve 4 boxes' })).toBeEnabled();
    });
  });
});
