import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';
import StageStepper from './StageStepper';

const auth = vi.hoisted(() => ({ role: 'FARMER' }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', role: auth.role } }) }));

const api = vi.hoisted(() => ({ getById: vi.fn(), updateStage: vi.fn(), archive: vi.fn(), detections: vi.fn() }));
vi.mock('../../services/batch.service', () => ({ batchService: { getById: api.getById, updateStage: api.updateStage, delete: api.archive } }));
vi.mock('../../services/detection.service', () => ({ detectionService: { getByBatch: api.detections } }));

import BatchDetailPage from './BatchDetailPage';

const batch = (over: object = {}) => ({
  id: 'b1-9sieo7cv', farmId: 'f1', stage: 'LARVA', startDate: '2026-05-16T00:00:00Z', expectedHarvestDate: '2026-06-06T00:00:00Z', isActive: true, createdAt: '', updatedAt: '',
  notes: 'Healthy eggs from the cooperative.', farm: { id: 'f1', name: "Serge's farm", location: 'Gatsibo' },
  counts: { diseaseDetections: 2, sensorReadings: 3, alertLogs: 1 },
  alertLogs: [{ id: 'a1', batchId: 'b1', type: 'TEMPERATURE', message: 'Temperature too low: 21 C', isRead: false, createdAt: '2026-10-01T00:00:00Z' }],
  sensorReadings: [
    { id: 's1', batchId: 'b1', temperature: 24.5, humidity: 78, timestamp: '2026-10-01T10:00:00Z' },
    { id: 's2', batchId: 'b1', temperature: 30.2, humidity: 78, timestamp: '2026-10-01T09:00:00Z' },
  ],
  ...over,
});
const detections = [
  { id: 'd1', batchId: 'b1', imageUrl: '', result: 'Healthy', confidence: 0.97, detectedAt: '2026-09-30T08:00:00Z', notes: 'Looks fine' },
  { id: 'd2', batchId: 'b1', imageUrl: '', result: 'Flacherie', confidence: 0.8, detectedAt: '2026-09-29T08:00:00Z' },
];

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function open() {
  return render(
    <MemoryRouter initialEntries={['/batches/b1-9sieo7cv']}>
      <LanguageProvider>
        <ToastProvider>
          <Routes>
            <Route path="/batches/:id" element={<BatchDetailPage />} />
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
  auth.role = 'FARMER';
  setReducedMotion(true);
  api.getById.mockResolvedValue({ data: { data: batch() } });
  api.detections.mockResolvedValue({ data: { data: detections } });
});

type StepperProps = Parameters<typeof StageStepper>[0];
const stepper = (props: StepperProps) => (
  <LanguageProvider>
    <StageStepper {...props} />
  </LanguageProvider>
);

describe('Stage stepper', () => {
  it('lists the five stages in order and marks the current one', () => {
    render(stepper({ current: 'PUPA', canAdvance: false, busy: false, onAdvance: () => {} }));
    const items = within(screen.getByRole('list', { name: 'Lifecycle' })).getAllByRole('listitem');
    expect(items.map((li) => li.querySelector('.stepper-label')?.textContent)).toEqual(['Egg', 'Larva', 'Pupa', 'Cocoon', 'Harvest']);
    expect(items[2]).toHaveAttribute('aria-current', 'step');
    expect(items[0]).not.toHaveAttribute('aria-current');
  });

  it('offers only the next stage and nothing backwards', () => {
    const onAdvance = vi.fn();
    render(stepper({ current: 'LARVA', canAdvance: true, busy: false, onAdvance }));
    expect(screen.queryByRole('button', { name: /Egg/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Move to Pupa' }));
    expect(onAdvance).toHaveBeenCalledWith('PUPA');
  });

  it('has no button on the last stage or when the person cannot edit', () => {
    const { rerender } = render(stepper({ current: 'HARVEST', canAdvance: true, busy: false, onAdvance: () => {} }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    rerender(stepper({ current: 'EGG', canAdvance: false, busy: false, onAdvance: () => {} }));
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('Batch details page', () => {
  it('names the batch and links to its farm, and sets the tab title', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Batch #9SIEO7CV' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: "Serge's farm" })).toHaveAttribute('href', '/farms/f1');
    await waitFor(() => expect(document.title).toBe('Batch #9SIEO7CV | SSMS'));
  });

  it('shows the dates, the place and the notes', async () => {
    open();
    await screen.findByText('Healthy eggs from the cooperative.');
    expect(screen.getByText('May 16, 2026')).toBeInTheDocument();
    expect(screen.getByText('Jun 6, 2026')).toBeInTheDocument();
    expect(screen.getByText('Gatsibo')).toBeInTheDocument();
  });

  it('moves the batch to the next stage', async () => {
    api.updateStage.mockResolvedValue({ data: { data: batch({ stage: 'PUPA' }) } });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Move to Pupa' }));
    await waitFor(() => expect(api.updateStage).toHaveBeenCalledWith('b1-9sieo7cv', 'PUPA'));
    expect(await screen.findByRole('button', { name: 'Move to Cocoon' })).toBeInTheDocument();
  });

  it('opens the harvest record when the batch reaches harvest', async () => {
    api.getById.mockResolvedValue({ data: { data: batch({ stage: 'COCOON' }) } });
    api.updateStage.mockResolvedValue({ data: { data: batch({ stage: 'HARVEST' }) } });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Move to Harvest' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/batches/b1-9sieo7cv/harvest'));
  });

  it('asks before archiving, then returns to the farm', async () => {
    api.archive.mockResolvedValue({ data: { data: null } });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Archive batch' }));
    const dialog = await screen.findByRole('dialog', { name: 'Archive this batch?' });
    expect(api.archive).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, archive' }));
    await waitFor(() => expect(api.archive).toHaveBeenCalledWith('b1-9sieo7cv'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/farms/f1'));
  });

  it('keeps archive and stage changes from a supervisor', async () => {
    auth.role = 'SUPERVISOR';
    open();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByRole('button', { name: 'Archive batch' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Move to/ })).not.toBeInTheDocument();
  });

  it('shows the harvest link only at the harvest stage', async () => {
    api.getById.mockResolvedValue({ data: { data: batch({ stage: 'HARVEST' }) } });
    open();
    expect(await screen.findByRole('link', { name: 'Harvest records' })).toHaveAttribute('href', '/batches/b1-9sieo7cv/harvest');
  });

  it('counts checks, readings and unread alerts in plain numbers, with the latest alert', async () => {
    open();
    await screen.findByText('Temperature too low: 21 C');
    const facts = screen.getByRole('region', { name: 'Activity' });
    expect(within(facts).getByText('Disease checks').nextSibling).toHaveTextContent('2');
    expect(within(facts).getByText('Sensor readings').nextSibling).toHaveTextContent('3');
    expect(within(facts).getByText('Unread alerts').nextSibling).toHaveTextContent('1');
  });

  it('lists the latest readings and says which are out of range', async () => {
    open();
    const table = await screen.findByRole('table', { name: 'Latest readings' });
    const row = within(table).getByText('30.2 °C').closest('tr') as HTMLElement;
    expect(within(row).getByText('Out of range')).toBeInTheDocument();
    const fine = within(table).getByText('24.5 °C').closest('tr') as HTMLElement;
    expect(within(fine).getByText('In range')).toBeInTheDocument();
  });

  it('lists disease checks with plain percentages, not progress bars', async () => {
    const { container } = open();
    const row = (await screen.findByText('Flacherie')).closest('tr') as HTMLElement;
    expect(within(row).getByText('80%')).toBeInTheDocument();
    expect(container.querySelector('.progress-bar, .progress-fill')).toBeNull();
    expect(screen.getByRole('link', { name: 'New check' })).toHaveAttribute('href', '/batches/b1-9sieo7cv/detect');
  });

  it('is kind when there are no checks or readings', async () => {
    api.detections.mockResolvedValue({ data: { data: [] } });
    api.getById.mockResolvedValue({ data: { data: batch({ sensorReadings: [], alertLogs: [], counts: { diseaseDetections: 0, sensorReadings: 0, alertLogs: 0 } }) } });
    open();
    expect(await screen.findByText('No disease checks yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Check for disease' })).toBeInTheDocument();
  });

  it('shows a calm message when the batch cannot be found', async () => {
    api.getById.mockRejectedValue(new Error('x'));
    open();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to farms/ })).toHaveAttribute('href', '/farms');
  });

  it('keeps the rainbow stepper, the AI wording and the old colours out', async () => {
    const { container } = open();
    await screen.findByText('Flacherie');
    expect(container.textContent).not.toMatch(/\bAI\b|AI-powered/);
    expect(container.innerHTML.toLowerCase()).not.toMatch(/gradient|#d97706|#2563eb|#dc2626|#16a34a|#7c3aed/);
  });
});
