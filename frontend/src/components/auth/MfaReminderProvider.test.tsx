import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';
import type { MfaTrigger } from '../../types';

const mfa = vi.hoisted(() => ({ status: vi.fn(), snooze: vi.fn(), seen: vi.fn(), enrollStart: vi.fn(), enrollConfirm: vi.fn() }));
vi.mock('../../services/mfa.service', () => ({ mfaService: mfa }));
const auth = vi.hoisted(() => ({ user: { id: 'u1', role: 'FARMER' } as { id: string; role: string }, acting: null as null | { id: string } }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));

import MfaReminderProvider from './MfaReminderProvider';
import { useMfaReminder } from './mfaReminderContext';
import TwoStepLine from './TwoStepLine';

const CODES = ['AAAAA-BBBBB', 'CCCCC-DDDDD', 'EEEEE-FFFFF', 'GGGGG-HHHHH', 'JJJJJ-KKKKK', 'MMMMM-NNNNN', 'PPPPP-QQQQQ', 'RRRRR-SSSSS'];

const answer = (show: boolean, trigger: MfaTrigger | null = null, reminderLine = false) =>
  ({ data: { data: { enabled: false, required: false, enabledAt: null, recoveryCodesLeft: 0, prompt: { show, trigger }, reminderLine } } });

/** The server shows the reminder at any moment it is asked about, and shows the line when told to. */
const serverShows = (line = false) => mfa.status.mockImplementation(async (trigger?: MfaTrigger) => answer(Boolean(trigger), trigger ?? null, line));

function Probe({ trigger = 'password_changed' as MfaTrigger }) {
  const reminder = useMfaReminder();
  const [done, setDone] = useState('');
  return (
    <>
      <button type="button" onClick={() => { reminder.ask(trigger).then(() => setDone('resolved')); }}>ask</button>
      <p data-testid="done">{done}</p>
      <p data-testid="open">{String(reminder.open)}</p>
      <TwoStepLine />
    </>
  );
}

const tree = (blocked = false) => (
  <LanguageProvider>
    <MfaReminderProvider blocked={blocked}>
      <Probe />
    </MfaReminderProvider>
  </LanguageProvider>
);

// findByRole can answer after React has drawn the dialog and before it has run what follows a drawing: the focus move, and
// telling the server the reminder was seen. On a busy machine it does. Once the focus is inside, both have run.
const reminder = async () => {
  const dialog = await screen.findByRole('dialog', { name: 'Protect your account' });
  await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));
  return dialog;
};
const noDialog = () => waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
const justSignedIn = (trigger: MfaTrigger = 'login') => sessionStorage.setItem('ssms_prompt', trigger);
const settle = () => act(async () => { await Promise.resolve(); });

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  auth.user = { id: 'u1', role: 'FARMER' };
  auth.acting = null;
  serverShows();
  mfa.snooze.mockResolvedValue({ data: { data: { snoozedUntil: '2026-11-30T00:00:00Z' } } });
  mfa.seen.mockResolvedValue({ data: { data: null } });
  mfa.enrollStart.mockResolvedValue({ data: { data: { secret: 'ABCDEFGH', otpauthUri: 'otpauth://totp/x?secret=ABCDEFGH' } } });
  mfa.enrollConfirm.mockResolvedValue({ data: { data: { recoveryCodes: CODES } } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the reminder after signing in', () => {
  it.each(['FARMER', 'SUPERVISOR'])('is shown to a %s when the server says so, and says why', async (role) => {
    auth.user = { id: 'u1', role };
    justSignedIn();
    render(tree());
    const dialog = await reminder();
    expect(mfa.status).toHaveBeenCalledWith('login');
    expect(within(dialog).getByText('A code from your phone keeps others out, even with your password.')).toBeInTheDocument();
    expect(within(dialog).getByText('Takes about 2 minutes. Use Google Authenticator, Microsoft Authenticator or FreeOTP.')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Set up now' })).toHaveFocus();
    expect(mfa.seen).toHaveBeenCalledTimes(1);
  });

  it('says it came from a new device when it did', async () => {
    justSignedIn('new_device');
    render(tree());
    await reminder();
    expect(mfa.status).toHaveBeenCalledWith('new_device');
  });

  it('is shown once even when the page draws itself twice, as it does while developing', async () => {
    justSignedIn();
    render(<StrictMode>{tree()}</StrictMode>);
    await reminder();
    expect(mfa.status.mock.calls.filter(([trigger]) => trigger === 'login')).toHaveLength(1);
    expect(mfa.seen).toHaveBeenCalledTimes(1);
  });

  it('is not shown when the server says not now', async () => {
    mfa.status.mockResolvedValue(answer(false));
    justSignedIn();
    render(tree());
    await settle();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mfa.seen).not.toHaveBeenCalled();
  });

  it('asks nothing more when the page is loaded again', async () => {
    justSignedIn();
    const first = render(tree());
    await reminder();
    first.unmount();
    mfa.status.mockClear();
    render(tree());
    await settle();
    expect(mfa.status.mock.calls).toEqual([[undefined]]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it.each([['an admin', () => { auth.user = { id: 'a', role: 'ADMIN' }; }], ['an admin acting as somebody', () => { auth.acting = { id: 's' }; }]])(
    'never asks the server for %s',
    async (_who, arrange) => {
      arrange();
      justSignedIn();
      render(tree());
      fireEvent.click(screen.getByRole('button', { name: 'ask' }));
      await waitFor(() => expect(screen.getByTestId('done')).toHaveTextContent('resolved'));
      expect(mfa.status).not.toHaveBeenCalled();
    },
  );
});

describe('putting it off', () => {
  it.each([
    ['Remind me later', (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole('button', { name: 'Remind me later' }))],
    ['Escape', () => fireEvent.keyDown(window, { key: 'Escape' })],
    ['the close button', (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))],
  ])('with %s is one answer to the server, and leaves the quiet line', async (_how, leave) => {
    justSignedIn();
    render(tree());
    leave(await reminder());
    await noDialog();
    expect(mfa.snooze).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Secure your account')).toBeInTheDocument();
  });

  it('still closes when the server cannot be told', async () => {
    mfa.snooze.mockRejectedValue(new Error('no connection'));
    justSignedIn();
    render(tree());
    fireEvent.click(within(await reminder()).getByRole('button', { name: 'Remind me later' }));
    await noDialog();
  });

  it('is also what leaving the set-up before the end means', async () => {
    justSignedIn();
    render(tree());
    fireEvent.click(within(await reminder()).getByRole('button', { name: 'Set up now' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await noDialog();
    expect(mfa.snooze).toHaveBeenCalledTimes(1);
  });
});

describe('setting it up from the reminder', () => {
  it('goes through to the recovery codes in the same dialog, which stays until they are kept', async () => {
    justSignedIn();
    render(tree());
    fireEvent.click(within(await reminder()).getByRole('button', { name: 'Set up now' }));
    const dialog = await screen.findByRole('dialog', { name: 'Turn on two-step sign in' });
    fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: 'my password' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    fireEvent.change(await within(dialog).findByLabelText('6 digit code'), { target: { value: '123456' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn on' }));
    await within(dialog).findByText(CODES[0]);
    expect(within(dialog).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(within(dialog).getByRole('button', { name: 'Done' })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'I saved these codes' }));
    mfa.status.mockResolvedValue(answer(false));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await noDialog();
    expect(mfa.snooze).not.toHaveBeenCalled();
    expect(screen.queryByText('Secure your account')).not.toBeInTheDocument();
  });
});

describe('while the code is being checked', () => {
  // The server may already be turning it on and signing other devices out, so this is no moment to look cancelled.
  it('cannot be closed, and can again if the code is refused', async () => {
    let refuse: (reason: unknown) => void = () => {};
    mfa.enrollConfirm.mockReturnValue(new Promise((_resolve, reject) => { refuse = reject; }));
    justSignedIn();
    render(tree());
    fireEvent.click(within(await reminder()).getByRole('button', { name: 'Set up now' }));
    fireEvent.change(await screen.findByLabelText('Your password'), { target: { value: 'my password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    fireEvent.change(await screen.findByLabelText('6 digit code'), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Turn on two-step sign in' })).toBeInTheDocument();
    expect(mfa.snooze).not.toHaveBeenCalled();
    await act(async () => { refuse(new Error('no')); await Promise.resolve(); });
    fireEvent.click(await screen.findByRole('button', { name: 'Close' }));
    await noDialog();
    expect(mfa.snooze).toHaveBeenCalledTimes(1);
  });
});

describe('the quiet line', () => {
  it('shows when the server says so, and opens the set-up with nothing in between', async () => {
    serverShows(true);
    render(tree());
    fireEvent.click(await screen.findByRole('button', { name: 'Set up' }));
    expect(await screen.findByRole('dialog', { name: 'Turn on two-step sign in' })).toBeInTheDocument();
  });

  it('closing what the line opened puts nothing off: nobody was interrupted', async () => {
    serverShows(true);
    render(tree());
    fireEvent.click(await screen.findByRole('button', { name: 'Set up' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await noDialog();
    expect(mfa.snooze).not.toHaveBeenCalled();
  });

  it('is absent otherwise', async () => {
    render(tree());
    await settle();
    expect(screen.queryByText('Secure your account')).not.toBeInTheDocument();
  });
});

describe('the other moments', () => {
  const ask = () => fireEvent.click(screen.getByRole('button', { name: 'ask' }));
  const resolved = () => waitFor(() => expect(screen.getByTestId('done')).toHaveTextContent('resolved'));

  it('lets the caller go on only once the reminder is closed, and gives the focus back', async () => {
    render(tree());
    await settle();
    const caller = screen.getByRole('button', { name: 'ask' });
    caller.focus();
    ask();
    const dialog = await reminder();
    expect(mfa.status).toHaveBeenCalledWith('password_changed');
    expect(screen.getByTestId('done')).toHaveTextContent('');
    expect(screen.getByTestId('open')).toHaveTextContent('true');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Remind me later' }));
    await resolved();
    await noDialog();
    expect(caller).toHaveFocus();
  });

  it('lets the caller go on at once when nothing is shown', async () => {
    mfa.status.mockResolvedValue(answer(false));
    render(tree());
    ask();
    await resolved();
  });

  // Review Focus: another dialog is up. The reminder never stacks on it.
  it('stays out of the way while another dialog waits', async () => {
    render(tree(true));
    await settle();
    mfa.status.mockClear();
    ask();
    await resolved();
    expect(mfa.status).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('hides while another dialog comes up, and comes back after, without counting it as put off', async () => {
    justSignedIn();
    const view = render(tree());
    await reminder();
    view.rerender(tree(true));
    await noDialog();
    expect(screen.getByTestId('open')).toHaveTextContent('false');
    view.rerender(tree(false));
    await reminder();
    expect(mfa.snooze).not.toHaveBeenCalled();
    expect(mfa.seen).toHaveBeenCalledTimes(1);
  });

  // A set-up in progress is not thrown away: what was typed, or codes not yet kept, would be lost with it.
  it('does not take away a set-up the person is in the middle of', async () => {
    justSignedIn();
    const view = render(tree());
    fireEvent.click(within(await reminder()).getByRole('button', { name: 'Set up now' }));
    fireEvent.change(await screen.findByLabelText('Your password'), { target: { value: 'half typed' } });
    view.rerender(tree(true));
    expect(screen.getByTestId('open')).toHaveTextContent('true');
    // Longer than a closing dialog stays in the page.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 300)); });
    expect(screen.getByRole('dialog', { name: 'Turn on two-step sign in' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your password')).toHaveValue('half typed');
  });

  // Review Focus: the request is slow or fails. Nothing appears and nothing waits for it.
  it('lets the caller go on when the server cannot be asked', async () => {
    mfa.status.mockRejectedValue(new Error('no connection'));
    render(tree());
    ask();
    await resolved();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('waits a second and a half at most, and a late answer shows nothing', async () => {
    mfa.status.mockResolvedValue(answer(false));
    render(tree());
    await settle();
    let late: (value: unknown) => void = () => {};
    mfa.status.mockReturnValue(new Promise((resolve) => { late = resolve; }));
    vi.useFakeTimers();
    ask();
    await act(async () => { await vi.advanceTimersByTimeAsync(1400); });
    expect(screen.getByTestId('done')).toHaveTextContent('');
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(screen.getByTestId('done')).toHaveTextContent('resolved');
    await act(async () => { late(answer(true, 'password_changed')); await vi.advanceTimersByTimeAsync(10); });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mfa.seen).not.toHaveBeenCalled();
  });

  it('lets a caller outside it go on at once', async () => {
    render(<LanguageProvider><Probe /></LanguageProvider>);
    ask();
    await resolved();
    expect(mfa.status).not.toHaveBeenCalled();
  });
});
