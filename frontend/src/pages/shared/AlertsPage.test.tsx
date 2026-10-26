import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const makeAlert = (i: number, over: object = {}) => ({
  id: `a${i}`, batchId: `b${i}`, type: 'TEMPERATURE', message: `Temperature too low: ${20 + i} C`, isRead: false,
  createdAt: new Date(Date.now() - i * 3600_000).toISOString(), farmerName: 'Claudine', farmName: "Claudine's Farm",
  batch: { id: `batch-${i}-abcdef`, stage: 'LARVA' }, ...over,
});

const api = vi.hoisted(() => ({ getAll: vi.fn(), markRead: vi.fn(), markAllRead: vi.fn() }));
vi.mock('../../services/alert.service', () => ({ alertService: api }));

import AlertsPage from './AlertsPage';

function open() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <ToastProvider>
          <AlertsPage />
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
  api.getAll.mockResolvedValue({
    data: { data: [makeAlert(1), makeAlert(2, { type: 'HUMIDITY', message: 'Humidity too high: 90%' }), makeAlert(3, { isRead: true, type: 'DISEASE', message: 'Flacherie suspected' })] },
  });
  api.markRead.mockResolvedValue({ data: { data: {} } });
  api.markAllRead.mockResolvedValue({ data: { data: { updated: 2 } } });
});

describe('Alerts page', () => {
  it('has one title and counts what is unread', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Alerts' })).toBeInTheDocument();
    expect(await screen.findByText('2 unread')).toBeInTheDocument();
  });

  it('says when everything has been read', async () => {
    api.getAll.mockResolvedValue({ data: { data: [makeAlert(1, { isRead: true })] } });
    open();
    expect(await screen.findByText('You are all caught up.')).toBeInTheDocument();
  });

  it('shows each alert with its type, farmer, batch and time', async () => {
    open();
    const item = (await screen.findByText('Humidity too high: 90%')).closest('li') as HTMLElement;
    expect(within(item).getByText('Humidity')).toBeInTheDocument();
    expect(within(item).getByText(/Claudine/)).toBeInTheDocument();
    expect(within(item).getByRole('link', { name: /Larva/ })).toHaveAttribute('href', '/batches/batch-2-abcdef');
    expect(within(item).getByText('2 hours ago')).toBeInTheDocument();
  });

  it('asks the server for unread alerts only when that tab is chosen', async () => {
    open();
    await screen.findByText('Humidity too high: 90%');
    expect(api.getAll).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole('tab', { name: 'Unread' }));
    await waitFor(() => expect(api.getAll).toHaveBeenLastCalledWith(true));
  });

  it('filters by type', async () => {
    open();
    await screen.findByText('Humidity too high: 90%');
    fireEvent.change(screen.getByRole('combobox', { name: 'Type' }), { target: { value: 'HUMIDITY' } });
    expect(screen.getByText('Humidity too high: 90%')).toBeInTheDocument();
    expect(screen.queryByText('Flacherie suspected')).not.toBeInTheDocument();
  });

  it('marks one alert read', async () => {
    open();
    const item = (await screen.findByText('Humidity too high: 90%')).closest('li') as HTMLElement;
    fireEvent.click(within(item).getByRole('button', { name: 'Mark as read' }));
    await waitFor(() => expect(api.markRead).toHaveBeenCalledWith('a2'));
    await waitFor(() => expect(within(item).queryByRole('button', { name: 'Mark as read' })).not.toBeInTheDocument());
  });

  it('marks all read and says so', async () => {
    open();
    await screen.findByText('2 unread');
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    await waitFor(() => expect(api.markAllRead).toHaveBeenCalled());
    expect(await screen.findByText('All alerts are marked as read.', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark all as read' })).not.toBeInTheDocument();
  });

  it('shows fifteen at a time and pages through the rest', async () => {
    api.getAll.mockResolvedValue({ data: { data: Array.from({ length: 20 }, (_, i) => makeAlert(i + 1, { message: `Alert number ${i + 1}` })) } });
    open();
    await screen.findByText('Alert number 1');
    expect(screen.getAllByRole('listitem')).toHaveLength(15);
    expect(screen.queryByText('Alert number 16')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Alert number 16')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
  });

  it('is kind when there is nothing to show', async () => {
    api.getAll.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No alerts')).toBeInTheDocument();
    expect(screen.getByText(/let you know here when something needs attention/)).toBeInTheDocument();
  });

  it('keeps the old purple and blue pills out', async () => {
    const { container } = open();
    await screen.findByText('Humidity too high: 90%');
    expect(container.innerHTML.toLowerCase()).not.toMatch(/#7c3aed|#2563eb|#d97706|#f3e8ff|#dbeafe/);
  });
});
