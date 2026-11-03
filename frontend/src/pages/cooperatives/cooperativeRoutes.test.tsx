import { configure, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setReducedMotion } from '../../test/setup';

const auth = vi.hoisted(() => ({ role: 'ADMIN' }));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'me', name: 'Someone', role: auth.role, cooperativeId: 'c1', cooperativeName: 'Gatsibo Silk' },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

const api = vi.hoisted(() => ({
  report: vi.fn(), download: vi.fn(), getById: vi.fn(), getAll: vi.fn(), getDeleted: vi.fn(),
  farmers: vi.fn(), invitations: vi.fn(), users: vi.fn(),
}));
vi.mock('../../services/coopReport.service', () => ({ coopReportService: { get: api.report, download: api.download } }));
vi.mock('../../services/cooperative.service', () => ({
  cooperativeService: { getById: api.getById, getAll: api.getAll, getDeleted: api.getDeleted },
}));
vi.mock('../../services/admin.service', () => ({ adminService: { getUsers: api.users, updateCooperative: vi.fn() } }));
vi.mock('../../services/team.service', () => ({
  teamService: { getFarmers: api.farmers, getInvitations: api.invitations },
}));

import { detail, renderCoop, report } from './coopTestKit';

// Each page is loaded from disk the first time it opens, which is slow when the whole suite runs at once.
configure({ asyncUtilTimeout: 5000 });

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 28, 12, 0, 0));
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  auth.role = 'ADMIN';
  api.report.mockResolvedValue({ data: { data: report() } });
  api.getById.mockResolvedValue({ data: { data: detail() } });
  api.getAll.mockResolvedValue({ data: { data: [] } });
  api.getDeleted.mockResolvedValue({ data: { data: [] } });
  api.farmers.mockResolvedValue({ data: { data: [] } });
  api.invitations.mockResolvedValue({ data: { data: [] } });
  api.users.mockResolvedValue({ data: { data: [] } });
});

afterEach(() => {
  vi.useRealTimers();
});

const sections = () => within(screen.getByRole('navigation', { name: 'Cooperative sections' })).getAllByRole('link');
const names = () => sections().map((a) => a.textContent);
const ready = () => screen.findByRole('navigation', { name: 'Cooperative sections' });

describe('A cooperative, for an admin', () => {
  it('has the cooperative as its title, with the place under it and a way back to the list', async () => {
    renderCoop('/admin/cooperatives/c1');
    expect(await screen.findByRole('heading', { level: 1, name: 'Gatsibo Sericulture 1' })).toBeInTheDocument();
    expect(screen.getByText('Gatsibo District, Rwanda')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cooperatives' })).toHaveAttribute('href', '/admin/cooperatives');
    expect(api.getById).toHaveBeenCalledWith('c1');
  });

  it('has the sections Report, Farms, Members and Details, and the first is open', async () => {
    renderCoop('/admin/cooperatives/c1');
    await ready();
    expect(names()).toEqual(['Report', 'Farms', 'Members', 'Details']);
    expect(sections().map((a) => a.getAttribute('href'))).toEqual([
      '/admin/cooperatives/c1', '/admin/cooperatives/c1/farms', '/admin/cooperatives/c1/members', '/admin/cooperatives/c1/details',
    ]);
    expect(sections()[0]).toHaveAttribute('aria-current', 'page');
    expect(sections()[1]).not.toHaveAttribute('aria-current');
  });

  it('moves between the sections and marks the open one', async () => {
    renderCoop('/admin/cooperatives/c1');
    await ready();
    fireEvent.click(sections()[2]);
    expect(await screen.findByRole('heading', { level: 2, name: 'Members (1)' })).toBeInTheDocument();
    expect(sections()[2]).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/cooperatives/c1/members');
  });

  it.each(['', '/farms', '/members', '/details'])('has exactly one title on %s', async (tab) => {
    renderCoop(`/admin/cooperatives/c1${tab}`);
    await ready();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('asks for the report of that one cooperative, and only while a section needs it', async () => {
    renderCoop('/admin/cooperatives/c1');
    await ready();
    await screen.findByText('3 records, 24.5 kg of cocoons, 900 g of silk.');
    expect(api.report).toHaveBeenCalledWith({ from: '2026-09-29', to: '2026-10-28', cooperative: 'c1' });
    expect(api.report).toHaveBeenCalledTimes(1);
    // Report and Farms share the same numbers, so moving between them does not ask again.
    fireEvent.click(sections()[1]);
    await screen.findByRole('heading', { level: 2, name: 'Farms, riskiest first' });
    expect(api.report).toHaveBeenCalledTimes(1);
  });

  it('does not ask for the report on the Members or Details sections', async () => {
    renderCoop('/admin/cooperatives/c1/members');
    await ready();
    await screen.findByRole('heading', { level: 2, name: 'Members (1)' });
    expect(api.report).not.toHaveBeenCalled();
  });

  it('says so, with a way back, when the cooperative does not exist', async () => {
    api.getById.mockRejectedValue(new Error('404'));
    renderCoop('/admin/cooperatives/nope');
    expect(await screen.findByText("We couldn't find that cooperative.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cooperatives' })).toHaveAttribute('href', '/admin/cooperatives');
    expect(screen.queryByRole('navigation', { name: 'Cooperative sections' })).not.toBeInTheDocument();
  });

  it('reads in French', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    renderCoop('/admin/cooperatives/c1');
    await screen.findByRole('navigation', { name: 'Sections de la coopérative' });
    expect(within(screen.getByRole('navigation', { name: 'Sections de la coopérative' })).getAllByRole('link').map((a) => a.textContent))
      .toEqual(['Rapport', 'Fermes', 'Membres', 'Détails']);
  });
});

describe('All the cooperatives, for an admin', () => {
  it('is titled All cooperatives and has only Report and Farms', async () => {
    renderCoop('/admin/cooperatives/all');
    expect(await screen.findByRole('heading', { level: 1, name: 'All cooperatives' })).toBeInTheDocument();
    await ready();
    expect(names()).toEqual(['Report', 'Farms']);
    expect(api.getById).not.toHaveBeenCalled();
  });

  it('asks for the report of every cooperative, with no cooperative named', async () => {
    renderCoop('/admin/cooperatives/all');
    await screen.findByText('3 records, 24.5 kg of cocoons, 900 g of silk.');
    expect(api.report).toHaveBeenCalledWith({ from: '2026-09-29', to: '2026-10-28' });
  });
});

describe('My cooperative, for a supervisor', () => {
  beforeEach(() => {
    auth.role = 'SUPERVISOR';
  });

  it('is titled My cooperative and names the cooperative under it once it is known', async () => {
    renderCoop('/supervisor/cooperative');
    expect(await screen.findByRole('heading', { level: 1, name: 'My cooperative' })).toBeInTheDocument();
    expect(await screen.findByText('Gatsibo Silk')).toBeInTheDocument();
    expect(api.getById).not.toHaveBeenCalled();
  });

  it('has the sections Report, Farms and Farmers, and no way to edit the cooperative', async () => {
    renderCoop('/supervisor/cooperative');
    await ready();
    expect(names()).toEqual(['Report', 'Farms', 'Farmers']);
    expect(screen.queryByRole('link', { name: 'Details' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Members' })).not.toBeInTheDocument();
  });

  it('shows the farmers and the invitations in the Farmers section, under the one title', async () => {
    renderCoop('/supervisor/cooperative/farmers');
    await ready();
    expect(await screen.findByRole('button', { name: 'Invite a farmer' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(api.report).not.toHaveBeenCalled();
  });

  it('asks for the report with no cooperative named, because it is always their own', async () => {
    renderCoop('/supervisor/cooperative');
    await screen.findByText('3 records, 24.5 kg of cocoons, 900 g of silk.');
    expect(api.report).toHaveBeenCalledWith({ from: '2026-09-29', to: '2026-10-28' });
  });

  it('reads in Kinyarwanda', async () => {
    localStorage.setItem('ssms_locale', 'rw');
    renderCoop('/supervisor/cooperative');
    expect(await screen.findByRole('heading', { level: 1, name: 'Koperative yanjye' })).toBeInTheDocument();
  });
});

describe('Who may open what', () => {
  it.each([
    ['FARMER', '/admin/cooperatives/c1'],
    ['FARMER', '/admin/cooperatives/all'],
    ['FARMER', '/supervisor/cooperative'],
    ['SUPERVISOR', '/admin/cooperatives'],
    ['SUPERVISOR', '/admin/cooperatives/c1'],
    ['SUPERVISOR', '/admin/cooperatives/all'],
    ['ADMIN', '/supervisor/cooperative'],
  ])('sends a %s away from %s', async (role, path) => {
    auth.role = role;
    renderCoop(path);
    expect(await screen.findByText('Not allowed here')).toBeInTheDocument();
  });
});

describe('The old addresses', () => {
  it('sends an admin from the old cooperative report to All cooperatives', async () => {
    renderCoop('/reports/cooperative');
    expect(await screen.findByRole('heading', { level: 1, name: 'All cooperatives' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/cooperatives/all');
  });

  it('sends a supervisor from the old cooperative report to My cooperative', async () => {
    auth.role = 'SUPERVISOR';
    renderCoop('/reports/cooperative');
    expect(await screen.findByRole('heading', { level: 1, name: 'My cooperative' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/supervisor/cooperative');
  });

  it('sends a farmer from the old cooperative report away', async () => {
    auth.role = 'FARMER';
    renderCoop('/reports/cooperative');
    expect(await screen.findByText('Not allowed here')).toBeInTheDocument();
  });

  it('sends a supervisor from My farmers to the Farmers section', async () => {
    auth.role = 'SUPERVISOR';
    renderCoop('/supervisor/farmers');
    expect(await screen.findByRole('button', { name: 'Invite a farmer' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/supervisor/cooperative/farmers');
  });
});
