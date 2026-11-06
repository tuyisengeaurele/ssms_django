import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';

const mfa = vi.hoisted(() => ({ verify: vi.fn() }));
vi.mock('../../services/mfa.service', () => ({ mfaService: mfa }));

import MfaCodeStep from './MfaCodeStep';

const USER = { id: 'u1', email: 'boss@example.rw', role: 'ADMIN' };

function fail(status: number, data: object) {
  return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status, data, statusText: '', headers: {}, config: {} as InternalAxiosRequestConfig,
  });
}

function open() {
  const onSignedIn = vi.fn();
  const onExpired = vi.fn<(message: string) => void>();
  render(
    <MemoryRouter>
      <LanguageProvider>
        <MfaCodeStep challenge="chal-1" device={{ installed: false }} sharedDevice={true} onSignedIn={onSignedIn} onExpired={onExpired} />
      </LanguageProvider>
    </MemoryRouter>,
  );
  return { onSignedIn, onExpired };
}

const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('MfaCodeStep', () => {
  it('asks for the six digit code and puts the cursor in the field', () => {
    open();
    const field = screen.getByLabelText('6 digit code');
    expect(field).toHaveFocus();
    expect(field).toHaveAttribute('inputmode', 'numeric');
    expect(field).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('sends the code with the challenge, the device and the shared computer tick, then signs in', async () => {
    mfa.verify.mockResolvedValue({ data: { data: { user: USER, token: 'jwt.token' } } });
    const { onSignedIn } = open();
    type('6 digit code', '123 456');
    submit();
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(USER, 'jwt.token'));
    expect(mfa.verify).toHaveBeenCalledWith({ challenge: 'chal-1', code: '123456', device: { installed: false }, sharedDevice: true });
  });

  it('says a wrong code is wrong, in plain words, and keeps the field for another try', async () => {
    mfa.verify.mockRejectedValue(fail(401, { message: "That code isn't right. Please try again." }));
    const { onSignedIn } = open();
    type('6 digit code', '000000');
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent("That code isn't right");
    expect(screen.getByLabelText('6 digit code')).toBeInTheDocument();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('goes back to the password step when the challenge is gone', async () => {
    mfa.verify.mockRejectedValue(fail(401, { message: 'That sign in took too long.', reason: 'challenge' }));
    const { onExpired } = open();
    type('6 digit code', '123456');
    submit();
    await waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1));
    expect(onExpired.mock.calls[0][0]).toMatch(/took too long/i);
  });

  it('says to wait, in the language chosen, when too many codes were tried', async () => {
    mfa.verify.mockRejectedValue(fail(429, { message: 'Too many attempts. Please try again in 15 minutes.' }));
    open();
    type('6 digit code', '123456');
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests. Please wait a moment and try again.');
  });

  it('can use a recovery code instead, and sends it under its own name', async () => {
    mfa.verify.mockResolvedValue({ data: { data: { user: USER, token: 't' } } });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Use a recovery code' }));
    expect(screen.queryByLabelText('6 digit code')).not.toBeInTheDocument();
    type('Recovery code', 'AAAAA-BBBBB');
    submit();
    await waitFor(() => expect(mfa.verify).toHaveBeenCalled());
    expect(mfa.verify).toHaveBeenCalledWith({ challenge: 'chal-1', recoveryCode: 'AAAAA-BBBBB', device: { installed: false }, sharedDevice: true });
  });

  it('can go back to the app code from the recovery code', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Use a recovery code' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use the app code instead' }));
    expect(screen.getByLabelText('6 digit code')).toBeInTheDocument();
  });

  it('cannot be sent twice at once', async () => {
    let finish: (value: unknown) => void = () => {};
    mfa.verify.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    open();
    type('6 digit code', '123456');
    submit();
    expect(await screen.findByRole('button', { name: /Checking/ })).toBeDisabled();
    finish({ data: { data: { user: USER, token: 't' } } });
  });

  it('speaks French when the person chose French', () => {
    localStorage.setItem('ssms_locale', 'fr');
    open();
    expect(screen.getByLabelText('Code à 6 chiffres')).toBeInTheDocument();
  });
});
