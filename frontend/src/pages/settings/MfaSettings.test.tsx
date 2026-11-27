import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const mfa = vi.hoisted(() => ({ status: vi.fn(), newRecoveryCodes: vi.fn(), enrollStart: vi.fn(), enrollConfirm: vi.fn(), disable: vi.fn() }));
vi.mock('../../services/mfa.service', () => ({ mfaService: mfa }));

const reminder = vi.hoisted(() => ({ ask: vi.fn(), refresh: vi.fn(), setUp: vi.fn(), open: false, line: false }));
vi.mock('../../components/auth/mfaReminderContext', () => ({ useMfaReminder: () => reminder }));

import MfaSettings from './MfaSettings';

const CODES = ['AAAAA-BBBBB', 'CCCCC-DDDDD', 'EEEEE-FFFFF', 'GGGGG-HHHHH', 'JJJJJ-KKKKK', 'MMMMM-NNNNN', 'PPPPP-QQQQQ', 'RRRRR-SSSSS'];
const on = (recoveryCodesLeft: number, required = false) => ({ data: { data: { enabled: true, required, enabledAt: '2026-11-05T10:00:00Z', recoveryCodesLeft } } });
const off = () => ({ data: { data: { enabled: false, required: false, enabledAt: null, recoveryCodesLeft: 0 } } });

function refused(status: number, data: object) {
  return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status, data, statusText: '', headers: {}, config: {} as InternalAxiosRequestConfig,
  });
}

const open = () => render(<LanguageProvider><ToastProvider><MfaSettings /></ToastProvider></LanguageProvider>);

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  mfa.status.mockResolvedValue(on(8));
});

async function askForNewCodes(code = '123456') {
  fireEvent.click(await screen.findByRole('button', { name: 'New recovery codes' }));
  const dialog = await screen.findByRole('dialog', { name: 'Replace your recovery codes' });
  fireEvent.change(within(dialog).getByLabelText('6 digit code'), { target: { value: code } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }));
  return dialog;
}

describe('MfaSettings', () => {
  it('says it is on, since when, and how many recovery codes are left', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 2, name: 'Two-step sign in' })).toBeInTheDocument();
    expect(await screen.findByText('On')).toBeInTheDocument();
    expect(screen.getByText(/On since .*2026/)).toBeInTheDocument();
    expect(screen.getByText('8 recovery codes left')).toBeInTheDocument();
  });

  it('says it in the singular when one code is left', async () => {
    mfa.status.mockResolvedValue(on(1));
    open();
    expect(await screen.findByText('1 recovery code left')).toBeInTheDocument();
  });

  it('says it is off, and offers nothing to renew, when there is no app', async () => {
    mfa.status.mockResolvedValue(off());
    open();
    expect(await screen.findByText('Off')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New recovery codes' })).not.toBeInTheDocument();
  });

  it('says plainly when the status cannot be read', async () => {
    mfa.status.mockRejectedValue(refused(500, { message: 'broken' }));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not read the authenticator status.');
  });

  it('asks for a code, then shows the new recovery codes and the new count', async () => {
    mfa.status.mockResolvedValue(on(2));
    mfa.newRecoveryCodes.mockResolvedValue({ data: { data: { recoveryCodes: CODES } } });
    open();
    await askForNewCodes('123 456');
    await waitFor(() => expect(mfa.newRecoveryCodes).toHaveBeenCalledWith('123456'));
    expect(await screen.findByText('Your new recovery codes')).toBeInTheDocument();
    CODES.forEach((code) => expect(screen.getByText(code)).toBeInTheDocument());
    expect(screen.getByText('8 recovery codes left')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('hides the new codes again when the person says they are done', async () => {
    mfa.newRecoveryCodes.mockResolvedValue({ data: { data: { recoveryCodes: CODES } } });
    open();
    await askForNewCodes();
    await screen.findByText('Your new recovery codes');
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.queryByText('Your new recovery codes')).not.toBeInTheDocument();
    expect(screen.queryByText(CODES[0])).not.toBeInTheDocument();
  });

  it('keeps the old codes and says the code is wrong when it is refused', async () => {
    mfa.newRecoveryCodes.mockRejectedValue(refused(422, { message: "That code isn't right." }));
    open();
    const dialog = await askForNewCodes('000000');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent("That code isn't right");
    expect(screen.queryByText('Your new recovery codes')).not.toBeInTheDocument();
    expect(screen.getByText('8 recovery codes left')).toBeInTheDocument();
  });

  it('does nothing when the person cancels', async () => {
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'New recovery codes' }));
    const dialog = await screen.findByRole('dialog', { name: 'Replace your recovery codes' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mfa.newRecoveryCodes).not.toHaveBeenCalled();
  });

  it('speaks French when the person chose French', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    open();
    expect(await screen.findByText('8 codes de récupération restants')).toBeInTheDocument();
  });
});

describe('MfaSettings, turning it on and off', () => {
  it('offers to turn it on while it is off', async () => {
    mfa.status.mockResolvedValue(off());
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on' }));
    const dialog = await screen.findByRole('dialog', { name: 'Turn on two-step sign in' });
    expect(within(dialog).getByLabelText('Your password')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn off' })).not.toBeInTheDocument();
  });

  it('reads the status again once it is on, and the codes dialog cannot be closed before they are kept', async () => {
    mfa.status.mockResolvedValueOnce(off()).mockResolvedValue(on(8));
    mfa.enrollStart.mockResolvedValue({ data: { data: { secret: 'ABCDEFGH', otpauthUri: 'otpauth://totp/x?secret=ABCDEFGH' } } });
    mfa.enrollConfirm.mockResolvedValue({ data: { data: { recoveryCodes: CODES } } });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn on' }));
    const dialog = await screen.findByRole('dialog', { name: 'Turn on two-step sign in' });
    fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: 'my password' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    fireEvent.change(await within(dialog).findByLabelText('6 digit code'), { target: { value: '123456' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn on' }));
    await within(dialog).findByText(CODES[0]);
    expect(within(dialog).queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('dialog', { name: 'Turn on two-step sign in' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'I saved these codes' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('8 recovery codes left')).toBeInTheDocument();
    expect(reminder.refresh).toHaveBeenCalled();
  });

  it('offers to turn it off while it is on, and reads the status again after', async () => {
    mfa.status.mockResolvedValueOnce(on(8)).mockResolvedValue(off());
    mfa.disable.mockResolvedValue({ data: { data: null } });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Turn off' }));
    const dialog = await screen.findByRole('dialog', { name: 'Turn off two-step sign in' });
    fireEvent.change(within(dialog).getByLabelText('Your password'), { target: { value: 'my password' } });
    fireEvent.change(within(dialog).getByLabelText('6 digit code'), { target: { value: '123456' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Turn off' }));
    expect(await screen.findByText('Off')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeInTheDocument();
    expect(reminder.refresh).toHaveBeenCalled();
  });

  it('never offers an admin to turn it off', async () => {
    mfa.status.mockResolvedValue(on(8, true));
    open();
    await screen.findByRole('button', { name: 'New recovery codes' });
    expect(screen.queryByRole('button', { name: 'Turn off' })).not.toBeInTheDocument();
  });
});
