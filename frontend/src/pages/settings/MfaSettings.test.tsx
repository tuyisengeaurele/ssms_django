import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const mfa = vi.hoisted(() => ({ status: vi.fn(), newRecoveryCodes: vi.fn() }));
vi.mock('../../services/mfa.service', () => ({ mfaService: mfa }));

import MfaSettings from './MfaSettings';

const CODES = ['AAAAA-BBBBB', 'CCCCC-DDDDD', 'EEEEE-FFFFF', 'GGGGG-HHHHH', 'JJJJJ-KKKKK', 'MMMMM-NNNNN', 'PPPPP-QQQQQ', 'RRRRR-SSSSS'];
const on = (recoveryCodesLeft: number) => ({ data: { data: { enabled: true, enabledAt: '2026-11-05T10:00:00Z', recoveryCodesLeft } } });

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
    expect(await screen.findByRole('heading', { level: 2, name: 'Authenticator app' })).toBeInTheDocument();
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
    mfa.status.mockResolvedValue({ data: { data: { enabled: false, enabledAt: null, recoveryCodesLeft: 0 } } });
    open();
    expect(await screen.findByText('Off')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New recovery codes' })).not.toBeInTheDocument();
  });

  it('says plainly when the status cannot be read', async () => {
    mfa.status.mockRejectedValue(refused(500, { message: 'broken' }));
    open();
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not read the authenticator app status.');
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
