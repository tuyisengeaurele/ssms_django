import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ getThresholds: vi.fn(), updateThreshold: vi.fn() }));
vi.mock('../../services/alert.service', () => ({ alertService: api }));

import AdminThresholdsPage from './AdminThresholdsPage';

const range = (stage: string, over: object = {}) => ({
  stage, tempMin: 22, tempMax: 28, humMin: 70, humMax: 85, updatedAt: null, updatedBy: null, ...over,
});
const rows = [
  range('EGG'),
  range('LARVA', { tempMin: 24, tempMax: 27, humMin: 65, humMax: 80, updatedAt: '2026-10-08T10:00:00Z', updatedBy: { id: 'u1', name: 'Aline Uwase' } }),
  range('PUPA'),
  range('COCOON'),
  range('HARVEST'),
];

function open() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <AdminThresholdsPage />
      </ToastProvider>
    </LanguageProvider>,
  );
}

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.getThresholds.mockResolvedValue({ data: { data: rows } });
  api.updateThreshold.mockImplementation((stage: string, r: object) =>
    Promise.resolve({ data: { data: range(stage, { ...r, updatedAt: '2026-10-28T09:00:00Z', updatedBy: { id: 'me', name: 'Eric Niyonzima' } }) } }));
});

const rowOf = async (stage: string) => (await screen.findByText(stage, { selector: 'td.cell-lead' })).closest('tr') as HTMLElement;
const box = (row: HTMLElement, label: RegExp) => within(row).getByLabelText(label) as HTMLInputElement;
const change = (row: HTMLElement, label: RegExp, value: string) => fireEvent.change(box(row, label), { target: { value } });

describe('Safe ranges page', () => {
  it('has one title and says what a range is for', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Safe ranges' })).toBeInTheDocument();
    expect(await screen.findByText(/The temperature and humidity each stage of a batch should stay between/)).toBeInTheDocument();
  });

  it('lists the five stages in order with their numbers', async () => {
    open();
    await rowOf('Egg');
    const names = screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(names).toEqual(['Egg', 'Larva', 'Pupa', 'Cocoon', 'Harvest']);
    const larva = await rowOf('Larva');
    expect(box(larva, /lowest temperature/).value).toBe('24');
    expect(box(larva, /highest temperature/).value).toBe('27');
    expect(box(larva, /lowest humidity/).value).toBe('65');
    expect(box(larva, /highest humidity/).value).toBe('80');
  });

  it('says who last changed a range and when, and says when nobody has', async () => {
    open();
    expect(within(await rowOf('Larva')).getByText(/Aline Uwase, /)).toBeInTheDocument();
    expect(within(await rowOf('Egg')).getByText('Not changed yet')).toBeInTheDocument();
  });

  it('says that a new range applies to new readings, and that open alerts stay open until a good reading', async () => {
    open();
    expect(await screen.findByText(/judged by the new range right away/)).toBeInTheDocument();
  });

  describe('changing a range', () => {
    it('offers Save only after a change', async () => {
      open();
      const row = await rowOf('Egg');
      expect(within(row).getByRole('button', { name: 'Save Egg' })).toBeDisabled();
      change(row, /highest temperature/, '29');
      expect(within(row).getByRole('button', { name: 'Save Egg' })).toBeEnabled();
    });

    it('saves the numbers as numbers and shows who changed it now', async () => {
      open();
      const row = await rowOf('Egg');
      change(row, /lowest temperature/, '23.5');
      change(row, /highest humidity/, '88');
      fireEvent.click(within(row).getByRole('button', { name: 'Save Egg' }));
      await waitFor(() => expect(api.updateThreshold).toHaveBeenCalledWith('EGG', { tempMin: 23.5, tempMax: 28, humMin: 70, humMax: 88 }));
      expect(await within(row).findByText(/Eric Niyonzima, /)).toBeInTheDocument();
      expect(await screen.findByText('Safe range updated.', {}, { timeout: 5000 })).toBeInTheDocument();
      expect(within(row).getByRole('button', { name: 'Save Egg' })).toBeDisabled();
    });

    it('keeps the changes in the other rows while one is saved', async () => {
      open();
      const egg = await rowOf('Egg');
      const pupa = await rowOf('Pupa');
      change(pupa, /highest temperature/, '30');
      change(egg, /highest temperature/, '29');
      fireEvent.click(within(egg).getByRole('button', { name: 'Save Egg' }));
      await within(egg).findByText(/Eric Niyonzima, /);
      expect(box(pupa, /highest temperature/).value).toBe('30');
      expect(within(pupa).getByRole('button', { name: 'Save Pupa' })).toBeEnabled();
    });

    it('holds the button while it saves', async () => {
      let finish: (v: unknown) => void = () => {};
      api.updateThreshold.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
      open();
      const row = await rowOf('Egg');
      change(row, /highest temperature/, '29');
      fireEvent.click(within(row).getByRole('button', { name: 'Save Egg' }));
      await waitFor(() => expect(within(row).getByRole('button', { name: 'Save Egg' })).toBeDisabled());
      fireEvent.click(within(row).getByRole('button', { name: 'Save Egg' }));
      expect(api.updateThreshold).toHaveBeenCalledTimes(1);
      finish({ data: { data: range('EGG', { tempMax: 29, updatedAt: '2026-10-28T09:00:00Z', updatedBy: { id: 'me', name: 'Eric Niyonzima' } }) } });
      await within(row).findByText(/Eric Niyonzima, /);
    });

    it('says kindly, and keeps the numbers, when it cannot be saved', async () => {
      api.updateThreshold.mockRejectedValueOnce(new Error('x'));
      open();
      const row = await rowOf('Egg');
      change(row, /highest temperature/, '29');
      fireEvent.click(within(row).getByRole('button', { name: 'Save Egg' }));
      expect(await screen.findByText("We couldn't save the range. Please try again.", {}, { timeout: 5000 })).toBeInTheDocument();
      expect(box(row, /highest temperature/).value).toBe('29');
      expect(within(row).getByRole('button', { name: 'Save Egg' })).toBeEnabled();
    });
  });

  describe('checking the numbers', () => {
    it('refuses a highest temperature that is not above the lowest, in words', async () => {
      open();
      const row = await rowOf('Egg');
      change(row, /highest temperature/, '20');
      expect(within(row).getByText('Please set the highest temperature above the lowest.')).toBeInTheDocument();
      expect(within(row).getByRole('button', { name: 'Save Egg' })).toBeDisabled();
    });

    it('refuses a highest humidity that is not above the lowest', async () => {
      open();
      const row = await rowOf('Egg');
      change(row, /highest humidity/, '60');
      expect(within(row).getByText('Please set the highest humidity above the lowest.')).toBeInTheDocument();
    });

    it('refuses numbers outside what a room can be', async () => {
      open();
      const row = await rowOf('Egg');
      change(row, /highest temperature/, '60');
      expect(within(row).getByText('Temperatures go from 0 to 50 °C.')).toBeInTheDocument();
      change(row, /highest temperature/, '28');
      change(row, /highest humidity/, '120');
      expect(within(row).getByText('Humidity goes from 0 to 100 %.')).toBeInTheDocument();
    });

    it('asks for a number when a box is empty', async () => {
      open();
      const row = await rowOf('Egg');
      change(row, /lowest humidity/, '');
      expect(within(row).getByText('Please enter a number for each box.')).toBeInTheDocument();
      expect(within(row).getByRole('button', { name: 'Save Egg' })).toBeDisabled();
    });

    it('does not ask the server about numbers it can already see are wrong', async () => {
      open();
      const row = await rowOf('Egg');
      change(row, /highest temperature/, '20');
      fireEvent.click(within(row).getByRole('button', { name: 'Save Egg' }));
      expect(api.updateThreshold).not.toHaveBeenCalled();
    });
  });

  describe('the usual range', () => {
    it('puts the usual numbers in the boxes without saving them', async () => {
      open();
      const row = await rowOf('Larva');
      fireEvent.click(within(row).getByRole('button', { name: 'Use the usual range for Larva' }));
      expect([box(row, /lowest temperature/).value, box(row, /highest temperature/).value, box(row, /lowest humidity/).value, box(row, /highest humidity/).value]).toEqual(['22', '28', '70', '85']);
      expect(api.updateThreshold).not.toHaveBeenCalled();
      expect(within(row).getByRole('button', { name: 'Save Larva' })).toBeEnabled();
    });

    it('is not offered when the range already is the usual one', async () => {
      open();
      const row = await rowOf('Egg');
      expect(within(row).getByRole('button', { name: 'Use the usual range for Egg' })).toBeDisabled();
    });
  });

  it('shows an error and a way to try again when the ranges cannot be loaded', async () => {
    api.getThresholds.mockRejectedValueOnce(new Error('x'));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the safe ranges. Please try again.");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await rowOf('Egg')).toBeInTheDocument();
  });

  it('reads in French', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Plages sûres' })).toBeInTheDocument();
    expect(await screen.findByLabelText(/Larve, température minimale/)).toBeInTheDocument();
  });
});
