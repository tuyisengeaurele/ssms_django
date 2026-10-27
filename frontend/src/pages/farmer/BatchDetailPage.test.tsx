import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';
import StageStepper from './StageStepper';

const auth = vi.hoisted(() => ({ role: 'FARMER' }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', role: auth.role } }) }));

const api = vi.hoisted(() => ({
  getById: vi.fn(), updateStage: vi.fn(), archive: vi.fn(), detections: vi.fn(), series: vi.fn(), thresholds: vi.fn(),
  update: vi.fn(), mortality: vi.fn(), addDeaths: vi.fn(), deleteDeaths: vi.fn(), moveRoom: vi.fn(), rooms: vi.fn(),
}));
vi.mock('../../services/room.service', () => ({ roomService: { getByFarm: api.rooms } }));
vi.mock('../../services/batch.service', () => ({
  batchService: {
    getById: api.getById, updateStage: api.updateStage, delete: api.archive, update: api.update,
    getMortality: api.mortality, addMortality: api.addDeaths, deleteMortality: api.deleteDeaths, moveToRoom: api.moveRoom,
  },
}));
vi.mock('../../services/detection.service', () => ({ detectionService: { getByBatch: api.detections } }));
vi.mock('../../services/sensor.service', () => ({ sensorService: { getBatchSeries: api.series } }));
vi.mock('../../services/alert.service', () => ({ alertService: { getThresholds: api.thresholds } }));

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
  api.mortality.mockResolvedValue({ data: { data: [] } });
  api.rooms.mockResolvedValue({ data: { data: [
    { id: 'r1', name: 'Rearing house 1', notes: '', batchCount: 1, batches: [], createdAt: '' },
    { id: 'r2', name: 'Cocoon room', notes: '', batchCount: 0, batches: [], createdAt: '' },
  ] } });
  api.series.mockResolvedValue({ data: { data: [
    { timestamp: '2026-10-01T09:00:00Z', temperature: 30.2, humidity: 78, count: 4 },
    { timestamp: '2026-10-01T10:00:00Z', temperature: 24.5, humidity: 78, count: 4 },
  ] } });
  api.thresholds.mockResolvedValue({ data: { data: [
    { stage: 'LARVA', tempMin: 24, tempMax: 27, humMin: 75, humMax: 85 },
    { stage: 'COCOON', tempMin: 22, tempMax: 28, humMin: 70, humMax: 85 },
  ] } });
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

  it.each(['FARMER', 'SUPERVISOR', 'ADMIN'])('links to the printable report for a %s', async (role) => {
    auth.role = role;
    open();
    const link = await screen.findByRole('link', { name: 'Batch report' });
    expect(link).toHaveAttribute('href', '/batches/b1-9sieo7cv/report');
  });

  it('shows the dates, the place and the notes', async () => {
    open();
    await screen.findByText('Healthy eggs from the cooperative.');
    expect(screen.getByText('May 16, 2026')).toBeInTheDocument();
    expect(screen.getByText('Jun 6, 2026')).toBeInTheDocument();
    expect(screen.getByText('Gatsibo')).toBeInTheDocument();
  });

  it('asks before moving the batch to the next stage, then moves it', async () => {
    api.updateStage.mockResolvedValue({ data: { data: batch({ stage: 'PUPA' }) } });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Move to Pupa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move this batch to Pupa?' });
    expect(dialog).toHaveTextContent('cannot be moved back');
    expect(api.updateStage).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, move it' }));
    await waitFor(() => expect(api.updateStage).toHaveBeenCalledWith('b1-9sieo7cv', 'PUPA'));
    expect(await screen.findByRole('button', { name: 'Move to Cocoon' })).toBeInTheDocument();
  });

  it('leaves the stage alone when the question is cancelled', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Move to Pupa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move this batch to Pupa?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.updateStage).not.toHaveBeenCalled();
  });

  it('opens the harvest record when the batch reaches harvest', async () => {
    api.getById.mockResolvedValue({ data: { data: batch({ stage: 'COCOON' }) } });
    api.updateStage.mockResolvedValue({ data: { data: batch({ stage: 'HARVEST' }) } });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Move to Harvest' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move this batch to Harvest?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, move it' }));
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

describe('Batch timeline and charts', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('says which day of the cycle it is and when harvest is expected', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-05-27T12:00:00Z'));
    open();
    expect(await screen.findByText('Day 12 of 21. Harvest is expected on Jun 6, 2026.')).toBeInTheDocument();
  });

  it('says so when the expected harvest date has passed', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-06-10T12:00:00Z'));
    open();
    expect(await screen.findByText('Day 26. Harvest was expected on Jun 6, 2026.')).toBeInTheDocument();
  });

  it('has no day count once the batch is at harvest', async () => {
    api.getById.mockResolvedValue({ data: { data: batch({ stage: 'HARVEST' }) } });
    open();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText(/^Day \d+/)).not.toBeInTheDocument();
  });

  it('tells the safe range of the current stage from the server, not from a fixed number', async () => {
    open();
    expect(await screen.findByText('In Larva, keep the temperature between 24 and 27 °C and the humidity between 75 and 85 %.')).toBeInTheDocument();
    expect(screen.getAllByText('Safe range: 24 to 27 °C').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Safe range: 75 to 85 %').length).toBeGreaterThan(0);
  });

  it('uses the usual range when the stage ranges cannot be fetched', async () => {
    api.thresholds.mockRejectedValue(new Error('nope'));
    open();
    expect(await screen.findByText('In Larva, keep the temperature between 22 and 28 °C and the humidity between 70 and 85 %.')).toBeInTheDocument();
  });

  it('judges the readings table by the range of the stage', async () => {
    open();
    const table = await screen.findByRole('table', { name: 'Latest readings' });
    // 24.5 is inside the LARVA range of 24 to 27, and 30.2 is not.
    expect(within(within(table).getByText('24.5 °C').closest('tr') as HTMLElement).getByText('In range')).toBeInTheDocument();
    expect(within(within(table).getByText('30.2 °C').closest('tr') as HTMLElement).getByText('Out of range')).toBeInTheDocument();
  });

  it('shows the last day of readings first and offers a week and a month', async () => {
    open();
    await waitFor(() => expect(api.series).toHaveBeenCalledWith('b1-9sieo7cv', 24));
    const choice = await screen.findByRole('group', { name: 'Time shown in the charts' });
    expect(within(choice).getByRole('button', { name: '24 hours' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(choice).getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(choice).getByRole('button', { name: '30 days' })).toBeInTheDocument();
  });

  it('loads a week or a month of readings when asked', async () => {
    open();
    const choice = await screen.findByRole('group', { name: 'Time shown in the charts' });
    fireEvent.click(within(choice).getByRole('button', { name: '7 days' }));
    await waitFor(() => expect(api.series).toHaveBeenCalledWith('b1-9sieo7cv', 168));
    expect(within(choice).getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(choice).getByRole('button', { name: '30 days' }));
    await waitFor(() => expect(api.series).toHaveBeenCalledWith('b1-9sieo7cv', 720));
  });

  it('says so when the chosen time has no readings', async () => {
    api.series.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No readings in this time.')).toBeInTheDocument();
  });
});

const deaths = [
  { id: 'm2', count: 30, note: 'Hot afternoon', recordedOn: '2026-05-20', createdAt: '2026-05-20T10:00:00Z' },
  { id: 'm1', count: 5, note: '', recordedOn: '2026-05-18', createdAt: '2026-05-18T10:00:00Z' },
];

describe('Breed, quantity and deaths', () => {
  it('shows the breed and the quantity in the details when they are set', async () => {
    api.getById.mockResolvedValue({ data: { data: batch({ breed: 'Bivoltine hybrid', quantity: 3, quantityUnit: 'BOXES' }) } });
    open();
    const facts = (await screen.findByText('Breed')).closest('dl') as HTMLElement;
    expect(within(facts).getByText('Bivoltine hybrid')).toBeInTheDocument();
    expect(within(facts).getByText('3 egg boxes')).toBeInTheDocument();
  });

  it('leaves out breed and quantity when they were never given', async () => {
    open();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Breed')).not.toBeInTheDocument();
    expect(screen.queryByText('Quantity')).not.toBeInTheDocument();
  });

  it('lists the deaths with their day, number and note, and the total', async () => {
    api.mortality.mockResolvedValue({ data: { data: deaths } });
    api.getById.mockResolvedValue({ data: { data: batch({ mortalityTotal: 35 }) } });
    open();
    const panel = (await screen.findByRole('heading', { name: 'Deaths recorded' })).closest('section') as HTMLElement;
    expect(await within(panel).findByText('Hot afternoon')).toBeInTheDocument();
    expect(within(panel).getByText('May 20, 2026')).toBeInTheDocument();
    expect(within(panel).getByText('Total: 35')).toBeInTheDocument();
  });

  it('puts the total next to the quantity when it is counted in worms', async () => {
    api.mortality.mockResolvedValue({ data: { data: deaths } });
    api.getById.mockResolvedValue({ data: { data: batch({ mortalityTotal: 35, quantity: 20000, quantityUnit: 'WORMS' }) } });
    open();
    expect(await screen.findByText('Total: 35 of 20,000 worms (0.2 %)')).toBeInTheDocument();
  });

  it('says so when nothing has been recorded', async () => {
    open();
    expect(await screen.findByText('No deaths recorded yet.')).toBeInTheDocument();
  });

  it('records deaths from a dialog and adds them to the list', async () => {
    api.addDeaths.mockResolvedValue({ data: { data: { id: 'm9', count: 12, note: 'Cold night', recordedOn: '2026-05-21', createdAt: '' } } });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Record deaths' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record deaths' });
    fireEvent.change(within(dialog).getByLabelText('How many died'), { target: { value: '12' } });
    fireEvent.change(within(dialog).getByLabelText(/^Note/), { target: { value: 'Cold night' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.addDeaths).toHaveBeenCalledWith('b1-9sieo7cv', expect.objectContaining({ count: 12, note: 'Cold night' })));
    expect(await screen.findByText('Cold night', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText('Deaths recorded.', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('offers today as the day and nothing later, nor before the batch started', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Record deaths' }));
    const day = within(await screen.findByRole('dialog', { name: 'Record deaths' })).getByLabelText('Day') as HTMLInputElement;
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    expect(day.value).toBe(iso);
    expect(day.max).toBe(iso);
    expect(day.min).toBe('2026-05-16');
  });

  it('asks for the number before it sends anything', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Record deaths' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record deaths' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Please enter how many worms died.');
    expect(api.addDeaths).not.toHaveBeenCalled();
  });

  it('shows the server answer inside the dialog when saving fails', async () => {
    api.addDeaths.mockRejectedValue(new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, { status: 422, data: { message: 'Please choose a day that is not in the future.' } } as never));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Record deaths' }));
    const dialog = await screen.findByRole('dialog', { name: 'Record deaths' });
    fireEvent.change(within(dialog).getByLabelText('How many died'), { target: { value: '3' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Please choose a day that is not in the future.');
  });

  it('asks before deleting an entry, then removes it', async () => {
    api.mortality.mockResolvedValue({ data: { data: deaths } });
    api.deleteDeaths.mockResolvedValue({ data: { data: null } });
    open();
    const entry = (await screen.findByText('Hot afternoon')).closest('li') as HTMLElement;
    fireEvent.click(within(entry).getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this entry?' });
    expect(api.deleteDeaths).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, delete' }));
    await waitFor(() => expect(api.deleteDeaths).toHaveBeenCalledWith('b1-9sieo7cv', 'm2'));
    await waitFor(() => expect(screen.queryByText('Hot afternoon')).not.toBeInTheDocument());
  });

  it('lets a supervisor read the log but not change it', async () => {
    auth.role = 'SUPERVISOR';
    api.mortality.mockResolvedValue({ data: { data: deaths } });
    open();
    expect(await screen.findByText('Hot afternoon')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record deaths' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit details' })).not.toBeInTheDocument();
  });

  it('edits breed, quantity and notes in a dialog', async () => {
    api.update.mockResolvedValue({ data: { data: batch({ breed: 'Local', quantity: 2, quantityUnit: 'BOXES', notes: 'Moved to shed 2' }) } });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit details' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit batch details' });
    fireEvent.change(within(dialog).getByLabelText(/^Breed/), { target: { value: 'Local' } });
    fireEvent.change(within(dialog).getByLabelText(/^Quantity/), { target: { value: '2' } });
    fireEvent.change(within(dialog).getByLabelText(/^Notes/), { target: { value: 'Moved to shed 2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('b1-9sieo7cv', { breed: 'Local', quantity: 2, quantityUnit: 'BOXES', notes: 'Moved to shed 2' }));
    expect(await screen.findByText('Moved to shed 2', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText('2 egg boxes')).toBeInTheDocument();
  });
});

describe('The room of a batch', () => {
  const inRoom = (over: object = {}) => batch({
    room: { id: 'r1', name: 'Rearing house 1' },
    roomStays: [{ roomId: 'r1', roomName: 'Rearing house 1', startedAt: '2026-05-16T00:00:00Z', endedAt: null }],
    ...over,
  });

  it('shows which room the batch is in', async () => {
    api.getById.mockResolvedValue({ data: { data: inRoom() } });
    open();
    const facts = (await screen.findByText('Room')).closest('dl') as HTMLElement;
    expect(within(facts).getByText('Rearing house 1')).toBeInTheDocument();
  });

  it('shows no room line for a batch that was never placed', async () => {
    api.getById.mockResolvedValue({ data: { data: batch({ room: null }) } });
    open();
    await screen.findByRole('heading', { level: 1 });
    expect(screen.queryByText('Room')).not.toBeInTheDocument();
  });

  it('moves the batch to another room of its farm and keeps going', async () => {
    api.getById.mockResolvedValue({ data: { data: inRoom() } });
    api.moveRoom.mockResolvedValue({ data: { data: inRoom({ room: { id: 'r2', name: 'Cocoon room' } }) } });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Move to another room' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move to another room' });
    const choice = within(dialog).getByLabelText('New room') as HTMLSelectElement;
    expect(within(choice).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a room', 'Cocoon room']);
    expect(within(dialog).getByRole('button', { name: 'Move' })).toBeDisabled();
    fireEvent.change(choice, { target: { value: 'r2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move' }));
    await waitFor(() => expect(api.moveRoom).toHaveBeenCalledWith('b1-9sieo7cv', 'r2'));
    expect(await screen.findByText('Cocoon room', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(await screen.findByText('Batch moved.', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('shows the answer in the dialog when the move is refused', async () => {
    api.getById.mockResolvedValue({ data: { data: inRoom() } });
    api.moveRoom.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status: 422, data: { message: "Please choose one of this farm's rooms." } } as never));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Move to another room' }));
    const dialog = await screen.findByRole('dialog', { name: 'Move to another room' });
    fireEvent.change(within(dialog).getByLabelText('New room'), { target: { value: 'r2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Move' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("Please choose one of this farm's rooms.");
  });

  it('offers no move when the farm has no other room', async () => {
    api.rooms.mockResolvedValue({ data: { data: [{ id: 'r1', name: 'Rearing house 1', notes: '', batchCount: 1, batches: [], createdAt: '' }] } });
    api.getById.mockResolvedValue({ data: { data: inRoom() } });
    open();
    await screen.findByText('Rearing house 1');
    expect(screen.queryByRole('button', { name: 'Move to another room' })).not.toBeInTheDocument();
  });

  it('keeps the move away from a supervisor', async () => {
    auth.role = 'SUPERVISOR';
    api.getById.mockResolvedValue({ data: { data: inRoom() } });
    open();
    await screen.findByText('Rearing house 1');
    expect(screen.queryByRole('button', { name: 'Move to another room' })).not.toBeInTheDocument();
  });

  it('lists where the batch has been once it has moved', async () => {
    api.getById.mockResolvedValue({
      data: {
        data: inRoom({
          room: { id: 'r2', name: 'Cocoon room' },
          roomStays: [
            { roomId: 'r2', roomName: 'Cocoon room', startedAt: '2026-05-20T00:00:00Z', endedAt: null },
            { roomId: 'r1', roomName: 'Rearing house 1', startedAt: '2026-05-16T00:00:00Z', endedAt: '2026-05-20T00:00:00Z' },
          ],
        }),
      },
    });
    open();
    const history = await screen.findByRole('list', { name: 'Where it has been' });
    const rows = within(history).getAllByRole('listitem').map((li) => li.textContent);
    expect(rows).toEqual(['Cocoon room: from May 20, 2026, now', 'Rearing house 1: from May 16, 2026 to May 20, 2026']);
  });

  it('does not list a history for a batch that has only been in one room', async () => {
    api.getById.mockResolvedValue({ data: { data: inRoom() } });
    open();
    await screen.findByText('Rearing house 1');
    expect(screen.queryByRole('list', { name: 'Where it has been' })).not.toBeInTheDocument();
  });
});
