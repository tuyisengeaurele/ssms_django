import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ active: vi.fn(), create: vi.fn(), rooms: vi.fn() }));
vi.mock('../../services/sensor.service', () => ({ batchSupervisorService: { getActive: api.active } }));
vi.mock('../../services/batch.service', () => ({ batchService: { create: api.create } }));
vi.mock('../../services/room.service', () => ({ roomService: { getByFarm: api.rooms } }));

import AddBatchPage from './AddBatchPage';
import BatchesPage from './BatchesPage';

const batch = (i: number, stage: string, farm: string) => ({
  id: `b${i}-abcdefg${i}`, farmId: `f${i}`, stage, startDate: '2026-05-01T00:00:00Z', expectedHarvestDate: '2026-06-01T00:00:00Z', isActive: true, createdAt: '',
  farm: { id: `f${i}`, name: farm, location: 'Gatsibo' }, detectionCount: 0,
});

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function wrap(path: string, route: string, page: JSX.Element) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <ToastProvider>
          <Routes>
            <Route path={route} element={page} />
            <Route path="*" element={<Where />} />
          </Routes>
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
  api.active.mockResolvedValue({ data: { data: [batch(1, 'LARVA', "Serge's farm"), batch(2, 'EGG', "Gad's farm"), batch(3, 'LARVA', "Bruce's Farm")] } });
  api.rooms.mockResolvedValue({ data: { data: [] } });
});

describe('Batches page', () => {
  const open = () => wrap('/batches', '/batches', <BatchesPage />);

  it('has one title and counts the active batches', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Batches' })).toBeInTheDocument();
    expect(await screen.findByText('3 active batches across your farms.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New batch' })).toHaveAttribute('href', '/farms');
  });

  it('offers to compare batches', async () => {
    open();
    expect(await screen.findByRole('link', { name: 'Compare batches' })).toHaveAttribute('href', '/batches/compare');
  });

  it('filters by stage with tabs that show counts', async () => {
    open();
    await screen.findByText("Serge's farm");
    expect(screen.getByRole('tab', { name: 'All (3)' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Larva (2)' }));
    expect(screen.queryByText("Gad's farm")).not.toBeInTheDocument();
    expect(screen.getByText("Bruce's Farm")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Pupa (0)' }));
    expect(screen.getByText('No batches in this stage')).toBeInTheDocument();
  });

  it('searches by farm', async () => {
    open();
    await screen.findByText("Serge's farm");
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search by farm' }), { target: { value: 'gad' } });
    expect(screen.queryByText("Serge's farm")).not.toBeInTheDocument();
    expect(screen.getByText("Gad's farm")).toBeInTheDocument();
  });

  it('gives each batch two ways in', async () => {
    open();
    const row = (await screen.findByText("Serge's farm")).closest('tr') as HTMLElement;
    expect(within(row).getByText('Larva')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: /^Details/ })).toHaveAttribute('href', '/batches/b1-abcdefg1');
    expect(within(row).getByRole('link', { name: /^Check for disease/ })).toHaveAttribute('href', '/batches/b1-abcdefg1/detect');
  });

  it('points to the farms when there are no batches', async () => {
    api.active.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No active batches')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to your farms' })).toHaveAttribute('href', '/farms');
  });

  it('keeps the old filter pills and outlined buttons out', async () => {
    const { container } = open();
    await screen.findByText("Serge's farm");
    expect(container.innerHTML.toLowerCase()).not.toMatch(/btn-outline-primary|var\(--brand-600\)/);
  });
});

describe('Batches page, how long is left', () => {
  const open = () => wrap('/batches', '/batches', <BatchesPage />);
  const dated = (i: number, stage: string, expected: string) => ({ ...batch(i, stage, `Farm ${i}`), expectedHarvestDate: expected });
  const rowOf = async (farm: string) => (await screen.findByText(farm)).closest('tr') as HTMLElement;

  beforeEach(() => {
    // Only the clock is faked, so waiting for the page still works. It is 20 May 2026.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 4, 20, 15, 0));
  });
  afterEach(() => vi.useRealTimers());

  it('says how many days are left under the expected harvest date', async () => {
    open();
    await screen.findByText("Serge's farm");
    expect(screen.getAllByText('12 days left')).toHaveLength(3);
  });

  it('says due today, due tomorrow and how many days late, in their own words', async () => {
    api.active.mockResolvedValue({ data: { data: [
      dated(1, 'LARVA', new Date(2026, 4, 20, 8).toISOString()),
      dated(2, 'PUPA', new Date(2026, 4, 21, 8).toISOString()),
      dated(3, 'COCOON', new Date(2026, 4, 19, 8).toISOString()),
      dated(4, 'COCOON', new Date(2026, 4, 17, 8).toISOString()),
    ] } });
    open();
    expect(within(await rowOf('Farm 1')).getByText('Due today')).toBeInTheDocument();
    expect(within(await rowOf('Farm 2')).getByText('Due tomorrow')).toBeInTheDocument();
    expect(within(await rowOf('Farm 3')).getByText('1 day overdue')).toBeInTheDocument();
    expect(within(await rowOf('Farm 4')).getByText('3 days overdue')).toBeInTheDocument();
  });

  it('says nothing about time for a batch already at the harvest stage', async () => {
    api.active.mockResolvedValue({ data: { data: [dated(1, 'HARVEST', new Date(2026, 4, 25).toISOString())] } });
    open();
    const row = within(await rowOf('Farm 1'));
    expect(row.queryByText(/left|overdue|Due/)).not.toBeInTheDocument();
  });

  it('keeps the date itself, and shows the hint as text next to it', async () => {
    api.active.mockResolvedValue({ data: { data: [dated(1, 'LARVA', new Date(2026, 5, 1, 8).toISOString())] } });
    open();
    const row = within(await rowOf('Farm 1'));
    expect(row.getByText('Jun 1, 2026')).toBeInTheDocument();
    expect(row.getByText('12 days left')).toBeInTheDocument();
  });
});

describe('New batch page', () => {
  const open = () => wrap('/farms/f1/batches/new', '/farms/:farmId/batches/new', <AddBatchPage />);

  it('has one title and a way back to the farm', () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'New batch' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to the farm/ })).toHaveAttribute('href', '/farms/f1');
  });

  it('asks for a harvest date at least a week away', () => {
    open();
    const field = screen.getByLabelText(/^Expected harvest date/) as HTMLInputElement;
    expect(field).toBeRequired();
    const week = new Date();
    week.setDate(week.getDate() + 7);
    expect(field.min).toBe(week.toISOString().split('T')[0]);
    expect(field).toHaveAccessibleDescription('Choose a date at least 7 days from today.');
  });

  it('creates the batch and returns to the farm', async () => {
    api.create.mockResolvedValue({ data: { data: { id: 'b9' } } });
    open();
    fireEvent.change(screen.getByLabelText(/^Expected harvest date/), { target: { value: '2030-01-15' } });
    fireEvent.change(screen.getByLabelText(/^Notes/), { target: { value: 'Healthy eggs' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create batch' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ farmId: 'f1', expectedHarvestDate: '2030-01-15', notes: 'Healthy eggs' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/farms/f1'));
  });

  it('says a quiet word on the first batch the farmer has started', async () => {
    api.create.mockResolvedValue({ data: { data: { id: 'b9', milestone: 'FIRST_BATCH' } } });
    open();
    fireEvent.change(screen.getByLabelText(/^Expected harvest date/), { target: { value: '2030-01-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create batch' }));
    expect(await screen.findByText('Your first batch is created. It starts at the egg stage. Open it any day to see how it is doing.')).toBeInTheDocument();
    expect(screen.queryByText('Batch created. It starts at the egg stage.')).not.toBeInTheDocument();
  });

  it('keeps the usual message for every batch after the first', async () => {
    api.create.mockResolvedValue({ data: { data: { id: 'b9', milestone: null } } });
    open();
    fireEvent.change(screen.getByLabelText(/^Expected harvest date/), { target: { value: '2030-01-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create batch' }));
    expect(await screen.findByText('Batch created. It starts at the egg stage.')).toBeInTheDocument();
  });

  const room = (id: string, name: string, approvalStatus = 'approved') => ({ id, name, notes: '', batchCount: 0, batches: [], approvalStatus, reviewNote: '', areaM2: 12, pendingAreaM2: null, createdAt: '' });

  it('blocks the batch with a clear message when the farm has no room', async () => {
    open();
    expect(await screen.findByText('Add a room and wait for your supervisor to approve it before you add a batch.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Room/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create batch' })).toBeDisabled();
    expect(api.rooms).toHaveBeenCalledWith('f1');
  });

  it('gives the same message when the only room still waits for approval', async () => {
    api.rooms.mockResolvedValue({ data: { data: [room('r1', 'Rearing house 1', 'pending'), room('r2', 'Old room', 'rejected')] } });
    open();
    expect(await screen.findByText('Add a room and wait for your supervisor to approve it before you add a batch.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create batch' })).toBeDisabled();
  });

  it('lists only approved rooms, and uses the only approved one without asking', async () => {
    api.rooms.mockResolvedValue({ data: { data: [room('r1', 'Rearing house 1', 'pending'), room('r2', 'Cocoon room')] } });
    open();
    const choice = (await screen.findByLabelText('Room')) as HTMLSelectElement;
    expect(within(choice).getAllByRole('option').map((o) => o.textContent)).toEqual(['Cocoon room']);
    expect(choice.value).toBe('r2');
    expect(screen.getByRole('button', { name: 'Create batch' })).toBeEnabled();
  });

  it('puts the batch in the only room the farm has, and shows which', async () => {
    api.rooms.mockResolvedValue({ data: { data: [room('r1', 'Rearing house 1')] } });
    api.create.mockResolvedValue({ data: { data: { id: 'b9' } } });
    open();
    const choice = (await screen.findByLabelText('Room')) as HTMLSelectElement;
    expect(choice.value).toBe('r1');
    fireEvent.change(screen.getByLabelText(/^Expected harvest date/), { target: { value: '2030-01-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create batch' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ farmId: 'f1', roomId: 'r1' })));
  });

  it('asks which room when the farm has several, and will not guess', async () => {
    api.rooms.mockResolvedValue({ data: { data: [room('r1', 'Rearing house 1'), room('r2', 'Cocoon room')] } });
    api.create.mockResolvedValue({ data: { data: { id: 'b9' } } });
    open();
    const choice = (await screen.findByLabelText('Room')) as HTMLSelectElement;
    expect(choice.value).toBe('');
    expect(choice).toBeRequired();
    expect(within(choice).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a room', 'Rearing house 1', 'Cocoon room']);
    fireEvent.change(screen.getByLabelText(/^Expected harvest date/), { target: { value: '2030-01-15' } });
    fireEvent.change(choice, { target: { value: 'r2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create batch' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ roomId: 'r2' })));
  });

  it('asks for breed, quantity and its unit, none of them required', () => {
    open();
    expect(screen.getByLabelText(/^Breed/)).not.toBeRequired();
    const quantity = screen.getByLabelText(/^Quantity/) as HTMLInputElement;
    expect(quantity).not.toBeRequired();
    expect(quantity.min).toBe('1');
    const unit = screen.getByLabelText('Unit') as HTMLSelectElement;
    expect(within(unit).getAllByRole('option').map((o) => o.textContent)).toEqual(['Egg boxes', 'Worms']);
    expect(unit.value).toBe('BOXES');
  });

  it('sends breed, quantity and unit when they are filled in', async () => {
    api.create.mockResolvedValue({ data: { data: { id: 'b9' } } });
    open();
    fireEvent.change(screen.getByLabelText(/^Expected harvest date/), { target: { value: '2030-01-15' } });
    fireEvent.change(screen.getByLabelText(/^Breed/), { target: { value: 'Bivoltine hybrid' } });
    fireEvent.change(screen.getByLabelText(/^Quantity/), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'WORMS' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create batch' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({
      farmId: 'f1', expectedHarvestDate: '2030-01-15', breed: 'Bivoltine hybrid', quantity: 3, quantityUnit: 'WORMS',
    }));
  });

  it('leaves the unit out when there is no quantity', async () => {
    api.create.mockResolvedValue({ data: { data: { id: 'b9' } } });
    open();
    fireEvent.change(screen.getByLabelText(/^Expected harvest date/), { target: { value: '2030-01-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create batch' }));
    await waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(api.create.mock.calls[0][0].quantityUnit).toBeUndefined();
    expect(api.create.mock.calls[0][0].quantity).toBeUndefined();
  });

  it('is one narrow form with no list of stages beside it', () => {
    const { container } = open();
    expect(screen.queryByRole('list', { name: 'The five stages' })).not.toBeInTheDocument();
    expect(screen.queryByText('Every new batch starts at the egg stage.')).not.toBeInTheDocument();
    expect(container.querySelector('.next-steps, .form-page')).toBeNull();
    expect(container.querySelector('.page-narrow')).not.toBeNull();
  });

  it('keeps the coloured stage squares and the tip box out', () => {
    const { container } = open();
    expect(container.innerHTML.toLowerCase()).not.toMatch(/#d97706|#10b981|#3b82f6|#8b5cf6|#ec4899|brand-50/);
  });
});

describe('Batches page when the batches cannot be loaded', () => {
  const open = () => wrap('/batches', '/batches', <BatchesPage />);

  it('says so, and does not claim there are no active batches', async () => {
    api.active.mockRejectedValue(new Error('boom'));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load this page');
    expect(screen.queryByText(/active batches across/)).not.toBeInTheDocument();
  });

  it('loads again with Try again', async () => {
    api.active.mockRejectedValueOnce(new Error('boom'));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('3 active batches across your farms.')).toBeInTheDocument();
  });
});
