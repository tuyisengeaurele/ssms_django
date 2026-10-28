import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', role: 'FARMER', name: 'Serge Mugisha' } }) }));

const api = vi.hoisted(() => ({
  batch: vi.fn(), mortality: vi.fn(), detections: vi.fn(), harvest: vi.fn(), series: vi.fn(), thresholds: vi.fn(), download: vi.fn(),
}));
vi.mock('../../services/batch.service', () => ({ batchService: { getById: api.batch, getMortality: api.mortality, downloadReport: api.download } }));
vi.mock('../../services/detection.service', () => ({ detectionService: { getByBatch: api.detections } }));
vi.mock('../../services/harvest.service', () => ({ harvestService: { getByBatch: api.harvest } }));
vi.mock('../../services/sensor.service', () => ({ sensorService: { getBatchSeries: api.series } }));
vi.mock('../../services/alert.service', () => ({ alertService: { getThresholds: api.thresholds } }));

import BatchReportPage from './BatchReportPage';

const batch = (over: object = {}) => ({
  id: 'b1-9sieo7cv', farmId: 'f1', stage: 'LARVA', startDate: '2026-05-16T00:00:00Z', expectedHarvestDate: '2026-06-06T00:00:00Z',
  isActive: true, createdAt: '', updatedAt: '', notes: 'Healthy eggs from the cooperative.', breed: 'Bivoltine hybrid',
  quantity: 2, quantityUnit: 'BOXES', room: { id: 'r2', name: 'Room 2' },
  roomStays: [
    { roomId: 'r2', roomName: 'Room 2', startedAt: '2026-05-20T00:00:00Z', endedAt: null },
    { roomId: 'r1', roomName: 'Room 1', startedAt: '2026-05-16T00:00:00Z', endedAt: '2026-05-20T00:00:00Z' },
  ],
  farm: { id: 'f1', name: "Serge's farm", location: 'Rwamagana, Eastern Province' },
  alertLogs: [
    { id: 'a1', batchId: 'b1', type: 'TEMPERATURE', message: 'x', isRead: false, createdAt: '2026-10-01T00:00:00Z' },
    { id: 'a2', batchId: 'b1', type: 'HUMIDITY', message: 'y', isRead: false, createdAt: '2026-10-02T00:00:00Z' },
  ],
  ...over,
});
const point = (temperature: number, humidity: number) => ({ timestamp: '2026-10-01T09:00:00Z', temperature, humidity, count: 1 });
const series = [point(20, 70), point(24, 80), point(30, 80), point(26, 75)];
const ranges = [{ stage: 'LARVA', tempMin: 22, tempMax: 28, humMin: 70, humMax: 85 }];
const death = (id: string, count: number, day: string, note = '') => ({ id, count, note, recordedOn: day, createdAt: '' });
const check = (id: string, result: string, confidence: number, day: string) => ({ id, batchId: 'b1', imageUrl: '', result, confidence, detectedAt: `${day}T08:00:00Z` });
const harvest = (id: string, kg: string, silk: string | null, grade: string) => ({
  id, batchId: 'b1', cocoonWeightKg: kg, silkYieldG: silk, qualityGrade: grade, notes: null, harvestedAt: '2026-10-01T09:00:00Z', createdAt: '',
});

function open() {
  return render(
    <MemoryRouter initialEntries={['/batches/b1-9sieo7cv/report']}>
      <LanguageProvider>
        <ToastProvider>
          <Routes>
            <Route path="/batches/:id/report" element={<BatchReportPage />} />
          </Routes>
        </ToastProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

const section = (name: string) => screen.getByRole('heading', { level: 2, name }).closest('section') as HTMLElement;

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.batch.mockResolvedValue({ data: { data: batch() } });
  api.mortality.mockResolvedValue({ data: { data: [death('m1', 30, '2026-05-25', 'Hot afternoon'), death('m2', 12, '2026-05-22')] } });
  api.detections.mockResolvedValue({ data: { data: [check('d1', 'Healthy', 0.97, '2026-09-30'), check('d2', 'Flacherie', 0.8, '2026-09-29')] } });
  api.harvest.mockResolvedValue({ data: { data: [] } });
  api.series.mockResolvedValue({ data: { data: series } });
  api.thresholds.mockResolvedValue({ data: { data: ranges } });
  api.download.mockResolvedValue(undefined);
});

describe('Batch report', () => {
  it('has one title and names the batch and the farm', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Batch report' })).toBeInTheDocument();
    expect(await screen.findByText("Batch #9SIEO7CV on Serge's farm")).toBeInTheDocument();
  });

  it('asks for the last 30 days of readings', async () => {
    open();
    await screen.findByText("Batch #9SIEO7CV on Serge's farm");
    expect(api.series).toHaveBeenCalledWith('b1-9sieo7cv', 720);
  });

  it('says who prepared it and when', async () => {
    open();
    expect(await screen.findByText(/Prepared on .+ for Serge Mugisha\./)).toBeInTheDocument();
  });

  describe('the batch', () => {
    it('lists the facts a person files a report for', async () => {
      open();
      await screen.findByText("Batch #9SIEO7CV on Serge's farm");
      const facts = within(section('The batch'));
      expect(facts.getByText('Larva')).toBeInTheDocument();
      expect(facts.getByText("Serge's farm")).toBeInTheDocument();
      expect(facts.getByText('Rwamagana, Eastern Province')).toBeInTheDocument();
      expect(facts.getByText('Bivoltine hybrid')).toBeInTheDocument();
      expect(facts.getByText('2 egg boxes')).toBeInTheDocument();
      expect(facts.getByText('Healthy eggs from the cooperative.')).toBeInTheDocument();
      expect(facts.getByText('Started').nextElementSibling).toHaveTextContent(/May 16, 2026|16 May 2026/);
    });

    it('shows every room the batch has been in, oldest first', async () => {
      open();
      await screen.findByText("Batch #9SIEO7CV on Serge's farm");
      const rooms = within(screen.getByRole('list', { name: 'Rooms' })).getAllByRole('listitem').map((li) => li.textContent);
      expect(rooms[0]).toMatch(/^Room 1/);
      expect(rooms[1]).toMatch(/^Room 2/);
      expect(rooms[1]).toMatch(/from/i);
    });

    it('leaves out what was never given', async () => {
      api.batch.mockResolvedValue({ data: { data: batch({ breed: '', quantity: null, notes: undefined, room: null, roomStays: [] }) } });
      open();
      await screen.findByText("Batch #9SIEO7CV on Serge's farm");
      const facts = within(section('The batch'));
      expect(facts.queryByText('Breed')).not.toBeInTheDocument();
      expect(facts.queryByText('Started with')).not.toBeInTheDocument();
      expect(facts.queryByText('Notes')).not.toBeInTheDocument();
      expect(facts.queryByRole('list', { name: 'Rooms' })).not.toBeInTheDocument();
    });
  });

  describe('conditions', () => {
    it('gives the lowest, average and highest, and the share of hours inside the range', async () => {
      open();
      await screen.findByText("Batch #9SIEO7CV on Serge's farm");
      const s = within(section('Conditions in the last 30 days'));
      expect(await s.findByText(/Temperature: lowest 20 °C, average 25 °C, highest 30 °C/)).toBeInTheDocument();
      expect(s.getByText(/Humidity: lowest 70 %, average 76.3 %, highest 80 %/)).toBeInTheDocument();
      expect(s.getByText(/50 % of the 24 hours were inside the usual range for the Larva stage \(22 to 28 °C, 70 to 85 %\)/)).toBeInTheDocument();
    });

    it('says so when there are no readings', async () => {
      api.series.mockResolvedValue({ data: { data: [] } });
      open();
      await screen.findByText("Batch #9SIEO7CV on Serge's farm");
      expect(within(section('Conditions in the last 30 days')).getByText('No readings in the last 30 days.')).toBeInTheDocument();
    });
  });

  describe('deaths', () => {
    it('adds up the deaths and lists the days', async () => {
      open();
      await screen.findByText("Batch #9SIEO7CV on Serge's farm");
      const s = within(section('Deaths'));
      expect(s.getByText('Total: 42')).toBeInTheDocument();
      expect(s.getByText('Hot afternoon')).toBeInTheDocument();
      expect(s.getAllByRole('row')).toHaveLength(3);
    });

    it('gives the share when the batch was counted in worms', async () => {
      api.batch.mockResolvedValue({ data: { data: batch({ quantity: 1000, quantityUnit: 'WORMS' }) } });
      open();
      expect(await screen.findByText('Total: 42 of 1,000 worms (4.2 %)')).toBeInTheDocument();
    });

    it('keeps to eight rows so the report stays on one page', async () => {
      api.mortality.mockResolvedValue({ data: { data: Array.from({ length: 11 }, (_, i) => death(`m${i}`, 1, `2026-05-${String(10 + i).padStart(2, '0')}`)) } });
      open();
      await screen.findByText("Batch #9SIEO7CV on Serge's farm");
      const s = within(section('Deaths'));
      expect(s.getAllByRole('row')).toHaveLength(9);
      expect(s.getByText('and 3 more entries')).toBeInTheDocument();
      expect(s.getByText('Total: 11')).toBeInTheDocument();
    });

    it('says so when none were recorded', async () => {
      api.mortality.mockResolvedValue({ data: { data: [] } });
      open();
      await screen.findByText("Batch #9SIEO7CV on Serge's farm");
      expect(within(section('Deaths')).getByText('No deaths recorded.')).toBeInTheDocument();
    });
  });

  describe('disease checks', () => {
    it('counts the checks and how many found a disease', async () => {
      open();
      await screen.findByText("Batch #9SIEO7CV on Serge's farm");
      const s = within(section('Disease checks'));
      expect(s.getByText('2 checks, 1 found a disease.')).toBeInTheDocument();
      expect(s.getByText('Flacherie')).toBeInTheDocument();
      expect(s.getByText('80 %')).toBeInTheDocument();
    });

    it('says so when there are none', async () => {
      api.detections.mockResolvedValue({ data: { data: [] } });
      open();
      await screen.findByText("Batch #9SIEO7CV on Serge's farm");
      expect(within(section('Disease checks')).getByText('No disease checks yet.')).toBeInTheDocument();
    });
  });

  describe('alerts', () => {
    it('counts the alerts nobody has seen yet', async () => {
      open();
      await screen.findByText("Batch #9SIEO7CV on Serge's farm");
      expect(within(section('Alerts')).getByText('2 alerts not yet seen.')).toBeInTheDocument();
    });

    it('says so when there are none', async () => {
      api.batch.mockResolvedValue({ data: { data: batch({ alertLogs: [] }) } });
      open();
      await screen.findByText("Batch #9SIEO7CV on Serge's farm");
      expect(within(section('Alerts')).getByText('No alerts waiting.')).toBeInTheDocument();
    });
  });

  describe('harvest', () => {
    it('adds up the harvest and counts each grade', async () => {
      api.harvest.mockResolvedValue({ data: { data: [harvest('h1', '12.50', '800.00', 'A'), harvest('h2', '8.00', null, 'B'), harvest('h3', '4.50', '200.00', 'A')] } });
      open();
      await screen.findByText("Batch #9SIEO7CV on Serge's farm");
      const s = within(section('Harvest'));
      expect(s.getByText('3 records, 25 kg of cocoons, 1000 g of silk.')).toBeInTheDocument();
      expect(s.getByText('Grade A: 2, Grade B: 1, Grade C: 0')).toBeInTheDocument();
    });

    it('says so when nothing was harvested', async () => {
      open();
      await screen.findByText("Batch #9SIEO7CV on Serge's farm");
      expect(within(section('Harvest')).getByText('No harvest recorded.')).toBeInTheDocument();
    });
  });

  describe('downloading the PDF', () => {
    it('asks the server for the PDF in the language of the screen', async () => {
      open();
      await screen.findByText("Batch #9SIEO7CV on Serge's farm");
      fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
      await waitFor(() => expect(api.download).toHaveBeenCalledWith('b1-9sieo7cv', 'en'));
    });

    it('asks in French when the screen is French', async () => {
      localStorage.setItem('ssms_locale', 'fr');
      open();
      await screen.findByText("Lot #9SIEO7CV à Serge's farm");
      fireEvent.click(screen.getByRole('button', { name: 'Télécharger le PDF' }));
      await waitFor(() => expect(api.download).toHaveBeenCalledWith('b1-9sieo7cv', 'fr'));
    });

    it('is not itself printed', async () => {
      open();
      await screen.findByText("Batch #9SIEO7CV on Serge's farm");
      expect(screen.getByRole('button', { name: 'Download PDF' }).closest('.no-print')).not.toBeNull();
    });

    it('holds the button while the file is being made', async () => {
      let finish: () => void = () => {};
      api.download.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
      open();
      await screen.findByText("Batch #9SIEO7CV on Serge's farm");
      fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
      expect(await screen.findByRole('button', { name: 'Preparing' })).toBeDisabled();
      finish();
      expect(await screen.findByRole('button', { name: 'Download PDF' })).toBeEnabled();
    });

    it('tells the person kindly when the PDF cannot be made', async () => {
      api.download.mockRejectedValue(new Error('x'));
      open();
      await screen.findByText("Batch #9SIEO7CV on Serge's farm");
      fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
      expect(await screen.findByText("We couldn't create the PDF. Please try again.", {}, { timeout: 5000 })).toBeInTheDocument();
    });
  });

  describe('printing', () => {
    it('prints from a button that is not itself printed', async () => {
      const print = vi.spyOn(window, 'print').mockImplementation(() => {});
      open();
      await screen.findByText("Batch #9SIEO7CV on Serge's farm");
      const button = screen.getByRole('button', { name: 'Print or save as PDF' });
      expect(button.closest('.no-print')).not.toBeNull();
      fireEvent.click(button);
      expect(print).toHaveBeenCalledTimes(1);
    });

    it('links back to the batch, also outside the print', async () => {
      open();
      await screen.findByText("Batch #9SIEO7CV on Serge's farm");
      const link = screen.getByRole('link', { name: /Back to the batch/ });
      expect(link).toHaveAttribute('href', '/batches/b1-9sieo7cv');
      expect(link.closest('.no-print')).not.toBeNull();
    });
  });

  it('shows an error and no report when the batch cannot be loaded', async () => {
    api.batch.mockRejectedValue(new Error('x'));
    open();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("We couldn't load this report. Please try again.");
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });

  it.each(['mortality', 'detections', 'harvest', 'series'])('shows an error, not a report with a gap, when %s cannot be loaded', async (which) => {
    api[which as 'mortality'].mockRejectedValue(new Error('x'));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load this report. Please try again.");
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(screen.queryByText('No readings in the last 30 days.')).not.toBeInTheDocument();
  });

  it('uses the usual range when the ranges cannot be loaded', async () => {
    api.thresholds.mockRejectedValue(new Error('x'));
    open();
    await screen.findByText("Batch #9SIEO7CV on Serge's farm");
    expect(within(section('Conditions in the last 30 days')).getByText(/\(22 to 28 °C, 70 to 85 %\)/)).toBeInTheDocument();
  });
});
