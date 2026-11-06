import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import type { SupportPersonRow } from '../../types';

const support = vi.hoisted(() => ({ endOwn: vi.fn() }));
vi.mock('../../services/support.service', () => ({ supportService: support }));

import SupportActiveBanner from './SupportActiveBanner';

const active = (over: Partial<SupportPersonRow> = {}): SupportPersonRow => ({
  id: 'a1', status: 'active', reason: 'Please look at my batch list', minutes: 30, requestedMode: 'view', grantedMode: 'view',
  admin: { name: 'Ange Admin' }, requestedAt: '2026-11-06T09:40:00Z', expiresAt: '2026-11-06T09:45:00Z',
  startedAt: '2026-11-06T09:42:00Z', endsAt: '2026-11-06T10:12:00Z', endedBy: '', endedReason: '', ...over,
});

const open = (row: SupportPersonRow | null) => {
  const onEnded = vi.fn();
  render(<LanguageProvider><SupportActiveBanner active={row} onEnded={onEnded} /></LanguageProvider>);
  return onEnded;
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  support.endOwn.mockResolvedValue({ data: { data: {} } });
});

describe('The banner on the person\'s own screen', () => {
  it('says that SSMS support is looking, in a status region, with the mode', () => {
    open(active());
    expect(screen.getByRole('status')).toHaveTextContent('SSMS support is viewing your account (view only).');
  });

  it('says so when changes are allowed', () => {
    open(active({ grantedMode: 'edit' }));
    expect(screen.getByRole('status')).toHaveTextContent('SSMS support is viewing your account (can make changes).');
  });

  it('ends the visit at once and tells the page', async () => {
    const onEnded = open(active());
    fireEvent.click(screen.getByRole('button', { name: 'End now' }));
    await act(async () => { await Promise.resolve(); });
    expect(support.endOwn).toHaveBeenCalledWith('a1');
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('tells the page even when the server says it was over already', async () => {
    support.endOwn.mockRejectedValue(new Error('409'));
    const onEnded = open(active());
    fireEvent.click(screen.getByRole('button', { name: 'End now' }));
    await act(async () => { await Promise.resolve(); });
    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('shows nothing when no visit is running', () => {
    open(null);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
