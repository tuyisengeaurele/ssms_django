import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const auth = vi.hoisted(() => ({ role: 'FARMER' }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 'me', role: auth.role } }) }));

const farm = (i: number, over: object = {}) => ({
  id: `f${i}`, name: `Farm ${i}`, location: i === 1 ? 'Gatsibo, Rwanda' : 'Huye', ownerId: 'u1', isActive: true,
  createdAt: '', updatedAt: '', owner: { id: 'u1', name: 'Mugisha Serge', email: 's@x.rw' }, counts: { batches: i === 1 ? 1 : 3 }, ...over,
});

const getAll = vi.hoisted(() => vi.fn());
vi.mock('../../services/farm.service', () => ({ farmService: { getAll } }));

import FarmsPage from './FarmsPage';

function open() {
  return render(
    <MemoryRouter>
      <LanguageProvider>
        <ToastProvider>
          <FarmsPage />
        </ToastProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  auth.role = 'FARMER';
  setReducedMotion(true);
  getAll.mockResolvedValue({ data: { data: [farm(1), farm(2)] } });
});

describe('Farms page', () => {
  it('has one title and counts the farms', async () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Farms' })).toBeInTheDocument();
    expect(await screen.findByText('2 farms registered.')).toBeInTheDocument();
  });

  it('shows each farm as a link with its place, owner and batches', async () => {
    open();
    const card = (await screen.findByRole('link', { name: /Farm 1/ })) as HTMLElement;
    expect(card).toHaveAttribute('href', '/farms/f1');
    expect(within(card).getByText('Gatsibo, Rwanda')).toBeInTheDocument();
    expect(within(card).getByText('Mugisha Serge')).toBeInTheDocument();
    expect(within(card).getByText('1 batch')).toBeInTheDocument();
    expect(within(screen.getByRole('link', { name: /Farm 2/ })).getByText('3 batches')).toBeInTheDocument();
  });

  it('searches by name or place', async () => {
    open();
    await screen.findByText('Farm 1');
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search farms' }), { target: { value: 'huye' } });
    expect(screen.queryByText('Farm 1')).not.toBeInTheDocument();
    expect(screen.getByText('Farm 2')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search farms' }), { target: { value: 'zzz' } });
    expect(screen.getByText('No farms match')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByText('Farm 1')).toBeInTheDocument();
  });

  it('invites the first farm when there are none', async () => {
    getAll.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No farms yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create a farm' })).toHaveAttribute('href', '/farms/new');
  });

  it('lets farmers and admins add a farm but not supervisors', async () => {
    open();
    await screen.findByText('Farm 1');
    expect(screen.getByRole('link', { name: 'New farm' })).toHaveAttribute('href', '/farms/new');
    auth.role = 'SUPERVISOR';
    const { unmount } = open();
    unmount();
    open();
    await waitFor(() => expect(screen.queryAllByRole('link', { name: 'New farm' })).toHaveLength(1));
  });

  it('pages through the server list', async () => {
    getAll.mockResolvedValue({
      data: { data: [farm(1)], pagination: { page: 1, pageSize: 12, totalItems: 30, totalPages: 3, hasNext: true, hasPrev: false } },
    });
    open();
    await screen.findByText('Farm 1');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    await waitFor(() => expect(getAll).toHaveBeenLastCalledWith(2));
  });

  it('drops the icon tile, the Active badge and the gradients', async () => {
    const { container } = open();
    await screen.findByText('Farm 1');
    expect(screen.queryByText('Active')).not.toBeInTheDocument();
    expect(container.innerHTML.toLowerCase()).not.toMatch(/gradient|var\(--brand-50\)|brand-100/);
  });
});
