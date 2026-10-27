import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const auth = vi.hoisted(() => ({ role: 'ADMIN' }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', role: auth.role } }) }));

const dev = (o: object) => ({
  batchId: null, room: null, isActive: true, createdAt: '2026-05-01T00:00:00Z', recentReadings: [], ...o,
});
const devices = vi.hoisted(() => [
  { id: 'd1', name: 'DHT22-Bruce', deviceKey: 'ssms-dev-9sh8zdw', farmId: 'f1', farmName: "Bruce's Farm", room: { id: 'r1', name: 'Rearing house 1' }, location: 'Rearing room A', status: 'online', lastSeen: new Date(Date.now() - 5 * 60_000).toISOString(), latestReading: { temperature: 22.6, humidity: 81.3, timestamp: '2026-10-08T10:00:00Z' } },
  { id: 'd2', name: 'SHT31-Gad', deviceKey: 'ssms-dev-ddl1fcq', farmId: 'f2', farmName: "Gad's farm", location: '', status: 'offline', lastSeen: null, latestReading: null },
  { id: 'd3', name: 'AM2301-Serge', deviceKey: 'ssms-dev-28dnpcn', farmId: 'f3', farmName: "Serge's farm", location: 'Gatsibo', status: 'error', lastSeen: new Date(Date.now() - 3 * 3600_000).toISOString(), latestReading: null },
]);

const api = vi.hoisted(() => ({ getAll: vi.fn(), getById: vi.fn(), create: vi.fn(), remove: vi.fn(), moveToRoom: vi.fn(), farms: vi.fn(), rooms: vi.fn() }));
vi.mock('../../services/device.service', () => ({ deviceService: { getAll: api.getAll, getById: api.getById, create: api.create, remove: api.remove, moveToRoom: api.moveToRoom } }));
vi.mock('../../services/room.service', () => ({ roomService: { getByFarm: api.rooms } }));
vi.mock('../../services/farm.service', () => ({ farmService: { getAll: api.farms } }));

import DevicesPage from './DevicesPage';

function open() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <ToastProvider>
          <DevicesPage />
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
  auth.role = 'ADMIN';
  setReducedMotion(true);
  api.getAll.mockResolvedValue({ data: { data: devices.map(dev) } });
  api.getById.mockResolvedValue({ data: { data: dev({ ...devices[0], recentReadings: [{ temperature: 22, humidity: 80, timestamp: '2026-10-08T09:00:00Z' }, { temperature: 23, humidity: 82, timestamp: '2026-10-08T10:00:00Z' }] }) } });
  api.farms.mockResolvedValue({ data: { data: [{ id: 'f1', name: "Bruce's Farm", location: 'Gatsibo' }, { id: 'f2', name: "Gad's farm", location: 'Nyagatare' }, { id: 'f3', name: "Serge's farm", location: 'Gatsibo' }, { id: 'f9', name: 'New Farm', location: 'Huye' }] } });
  api.remove.mockResolvedValue({ data: { data: { id: 'd1' } } });
  api.rooms.mockImplementation((farmId: string) => Promise.resolve({ data: { data: ROOMS[farmId] ?? [] } }));
});

// Rooms by farm: f1 and f9 have two, f2 has one and the rest have none.
const room = (id: string, name: string) => ({ id, name, notes: '', batchCount: 0, batches: [], devices: [], latestReading: null, createdAt: '2026-05-01T00:00:00Z' });
const ROOMS: Record<string, ReturnType<typeof room>[]> = {
  f1: [room('r1', 'Rearing house 1'), room('r2', 'Rearing house 2')],
  f2: [room('r5', 'Only room')],
  f9: [room('r8', 'Shed A'), room('r9', 'Shed B')],
};

// The details dialog repeats the name in its title, so only the table cell counts.
const rowOf = async (name: string) => (await screen.findAllByText(name)).find((n) => n.closest('tr'))!.closest('tr') as HTMLElement;

describe('Devices page', () => {
  it('has one title and counts the devices', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Devices' })).toBeInTheDocument();
    expect(await screen.findByText('3 devices registered.')).toBeInTheDocument();
  });

  it('filters with tabs that show their counts', async () => {
    open();
    await screen.findByText('DHT22-Bruce');
    expect(screen.getByRole('tab', { name: 'All (3)' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Offline (1)' }));
    expect(screen.queryByText('DHT22-Bruce')).not.toBeInTheDocument();
    expect(screen.getByText('SHT31-Gad')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'Needs attention (1)' }));
    expect(screen.getByText('AM2301-Serge')).toBeInTheDocument();
  });

  it('shows status in words, readings in plain ink and the time since last seen', async () => {
    open();
    const row = await rowOf('DHT22-Bruce');
    expect(within(row).getByText('Online')).toBeInTheDocument();
    expect(within(row).getByText('22.6 °C')).toBeInTheDocument();
    expect(within(row).getByText('81.3 %')).toBeInTheDocument();
    expect(within(row).getByText('5 minutes ago')).toBeInTheDocument();
    const quiet = await rowOf('SHT31-Gad');
    expect(within(quiet).getByText('Offline')).toBeInTheDocument();
    expect(within(quiet).getByText('Never')).toBeInTheDocument();
  });

  it('searches names, farms, places and keys', async () => {
    open();
    await screen.findByText('DHT22-Bruce');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search devices' }), { target: { value: 'ddl1' } });
    expect(screen.queryByText('DHT22-Bruce')).not.toBeInTheDocument();
    expect(screen.getByText('SHT31-Gad')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search devices' }), { target: { value: 'zzz' } });
    expect(screen.getByText('No devices match')).toBeInTheDocument();
  });

  it('opens the details with the latest reading and a table of recent ones', async () => {
    open();
    fireEvent.click(within(await rowOf('DHT22-Bruce')).getByRole('button', { name: /^Details/ }));
    const dialog = await screen.findByRole('dialog', { name: 'DHT22-Bruce' });
    expect(within(dialog).getByText('ssms-dev-9sh8zdw')).toBeInTheDocument();
    expect(within(dialog).getByText('22.6 °C')).toBeInTheDocument();
    await waitFor(() => expect(api.getById).toHaveBeenCalledWith('d1'));
    expect(await within(dialog).findByRole('img', { name: 'Recent readings' })).toBeInTheDocument();
  });

  it('asks before removing a device, then removes it', async () => {
    open();
    fireEvent.click(within(await rowOf('DHT22-Bruce')).getByRole('button', { name: /^Details/ }));
    const dialog = await screen.findByRole('dialog', { name: 'DHT22-Bruce' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remove device' }));
    expect(api.remove).not.toHaveBeenCalled();
    expect(within(dialog).getByText(/Historical readings are kept/)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, remove it' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('d1'));
    await waitFor(() => expect(screen.queryByText('DHT22-Bruce')).not.toBeInTheDocument());
  });

  it('registers a device and adds it to the list', async () => {
    api.create.mockResolvedValue({ data: { data: dev({ id: 'd9', name: 'New sensor', deviceKey: 'ssms-new', farmId: 'f9', farmName: 'New Farm', location: 'Room 1', status: 'offline', lastSeen: null, latestReading: null }) } });
    open();
    await screen.findByText('DHT22-Bruce');
    fireEvent.click(screen.getByRole('button', { name: 'Add device' }));
    const dialog = await screen.findByRole('dialog', { name: 'Register a device' });
    await within(dialog).findByRole('option', { name: /New Farm/ });
    fireEvent.change(within(dialog).getByLabelText(/^Device name/), { target: { value: 'New sensor' } });
    fireEvent.change(within(dialog).getByLabelText(/^Farm/), { target: { value: 'f9' } });
    fireEvent.change(await within(dialog).findByLabelText(/^Room/), { target: { value: 'r9' } });
    fireEvent.change(within(dialog).getByLabelText('Place in the farm'), { target: { value: 'Room 1' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Register device' }));
    await waitFor(() => expect(api.create).toHaveBeenCalledWith({ name: 'New sensor', farmId: 'f9', roomId: 'r9', location: 'Room 1', deviceKey: undefined }));
    expect(await screen.findByText('New sensor')).toBeInTheDocument();
  });

  describe('choosing the room of a new device', () => {
    const openAdd = async () => {
      api.create.mockResolvedValue({ data: { data: dev({ id: 'd9', name: 'New sensor', deviceKey: 'ssms-new', farmId: 'f9', farmName: 'New Farm', status: 'offline', lastSeen: null, latestReading: null }) } });
      open();
      await screen.findByText('DHT22-Bruce');
      fireEvent.click(screen.getByRole('button', { name: 'Add device' }));
      return screen.findByRole('dialog', { name: 'Register a device' });
    };

    it('asks for the room once a farm with several rooms is chosen', async () => {
      const dialog = await openAdd();
      expect(within(dialog).queryByLabelText(/^Room/)).not.toBeInTheDocument();
      fireEvent.change(within(dialog).getByLabelText(/^Farm/), { target: { value: 'f9' } });
      const select = await within(dialog).findByLabelText(/^Room/);
      expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a room', 'Shed A', 'Shed B']);
      expect(select).toBeRequired();
    });

    it('lists the rooms of the farm that was picked and not of the one picked before', async () => {
      const dialog = await openAdd();
      fireEvent.change(within(dialog).getByLabelText(/^Farm/), { target: { value: 'f9' } });
      await within(dialog).findByRole('option', { name: 'Shed A' });
      fireEvent.change(within(dialog).getByLabelText(/^Farm/), { target: { value: 'f1' } });
      await within(dialog).findByRole('option', { name: 'Rearing house 2' });
      expect(within(dialog).queryByRole('option', { name: 'Shed A' })).not.toBeInTheDocument();
      expect((within(dialog).getByLabelText(/^Room/) as HTMLSelectElement).value).toBe('');
    });

    it('puts the device in the only room of a farm without asking', async () => {
      const dialog = await openAdd();
      fireEvent.change(within(dialog).getByLabelText(/^Device name/), { target: { value: 'New sensor' } });
      fireEvent.change(within(dialog).getByLabelText(/^Farm/), { target: { value: 'f2' } });
      await waitFor(() => expect(within(dialog).getByLabelText(/^Room/)).toHaveValue('r5'));
      fireEvent.click(within(dialog).getByRole('button', { name: 'Register device' }));
      await waitFor(() => expect(api.create).toHaveBeenCalledWith(expect.objectContaining({ farmId: 'f2', roomId: 'r5' })));
    });

    it('says what to do when the farm has no room yet, and still registers the device', async () => {
      const dialog = await openAdd();
      fireEvent.change(within(dialog).getByLabelText(/^Device name/), { target: { value: 'New sensor' } });
      fireEvent.change(within(dialog).getByLabelText(/^Farm/), { target: { value: 'f3' } });
      expect(await within(dialog).findByText(/no rooms yet/)).toBeInTheDocument();
      expect(within(dialog).queryByLabelText(/^Room/)).not.toBeInTheDocument();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Register device' }));
      await waitFor(() => expect(api.create).toHaveBeenCalled());
      expect(api.create.mock.calls[0][0].roomId).toBeUndefined();
    });

    it('registers without a room when the rooms could not be loaded', async () => {
      api.rooms.mockRejectedValue(new Error('offline'));
      const dialog = await openAdd();
      fireEvent.change(within(dialog).getByLabelText(/^Device name/), { target: { value: 'New sensor' } });
      fireEvent.change(within(dialog).getByLabelText(/^Farm/), { target: { value: 'f9' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Register device' }));
      await waitFor(() => expect(api.create).toHaveBeenCalled());
    });
  });

  it('shows the room of each device, and finds a device by its room', async () => {
    open();
    expect(within(await rowOf('DHT22-Bruce')).getByText('Rearing house 1')).toBeInTheDocument();
    expect(within(await rowOf('SHT31-Gad')).getByText('Not in a room')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search devices' }), { target: { value: 'house 1' } });
    expect(screen.getByText('DHT22-Bruce')).toBeInTheDocument();
    expect(screen.queryByText('SHT31-Gad')).not.toBeInTheDocument();
  });

  describe('moving a device to another room', () => {
    const openDetails = async (name = 'DHT22-Bruce') => {
      fireEvent.click(within(await rowOf(name)).getByRole('button', { name: /^Details/ }));
      return screen.findByRole('dialog', { name });
    };

    it('shows the room in the details', async () => {
      open();
      const dialog = await openDetails();
      expect(within(dialog).getByText('Rearing house 1')).toBeInTheDocument();
    });

    it('lets a manager pick another room of the farm and moves the device', async () => {
      api.moveToRoom.mockResolvedValue({ data: { data: dev({ ...devices[0], room: { id: 'r2', name: 'Rearing house 2' } }) } });
      open();
      const dialog = await openDetails();
      const select = await within(dialog).findByLabelText('Move to another room');
      expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a room', 'Rearing house 2']);
      fireEvent.change(select, { target: { value: 'r2' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Move device' }));
      await waitFor(() => expect(api.moveToRoom).toHaveBeenCalledWith('d1', 'r2'));
      await waitFor(() => expect(within(dialog).getByText('Rearing house 2', { selector: 'dd' })).toBeInTheDocument());
      expect(within(await rowOf('DHT22-Bruce')).getByText('Rearing house 2')).toBeInTheDocument();
    });

    it('offers every room of the farm to a device that has none yet', async () => {
      open();
      const dialog = await openDetails('SHT31-Gad');
      const select = await within(dialog).findByLabelText('Move to another room');
      expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a room', 'Only room']);
    });

    it('keeps the move button off until a room is chosen', async () => {
      open();
      const dialog = await openDetails();
      await within(dialog).findByLabelText('Move to another room');
      expect(within(dialog).getByRole('button', { name: 'Move device' })).toBeDisabled();
    });

    it('does not offer a farmer the move', async () => {
      auth.role = 'FARMER';
      open();
      const dialog = await openDetails();
      expect(within(dialog).queryByLabelText('Move to another room')).not.toBeInTheDocument();
      expect(api.rooms).not.toHaveBeenCalled();
    });

    it('keeps the old room when the move fails', async () => {
      api.moveToRoom.mockRejectedValue(new Error('nope'));
      open();
      const dialog = await openDetails();
      fireEvent.change(await within(dialog).findByLabelText('Move to another room'), { target: { value: 'r2' } });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Move device' }));
      await waitFor(() => expect(api.moveToRoom).toHaveBeenCalled());
      expect(within(dialog).getByText('Rearing house 1', { selector: 'dd' })).toBeInTheDocument();
    });
  });

  it('does not offer add or remove to a farmer', async () => {
    auth.role = 'FARMER';
    open();
    await screen.findByText('DHT22-Bruce');
    expect(screen.queryByRole('button', { name: 'Add device' })).not.toBeInTheDocument();
    fireEvent.click(within(await rowOf('DHT22-Bruce')).getByRole('button', { name: /^Details/ }));
    const dialog = await screen.findByRole('dialog', { name: 'DHT22-Bruce' });
    expect(within(dialog).queryByRole('button', { name: 'Remove device' })).not.toBeInTheDocument();
  });

  it('is kind when there are no devices', async () => {
    api.getAll.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No devices yet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Register a device' })).toBeInTheDocument();
  });

  it('keeps the old blue and green readings and outlined tiles out', async () => {
    const { container } = open();
    await screen.findByText('DHT22-Bruce');
    expect(container.innerHTML.toLowerCase()).not.toMatch(/#2563eb|#16a34a|#dc2626|#f0fdf4|#eff6ff|stat-card/);
  });
});
