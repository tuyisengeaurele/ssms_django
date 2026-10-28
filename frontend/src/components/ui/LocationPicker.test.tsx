import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { AxiosError } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import LocationPicker, { EMPTY_PLACE, PlaceValue } from './LocationPicker';

const api = vi.hoisted(() => ({ getPlaces: vi.fn(), locate: vi.fn() }));
vi.mock('../../services/location.service', () => ({ locationService: api }));

const TREE: Record<string, { code: string; name: string }[]> = {
  '': [{ code: '5', name: 'Eastern Province' }, { code: '1', name: 'Kigali City' }],
  '1': [{ code: '101', name: 'Nyarugenge' }, { code: '102', name: 'Gasabo' }],
  '5': [{ code: '503', name: 'Gatsibo' }],
  '102': [{ code: '010211', name: 'Kimironko' }, { code: '010213', name: 'Remera' }],
  '010213': [{ code: '1021303', name: 'Rukiri I' }],
  '1021303': [{ code: '102130307', name: 'Urumuri' }],
};

let latest: PlaceValue = EMPTY_PLACE;

function Harness({ start = EMPTY_PLACE, legacyText }: { start?: PlaceValue; legacyText?: string }) {
  const [value, setValue] = useState(start);
  latest = value;
  return (
    <LanguageProvider>
      <LocationPicker value={value} onChange={setValue} legacyText={legacyText} />
    </LanguageProvider>
  );
}

const field = (name: RegExp | string) => screen.getByLabelText(name) as HTMLSelectElement;
const optionNames = (select: HTMLElement) => within(select).getAllByRole('option').map((o) => o.textContent);

function geolocation(impl: (ok: PositionCallback, fail: PositionErrorCallback) => void) {
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition: impl } });
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  latest = EMPTY_PLACE;
  api.getPlaces.mockImplementation((parent?: string) => Promise.resolve({ data: { data: TREE[parent ?? ''] ?? [] } }));
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'geolocation');
});

describe('Location picker', () => {
  it('asks for the five places in order, with the street last and optional', async () => {
    render(<Harness />);
    const labels = ['Province', 'District', 'Sector', 'Cell', 'Village'];
    for (const label of labels) expect(field(new RegExp(`^${label}`))).toBeRequired();
    expect(screen.getByLabelText(/^Street or landmark/)).not.toBeRequired();
    expect(await within(field(/^Province/)).findByRole('option', { name: 'Kigali City' })).toBeInTheDocument();
  });

  it('lists the provinces by name and keeps the lower lists shut until the one above is chosen', async () => {
    render(<Harness />);
    await within(field(/^Province/)).findByRole('option', { name: 'Kigali City' });
    expect(optionNames(field(/^Province/))).toEqual(['Choose a province', 'Eastern Province', 'Kigali City']);
    for (const label of ['District', 'Sector', 'Cell', 'Village']) expect(field(new RegExp(`^${label}`))).toBeDisabled();
  });

  it('loads the districts of the province that was chosen', async () => {
    render(<Harness />);
    await within(field(/^Province/)).findByRole('option', { name: 'Kigali City' });
    fireEvent.change(field(/^Province/), { target: { value: '1' } });
    await within(field(/^District/)).findByRole('option', { name: 'Gasabo' });
    expect(api.getPlaces).toHaveBeenCalledWith('1');
    expect(field(/^District/)).toBeEnabled();
    expect(latest.provinceCode).toBe('1');
  });

  it('walks all the way down and reports every code', async () => {
    render(<Harness />);
    await within(field(/^Province/)).findByRole('option', { name: 'Kigali City' });
    fireEvent.change(field(/^Province/), { target: { value: '1' } });
    await within(field(/^District/)).findByRole('option', { name: 'Gasabo' });
    fireEvent.change(field(/^District/), { target: { value: '102' } });
    await within(field(/^Sector/)).findByRole('option', { name: 'Remera' });
    fireEvent.change(field(/^Sector/), { target: { value: '010213' } });
    await within(field(/^Cell/)).findByRole('option', { name: 'Rukiri I' });
    fireEvent.change(field(/^Cell/), { target: { value: '1021303' } });
    await within(field(/^Village/)).findByRole('option', { name: 'Urumuri' });
    fireEvent.change(field(/^Village/), { target: { value: '102130307' } });
    fireEvent.change(screen.getByLabelText(/^Street or landmark/), { target: { value: 'KG 9 Ave' } });
    expect(latest).toEqual({ provinceCode: '1', districtCode: '102', sectorCode: '010213', cellCode: '1021303', villageCode: '102130307', street: 'KG 9 Ave' });
  });

  it('empties everything below when a place above is changed', async () => {
    render(<Harness start={{ provinceCode: '1', districtCode: '102', sectorCode: '010213', cellCode: '1021303', villageCode: '102130307', street: 'KG 9 Ave' }} />);
    await waitFor(() => expect(field(/^Village/)).toHaveValue('102130307'));
    fireEvent.change(field(/^District/), { target: { value: '101' } });
    expect(latest).toMatchObject({ provinceCode: '1', districtCode: '101', sectorCode: '', cellCode: '', villageCode: '' });
    expect(latest.street).toBe('KG 9 Ave');
  });

  it('shows a place that is already chosen, such as when a farm is edited', async () => {
    render(<Harness start={{ provinceCode: '1', districtCode: '102', sectorCode: '010213', cellCode: '1021303', villageCode: '102130307', street: '' }} />);
    await waitFor(() => expect(field(/^Village/)).toHaveValue('102130307'));
    expect(field(/^Province/)).toHaveValue('1');
    expect(field(/^District/)).toHaveValue('102');
    expect(field(/^Sector/)).toHaveValue('010213');
    expect(field(/^Cell/)).toHaveValue('1021303');
  });

  it('says so and lets the person try again when a list cannot be loaded', async () => {
    api.getPlaces.mockRejectedValueOnce(new AxiosError('offline'));
    render(<Harness />);
    expect(await screen.findByText('We could not load the list of places. Please try again.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await within(field(/^Province/)).findByRole('option', { name: 'Kigali City' })).toBeInTheDocument();
  });

  it('shows the old text of a farm that has no place yet and asks for a place to replace it', async () => {
    render(<Harness legacyText="Near the old market, Gatsibo" />);
    expect(await screen.findByText(/Near the old market, Gatsibo/)).toBeInTheDocument();
    expect(screen.getByText(/added before places could be chosen/)).toBeInTheDocument();
  });

  it('does not show the old text once a place is chosen', async () => {
    render(<Harness legacyText="Near the old market, Gatsibo" start={{ ...EMPTY_PLACE, provinceCode: '1' }} />);
    await within(field(/^Province/)).findByRole('option', { name: 'Kigali City' });
    expect(screen.queryByText(/Near the old market/)).not.toBeInTheDocument();
  });
});

describe('Use my location', () => {
  const found = { province: { code: '1', name: 'Kigali City' }, district: { code: '102', name: 'Gasabo' }, sector: { code: '010213', name: 'Remera' } };

  it('is not offered on a device that cannot share a location', async () => {
    render(<Harness />);
    await within(field(/^Province/)).findByRole('option', { name: 'Kigali City' });
    expect(screen.queryByRole('button', { name: 'Use my location' })).not.toBeInTheDocument();
  });

  it('fills province, district and sector and leaves cell and village to the person when that is all it knows', async () => {
    geolocation((ok) => ok({ coords: { latitude: -1.9536, longitude: 30.0925 } } as GeolocationPosition));
    api.locate.mockResolvedValue({ data: { data: found } });
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use my location' }));
    await waitFor(() => expect(api.locate).toHaveBeenCalledWith(-1.9536, 30.0925));
    await waitFor(() => expect(field(/^Sector/)).toHaveValue('010213'));
    expect(latest).toMatchObject({ provinceCode: '1', districtCode: '102', sectorCode: '010213', cellCode: '', villageCode: '' });
    expect(screen.getByRole('status')).toHaveTextContent('We found your province, district and sector. Please choose your cell and village.');
    expect(field(/^Cell/)).toBeEnabled();
  });

  const deep = {
    ...found,
    cell: { code: '1021303', name: 'Rukiri I' },
    village: { code: '102130307', name: 'Urumuri' },
  };

  it('fills the cell and the village too when the server knows them', async () => {
    geolocation((ok) => ok({ coords: { latitude: -1.9536, longitude: 30.0925 } } as GeolocationPosition));
    api.locate.mockResolvedValue({ data: { data: deep } });
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use my location' }));
    await waitFor(() => expect(field(/^Village/)).toHaveValue('102130307'));
    expect(field(/^Cell/)).toHaveValue('1021303');
    expect(latest).toMatchObject({ provinceCode: '1', districtCode: '102', sectorCode: '010213', cellCode: '1021303', villageCode: '102130307' });
    expect(screen.getByRole('status')).toHaveTextContent('We filled in your place down to the village. Please check it and add the street if you like.');
  });

  it('fills the cell and asks for the village when the server knows only the cell', async () => {
    geolocation((ok) => ok({ coords: { latitude: -1.9536, longitude: 30.0925 } } as GeolocationPosition));
    api.locate.mockResolvedValue({ data: { data: { ...found, cell: deep.cell } } });
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use my location' }));
    await waitFor(() => expect(field(/^Cell/)).toHaveValue('1021303'));
    expect(latest.cellCode).toBe('1021303');
    expect(latest.villageCode).toBe('');
    expect(screen.getByRole('status')).toHaveTextContent('We found your place down to the cell. Please choose your village.');
  });

  it('empties a cell and village chosen earlier when the new place has none', async () => {
    geolocation((ok) => ok({ coords: { latitude: -1.9536, longitude: 30.0925 } } as GeolocationPosition));
    api.locate.mockResolvedValue({ data: { data: found } });
    render(<Harness start={{ provinceCode: '1', districtCode: '102', sectorCode: '010211', cellCode: '1021101', villageCode: '102110101', street: '' }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use my location' }));
    await waitFor(() => expect(latest.sectorCode).toBe('010213'));
    expect(latest.cellCode).toBe('');
    expect(latest.villageCode).toBe('');
  });

  it('says what it fills in, and that the person should check it', async () => {
    geolocation((ok) => ok({ coords: { latitude: -1.9536, longitude: 30.0925 } } as GeolocationPosition));
    render(<Harness />);
    expect(await screen.findByText('Fills in the province, district, sector, cell and village where it can, and saves your exact position with the farm so your cooperative can see it on a map. Please check the place.')).toBeInTheDocument();
  });

  it('keeps the street when the village is filled in', async () => {
    geolocation((ok) => ok({ coords: { latitude: -1.9536, longitude: 30.0925 } } as GeolocationPosition));
    api.locate.mockResolvedValue({ data: { data: deep } });
    render(<Harness start={{ ...EMPTY_PLACE, street: 'Near the church' }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use my location' }));
    await waitFor(() => expect(latest.villageCode).toBe('102130307'));
    expect(latest.street).toBe('Near the church');
  });

  describe('the exact position', () => {
    const fixes = (latitude: number, longitude: number) => geolocation((ok) => ok({ coords: { latitude, longitude } } as GeolocationPosition));
    const pinned = { provinceCode: '1', districtCode: '102', sectorCode: '010213', cellCode: '1021303', villageCode: '102130307', street: 'Near the church', latitude: -1.9536, longitude: 30.0925 };

    it('keeps the spot the phone reported, rounded to about a metre', async () => {
      fixes(-1.953612345, 30.092587654);
      api.locate.mockResolvedValue({ data: { data: deep } });
      render(<Harness />);
      fireEvent.click(await screen.findByRole('button', { name: 'Use my location' }));
      await waitFor(() => expect(latest.villageCode).toBe('102130307'));
      expect(latest.latitude).toBe(-1.95361);
      expect(latest.longitude).toBe(30.09259);
    });

    it('keeps the spot even when the server can only say the sector', async () => {
      fixes(-1.9536, 30.0925);
      api.locate.mockResolvedValue({ data: { data: found } });
      render(<Harness />);
      fireEvent.click(await screen.findByRole('button', { name: 'Use my location' }));
      await waitFor(() => expect(latest.sectorCode).toBe('010213'));
      expect(latest).toMatchObject({ latitude: -1.9536, longitude: 30.0925 });
    });

    it('says that the position is saved with the farm and who sees it, with the numbers', () => {
      render(<Harness start={pinned} />);
      expect(screen.getByText('The exact position of the farm is saved with it, so your cooperative can see it on the map: -1.95360, 30.09250')).toBeInTheDocument();
    });

    it('says nothing about a position when there is none', () => {
      render(<Harness />);
      expect(screen.queryByText(/The exact position of the farm/)).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Remove the position' })).not.toBeInTheDocument();
    });

    it('removes the position and keeps the place', async () => {
      render(<Harness start={pinned} />);
      fireEvent.click(screen.getByRole('button', { name: 'Remove the position' }));
      expect(latest).toMatchObject({ latitude: null, longitude: null, villageCode: '102130307', street: 'Near the church' });
      expect(screen.queryByText(/The exact position of the farm/)).not.toBeInTheDocument();
    });

    it('lets go of the position when the person chooses another place, because it no longer matches', async () => {
      render(<Harness start={pinned} />);
      await within(field(/^Province/)).findByRole('option', { name: 'Eastern Province' });
      fireEvent.change(field(/^Province/), { target: { value: '5' } });
      expect(latest.provinceCode).toBe('5');
      expect(latest.latitude).toBeNull();
      expect(latest.longitude).toBeNull();
    });

    it('keeps the position when only the street changes', async () => {
      render(<Harness start={pinned} />);
      fireEvent.change(screen.getByLabelText(/^Street or landmark/), { target: { value: 'By the school' } });
      expect(latest).toMatchObject({ street: 'By the school', latitude: -1.9536, longitude: 30.0925 });
    });

    it('adds no position to a form that never had one when a place is chosen', async () => {
      render(<Harness />);
      await within(field(/^Province/)).findByRole('option', { name: 'Eastern Province' });
      fireEvent.change(field(/^Province/), { target: { value: '5' } });
      expect(latest.latitude).toBeUndefined();
    });

    it('saves no position when the spot is not in Rwanda', async () => {
      fixes(0.3476, 32.5825);
      api.locate.mockRejectedValue(new AxiosError('x', '404', undefined, undefined, { status: 404, data: { message: 'That spot is not inside a Rwanda sector.' } } as never));
      render(<Harness />);
      fireEvent.click(await screen.findByRole('button', { name: 'Use my location' }));
      expect(await screen.findByRole('status')).toHaveTextContent('That spot is not inside a Rwanda sector.');
      expect(latest.latitude).toBeUndefined();
    });

    it('reads in French', async () => {
      localStorage.setItem('ssms_locale', 'fr');
      render(<Harness start={pinned} />);
      expect(screen.getByText('La position exacte de la ferme est enregistrée avec elle, pour que votre coopérative la voie sur la carte : -1.95360, 30.09250')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retirer la position' })).toBeInTheDocument();
    });
  });

  it('replaces a place chosen earlier, but keeps the street', async () => {
    geolocation((ok) => ok({ coords: { latitude: -1.9536, longitude: 30.0925 } } as GeolocationPosition));
    api.locate.mockResolvedValue({ data: { data: found } });
    render(<Harness start={{ provinceCode: '5', districtCode: '503', sectorCode: '', cellCode: '', villageCode: '', street: 'Near the church' }} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use my location' }));
    await waitFor(() => expect(latest.districtCode).toBe('102'));
    expect(latest.street).toBe('Near the church');
  });

  it('says what happened when the person does not allow it', async () => {
    geolocation((_ok, fail) => fail({ code: 1, message: 'denied' } as GeolocationPositionError));
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use my location' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Your location was not shared. You can choose the place yourself.');
    expect(api.locate).not.toHaveBeenCalled();
  });

  it('says what happened when the device cannot tell where it is', async () => {
    geolocation((_ok, fail) => fail({ code: 2, message: 'unavailable' } as GeolocationPositionError));
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use my location' }));
    expect(await screen.findByRole('status')).toHaveTextContent('We could not find where you are. You can choose the place yourself.');
  });

  it('says so when the spot is not in Rwanda', async () => {
    geolocation((ok) => ok({ coords: { latitude: 0.3476, longitude: 32.5825 } } as GeolocationPosition));
    api.locate.mockRejectedValue(new AxiosError('x', '404', undefined, undefined, { status: 404, data: { message: 'That spot is not inside a Rwanda sector.' } } as never));
    render(<Harness />);
    fireEvent.click(await screen.findByRole('button', { name: 'Use my location' }));
    expect(await screen.findByRole('status')).toHaveTextContent('That spot is not inside a Rwanda sector. You can choose the place yourself.');
    expect(latest.provinceCode).toBe('');
  });

  it('shows that it is working and cannot be pressed twice', async () => {
    let finish: PositionCallback = () => undefined;
    geolocation((ok) => { finish = ok; });
    api.locate.mockResolvedValue({ data: { data: found } });
    render(<Harness />);
    const button = await screen.findByRole('button', { name: 'Use my location' });
    fireEvent.click(button);
    expect(await screen.findByRole('button', { name: /Finding where you are/ })).toBeDisabled();
    finish({ coords: { latitude: -1.9536, longitude: 30.0925 } } as GeolocationPosition);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Use my location' })).toBeEnabled());
  });
});
