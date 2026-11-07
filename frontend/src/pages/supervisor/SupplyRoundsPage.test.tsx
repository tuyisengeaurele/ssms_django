import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const auth = vi.hoisted(() => ({ user: { id: 'sup', name: 'Claire Uwimana', role: 'SUPERVISOR' } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));

const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn() }));
vi.mock('../../services/supply.service', () => ({ supplyService: { listRounds: api.list, createRound: api.create } }));

import SupplyRoundsPage from './SupplyRoundsPage';

const round = (id: string, name: string, over: object = {}) => ({
  id, name, stockBoxes: 10, requestDeadline: '2026-11-10T12:00:00Z', deliveryDate: '2026-11-14', deliveryPlace: 'Store', expectedHarvestDate: '2026-12-20',
  lotCode: null, status: 'open', paused: false, createdAt: '2026-11-01T10:00:00Z', allocatedAt: null, requestCount: 2, approvedBoxes: 0, ...over,
});

const open = () => render(
  <MemoryRouter>
    <LanguageProvider>
      <ToastProvider>
        <SupplyRoundsPage />
      </ToastProvider>
    </LanguageProvider>
  </MemoryRouter>,
);

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  auth.user = { id: 'sup', name: 'Claire Uwimana', role: 'SUPERVISOR' };
  api.list.mockResolvedValue({ data: { data: { rounds: [round('r1', 'November round'), round('r2', 'October round', { status: 'done', requestCount: 5 })] } } });
});

describe('Supply rounds', () => {
  it('lists the rounds with their status, boxes, deadline and requests, each linking to its page', async () => {
    open();
    const row = (await screen.findByText('November round')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Open for requests')).toBeInTheDocument();
    expect(within(row).getByText('10')).toBeInTheDocument();
    expect(within(row).getByText('2')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: 'Open November round' })).toHaveAttribute('href', '/supply/r1');
    expect(within((await screen.findByText('October round')).closest('tr') as HTMLElement).getByText('Done')).toBeInTheDocument();
  });

  it('says there are no rounds yet', async () => {
    api.list.mockResolvedValue({ data: { data: { rounds: [] } } });
    open();
    expect(await screen.findByText('No supply rounds yet.')).toBeInTheDocument();
  });

  it('says it could not load, with a way to try again', async () => {
    api.list.mockRejectedValueOnce(new Error('down'));
    open();
    expect(await screen.findByText('We could not load the supply rounds.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('November round')).toBeInTheDocument();
  });

  it('shows a round name as plain text', async () => {
    api.list.mockResolvedValue({ data: { data: { rounds: [round('r1', '<b>Big</b> round')] } } });
    const { container } = open();
    expect(await screen.findByText('<b>Big</b> round')).toBeInTheDocument();
    expect(container.querySelector('b')).toBeNull();
  });

  it('has no New round button for an admin, who names no cooperative here', async () => {
    auth.user = { id: 'a', name: 'Admin', role: 'ADMIN' };
    open();
    await screen.findByText('November round');
    expect(screen.queryByRole('button', { name: 'New round' })).not.toBeInTheDocument();
  });

  describe('making a round', () => {
    const openForm = async () => {
      open();
      fireEvent.click(await screen.findByRole('button', { name: 'New round' }));
      return screen.findByRole('dialog', { name: 'New round' });
    };
    const fill = (dialog: HTMLElement, over: Record<string, string> = {}) => {
      const values: Record<string, string> = {
        Name: 'December round', 'Boxes in the round': '12', 'Ask before': '2030-12-10T12:00', 'Handed over on': '2030-12-14', Place: 'Cooperative store', 'Expected harvest': '2031-01-20', ...over,
      };
      for (const [label, value] of Object.entries(values)) fireEvent.change(within(dialog).getByLabelText(new RegExp(`^${label}`)), { target: { value } });
    };
    const save = (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole('button', { name: 'Save round' }));

    it('sends the facts, with the deadline as an exact moment, and shows the new round', async () => {
      api.create.mockResolvedValue({ data: { data: round('r3', 'December round', { status: 'draft', requestCount: 0 }) } });
      const dialog = await openForm();
      fill(dialog);
      save(dialog);
      await waitFor(() => expect(api.create).toHaveBeenCalledWith({
        name: 'December round', stockBoxes: 12, requestDeadline: new Date('2030-12-10T12:00').toISOString(), deliveryDate: '2030-12-14',
        deliveryPlace: 'Cooperative store', expectedHarvestDate: '2031-01-20',
      }));
      expect(await screen.findByText('December round')).toBeInTheDocument();
    });

    it('says what the expected harvest date is for', async () => {
      const dialog = await openForm();
      expect(within(dialog).getByText('The batches made from this round get this date.')).toBeInTheDocument();
    });

    it.each([
      [{ Name: '   ' }, 'Please give the round a name.'],
      [{ 'Boxes in the round': '-1' }, 'Please enter the boxes in the round as a whole number from 0 to 100000.'],
      [{ 'Boxes in the round': '2.5' }, 'Please enter the boxes in the round as a whole number from 0 to 100000.'],
      [{ 'Boxes in the round': '' }, 'Please enter the boxes in the round as a whole number from 0 to 100000.'],
      [{ 'Ask before': '' }, 'Please give the request deadline.'],
      [{ Place: ' ' }, 'Please say where the eggs are handed over.'],
      [{ 'Handed over on': '2030-12-01' }, 'The eggs cannot be handed over before the request deadline.'],
      [{ 'Expected harvest': '2030-12-14' }, 'The expected harvest must come after the delivery day.'],
    ])('refuses %o before sending', async (over, message) => {
      const dialog = await openForm();
      fill(dialog, over as Record<string, string>);
      save(dialog);
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
      expect(api.create).not.toHaveBeenCalled();
    });

    it('shows the answer of the server inside the dialog and keeps what was typed', async () => {
      api.create.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status: 422, data: { message: 'Please give the round a name of up to 120 characters.' } } as never));
      const dialog = await openForm();
      fill(dialog);
      save(dialog);
      expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please give the round a name of up to 120 characters.');
      expect(within(dialog).getByLabelText(/^Name/)).toHaveValue('December round');
    });
  });
});
