import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../context/LanguageContext';

const api = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('../services/lot.service', () => ({ lotService: { getPublic: api.get } }));
// The page sits inside the site navigation, which is not what is tested here.
vi.mock('../landing/Nav', () => ({ Nav: () => <nav aria-label="Main" /> }));
vi.mock('../landing/Footer', () => ({ Footer: () => <footer /> }));

import PublicLotPage from './PublicLotPage';

const LOT = {
  farmName: 'Hillside Farm', province: 'Kigali City', district: 'Nyarugenge', cooperativeName: 'Gatsibo Silk Cooperative', breed: 'Bivoltine',
  grade: 'A', cocoonWeightKg: 18.5, silkYieldG: 2100, startedOn: '2026-08-21', harvestedOn: '2026-09-20', rearingDays: 30,
};

function open(token = 'tok123') {
  return render(
    <MemoryRouter initialEntries={[`/lot/${token}`]}>
      <LanguageProvider>
        <Routes>
          <Route path="/lot/:token" element={<PublicLotPage />} />
        </Routes>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

const row = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  document.head.querySelectorAll('meta[name="robots"]').forEach((m) => m.remove());
  api.get.mockResolvedValue({ data: { data: LOT } });
});

describe('the page behind a QR code', () => {
  it('asks for the lot by the token in the address', async () => {
    open('tok123');
    await screen.findByRole('heading', { level: 1, name: 'Hillside Farm' });
    expect(api.get).toHaveBeenCalledWith('tok123');
  });

  it('names the farm and says where it is', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Hillside Farm' })).toBeInTheDocument();
    expect(row('Place')).toBe('Nyarugenge, Kigali City');
    expect(row('Cooperative')).toBe('Gatsibo Silk Cooperative');
  });

  it('gives the weight, the grade, the breed and the dates', async () => {
    open();
    await screen.findByRole('heading', { level: 1 });
    expect(row('Cocoon weight')).toBe('18.5 kg');
    expect(row('Silk')).toBe('2,100 g');
    expect(row('Grade')).toBe('Grade A');
    expect(row('Breed')).toBe('Bivoltine');
    expect(row('Started')).toMatch(/Aug 21, 2026/);
    expect(row('Harvested')).toMatch(/Sep 20, 2026/);
    expect(row('Rearing time')).toBe('30 days');
  });

  it('leaves out a fact that was not given, rather than showing an empty line', async () => {
    api.get.mockResolvedValue({ data: { data: { ...LOT, cooperativeName: null, breed: null, silkYieldG: null, district: null, province: null } } });
    open();
    await screen.findByRole('heading', { level: 1 });
    for (const label of ['Cooperative', 'Breed', 'Silk', 'Place']) expect(screen.queryByText(label, { selector: 'dt' })).not.toBeInTheDocument();
    expect(row('Cocoon weight')).toBe('18.5 kg');
  });

  it('shows only the district when the province is not known', async () => {
    api.get.mockResolvedValue({ data: { data: { ...LOT, province: null } } });
    open();
    await screen.findByRole('heading', { level: 1 });
    expect(row('Place')).toBe('Nyarugenge');
  });

  it('says the numbers are the farmer\'s own, entered in SSMS', async () => {
    open();
    expect(await screen.findByText(/recorded by the farmer in SSMS/)).toBeInTheDocument();
  });

  it('says 1 day and not 1 days', async () => {
    api.get.mockResolvedValue({ data: { data: { ...LOT, rearingDays: 1 } } });
    open();
    await screen.findByRole('heading', { level: 1 });
    expect(row('Rearing time')).toBe('1 day');
  });

  it('is not for search engines', async () => {
    open();
    await screen.findByRole('heading', { level: 1 });
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  });

  it('puts the farm in the browser tab title', async () => {
    open();
    await screen.findByRole('heading', { level: 1 });
    expect(document.title).toBe('Lot from Hillside Farm | SSMS');
  });

  it('takes the search tag off again when the page closes', async () => {
    const { unmount } = open();
    await screen.findByRole('heading', { level: 1 });
    unmount();
    expect(document.head.querySelector('meta[name="robots"][content="noindex, nofollow"]')).toBeNull();
  });

  it('shows no personal detail even if the server sent one by mistake', async () => {
    api.get.mockResolvedValue({ data: { data: { ...LOT, ownerName: 'Aline Uwase', ownerEmail: 'a@x.rw', street: 'KG 11 Ave', notes: 'Private' } } });
    open();
    await screen.findByRole('heading', { level: 1 });
    for (const text of ['Aline', 'a@x.rw', 'KG 11', 'Private']) expect(screen.queryByText(new RegExp(text))).not.toBeInTheDocument();
  });
});

describe('a link that does not work', () => {
  it('says the link is no longer valid when the server cannot find the lot', async () => {
    api.get.mockRejectedValue(Object.assign(new Error('nope'), { response: { status: 404 } }));
    open();
    expect(await screen.findByRole('heading', { name: 'This link is no longer valid.' })).toBeInTheDocument();
    expect(screen.getByText(/The farmer may have switched it off, or the lot was removed/)).toBeInTheDocument();
  });

  it('does not say the link is dead when the server had a problem', async () => {
    api.get.mockRejectedValue(Object.assign(new Error('boom'), { response: { status: 500 } }));
    open();
    expect(await screen.findByText(/Something went wrong on our side/)).toBeInTheDocument();
    expect(screen.queryByText('This link is no longer valid.')).not.toBeInTheDocument();
  });

  it('shows a short wait first', () => {
    api.get.mockReturnValue(new Promise(() => {}));
    open();
    expect(screen.getByText('One moment')).toBeInTheDocument();
  });

  it('is not for search engines either', async () => {
    api.get.mockRejectedValue(Object.assign(new Error('nope'), { response: { status: 404 } }));
    open();
    await screen.findByRole('heading', { name: 'This link is no longer valid.' });
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  });
});

describe('in French and Kinyarwanda', () => {
  it('reads in French', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    open();
    await screen.findByRole('heading', { level: 1, name: 'Hillside Farm' });
    expect(row('Poids des cocons')).toBe('18,5 kg');
    expect(within(document.body).getByText('Grade A', { selector: 'dd' })).toBeInTheDocument();
  });

  it('reads in Kinyarwanda', async () => {
    localStorage.setItem('ssms_locale', 'rw');
    open();
    await screen.findByRole('heading', { level: 1, name: 'Hillside Farm' });
    await waitFor(() => expect(document.querySelector('dt')?.textContent).not.toBe('Place'));
  });
});
