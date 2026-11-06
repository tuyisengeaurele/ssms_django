import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ get: vi.fn(), ask: vi.fn(), withdraw: vi.fn() }));
vi.mock('../../services/supply.service', () => ({ supplyService: { getAllowance: api.get, ask: api.ask, withdraw: api.withdraw } }));

import AllowanceCard from './AllowanceCard';

const card = (over: object = {}) => ({
  boxes: 2, source: 'default', since: null, history: [], openRequest: null, capacityBoxes: null, starterBoxes: 2, ...over,
});

const show = () => render(<LanguageProvider><ToastProvider><AllowanceCard /></ToastProvider></LanguageProvider>);

const answer = (data: object) => api.get.mockResolvedValue({ data: { data: data } });

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  answer(card());
});

describe('AllowanceCard', () => {
  it('shows the amount with the plural, and says it was set by the cooperative', async () => {
    show();
    expect(await screen.findByText('2 boxes')).toBeInTheDocument();
    expect(screen.getByText('Set by your cooperative')).toBeInTheDocument();
  });

  it('says 1 box for one box', async () => {
    answer(card({ boxes: 1 }));
    show();
    expect(await screen.findByText('1 box')).toBeInTheDocument();
  });

  it('says when a set amount was set', async () => {
    answer(card({ boxes: 3, source: 'set', since: '2026-11-06T10:00:00Z' }));
    show();
    expect(await screen.findByText('Set on Nov 6, 2026')).toBeInTheDocument();
  });

  it('puts the last change in words, with who and why, as plain text', async () => {
    answer(card({
      boxes: 1, source: 'set', since: '2026-11-06T10:00:00Z',
      history: [
        { oldBoxes: 3, newBoxes: 1, kind: 'reduction', reason: '<b>Outbreak</b> last month', byName: 'Claire Uwimana', at: '2026-11-06T10:00:00Z' },
        { oldBoxes: null, newBoxes: 3, kind: 'start', reason: '', byName: 'Claire Uwimana', at: '2026-10-01T10:00:00Z' },
      ],
    }));
    const { container } = show();
    expect(await screen.findByText('Lowered to 1 box by Claire Uwimana: <b>Outbreak</b> last month')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });

  it('shows no change line when the only history is the start', async () => {
    answer(card({ source: 'set', since: '2026-11-06T10:00:00Z', history: [{ oldBoxes: null, newBoxes: 2, kind: 'start', reason: '', byName: null, at: '' }] }));
    show();
    await screen.findByText('2 boxes');
    expect(screen.queryByText(/Lowered|Changed to/)).not.toBeInTheDocument();
  });

  it('shows nothing for a farmer who is in no cooperative, or when it cannot load', async () => {
    answer(card({ boxes: 0, source: 'none' }));
    const first = show();
    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(screen.queryByText('Your allowance')).not.toBeInTheDocument();
    first.unmount();
    api.get.mockRejectedValue(new Error('down'));
    show();
    await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Your allowance')).not.toBeInTheDocument();
  });

  it('shows a waiting request with who it waits for, and withdraws it', async () => {
    answer(card({ openRequest: { id: 'q1', boxesAsked: 4, reason: 'I built a second house', createdAt: '2026-11-06T10:00:00Z' } }));
    api.withdraw.mockResolvedValue({ data: { data: null } });
    show();
    expect(await screen.findByText('Your request for 4 boxes is waiting for your supervisor.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ask for a different amount' })).not.toBeInTheDocument();
    answer(card());
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw request' }));
    await waitFor(() => expect(api.withdraw).toHaveBeenCalledWith('q1'));
    expect(await screen.findByText('Request withdrawn.')).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Ask for a different amount' })).toBeInTheDocument();
  });
});

describe('asking for a different amount', () => {
  const openModal = async () => {
    show();
    fireEvent.click(await screen.findByRole('button', { name: 'Ask for a different amount' }));
    return screen.findByRole('dialog', { name: 'Ask for a different amount' });
  };
  const fillIn = (dialog: HTMLElement, boxes: string, reason: string) => {
    fireEvent.change(within(dialog).getByLabelText('Boxes per round'), { target: { value: boxes } });
    fireEvent.change(within(dialog).getByLabelText(/^Why do you need this/), { target: { value: reason } });
  };
  const send = (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole('button', { name: 'Send request' }));

  it('starts at the current amount and says why a reason is wanted', async () => {
    const dialog = await openModal();
    expect(within(dialog).getByLabelText('Boxes per round')).toHaveValue(2);
    expect(within(dialog).getByText('Say why. Your supervisor reads this.')).toBeInTheDocument();
  });

  it('says what the rooms can hold only when that is known', async () => {
    answer(card({ capacityBoxes: 5 }));
    const dialog = await openModal();
    expect(within(dialog).getByText('Your approved rooms can hold about 5 boxes.')).toBeInTheDocument();
  });

  it('has no capacity line when it is not known', async () => {
    const dialog = await openModal();
    expect(within(dialog).queryByText(/can hold about/)).not.toBeInTheDocument();
  });

  it.each([['-1'], ['101'], ['2.5'], ['']])('refuses %s boxes before sending', async (boxes) => {
    const dialog = await openModal();
    fillIn(dialog, boxes, 'I built a second house');
    send(dialog);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please enter a whole number of boxes from 0 to 100.');
    expect(api.ask).not.toHaveBeenCalled();
  });

  it('refuses the amount it already is', async () => {
    const dialog = await openModal();
    fillIn(dialog, '2', 'I built a second house');
    send(dialog);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('That is your current amount.');
    expect(api.ask).not.toHaveBeenCalled();
  });

  it.each([['short'], ['x'.repeat(501)]])('refuses a reason that is too short or too long', async (reason) => {
    const dialog = await openModal();
    fillIn(dialog, '4', reason);
    send(dialog);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please say why, in 10 to 500 characters.');
    expect(api.ask).not.toHaveBeenCalled();
  });

  it('sends the amount and the reason, then shows the waiting state', async () => {
    api.ask.mockResolvedValue({ data: { data: { id: 'q1' } } });
    const dialog = await openModal();
    fillIn(dialog, '4', '  I built a second house  ');
    answer(card({ openRequest: { id: 'q1', boxesAsked: 4, reason: 'I built a second house', createdAt: '2026-11-06T10:00:00Z' } }));
    send(dialog);
    await waitFor(() => expect(api.ask).toHaveBeenCalledWith({ boxesAsked: 4, reason: 'I built a second house' }));
    expect(await screen.findByText('Request sent. Your supervisor will decide.')).toBeInTheDocument();
    expect(await screen.findByText('Your request for 4 boxes is waiting for your supervisor.')).toBeInTheDocument();
  });

  it('shows the answer of the server inside the dialog and keeps what was typed', async () => {
    api.ask.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status: 409, data: { message: 'You already have a request waiting. Withdraw it first to ask again.' } } as never));
    const dialog = await openModal();
    fillIn(dialog, '4', 'I built a second house');
    send(dialog);
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('You already have a request waiting.');
    expect(within(dialog).getByLabelText('Boxes per round')).toHaveValue(4);
  });

  it('closes with Cancel and sends nothing', async () => {
    const dialog = await openModal();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.ask).not.toHaveBeenCalled();
  });
});
