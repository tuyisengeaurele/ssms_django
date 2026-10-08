import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ active: vi.fn(), create: vi.fn() }));
vi.mock('../../services/sensor.service', () => ({ batchSupervisorService: { getActive: api.active } }));
vi.mock('../../services/batch.service', () => ({ batchService: { create: api.create } }));

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
});

describe('Batches page', () => {
  const open = () => wrap('/batches', '/batches', <BatchesPage />);

  it('has one title and counts the active batches', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Batches' })).toBeInTheDocument();
    expect(await screen.findByText('3 active batches across your farms.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'New batch' })).toHaveAttribute('href', '/farms');
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

  it('shows the five stages in order and says every batch starts at the egg', () => {
    open();
    const stages = screen.getByRole('list', { name: 'The five stages' });
    const titles = within(stages).getAllByRole('listitem').map((li) => li.querySelector('strong')?.textContent);
    expect(titles).toEqual(['Egg', 'Larva', 'Pupa', 'Cocoon', 'Harvest']);
    expect(screen.getByText('Every new batch starts at the egg stage.')).toBeInTheDocument();
  });

  it('keeps the coloured stage squares and the tip box out', () => {
    const { container } = open();
    expect(container.innerHTML.toLowerCase()).not.toMatch(/#d97706|#10b981|#3b82f6|#8b5cf6|#ec4899|brand-50/);
  });
});
