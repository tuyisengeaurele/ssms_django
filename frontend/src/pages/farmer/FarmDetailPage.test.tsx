import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const auth = vi.hoisted(() => ({ role: 'FARMER' }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', role: auth.role } }) }));

const api = vi.hoisted(() => ({
  getById: vi.fn(), update: vi.fn(), remove: vi.fn(), batches: vi.fn(), devices: vi.fn(), deviceById: vi.fn(), deviceCreate: vi.fn(), deviceRemove: vi.fn(), allFarms: vi.fn(),
}));
vi.mock('../../services/farm.service', () => ({ farmService: { getById: api.getById, update: api.update, delete: api.remove, getAll: api.allFarms } }));
vi.mock('../../services/batch.service', () => ({ batchService: { getByFarm: api.batches } }));
vi.mock('../../services/device.service', () => ({
  deviceService: { getAll: api.devices, getById: api.deviceById, create: api.deviceCreate, remove: api.deviceRemove },
}));

import FarmDetailPage from './FarmDetailPage';

const farm = { id: 'f1', name: "Serge's farm", location: 'Gatsibo', ownerId: 'u1', isActive: true, createdAt: '2026-05-04T10:00:00Z', updatedAt: '', owner: { id: 'u1', name: 'Mugisha Serge', email: 's@x.rw' } };
const batch = (i: number, stage: string, checks: number) => ({
  id: `b${i}-abcdefg${i}`, farmId: 'f1', stage, startDate: '2026-05-01T00:00:00Z', expectedHarvestDate: '2026-06-01T00:00:00Z', isActive: true, createdAt: '', updatedAt: '', counts: { diseaseDetections: checks },
});
const device = (id: string, status: string, over: object = {}) => ({
  id, name: `Sensor ${id}`, deviceKey: `key-${id}`, farmId: 'f1', farmName: "Serge's farm", batchId: null, location: 'Room A', status,
  lastSeen: new Date(Date.now() - 600_000).toISOString(), isActive: true, createdAt: '', latestReading: { temperature: 24.1, humidity: 79.9, timestamp: '' }, recentReadings: [], ...over,
});

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

function open() {
  return render(
    <MemoryRouter initialEntries={['/farms/f1']}>
      <LanguageProvider>
        <ToastProvider>
          <Routes>
            <Route path="/farms/:id" element={<FarmDetailPage />} />
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
  api.getById.mockResolvedValue({ data: { data: farm } });
  api.batches.mockResolvedValue({ data: { data: [batch(1, 'LARVA', 4), batch(2, 'EGG', 0)] } });
  api.devices.mockResolvedValue({ data: { data: [device('d1', 'online'), device('d2', 'offline', { latestReading: null, lastSeen: null })] } });
  api.deviceById.mockResolvedValue({ data: { data: device('d1', 'online') } });
  api.allFarms.mockResolvedValue({ data: { data: [farm] } });
  document.title = 'Start';
});

describe('Farm details page', () => {
  it('names the farm, says where it is and sets the tab title', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 1, name: "Serge's farm" })).toBeInTheDocument();
    expect(screen.getByText('Gatsibo')).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe("Serge's farm | SSMS"));
  });

  it('shows the owner, batches, devices and creation date as facts', async () => {
    open();
    await screen.findByText('Mugisha Serge');
    const facts = document.querySelector('.facts') as HTMLElement;
    expect(within(facts).getByText('2')).toBeInTheDocument();
    expect(within(facts).getByText('1 online of 2')).toBeInTheDocument();
    expect(within(facts).getByText('May 4, 2026')).toBeInTheDocument();
    expect(within(facts).queryByText('Active')).not.toBeInTheDocument();
  });

  it('lists batches with a stage, counts and two ways in', async () => {
    open();
    const row = (await screen.findByText('#abcdefg1')).closest('tr') as HTMLElement;
    expect(within(row).getByText('Larva')).toBeInTheDocument();
    expect(within(row).getByText('4')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: /^Details/ })).toHaveAttribute('href', '/batches/b1-abcdefg1');
    expect(within(row).getByRole('link', { name: /^Check for disease/ })).toHaveAttribute('href', '/batches/b1-abcdefg1/detect');
  });

  it('lists devices with status, readings in plain ink, and when each was last seen', async () => {
    open();
    const first = (await screen.findByText('Sensor d1')).closest('li') as HTMLElement;
    expect(within(first).getByText('Online')).toBeInTheDocument();
    expect(within(first).getByText('24.1 °C')).toBeInTheDocument();
    expect(within(first).getByText('79.9 %')).toBeInTheDocument();
    expect(within(first).getByText(/10 minutes ago/)).toBeInTheDocument();
    const second = screen.getByText('Sensor d2').closest('li') as HTMLElement;
    expect(within(second).getByText('Offline')).toBeInTheDocument();
    expect(within(second).getByText('No readings yet')).toBeInTheDocument();
    expect(within(second).getByText(/Never/)).toBeInTheDocument();
  });

  it('opens a device in the same dialog the Devices page uses', async () => {
    open();
    fireEvent.click(within((await screen.findByText('Sensor d1')).closest('li') as HTMLElement).getByRole('button', { name: /^Details/ }));
    expect(await screen.findByRole('dialog', { name: 'Sensor d1' })).toBeInTheDocument();
  });

  it('lets a farmer edit the farm', async () => {
    api.update.mockResolvedValue({ data: { data: { ...farm, name: 'Serge Farm' } } });
    open();
    await screen.findByText('Mugisha Serge');
    fireEvent.click(screen.getByRole('button', { name: 'Edit farm' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit farm' });
    expect((within(dialog).getByLabelText(/^Farm name/) as HTMLInputElement).value).toBe("Serge's farm");
    fireEvent.change(within(dialog).getByLabelText(/^Farm name/), { target: { value: 'Serge Farm' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('f1', { name: 'Serge Farm', location: 'Gatsibo' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Serge Farm' })).toBeInTheDocument();
  });

  it('asks before deleting, then goes back to the list', async () => {
    api.remove.mockResolvedValue({ data: { data: null } });
    open();
    await screen.findByText('Mugisha Serge');
    fireEvent.click(screen.getByRole('button', { name: 'Delete farm' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this farm?' });
    expect(dialog).toHaveTextContent("Serge's farm and everything recorded for it will be deleted. This cannot be undone.");
    expect(api.remove).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, delete' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('f1'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/farms'));
  });

  it('keeps edit and delete away from a supervisor, who can still add devices', async () => {
    auth.role = 'SUPERVISOR';
    open();
    await screen.findByText('Mugisha Serge');
    expect(screen.queryByRole('button', { name: 'Edit farm' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete farm' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'New batch' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add device' })).toBeInTheDocument();
  });

  it('registers a device straight onto this farm', async () => {
    auth.role = 'ADMIN';
    api.deviceCreate.mockResolvedValue({ data: { data: device('d9', 'offline', { name: 'New sensor', latestReading: null, lastSeen: null }) } });
    open();
    await screen.findByText('Mugisha Serge');
    fireEvent.click(screen.getByRole('button', { name: 'Add device' }));
    const dialog = await screen.findByRole('dialog', { name: 'Register a device' });
    expect((within(dialog).getByLabelText(/^Farm/) as HTMLSelectElement).value).toBe('f1');
    fireEvent.change(within(dialog).getByLabelText(/^Device name/), { target: { value: 'New sensor' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Register device' }));
    await waitFor(() => expect(api.deviceCreate).toHaveBeenCalledWith(expect.objectContaining({ name: 'New sensor', farmId: 'f1' })));
    expect(await screen.findByText('New sensor')).toBeInTheDocument();
  });

  it('is kind when there are no batches or devices', async () => {
    api.batches.mockResolvedValue({ data: { data: [] } });
    api.devices.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No batches yet')).toBeInTheDocument();
    expect(screen.getByText('No devices yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Add a batch' })).toHaveAttribute('href', '/farms/f1/batches/new');
  });

  it('says so, without a stack of buttons, when the farm cannot be found', async () => {
    api.getById.mockRejectedValue(new Error('x'));
    open();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to farms/ })).toHaveAttribute('href', '/farms');
  });

  it('keeps the old blue and green readings, emoji and icon tiles out', async () => {
    const { container } = open();
    await screen.findByText('Sensor d1');
    expect(container.innerHTML.toLowerCase()).not.toMatch(/#2563eb|#16a34a|#eff6ff|#f0fdf4/);
    expect(container.textContent).not.toMatch(/\u{1F4CD}/u);
  });
});
