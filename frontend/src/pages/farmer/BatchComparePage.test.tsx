import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';
import type { BatchComparison } from '../../types';

const api = vi.hoisted(() => ({ active: vi.fn(), compare: vi.fn() }));
vi.mock('../../services/sensor.service', () => ({ batchSupervisorService: { getActive: api.active } }));
vi.mock('../../services/batch.service', () => ({ batchService: { compare: api.compare } }));

import BatchComparePage from './BatchComparePage';

const active = (i: number, stage = 'LARVA') => ({
  id: `b${i}-abcdefg${i}`, farmId: `f${i}`, stage, startDate: '2026-05-01T00:00:00Z', expectedHarvestDate: '2026-06-01T00:00:00Z', isActive: true, createdAt: '',
  farm: { id: `f${i}`, name: `Farm ${i}`, location: 'Gatsibo' }, detectionCount: 0,
});

const comparison = (i: number, over: Partial<BatchComparison> = {}, harvest: Partial<BatchComparison['harvest']> = {}): BatchComparison => ({
  id: `b${i}-abcdefg${i}`, code: `ABCDEFG${i}`, farm: { id: `f${i}`, name: `Farm ${i}` }, breed: '', stage: 'COCOON', room: null,
  startDate: '2026-05-01T00:00:00Z', expectedHarvestDate: '2026-06-01T00:00:00Z', daysRunning: 20, quantity: 2, quantityUnit: 'BOXES',
  deaths: 0, deathRatePct: null,
  harvest: { records: 1, cocoonKg: 10, silkG: 0, grades: { A: 1, B: 0, C: 0 }, yieldPerUnit: { unit: 'BOXES', kg: 5 }, curve: [{ day: 28, kg: 10 }], ...harvest },
  conditions: { inRangePct: 80, readings: 100 }, checks: { total: 0, grasserie: 0 }, alerts: 0,
  ...over,
});

function Where() {
  const { pathname, search } = useLocation();
  return <p data-testid="where">{pathname + search}</p>;
}

function open(path = '/batches/compare') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <ToastProvider>
          <Routes>
            <Route path="/batches/compare" element={<><BatchComparePage /><Where /></>} />
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
  api.active.mockResolvedValue({ data: { data: [active(1), active(2, 'EGG'), active(3), active(4), active(5)] } });
  api.compare.mockResolvedValue({ data: { data: { batches: [comparison(1), comparison(2)] } } });
});

const where = () => screen.getByTestId('where').textContent;

describe('choosing batches to compare', () => {
  it('has one title and lists the batches as checkboxes with their code, farm and stage', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Compare batches' })).toBeInTheDocument();
    const box = await screen.findByRole('checkbox', { name: /ABCDEFG1.*Farm 1.*Larva/ });
    expect(box).not.toBeChecked();
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
  });

  it('asks for two batches before it lets the person compare', async () => {
    open();
    const go = await screen.findByRole('button', { name: 'Compare' });
    expect(go).toBeDisabled();
    expect(screen.getByText('Choose at least two batches.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Farm 1/ }));
    expect(go).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: /Farm 2/ }));
    expect(go).toBeEnabled();
    expect(screen.getByText('2 of 4 chosen')).toBeInTheDocument();
    expect(screen.queryByText('Choose at least two batches.')).not.toBeInTheDocument();
  });

  it('stops at four, says so, and lets one be taken off again', async () => {
    open();
    for (const n of [1, 2, 3, 4]) fireEvent.click(await screen.findByRole('checkbox', { name: new RegExp(`Farm ${n}\\b`) }));
    const fifth = screen.getByRole('checkbox', { name: /Farm 5/ });
    expect(fifth).toBeDisabled();
    expect(screen.getByText('You can compare up to 4 batches.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('checkbox', { name: /Farm 4/ }));
    expect(fifth).toBeEnabled();
  });

  it('opens the comparison in the order the batches were chosen', async () => {
    open();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Farm 3/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Farm 1/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));
    await waitFor(() => expect(where()).toBe('/batches/compare?ids=b3-abcdefg3%2Cb1-abcdefg1'));
    await waitFor(() => expect(api.compare).toHaveBeenCalledWith(['b3-abcdefg3', 'b1-abcdefg1']));
  });

  it('says what to do when there are fewer than two batches', async () => {
    api.active.mockResolvedValue({ data: { data: [active(1)] } });
    open();
    expect(await screen.findByText('You need at least two batches to compare')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to your farms' })).toHaveAttribute('href', '/farms');
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it.each([['one batch', '?ids=b1-abcdefg1'], ['five batches', '?ids=a,b,c,d,e'], ['nothing', '?ids=']])('shows the choice again for %s in the address', async (_name, query) => {
    open(`/batches/compare${query}`);
    expect(await screen.findByRole('button', { name: 'Compare' })).toBeInTheDocument();
    expect(api.compare).not.toHaveBeenCalled();
  });
});

const IDS = '?ids=b1-abcdefg1,b2-abcdefg2';
const table = async () => within(await screen.findByRole('table', { name: 'Compare batches' }));
/** What each batch shows in the row with this label, in order. A row is found by its row heading. */
const row = async (label: string) => {
  const heading = (await table()).getByRole('rowheader', { name: label });
  return within(heading.closest('tr') as HTMLElement).getAllByRole('cell').map((c) => c.textContent ?? '');
};

describe('the comparison', () => {
  it('asks for the batches in the address, in order', async () => {
    open(`/batches/compare${IDS}`);
    await table();
    expect(api.compare).toHaveBeenCalledWith(['b1-abcdefg1', 'b2-abcdefg2']);
  });

  it('heads each column with the batch code as a link, its farm and its stage', async () => {
    open(`/batches/compare${IDS}`);
    const t = await table();
    expect(t.getByRole('link', { name: '#ABCDEFG1' })).toHaveAttribute('href', '/batches/b1-abcdefg1');
    const header = t.getByRole('columnheader', { name: /ABCDEFG2/ });
    expect(within(header).getByText('Farm 2')).toBeInTheDocument();
    expect(within(header).getByText('Cocoon')).toBeInTheDocument();
  });

  it('shows what each batch gave', async () => {
    api.compare.mockResolvedValue({ data: { data: { batches: [
      comparison(1, {}, { cocoonKg: 12.5, silkG: 250, records: 2, grades: { A: 1, B: 1, C: 0 } }),
      comparison(2, {}, { cocoonKg: 9, silkG: 0, records: 1, grades: { A: 1, B: 0, C: 0 } }),
    ] } } });
    open(`/batches/compare${IDS}`);
    expect(await row('Cocoons harvested')).toEqual(['12.5 kg Best', '9 kg']);
    expect(await row('Silk')).toEqual(['250 g Best', '0 g']);
    // More harvests is not better or worse, so there is no marker.
    expect(await row('Harvests recorded')).toEqual(['2', '1']);
    expect(await row('Grades')).toEqual(['A 1 · B 1 · C 0', 'A 1 · B 0 · C 0']);
  });

  it('marks the best result in a row with a word, not only a colour, and the lowest where less is better', async () => {
    api.compare.mockResolvedValue({ data: { data: { batches: [
      comparison(1, { deaths: 40, checks: { total: 4, grasserie: 2 }, alerts: 5 }),
      comparison(2, { deaths: 10, checks: { total: 6, grasserie: 0 }, alerts: 1 }),
    ] } } });
    open(`/batches/compare${IDS}`);
    // Counting deaths alone says nothing when the batches started with different numbers, so only the death rate is marked.
    expect(await row('Deaths')).toEqual(['40', '10']);
    expect(await row('Grasserie found')).toEqual(['2', '0 Best']);
    expect(await row('Alerts')).toEqual(['5', '1 Best']);
    // More checks is not better or worse, so there is no marker.
    expect(await row('Disease checks')).toEqual(['4', '6']);
  });

  it('marks nothing when the batches are equal, or when only one has a value', async () => {
    api.compare.mockResolvedValue({ data: { data: { batches: [
      comparison(1, { conditions: { inRangePct: 90, readings: 5 } }, { cocoonKg: 10 }),
      comparison(2, { conditions: null }, { cocoonKg: 10 }),
    ] } } });
    open(`/batches/compare${IDS}`);
    expect(await row('Cocoons harvested')).toEqual(['10 kg', '10 kg']);
    expect(await row('Time in the safe range')).toEqual(['90 %', 'No data']);
  });

  it('shows a value that is not known as No data', async () => {
    api.compare.mockResolvedValue({ data: { data: { batches: [
      comparison(1, { breed: 'Bivoltine', room: 'Rearing house 1', quantity: null }),
      comparison(2),
    ] } } });
    open(`/batches/compare${IDS}`);
    expect(await row('Breed')).toEqual(['Bivoltine', 'No data']);
    expect(await row('Room')).toEqual(['Rearing house 1', 'No data']);
    expect(await row('Started with')).toEqual(['No data', '2 egg boxes']);
  });

  it('says how each batch started, in boxes or in worms', async () => {
    api.compare.mockResolvedValue({ data: { data: { batches: [
      comparison(1, { quantity: 1, quantityUnit: 'BOXES' }),
      comparison(2, { quantity: 5000, quantityUnit: 'WORMS' }),
    ] } } });
    open(`/batches/compare${IDS}`);
    expect(await row('Started with')).toEqual(['1 egg box', '5,000 worms']);
  });

  it('gives the yield per egg box and per thousand worms in separate rows, so the two are never compared', async () => {
    api.compare.mockResolvedValue({ data: { data: { batches: [
      comparison(1, { quantityUnit: 'BOXES' }, { yieldPerUnit: { unit: 'BOXES', kg: 3.5 } }),
      comparison(2, { quantityUnit: 'WORMS', quantity: 5000 }, { yieldPerUnit: { unit: 'WORMS', kg: 2 } }),
      comparison(3, { quantityUnit: 'BOXES' }, { yieldPerUnit: { unit: 'BOXES', kg: 4.25 } }),
    ] } } });
    open('/batches/compare?ids=b1-abcdefg1,b2-abcdefg2,b3-abcdefg3');
    expect(await row('Cocoons per egg box')).toEqual(['3.5 kg', 'No data', '4.25 kg Best']);
    expect(await row('Cocoons per 1,000 worms')).toEqual(['No data', '2 kg', 'No data']);
  });

  it('leaves out the row for a start count that no batch used', async () => {
    open(`/batches/compare${IDS}`);
    await table();
    expect(screen.queryByRole('rowheader', { name: 'Cocoons per 1,000 worms' })).not.toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Cocoons per egg box' })).toBeInTheDocument();
  });

  it('shows the death rate only for batches counted in worms', async () => {
    api.compare.mockResolvedValue({ data: { data: { batches: [
      comparison(1, { quantityUnit: 'WORMS', quantity: 1000, deaths: 125, deathRatePct: 12.5 }),
      comparison(2, { quantityUnit: 'BOXES', deaths: 40, deathRatePct: null }),
    ] } } });
    open(`/batches/compare${IDS}`);
    expect(await row('Death rate')).toEqual(['12.5 %', 'No data']);
    expect(await row('Deaths')).toEqual(['125', '40']);
  });

  it('marks the lowest death rate between batches counted in worms', async () => {
    api.compare.mockResolvedValue({ data: { data: { batches: [
      comparison(1, { quantityUnit: 'WORMS', quantity: 1000, deaths: 125, deathRatePct: 12.5 }),
      comparison(2, { quantityUnit: 'WORMS', quantity: 4000, deaths: 200, deathRatePct: 5 }),
    ] } } });
    open(`/batches/compare${IDS}`);
    expect(await row('Death rate')).toEqual(['12.5 %', '5 % Best']);
  });

  it('names how far along each batch is', async () => {
    open(`/batches/compare${IDS}`);
    expect(await row('Days running')).toEqual(['20', '20']);
    expect((await row('Started'))[0]).toMatch(/2026/);
  });

  it('can go back to choosing other batches', async () => {
    open(`/batches/compare${IDS}`);
    await table();
    fireEvent.click(screen.getByRole('link', { name: 'Choose other batches' }));
    await waitFor(() => expect(where()).toBe('/batches/compare'));
    expect(await screen.findByRole('button', { name: 'Compare' })).toBeInTheDocument();
  });

  it('says a batch may be gone or hidden when the server cannot find one, and offers the choice again', async () => {
    api.compare.mockRejectedValue(Object.assign(new Error('not found'), { response: { status: 404 } }));
    open(`/batches/compare${IDS}`);
    expect(await screen.findByText('We could not load this comparison')).toBeInTheDocument();
    expect(screen.getByText('One of the batches may have been deleted, or is not one you can see.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose other batches' })).toBeInTheDocument();
  });

  it.each([
    ['the server has a problem', Object.assign(new Error('boom'), { response: { status: 500 } })],
    ['the server cannot be reached', new Error('Network Error')],
  ])('does not blame the batches when %s', async (_name, error) => {
    api.compare.mockRejectedValue(error);
    open(`/batches/compare${IDS}`);
    expect(await screen.findByText('We could not load this comparison')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong on our side. Please try again in a moment.')).toBeInTheDocument();
    expect(screen.queryByText(/may have been deleted/)).not.toBeInTheDocument();
  });
});

describe('the harvest chart', () => {
  it('gives the harvest so far for each batch, with the same numbers in a table for screen readers', async () => {
    api.compare.mockResolvedValue({ data: { data: { batches: [
      comparison(1, {}, { curve: [{ day: 30, kg: 6 }, { day: 33, kg: 10 }] }),
      comparison(2, {}, { curve: [{ day: 31, kg: 4 }] }),
    ] } } });
    open(`/batches/compare${IDS}`);
    const chart = await screen.findByRole('img', { name: 'Cocoons harvested so far' });
    const rows = within(chart).getAllByRole('row').map((r) => Array.from(r.querySelectorAll('th, td')).map((c) => c.textContent));
    expect(rows).toEqual([
      ['Day', '#ABCDEFG1', '#ABCDEFG2'],
      ['30', '6 kg', 'No data'],
      ['31', '6 kg', '4 kg'],
      ['33', '10 kg', '4 kg'],
    ]);
  });

  it('says so when nothing has been harvested yet', async () => {
    api.compare.mockResolvedValue({ data: { data: { batches: [comparison(1, {}, { curve: [], cocoonKg: 0, records: 0 }), comparison(2, {}, { curve: [], cocoonKg: 0, records: 0 })] } } });
    open(`/batches/compare${IDS}`);
    expect(await screen.findByText('No harvests recorded yet for these batches.')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Cocoons harvested so far' })).not.toBeInTheDocument();
  });
});

describe('in French', () => {
  it('reads in the language of the screen', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    open(`/batches/compare${IDS}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Comparer des lots' })).toBeInTheDocument();
    const t = within(await screen.findByRole('table', { name: 'Comparer des lots' }));
    expect(t.getByRole('rowheader', { name: 'Cocons récoltés' })).toBeInTheDocument();
    expect(t.getAllByText('Cocon')).toHaveLength(2);
  });
});
