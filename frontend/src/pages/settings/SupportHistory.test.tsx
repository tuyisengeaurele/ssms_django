import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import type { SupportPersonRow } from '../../types';

const support = vi.hoisted(() => ({ history: vi.fn() }));
vi.mock('../../services/support.service', () => ({ supportService: support }));

import SupportHistory from './SupportHistory';

const row = (over: Partial<SupportPersonRow>): SupportPersonRow => ({
  id: 'r', status: 'ended', reason: 'Please look at my batch list', minutes: 30, requestedMode: 'view', grantedMode: 'view',
  admin: { name: 'Ange Admin' }, requestedAt: '2026-11-06T10:02:00Z', expiresAt: '2026-11-06T10:07:00Z',
  startedAt: '2026-11-06T10:03:00Z', endsAt: '2026-11-06T10:33:00Z', endedBy: 'person', endedReason: '', ...over,
});

const open = () => render(<LanguageProvider><SupportHistory /></LanguageProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('SSMS support visits', () => {
  it('lists each request with who asked, what became of it and the reason', async () => {
    support.history.mockResolvedValue({ data: { data: [
      row({ id: '1', status: 'ended', grantedMode: 'edit' }),
      row({ id: '2', status: 'rejected', grantedMode: '', reason: 'Another reason to look' }),
      row({ id: '3', status: 'expired', grantedMode: '', admin: { name: 'Bosco Admin' } }),
    ] } });
    open();
    const items = await screen.findAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText(/Ange Admin/)).toBeInTheDocument();
    expect(within(items[0]).getByText(/Looked at your account, can make changes\./)).toBeInTheDocument();
    expect(within(items[1]).getByText(/You said no\./)).toBeInTheDocument();
    expect(within(items[1]).getByText(/Reason: Another reason to look/)).toBeInTheDocument();
    expect(within(items[2]).getByText(/Bosco Admin/)).toBeInTheDocument();
    expect(within(items[2]).getByText(/You did not answer in time\./)).toBeInTheDocument();
  });

  it('says a visit that is running now', async () => {
    support.history.mockResolvedValue({ data: { data: [row({ status: 'active', endedBy: '' })] } });
    open();
    expect(await screen.findByText(/Looking at your account now, view only\./)).toBeInTheDocument();
  });

  it('shows the reason as plain text', async () => {
    support.history.mockResolvedValue({ data: { data: [row({ reason: '<i>look</i>' })] } });
    const { container } = open();
    expect(await screen.findByText(/Reason: <i>look<\/i>/)).toBeInTheDocument();
    expect(container.querySelector('i')).toBeNull();
  });

  it('says so when nobody has asked', async () => {
    support.history.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByText('No one from SSMS support has asked to view your account.')).toBeInTheDocument();
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument();
  });

  it('shows the heading', async () => {
    support.history.mockResolvedValue({ data: { data: [] } });
    open();
    expect(await screen.findByRole('heading', { name: 'SSMS support visits' })).toBeInTheDocument();
  });

  it('tells the person when the list cannot be read', async () => {
    support.history.mockRejectedValue(new Error('offline'));
    open();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
