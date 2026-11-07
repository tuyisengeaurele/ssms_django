import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';

const api = vi.hoisted(() => ({ onboarding: vi.fn() }));
vi.mock('../../services/supply.service', () => ({ supplyService: { onboarding: api.onboarding } }));

import OnboardingCard from './OnboardingCard';

type Step = { key: string; state: string; detail?: Record<string, unknown> };
const steps = (over: Partial<Record<string, Step>> = {}): { complete: boolean; steps: Step[] } => ({
  complete: false,
  steps: [
    over.cooperative ?? { key: 'cooperative', state: 'done', detail: {} },
    over.farm ?? { key: 'farm', state: 'todo', detail: {} },
    over.room ?? { key: 'room', state: 'todo', detail: {} },
    over.eggs ?? { key: 'eggs', state: 'no_round', detail: {} },
  ] as Step[],
});
const answer = (data: object) => api.onboarding.mockResolvedValue({ data: { data } });
const show = () => render(<MemoryRouter><LanguageProvider><OnboardingCard /></LanguageProvider></MemoryRouter>);
const item = async (label: string) => (await screen.findByText(label)).closest('li') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  answer(steps());
});

describe('OnboardingCard', () => {
  it('shows nothing when the farmer is past every step, while loading, or when it cannot load', async () => {
    answer({ ...steps(), complete: true });
    const first = show();
    await waitFor(() => expect(api.onboarding).toHaveBeenCalled());
    expect(screen.queryByText('Getting started')).not.toBeInTheDocument();
    first.unmount();
    api.onboarding.mockRejectedValue(new Error('down'));
    show();
    await waitFor(() => expect(api.onboarding).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Getting started')).not.toBeInTheDocument();
  });

  it('lists the four steps in order, with the first undone step marked as next and the rest as later', async () => {
    show();
    await screen.findByText('Getting started');
    const marks = screen.getAllByRole('listitem').map((li) => li.getAttribute('data-mark'));
    expect(marks).toEqual(['done', 'next', 'later', 'later']);
    expect(within(await item('Join your cooperative')).getByText('Done')).toBeInTheDocument();
    expect(within(await item('Add your farm')).getByText('Next')).toBeInTheDocument();
    expect(within(await item('Get your eggs')).getByText('Later')).toBeInTheDocument();
  });

  it('tells a farmer in no cooperative how to join one', async () => {
    answer(steps({ cooperative: { key: 'cooperative', state: 'todo' } }));
    show();
    expect(await screen.findByText('Ask your supervisor for an invitation link.')).toBeInTheDocument();
  });

  it('links to the farm form for the farm step', async () => {
    show();
    const li = await item('Add your farm');
    expect(within(li).getByRole('link', { name: 'Add a farm' })).toHaveAttribute('href', '/farms/new');
  });

  it('links to the farm page for the room step once there is a farm, and asks for a farm first before that', async () => {
    answer(steps({ farm: { key: 'farm', state: 'done', detail: { farmId: 'f1' } } }));
    const first = show();
    expect(within(await item('Add a room and get it approved')).getByRole('link', { name: 'Add a room to your farm' })).toHaveAttribute('href', '/farms/f1');
    first.unmount();
    answer(steps());
    show();
    expect(await screen.findByText('Add your farm first.')).toBeInTheDocument();
  });

  it('says who the room waits for, for one person and for several', async () => {
    answer(steps({ farm: { key: 'farm', state: 'done', detail: { farmId: 'f1' } }, room: { key: 'room', state: 'waiting', detail: { waitingFor: ['Claire Uwimana'] } } }));
    const first = show();
    expect(await screen.findByText('Waiting for Claire Uwimana to approve it.')).toBeInTheDocument();
    expect(within(await item('Add a room and get it approved')).getByText('Waiting')).toBeInTheDocument();
    first.unmount();
    answer(steps({ farm: { key: 'farm', state: 'done', detail: { farmId: 'f1' } }, room: { key: 'room', state: 'waiting', detail: { waitingFor: ['Claire Uwimana', 'Bruce Ishimwe'] } } }));
    show();
    expect(await screen.findByText('Waiting for Claire Uwimana and Bruce Ishimwe to approve it.')).toBeInTheDocument();
  });

  it('shows the reason a room was not approved as plain text, and what to do', async () => {
    answer(steps({ room: { key: 'room', state: 'rejected', detail: { note: '<b>Too</b> small' } } }));
    const { container } = show();
    expect(await screen.findByText('Not approved: <b>Too</b> small. Change the size and send it again.')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });

  it('says a room was not approved even when no reason was given', async () => {
    answer(steps({ room: { key: 'room', state: 'rejected', detail: { note: '' } } }));
    show();
    expect(await screen.findByText('Not approved. Change the size and send it again.')).toBeInTheDocument();
  });

  it.each([
    [{ state: 'no_round', detail: {} }, 'Waiting for your supervisor to open a supply round.'],
    [{ state: 'needs_room', detail: { roundName: 'November round' } }, 'November round is open. You need an approved room to ask.'],
    [{ state: 'ready', detail: { roundName: 'November round' } }, 'November round is open. Request eggs on the card below.'],
    [{ state: 'waiting', detail: { roundName: 'November round', waitingFor: ['Claire Uwimana'] } }, 'Your request in November round is waiting for Claire Uwimana.'],
    [{ state: 'approved', detail: { roundName: 'November round', boxes: 2, deliveryDate: '2026-11-14', deliveryPlace: 'Cooperative store' } }, 'Approved: 2 boxes. Handed over on Nov 14, 2026 at Cooperative store.'],
    [{ state: 'not_given', detail: { roundName: 'November round', note: 'No space in your room' } }, 'No eggs this time: No space in your room'],
    [{ state: 'not_given', detail: { roundName: 'November round', note: '' } }, 'No eggs this time. Ask again in the next round.'],
  ])('says the eggs step in words for %o', async (eggs, text) => {
    answer(steps({
      farm: { key: 'farm', state: 'done', detail: { farmId: 'f1' } }, room: { key: 'room', state: 'done', detail: {} }, eggs: { key: 'eggs', ...eggs },
    }));
    show();
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it('shows a delivery place and a round name as plain text', async () => {
    answer(steps({ eggs: { key: 'eggs', state: 'approved', detail: { roundName: 'x', boxes: 1, deliveryDate: '2026-11-14', deliveryPlace: '<i>Store</i>' } } }));
    const { container } = show();
    expect(await screen.findByText(/<i>Store<\/i>/)).toBeInTheDocument();
    expect(container.querySelector('i')).toBeNull();
  });
});
