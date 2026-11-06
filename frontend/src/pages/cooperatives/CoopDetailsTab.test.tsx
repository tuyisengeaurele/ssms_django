import { configure, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { setReducedMotion } from '../../test/setup';

vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'me', name: 'Auris', role: 'ADMIN' }, isAuthenticated: true, isLoading: false }),
}));

const api = vi.hoisted(() => ({ getById: vi.fn(), update: vi.fn(), remove: vi.fn(), getAll: vi.fn(), getDeleted: vi.fn(), settings: vi.fn(), saveSettings: vi.fn() }));
vi.mock('../../services/supply.service', () => ({ supplyService: { getSettings: api.settings, updateSettings: api.saveSettings } }));
vi.mock('../../services/cooperative.service', () => ({
  cooperativeService: { getById: api.getById, update: api.update, delete: api.remove, getAll: api.getAll, getDeleted: api.getDeleted },
}));
vi.mock('../../services/coopReport.service', () => ({ coopReportService: { get: vi.fn(), download: vi.fn() } }));

import { detail, renderCoop } from './coopTestKit';

configure({ asyncUtilTimeout: 5000 });

const PATH = '/admin/cooperatives/c1/details';

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.getById.mockResolvedValue({ data: { data: detail() } });
  api.getAll.mockResolvedValue({ data: { data: [] } });
  api.getDeleted.mockResolvedValue({ data: { data: [] } });
  api.settings.mockResolvedValue({ data: { data: { starterBoxes: 2, m2PerBox: null } } });
});

const ready = () => screen.findByRole('heading', { level: 2, name: 'About this cooperative' });

describe('The details of a cooperative', () => {
  it('shows where it is, how many people and farms it has, when it was made, and what it is for', async () => {
    renderCoop(PATH);
    await ready();
    const term = (label: string) => screen.getByText(label, { selector: 'dt' });
    const facts = term('Location').closest('dl') as HTMLElement;
    expect(within(facts).getByText('Gatsibo District, Rwanda')).toBeInTheDocument();
    expect(term('Members').nextElementSibling).toHaveTextContent('1');
    expect(term('Farms').nextElementSibling).toHaveTextContent('1');
    expect(within(facts).getByText('May 8, 2026')).toBeInTheDocument();
    expect(screen.getByText('The first silk cooperative.')).toBeInTheDocument();
  });

  it('opens the edit form filled in, saves, and shows the new name as the title', async () => {
    api.update.mockResolvedValue({ data: { data: { ...detail(), name: 'Gatsibo Silk Group' } } });
    renderCoop(PATH);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit cooperative' });
    const name = within(dialog).getByLabelText(/^Name/) as HTMLInputElement;
    expect(name.value).toBe('Gatsibo Sericulture 1');
    fireEvent.change(name, { target: { value: 'Gatsibo Silk Group' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.update).toHaveBeenCalledWith('c1', expect.objectContaining({ name: 'Gatsibo Silk Group' })));
    expect(await screen.findByRole('heading', { level: 1, name: 'Gatsibo Silk Group' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('needs a name before it saves', async () => {
    renderCoop(PATH);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit cooperative' });
    fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: '  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save changes' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Please enter a name for the cooperative.');
    expect(api.update).not.toHaveBeenCalled();
  });

  it('asks before deleting, and goes back to the list once it is deleted', async () => {
    api.remove.mockResolvedValue({ data: { data: null } });
    renderCoop(PATH);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this cooperative?' });
    expect(api.remove).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Yes, delete' }));
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith('c1'));
    expect(await screen.findByRole('heading', { level: 1, name: 'Cooperatives' })).toBeInTheDocument();
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/cooperatives');
  });

  it('stays where it is when the deletion is cancelled', async () => {
    renderCoop(PATH);
    await ready();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete this cooperative?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(api.remove).not.toHaveBeenCalled();
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/cooperatives/c1/details');
  });

  it('does not use the words turn off anywhere', async () => {
    renderCoop(PATH);
    await ready();
    expect(screen.queryByText(/turn off|turned off/i)).not.toBeInTheDocument();
  });

  it('reads in French', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    renderCoop(PATH);
    expect(await screen.findByRole('heading', { level: 2, name: 'À propos de cette coopérative' })).toBeInTheDocument();
  });

  describe('the egg supply settings', () => {
    const settingsReady = () => screen.findByRole('heading', { level: 2, name: 'Egg supply settings' });
    const field = (name: string | RegExp) => screen.getByLabelText(name) as HTMLInputElement;
    const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

    it('asks for the settings of this cooperative and shows them', async () => {
      api.settings.mockResolvedValue({ data: { data: { starterBoxes: 3, m2PerBox: 4.5 } } });
      renderCoop(PATH);
      await settingsReady();
      expect(api.settings).toHaveBeenCalledWith('c1');
      expect(field('Default boxes for a new farmer')).toHaveValue(3);
      expect(field('Space one box needs (m²)')).toHaveValue(4.5);
    });

    it('leaves the space per box empty and says to ask a sericulture officer while it is not known', async () => {
      renderCoop(PATH);
      await settingsReady();
      expect(field('Space one box needs (m²)')).toHaveValue(null);
      expect(screen.getByText('Not known yet? Leave it empty and ask a sericulture officer.')).toBeInTheDocument();
    });

    it('saves both numbers for this cooperative', async () => {
      api.saveSettings.mockResolvedValue({ data: { data: { starterBoxes: 3, m2PerBox: 4 } } });
      renderCoop(PATH);
      await settingsReady();
      fireEvent.change(field('Default boxes for a new farmer'), { target: { value: '3' } });
      fireEvent.change(field('Space one box needs (m²)'), { target: { value: '4' } });
      save();
      await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ cooperativeId: 'c1', starterBoxes: 3, m2PerBox: 4 }));
      expect(await screen.findByText('Settings saved.', {}, { timeout: 5000 })).toBeInTheDocument();
    });

    it('saves an empty space per box as not known', async () => {
      api.settings.mockResolvedValue({ data: { data: { starterBoxes: 2, m2PerBox: 4 } } });
      api.saveSettings.mockResolvedValue({ data: { data: { starterBoxes: 2, m2PerBox: null } } });
      renderCoop(PATH);
      await settingsReady();
      fireEvent.change(field('Space one box needs (m²)'), { target: { value: '' } });
      save();
      await waitFor(() => expect(api.saveSettings).toHaveBeenCalledWith({ cooperativeId: 'c1', starterBoxes: 2, m2PerBox: null }));
    });

    it.each([['101'], ['-1'], ['2.5'], ['']])('refuses %s as the default boxes before sending', async (value) => {
      renderCoop(PATH);
      await settingsReady();
      fireEvent.change(field('Default boxes for a new farmer'), { target: { value } });
      save();
      expect(await screen.findByText('Please enter a whole number of boxes from 0 to 100.')).toBeInTheDocument();
      expect(api.saveSettings).not.toHaveBeenCalled();
    });

    it.each([['0'], ['-3'], ['1001'], ['2.555']])('refuses %s as the space per box before sending', async (value) => {
      renderCoop(PATH);
      await settingsReady();
      fireEvent.change(field('Space one box needs (m²)'), { target: { value } });
      save();
      expect(await screen.findByText('Please enter a number above 0 and up to 1000, with at most two decimals, or leave it empty.')).toBeInTheDocument();
      expect(api.saveSettings).not.toHaveBeenCalled();
    });

    it('shows the answer of the server when saving is refused', async () => {
      api.saveSettings.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status: 403, data: { message: "You don't have permission to do that." } } as never));
      renderCoop(PATH);
      await settingsReady();
      save();
      expect(await screen.findByText("You don't have permission to do that.")).toBeInTheDocument();
    });

    it('leaves the section out, and the rest of the page working, when the settings cannot be loaded', async () => {
      api.settings.mockRejectedValue(new Error('down'));
      renderCoop(PATH);
      await ready();
      await waitFor(() => expect(api.settings).toHaveBeenCalled());
      expect(screen.queryByRole('heading', { level: 2, name: 'Egg supply settings' })).not.toBeInTheDocument();
    });
  });
});
