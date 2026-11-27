import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';

const mfa = vi.hoisted(() => ({ disable: vi.fn() }));
vi.mock('../../services/mfa.service', () => ({ mfaService: mfa }));

import TurnOffTwoStepDialog from './TurnOffTwoStepDialog';

const refused = (status: number, data: object) =>
  new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, { status, data, statusText: '', headers: {}, config: {} as InternalAxiosRequestConfig });

function open() {
  const onClose = vi.fn();
  const onDone = vi.fn();
  render(<LanguageProvider><TurnOffTwoStepDialog open onClose={onClose} onDone={onDone} /></LanguageProvider>);
  return { onClose, onDone, dialog: screen.getByRole('dialog', { name: 'Turn off two-step sign in' }) };
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const turnOff = () => screen.getByRole('button', { name: 'Turn off' });

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  mfa.disable.mockResolvedValue({ data: { data: null } });
});

describe('turning two-step sign in off', () => {
  it('needs the password and a code before it can be pressed', () => {
    const { dialog } = open();
    expect(within(dialog).getByText('Your other devices will be signed out.')).toBeInTheDocument();
    expect(turnOff()).toBeDisabled();
    type('Your password', 'my password');
    expect(turnOff()).toBeDisabled();
    type('6 digit code', '123456');
    expect(turnOff()).toBeEnabled();
  });

  it('sends the password and the app code', async () => {
    const { onDone } = open();
    type('Your password', 'my password');
    type('6 digit code', '123 456');
    fireEvent.click(turnOff());
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(mfa.disable).toHaveBeenCalledWith({ password: 'my password', code: '123456' });
  });

  it('takes a recovery code instead', async () => {
    open();
    type('Your password', 'my password');
    fireEvent.click(screen.getByRole('button', { name: 'Use a recovery code' }));
    type('Recovery code', ' AAAAA-BBBBB ');
    fireEvent.click(turnOff());
    await waitFor(() => expect(mfa.disable).toHaveBeenCalledWith({ password: 'my password', recoveryCode: 'AAAAA-BBBBB' }));
  });

  it('keeps the dialog and says what was wrong', async () => {
    mfa.disable.mockRejectedValue(refused(422, { code: 'mfa_wrong_code', message: 'That code is not right.' }));
    const { onDone, onClose } = open();
    type('Your password', 'my password');
    type('6 digit code', '000000');
    fireEvent.click(turnOff());
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not right.');
    expect(onDone).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Your password')).toHaveValue('my password');
  });

  it('cannot be pressed twice or closed while it is sending', async () => {
    let finish: (value: unknown) => void = () => {};
    mfa.disable.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const { onClose, dialog } = open();
    type('Your password', 'my password');
    type('6 digit code', '123456');
    fireEvent.click(turnOff());
    expect(within(dialog).getByRole('button', { name: /Turn off/ })).toBeDisabled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
    finish({ data: { data: null } });
    await waitFor(() => expect(mfa.disable).toHaveBeenCalledTimes(1));
  });
});
