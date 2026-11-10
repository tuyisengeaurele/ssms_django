import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';

const api = vi.hoisted(() => ({ events: vi.fn() }));
vi.mock('../../services/calendar.service', () => ({ calendarService: { events: api.events } }));

import FarmCalendar from './FarmCalendar';

type Ev = { id: string; date: string; kind: string; expected?: boolean; batchId?: string | null; farmId?: string | null; farmName?: string; detail?: Record<string, unknown> };
const ev = (over: Ev) => ({ expected: false, batchId: 'b1', farmId: 'f1', farmName: 'Hillside', detail: {}, ...over });
const answer = (events: Ev[], truncated = false) => api.events.mockResolvedValue({ data: { data: { events: events.map(ev), from: '', to: '', truncated } } });
const open = (staff = false) => render(<MemoryRouter><LanguageProvider><FarmCalendar staff={staff} /></LanguageProvider></MemoryRouter>);
const day = (label: RegExp) => screen.getByRole('button', { name: label });

beforeEach(() => {
  vi.clearAllMocks();
  // Only the clock is faked, so waiting for the page still works. It is Thursday 12 November 2026.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 10, 12, 10, 0));
  answer([]);
});
afterEach(() => vi.useRealTimers());

describe('FarmCalendar, the month', () => {
  it('asks for the whole grid so the edge days show their events, and names the month', async () => {
    open();
    await waitFor(() => expect(api.events).toHaveBeenCalledWith('2026-10-26', '2026-12-06'));
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
  });

  it('draws 42 days with the weekdays Monday first and marks today', async () => {
    open();
    await waitFor(() => expect(api.events).toHaveBeenCalled());
    expect(screen.getAllByRole('button', { name: /\d{4}/ })).toHaveLength(42);
    expect(screen.getAllByTestId('weekday').map((w) => w.textContent)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    expect(day(/Thursday, November 12, 2026/)).toHaveAttribute('aria-current', 'date');
    expect(day(/Thursday, November 12, 2026/).getAttribute('aria-label')).toContain('today');
  });

  it('says how many events a day holds in its name', async () => {
    answer([{ id: 'a', date: '2026-11-03', kind: 'batch_started' }, { id: 'b', date: '2026-11-03', kind: 'disease_check', detail: { result: 'Healthy' } }, { id: 'c', date: '2026-11-05', kind: 'batch_started' }]);
    open();
    expect(await screen.findByRole('button', { name: /Tuesday, November 3, 2026, 2 events/ })).toBeInTheDocument();
    expect(day(/Thursday, November 5, 2026, 1 event$/)).toBeInTheDocument();
    expect(day(/Friday, November 6, 2026, no events/)).toBeInTheDocument();
  });

  it('shows a day of the next month in the grid with its events', async () => {
    answer([{ id: 'a', date: '2026-12-01', kind: 'harvest_expected', expected: true }]);
    open();
    fireEvent.click(await screen.findByRole('button', { name: /Tuesday, December 1, 2026, 1 event/ }));
    expect(within(screen.getByTestId('day-list')).getByText('Harvest expected')).toBeInTheDocument();
  });

  it('shows at most three dots on a day and still lists every event', async () => {
    answer([1, 2, 3, 4, 5].map((n) => ({ id: `e${n}`, date: '2026-11-10', kind: 'disease_check', detail: { result: 'Healthy' } })));
    open();
    const button = await screen.findByRole('button', { name: /Tuesday, November 10, 2026, 5 events/ });
    expect(button.querySelectorAll('.cal-dot')).toHaveLength(3);
    fireEvent.click(button);
    expect(within(screen.getByTestId('day-list')).getAllByRole('listitem')).toHaveLength(5);
  });
});

describe('FarmCalendar, the words for each event', () => {
  const cases: Array<[Ev, string]> = [
    [{ id: '1', date: '2026-11-10', kind: 'batch_started' }, 'Batch started'],
    [{ id: '2', date: '2026-11-10', kind: 'harvest_expected', expected: true }, 'Harvest expected'],
    [{ id: '3', date: '2026-11-10', kind: 'stage_changed', detail: { stage: 'LARVA' } }, 'Stage changed to Larva'],
    [{ id: '4', date: '2026-11-10', kind: 'stage_changed', detail: { stage: null } }, 'Stage changed'],
    [{ id: '5', date: '2026-11-10', kind: 'harvest_recorded' }, 'Harvest recorded'],
    [{ id: '6', date: '2026-11-10', kind: 'disease_check', detail: { result: 'Grasserie' } }, 'Disease check: Grasserie'],
    [{ id: '7', date: '2026-11-10', kind: 'round_deadline', batchId: null, farmId: null, farmName: '', detail: { name: 'November round', roundId: 'r1' } }, 'November round: requests close'],
    [{ id: '8', date: '2026-11-10', kind: 'round_delivery', batchId: null, farmId: null, farmName: '', detail: { name: 'November round', place: 'Cooperative store', roundId: 'r1' } }, 'November round: eggs handed over at Cooperative store'],
  ];

  it.each(cases)('words %o', async (event, text) => {
    answer([event]);
    open();
    fireEvent.click(await screen.findByRole('button', { name: /Tuesday, November 10, 2026, 1 event/ }));
    expect(within(screen.getByTestId('day-list')).getByText(text)).toBeInTheDocument();
  });

  it('marks an expected event in words and not by colour alone', async () => {
    answer([{ id: '2', date: '2026-11-10', kind: 'harvest_expected', expected: true }]);
    open();
    fireEvent.click(await screen.findByRole('button', { name: /Tuesday, November 10, 2026, 1 event/ }));
    expect(within(screen.getByTestId('day-list')).getByText('expected')).toBeInTheDocument();
  });

  it('shows a farm name and a round name as plain text', async () => {
    answer([{ id: '1', date: '2026-11-10', kind: 'batch_started', farmName: '<b>Hill</b>' }, { id: '2', date: '2026-11-10', kind: 'round_deadline', batchId: null, farmName: '', detail: { name: '<i>Round</i>' } }]);
    const { container } = open();
    fireEvent.click(await screen.findByRole('button', { name: /Tuesday, November 10, 2026, 2 events/ }));
    expect(within(screen.getByTestId('day-list')).getByText('<b>Hill</b>')).toBeInTheDocument();
    expect(within(screen.getByTestId('day-list')).getByText('<i>Round</i>: requests close')).toBeInTheDocument();
    expect(container.querySelector('b, i')).toBeNull();
  });

  it('links a batch event to the batch and a round event to the round only for staff', async () => {
    answer([{ id: '1', date: '2026-11-10', kind: 'batch_started' }, { id: '2', date: '2026-11-10', kind: 'round_deadline', batchId: null, farmName: '', detail: { name: 'Round', roundId: 'r1' } }]);
    const first = open(false);
    fireEvent.click(await screen.findByRole('button', { name: /Tuesday, November 10, 2026, 2 events/ }));
    const list = within(screen.getByTestId('day-list'));
    expect(list.getByRole('link', { name: /Batch started/ })).toHaveAttribute('href', '/batches/b1');
    expect(list.queryByRole('link', { name: /requests close/ })).not.toBeInTheDocument();
    first.unmount();
    open(true);
    fireEvent.click(await screen.findByRole('button', { name: /Tuesday, November 10, 2026, 2 events/ }));
    expect(within(screen.getByTestId('day-list')).getByRole('link', { name: /requests close/ })).toHaveAttribute('href', '/supply/r1');
  });
});

describe('FarmCalendar, choosing a day', () => {
  it('lists today first and a quiet message for a day with nothing', async () => {
    answer([{ id: 'a', date: '2026-11-12', kind: 'disease_check', detail: { result: 'Healthy' } }]);
    open();
    expect(await within(screen.getByTestId('day-list')).findByText('Disease check: Healthy')).toBeInTheDocument();
    fireEvent.click(day(/Friday, November 13, 2026/));
    expect(within(screen.getByTestId('day-list')).getByText('Nothing on this day.')).toBeInTheDocument();
    expect(day(/Friday, November 13, 2026/)).toHaveAttribute('aria-pressed', 'true');
    expect(day(/Thursday, November 12, 2026/)).toHaveAttribute('aria-pressed', 'false');
  });

  it('names the chosen day above its events', async () => {
    open();
    await waitFor(() => expect(api.events).toHaveBeenCalled());
    expect(within(screen.getByTestId('day-list')).getByRole('heading', { name: 'Thursday, November 12, 2026' })).toBeInTheDocument();
  });
});

describe('FarmCalendar, the keyboard', () => {
  const selected = () => screen.getAllByRole('button', { pressed: true })[0];
  const press = (key: string) => fireEvent.keyDown(selected(), { key });

  it('moves by a day with the left and right arrows and by a week with up and down', async () => {
    open();
    await waitFor(() => expect(api.events).toHaveBeenCalled());
    press('ArrowRight');
    expect(selected().getAttribute('aria-label')).toMatch(/Friday, November 13/);
    press('ArrowDown');
    expect(selected().getAttribute('aria-label')).toMatch(/Friday, November 20/);
    press('ArrowLeft');
    expect(selected().getAttribute('aria-label')).toMatch(/Thursday, November 19/);
    press('ArrowUp');
    expect(selected().getAttribute('aria-label')).toMatch(/Thursday, November 12/);
  });

  it('goes to the start and the end of the week with Home and End', async () => {
    open();
    await waitFor(() => expect(api.events).toHaveBeenCalled());
    press('Home');
    expect(selected().getAttribute('aria-label')).toMatch(/Monday, November 9/);
    press('End');
    expect(selected().getAttribute('aria-label')).toMatch(/Sunday, November 15/);
  });

  it('changes the month with PageDown and PageUp and asks for the new window', async () => {
    open();
    await waitFor(() => expect(api.events).toHaveBeenCalledTimes(1));
    press('PageDown');
    expect(await screen.findByRole('heading', { name: 'December 2026' })).toBeInTheDocument();
    expect(selected().getAttribute('aria-label')).toMatch(/Saturday, December 12/);
    await waitFor(() => expect(api.events).toHaveBeenCalledTimes(2));
    press('PageUp');
    expect(await screen.findByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
  });

  it('follows the arrow keys into the next month', async () => {
    open();
    await waitFor(() => expect(api.events).toHaveBeenCalled());
    for (let i = 0; i < 3; i += 1) press('ArrowDown');
    expect(await screen.findByRole('heading', { name: 'December 2026' })).toBeInTheDocument();
  });

  it('keeps one day in the tab order and leaves Tab free', async () => {
    open();
    await waitFor(() => expect(api.events).toHaveBeenCalled());
    const buttons = screen.getAllByRole('button', { name: /\d{4}/ });
    expect(buttons.filter((b) => b.tabIndex === 0)).toHaveLength(1);
    const prevented = fireEvent.keyDown(selected(), { key: 'Tab' });
    expect(prevented).toBe(true);
  });
});

describe('FarmCalendar, the month buttons', () => {
  it('moves to the next and the previous month and back to today', async () => {
    open();
    await waitFor(() => expect(api.events).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(await screen.findByRole('heading', { name: 'December 2026' })).toBeInTheDocument();
    await waitFor(() => expect(api.events).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(await screen.findByRole('heading', { name: 'October 2026' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(await screen.findByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
    expect(day(/Thursday, November 12, 2026/)).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('FarmCalendar, the agenda', () => {
  it('lists the next 14 days by day, today first, and leaves out days with nothing', async () => {
    answer([
      { id: 'a', date: '2026-11-12', kind: 'disease_check', detail: { result: 'Healthy' } },
      { id: 'b', date: '2026-11-20', kind: 'harvest_expected', expected: true },
      { id: 'c', date: '2026-11-26', kind: 'batch_started' },
      { id: 'd', date: '2026-11-05', kind: 'batch_started' },
    ]);
    open();
    const agenda = within(await screen.findByTestId('agenda'));
    const headings = agenda.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(headings).toEqual(['Thu, Nov 12, 2026', 'Fri, Nov 20, 2026']);
    expect(agenda.getByText('Harvest expected')).toBeInTheDocument();
    expect(agenda.queryByText('Batch started')).not.toBeInTheDocument();
  });

  it('says so when nothing is coming', async () => {
    open();
    expect(await within(screen.getByTestId('agenda')).findByText('Nothing in the next 14 days.')).toBeInTheDocument();
  });
});

describe('FarmCalendar, when something goes wrong', () => {
  it('says it could not load, offers to try again, and then shows the events', async () => {
    api.events.mockRejectedValueOnce(new Error('down'));
    open();
    expect(await screen.findByText('We could not load the calendar.')).toBeInTheDocument();
    answer([{ id: 'a', date: '2026-11-12', kind: 'disease_check', detail: { result: 'Healthy' } }]);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await within(screen.getByTestId('day-list')).findByText('Disease check: Healthy')).toBeInTheDocument();
    expect(screen.queryByText('We could not load the calendar.')).not.toBeInTheDocument();
  });

  it('tells a person when there were more events than it shows', async () => {
    answer([], true);
    open();
    expect(await screen.findByText('Showing the first 500 events of this period.')).toBeInTheDocument();
  });

  it('still draws the month while it loads', () => {
    api.events.mockReturnValue(new Promise(() => {}));
    open();
    expect(screen.getAllByRole('button', { name: /\d{4}/ })).toHaveLength(42);
  });
});
