import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ getRisk: vi.fn() }));
vi.mock('../../services/farm.service', () => ({ farmService: api }));

import FarmRiskPanel from './FarmRiskPanel';

const row = (id: string, name: string, level: 'HIGH' | 'MEDIUM' | 'OK', over: object = {}) => ({
  id, name, ownerName: `Owner of ${name}`, location: 'Gatsibo', level, score: 0,
  diseaseAlerts: 0, openAirAlerts: 0, offlineDevices: 0, activeBatches: 1, ...over,
});

const rows = [
  row('f1', 'Hill Farm', 'HIGH', { diseaseAlerts: 2, openAirAlerts: 1, offlineDevices: 1, score: 15 }),
  row('f2', 'River Farm', 'MEDIUM', { offlineDevices: 1, score: 2 }),
  row('f3', 'Quiet Farm', 'OK'),
  row('f4', 'Calm Farm', 'OK'),
];

function open() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <FarmRiskPanel />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

const list = () => screen.getByRole('list', { name: 'Farms that need a look first' });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.getRisk.mockResolvedValue({ data: { data: rows } });
});

describe('Farm risk panel', () => {
  it('names the farms that need a look, most worrying first, and leaves the quiet ones out', async () => {
    open();
    expect(await screen.findByText('Hill Farm')).toBeInTheDocument();
    const names = within(list()).getAllByRole('link').map((a) => a.textContent);
    expect(names).toEqual(['Hill Farm', 'River Farm']);
    expect(screen.queryByText('Quiet Farm')).not.toBeInTheDocument();
  });

  it('says why, in words, with the right plural', async () => {
    open();
    const hill = (await screen.findByText('Hill Farm')).closest('li') as HTMLElement;
    expect(within(hill).getByText('2 disease alerts in the last 14 days')).toBeInTheDocument();
    expect(within(hill).getByText('1 open temperature or humidity problem')).toBeInTheDocument();
    expect(within(hill).getByText('1 sensor offline')).toBeInTheDocument();
    const river = screen.getByText('River Farm').closest('li') as HTMLElement;
    expect(within(river).queryByText(/disease/)).not.toBeInTheDocument();
  });

  it('says the level in words, not only in colour', async () => {
    open();
    const hill = (await screen.findByText('Hill Farm')).closest('li') as HTMLElement;
    expect(within(hill).getByText('High')).toBeInTheDocument();
    expect(within(screen.getByText('River Farm').closest('li') as HTMLElement).getByText('Medium')).toBeInTheDocument();
  });

  it('names the owner and links to the farm', async () => {
    open();
    const hill = (await screen.findByText('Hill Farm')).closest('li') as HTMLElement;
    expect(within(hill).getByText('Owner of Hill Farm')).toBeInTheDocument();
    expect(within(hill).getByRole('link', { name: 'Hill Farm' })).toHaveAttribute('href', '/farms/f1');
  });

  it('explains the rule in one sentence', async () => {
    open();
    await screen.findByText('Hill Farm');
    expect(screen.getByText(/High means a disease alert in the last 14 days or an open temperature or humidity problem\. Medium means a sensor is offline\./)).toBeInTheDocument();
  });

  it('shows every farm on request, and fewer again', async () => {
    open();
    await screen.findByText('Hill Farm');
    fireEvent.click(screen.getByRole('button', { name: 'Show all 4 farms' }));
    expect(screen.getByText('Quiet Farm')).toBeInTheDocument();
    expect(within(screen.getByText('Quiet Farm').closest('li') as HTMLElement).getByText('OK')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show fewer' }));
    expect(screen.queryByText('Quiet Farm')).not.toBeInTheDocument();
  });

  it('shows only five at first when more need a look', async () => {
    const many = Array.from({ length: 8 }, (_, i) => row(`m${i}`, `Farm ${i}`, 'MEDIUM', { offlineDevices: 1 }));
    api.getRisk.mockResolvedValue({ data: { data: many } });
    open();
    await screen.findByText('Farm 0');
    expect(list().children).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Show all 8 farms' }));
    expect(list().children).toHaveLength(8);
  });

  it('says so, calmly, when no farm needs a look', async () => {
    api.getRisk.mockResolvedValue({ data: { data: [row('f3', 'Quiet Farm', 'OK'), row('f4', 'Calm Farm', 'OK')] } });
    open();
    expect(await screen.findByText('No farm needs a look right now.')).toBeInTheDocument();
    expect(screen.queryByText('Quiet Farm')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show all 2 farms' })).toBeInTheDocument();
  });

  it('words the button for a single farm in the singular', async () => {
    api.getRisk.mockResolvedValue({ data: { data: [row('f3', 'Quiet Farm', 'OK')] } });
    open();
    expect(await screen.findByRole('button', { name: 'Show the farm' })).toBeInTheDocument();
  });

  it('says so when there are no farms at all', async () => {
    api.getRisk.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No farms yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show all/ })).not.toBeInTheDocument();
  });

  it('shows an error and a way to try again', async () => {
    api.getRisk.mockRejectedValueOnce(new Error('x'));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't load the farm ranking. Please try again.");
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Hill Farm')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('reads in French', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    open();
    expect(await screen.findByText('Hill Farm')).toBeInTheDocument();
    expect(screen.getByText('Élevé')).toBeInTheDocument();
    expect(screen.getByText('2 alertes de maladie ces 14 derniers jours')).toBeInTheDocument();
  });

  it('reads in Kinyarwanda', async () => {
    localStorage.setItem('ssms_locale', 'rw');
    open();
    expect(await screen.findByText('Hill Farm')).toBeInTheDocument();
    expect(screen.getByText('Hejuru')).toBeInTheDocument();
  });
});
