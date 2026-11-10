import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ lot: vi.fn() }));
vi.mock('../../services/supply.service', () => ({ supplyService: { lot: api.lot } }));

import SupplyLotPage from './SupplyLotPage';

const row = (over: object = {}) => ({
  id: 'b1-abcdefgh', stage: 'LARVA', quantity: 2, quantityUnit: 'BOXES', startDate: '2026-11-02T08:00:00Z', status: 'not_checked',
  farm: { id: 'f1', name: 'Hillside' }, owner: { id: 'u1', name: 'Aline Uwase', email: 'aline@example.rw' }, room: { id: 'r1', name: 'Main house' },
  lastCheck: null, openAlert: false, ...over,
});
const lot = (over: object = {}) => ({
  lotCode: 'L2611-AB12', round: { id: 'rd1', name: 'November round', deliveryDate: '2026-11-14', status: 'done' },
  summary: { batches: 3, farms: 3, disease: 1, healthy: 1, notChecked: 1 },
  batches: [
    row({ id: 'b1-sick00001', status: 'disease', lastCheck: { result: 'Grasserie', at: '2026-11-08T08:00:00Z' }, openAlert: true }),
    row({ id: 'b2-unseen002', owner: { id: 'u2', name: 'Bruce Ishimwe', email: 'bruce@example.rw' }, farm: { id: 'f2', name: 'Riverside' } }),
    row({ id: 'b3-fine00003', status: 'healthy', owner: { id: 'u3', name: 'Gad Anaclet', email: 'gad@example.rw' }, farm: { id: 'f3', name: 'Lakeview' }, lastCheck: { result: 'Healthy', at: '2026-11-07T08:00:00Z' } }),
  ],
  ...over,
});
const answer = (data: object) => api.lot.mockResolvedValue({ data: { data } });
const open = (code = 'L2611-AB12') => render(
  <MemoryRouter initialEntries={[`/supply/lots/${encodeURIComponent(code)}`]}>
    <LanguageProvider>
      <Routes>
        <Route path="/supply/lots/:code" element={<SupplyLotPage />} />
      </Routes>
    </LanguageProvider>
  </MemoryRouter>,
);
const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr') as HTMLElement;

beforeEach(() => {
  vi.clearAllMocks();
  setReducedMotion(true);
  answer(lot());
});

describe('Lot page', () => {
  it('asks for the lot named in the address and shows its code', async () => {
    open();
    await screen.findByText('Aline Uwase');
    expect(api.lot).toHaveBeenCalledWith('L2611-AB12');
    expect(screen.getAllByText('Egg lot L2611-AB12').length).toBeGreaterThan(0);
  });

  it('links to the round the lot came from, and names none when there is none', async () => {
    const first = open();
    expect(await screen.findByRole('link', { name: 'November round' })).toHaveAttribute('href', '/supply/rd1');
    first.unmount();
    answer(lot({ round: null }));
    open();
    await screen.findByText('Aline Uwase');
    expect(screen.queryByRole('link', { name: 'November round' })).not.toBeInTheDocument();
  });

  it('counts the batches, the farms and how many have a disease, are healthy or are not checked', async () => {
    open();
    await screen.findByText('Aline Uwase');
    const tile = (label: string) => screen.getAllByText(label).map((el) => el.closest('.stat-tile')).find(Boolean) as HTMLElement;
    expect(tile('Batches')).toHaveTextContent('3');
    expect(tile('Farms')).toHaveTextContent('3');
    expect(tile('With disease')).toHaveTextContent('1');
    expect(tile('Healthy')).toHaveTextContent('1');
    expect(tile('Not checked')).toHaveTextContent('1');
  });

  it('lists the batches in the order given, each with its farmer, farm, room, stage and quantity', async () => {
    open();
    await screen.findByText('Aline Uwase');
    const names = screen.getAllByRole('row').slice(1).map((r) => r.querySelector('.cell-strong')?.textContent);
    expect(names).toEqual(['Aline Uwase', 'Bruce Ishimwe', 'Gad Anaclet']);
    const first = await rowOf('Aline Uwase');
    expect(within(first).getByText('Hillside')).toBeInTheDocument();
    expect(within(first).getByText('Main house')).toBeInTheDocument();
    expect(within(first).getByText('2 boxes')).toBeInTheDocument();
  });

  it('puts the five counts in one row on a wide screen, not three and then two', async () => {
    open();
    await screen.findByText('Aline Uwase');
    const tiles = document.querySelectorAll('.stat-tile');
    expect(tiles).toHaveLength(5);
    expect(tiles[0].parentElement).toHaveClass('grid-5');
  });

  it('keeps the disease badge and the open alert badge in one row, so they do not run together', async () => {
    open();
    const first = await rowOf('Aline Uwase');
    const disease = within(first).getByText('Disease found');
    const alert = within(first).getByText('Open alert');
    expect(disease.parentElement).toHaveClass('badge-row');
    expect(alert.parentElement).toBe(disease.parentElement);
  });

  it('says nothing about quantity for a batch with no quantity, instead of a lone dash', async () => {
    answer(lot({ batches: [row({ quantity: null, quantityUnit: null })] }));
    open();
    const only = await rowOf('Aline Uwase');
    const cell = only.querySelector('td.cell-mono') as HTMLElement;
    expect(within(cell).queryByText('-')).not.toBeInTheDocument();
    expect(cell.querySelectorAll('.cell-sub')).toHaveLength(1);
  });

  it('says in words how each batch is doing, never by colour alone', async () => {
    open();
    expect(within(await rowOf('Aline Uwase')).getByText('Disease found')).toBeInTheDocument();
    expect(within(await rowOf('Bruce Ishimwe')).getByText('Not checked')).toBeInTheDocument();
    expect(within(await rowOf('Gad Anaclet')).getByText('Healthy')).toBeInTheDocument();
  });

  it('shows the last check with its date, and flags an open disease alert', async () => {
    open();
    const sick = await rowOf('Aline Uwase');
    expect(within(sick).getByText('Grasserie, Nov 8, 2026')).toBeInTheDocument();
    expect(within(sick).getByText('Open alert')).toBeInTheDocument();
    expect(within(await rowOf('Gad Anaclet')).queryByText('Open alert')).not.toBeInTheDocument();
  });

  it('opens a batch from its row', async () => {
    open();
    const link = within(await rowOf('Aline Uwase')).getByRole('link', { name: '#ICK00001' });
    expect(link).toHaveAttribute('href', '/batches/b1-sick00001');
  });

  it('reads well for a lot of one batch', async () => {
    answer(lot({ summary: { batches: 1, farms: 1, disease: 0, healthy: 0, notChecked: 1 }, batches: [row()] }));
    open();
    expect(await screen.findByText('Aline Uwase')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(2);
  });

  it('shows a name, a farm, a room and a lot code as plain text', async () => {
    answer(lot({
      lotCode: '<i>L1</i>',
      batches: [row({ owner: { id: 'u1', name: '<b>Aline</b>', email: 'a@example.rw' }, farm: { id: 'f1', name: '<u>Hill</u>' }, room: { id: 'r1', name: '<s>Main</s>' } })],
    }));
    const { container } = open('<i>L1</i>');
    expect(await screen.findByText('<b>Aline</b>')).toBeInTheDocument();
    expect(screen.getByText('<u>Hill</u>')).toBeInTheDocument();
    expect(screen.getByText('<s>Main</s>')).toBeInTheDocument();
    expect(container.querySelector('b, i, u, s')).toBeNull();
  });

  it('says so when the lot is not found', async () => {
    api.lot.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status: 404, data: { message: 'We could not find that lot.' } } as never));
    open();
    expect(await screen.findByText('We could not find that lot.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });

  it('offers to try again when the lot cannot be loaded, and then shows it', async () => {
    api.lot.mockRejectedValueOnce(new Error('down'));
    open();
    expect(await screen.findByText('We could not load this lot.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Aline Uwase')).toBeInTheDocument();
    await waitFor(() => expect(api.lot).toHaveBeenCalledTimes(2));
  });
});
