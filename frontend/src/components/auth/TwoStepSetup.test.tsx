import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';

const mfa = vi.hoisted(() => ({ enrollStart: vi.fn(), enrollConfirm: vi.fn() }));
vi.mock('../../services/mfa.service', () => ({ mfaService: mfa }));

import TwoStepSetup from './TwoStepSetup';

const CODES = ['AAAAA-BBBBB', 'CCCCC-DDDDD', 'EEEEE-FFFFF', 'GGGGG-HHHHH', 'JJJJJ-KKKKK', 'MMMMM-NNNNN', 'PPPPP-QQQQQ', 'RRRRR-SSSSS'];
const refused = (status: number, data: object) =>
  new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, { status, data, statusText: '', headers: {}, config: {} as InternalAxiosRequestConfig });

function open() {
  const onDone = vi.fn();
  const onCancel = vi.fn();
  const onLock = vi.fn();
  render(<LanguageProvider><TwoStepSetup onDone={onDone} onCancel={onCancel} onLock={onLock} /></LanguageProvider>);
  return { onDone, onCancel, onLock };
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const press = (name: string) => fireEvent.click(screen.getByRole('button', { name }));

async function toTheScan() {
  type('Your password', 'my password');
  press('Continue');
  await screen.findByText('Key to type');
}

async function toTheCodes() {
  await toTheScan();
  type('6 digit code', '123456');
  press('Turn on');
  await screen.findByText(CODES[0]);
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mfa.enrollStart.mockResolvedValue({ data: { data: { secret: 'ABCDEFGHIJKLMNOP', otpauthUri: 'otpauth://totp/SSMS:a@example.rw?secret=ABCDEFGHIJKLMNOP' } } });
  mfa.enrollConfirm.mockResolvedValue({ data: { data: { recoveryCodes: CODES } } });
});

describe('turning two-step sign in on', () => {
  it('asks for the password first and says the other devices will be signed out', () => {
    open();
    expect(screen.getByText('Your other devices will be signed out.')).toBeInTheDocument();
    expect(screen.getByLabelText('Your password')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Your password')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled();
    expect(mfa.enrollStart).not.toHaveBeenCalled();
  });

  it('stays on the password and says why when it is wrong', async () => {
    mfa.enrollStart.mockRejectedValue(refused(422, { code: 'wrong_password', message: 'That password is not right.' }));
    open();
    type('Your password', 'nope');
    press('Continue');
    expect(await screen.findByRole('alert')).toHaveTextContent('That password is not right.');
    expect(screen.getByLabelText('Your password')).toBeInTheDocument();
  });

  it('shows the square to scan and the key in groups of four', async () => {
    open();
    await toTheScan();
    expect(mfa.enrollStart).toHaveBeenCalledWith('my password');
    expect(screen.getByRole('img', { name: 'QR code for the authenticator app' })).toBeInTheDocument();
    expect(screen.getByText('ABCD EFGH IJKL MNOP')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Turn on' })).toBeDisabled();
  });

  it('says the code is wrong and what to check on the phone', async () => {
    mfa.enrollConfirm.mockRejectedValue(refused(422, { code: 'mfa_wrong_code', message: 'That code is not right.' }));
    open();
    await toTheScan();
    type('6 digit code', '000000');
    press('Turn on');
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not right.');
    expect(screen.getByText('If refused, turn on automatic date and time on your phone.')).toBeInTheDocument();
  });

  it('locks the dialog as soon as the code is on its way, and unlocks it if the code is refused', async () => {
    let refuse: (reason: unknown) => void = () => {};
    mfa.enrollConfirm.mockReturnValue(new Promise((_resolve, reject) => { refuse = reject; }));
    const { onLock } = open();
    await toTheScan();
    expect(onLock).not.toHaveBeenCalled();
    type('6 digit code', '123456');
    press('Turn on');
    expect(onLock).toHaveBeenLastCalledWith(true);
    refuse(refused(422, { code: 'mfa_wrong_code', message: 'That code is not right.' }));
    await screen.findByRole('alert');
    expect(onLock).toHaveBeenLastCalledWith(false);
  });

  it('goes back to the password when the set-up has to start again', async () => {
    mfa.enrollConfirm.mockRejectedValue(refused(409, { code: 'mfa_start_again', message: 'Please start the setup again.' }));
    open();
    await toTheScan();
    type('6 digit code', '123456');
    press('Turn on');
    expect(await screen.findByRole('alert')).toHaveTextContent('Please start the setup again.');
    expect(screen.getByLabelText('Your password')).toHaveValue('');
  });

  it('shows the recovery codes and lets nothing continue until they are kept', async () => {
    const { onDone, onLock } = open();
    await toTheCodes();
    expect(mfa.enrollConfirm).toHaveBeenCalledWith('123456');
    expect(onLock).toHaveBeenLastCalledWith(true);
    CODES.forEach((code) => expect(screen.getByText(code)).toBeInTheDocument());
    // It is on by now: there is nothing left to cancel, only the codes to keep.
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeDisabled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'I saved these codes' }));
    press('Done');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it.each([['the password step', async () => {}], ['the scan step', toTheScan]])('can be cancelled on %s', async (_name, reach) => {
    const { onCancel } = open();
    await reach();
    press('Cancel');
    expect(onCancel).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(mfa.enrollConfirm).not.toHaveBeenCalled());
  });

  it('sends each step with the Enter key, and puts the cursor where the typing goes', async () => {
    open();
    expect(screen.getByLabelText('Your password')).toHaveFocus();
    type('Your password', 'my password');
    fireEvent.submit(screen.getByLabelText('Your password').closest('form') as HTMLFormElement);
    await screen.findByText('Key to type');
    expect(screen.getByLabelText('6 digit code')).toHaveFocus();
  });
});
