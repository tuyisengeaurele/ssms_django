import { act, fireEvent, render, screen } from '@testing-library/react';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import type { SupportPersonRow } from '../../types';

const support = vi.hoisted(() => ({ respond: vi.fn() }));
vi.mock('../../services/support.service', () => ({ supportService: support }));

import SupportRequestModal from './SupportRequestModal';

const NOW = new Date('2026-11-06T10:00:00Z');
const request = (over: Partial<SupportPersonRow> = {}): SupportPersonRow => ({
  id: 'r1', status: 'requested', reason: 'Please look at my batch list', minutes: 30, requestedMode: 'view', grantedMode: '',
  admin: { name: 'Ange Admin' }, requestedAt: '2026-11-06T10:00:00Z', expiresAt: '2026-11-06T10:05:00Z',
  startedAt: null, endsAt: null, endedBy: '', endedReason: '', ...over,
});

function open(row: SupportPersonRow | null = request()) {
  const onAnswered = vi.fn();
  const view = render(
    <LanguageProvider>
      <SupportRequestModal request={row} onAnswered={onAnswered} />
    </LanguageProvider>,
  );
  return { onAnswered, ...view };
}

const settle = () => act(async () => { await vi.advanceTimersByTimeAsync(0); });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
  vi.clearAllMocks();
  localStorage.clear();
  support.respond.mockResolvedValue({ data: { data: {} } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('The question from SSMS support', () => {
  it('says who asks, for how long and why', () => {
    open();
    expect(screen.getByRole('alertdialog', { name: 'SSMS support wants to view your account' })).toBeInTheDocument();
    expect(screen.getByText('Ange Admin asks to look at your account for 30 minutes.')).toBeInTheDocument();
    expect(screen.getByText('Reason: Please look at my batch list')).toBeInTheDocument();
  });

  it('shows the reason as plain text, never as markup', () => {
    const { baseElement } = open(request({ reason: '<b>hi</b> look at my batch' }));
    expect(screen.getByText('Reason: <b>hi</b> look at my batch')).toBeInTheDocument();
    expect(baseElement.querySelector('b')).toBeNull();
  });

  it('puts the focus on Reject, the safe answer, so Enter cannot allow by accident', () => {
    open();
    expect(screen.getByRole('button', { name: 'Reject' })).toHaveFocus();
  });

  it('offers the tick for changes only when changes were asked for, and leaves it off', () => {
    open(request({ requestedMode: 'view' }));
    expect(screen.queryByLabelText('Also let them make changes')).not.toBeInTheDocument();
  });

  it('shows the tick, off, when changes were asked for', () => {
    open(request({ requestedMode: 'edit' }));
    expect(screen.getByText('They also asked to make changes.')).toBeInTheDocument();
    expect(screen.getByLabelText('Also let them make changes')).not.toBeChecked();
  });

  it('allows view only by default', async () => {
    const { onAnswered } = open(request({ requestedMode: 'edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    await settle();
    expect(support.respond).toHaveBeenCalledWith('r1', { decision: 'allow', allowEdit: false });
    expect(onAnswered).toHaveBeenCalledTimes(1);
  });

  it('allows changes only when the tick is on', async () => {
    open(request({ requestedMode: 'edit' }));
    fireEvent.click(screen.getByLabelText('Also let them make changes'));
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    await settle();
    expect(support.respond).toHaveBeenCalledWith('r1', { decision: 'allow', allowEdit: true });
  });

  it('rejects without any tick', async () => {
    const { onAnswered } = open(request({ requestedMode: 'edit' }));
    fireEvent.click(screen.getByLabelText('Also let them make changes'));
    fireEvent.click(screen.getByRole('button', { name: 'Reject' }));
    await settle();
    expect(support.respond).toHaveBeenCalledWith('r1', { decision: 'reject', allowEdit: false });
    expect(onAnswered).toHaveBeenCalledTimes(1);
  });

  it('counts down the time left to answer', () => {
    open();
    expect(screen.getByText('5:00 left to answer')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByText('4:59 left to answer')).toBeInTheDocument();
  });

  it('hands over to the page when the time is up, so it can ask the server and close', async () => {
    const { onAnswered } = open(request({ expiresAt: '2026-11-06T10:00:02Z' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
    expect(onAnswered).toHaveBeenCalled();
    expect(support.respond).not.toHaveBeenCalled();
  });

  it('does not close on Escape, because it is a question that needs an answer', () => {
    open();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });

  it('shows why when the answer cannot be saved, and stays open', async () => {
    support.respond.mockRejectedValue(new AxiosError('no', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 409, data: { message: 'That request has run out of time.' }, statusText: '', headers: {}, config: {} as InternalAxiosRequestConfig,
    }));
    const { onAnswered } = open();
    fireEvent.click(screen.getByRole('button', { name: 'Allow' }));
    await settle();
    expect(screen.getByRole('alert')).toHaveTextContent('That request has run out of time.');
    expect(onAnswered).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Allow' })).toBeEnabled();
  });

  it('shows nothing when nobody is asking', () => {
    open(null);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
