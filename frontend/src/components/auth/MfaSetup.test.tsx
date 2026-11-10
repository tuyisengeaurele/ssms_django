import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';

const mfa = vi.hoisted(() => ({ setupStart: vi.fn(), setupConfirm: vi.fn() }));
vi.mock('../../services/mfa.service', () => ({ mfaService: mfa }));
vi.mock('qrcode.react', () => ({ QRCodeSVG: ({ value }: { value: string }) => <svg data-testid="qr" data-value={value} /> }));

import MfaSetup from './MfaSetup';

const USER = { id: 'u1', email: 'boss@example.rw', role: 'ADMIN' };
const URI = 'otpauth://totp/SSMS:boss%40example.rw?secret=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567&issuer=SSMS';
const CODES = ['AAAAA-BBBBB', 'CCCCC-DDDDD', 'EEEEE-FFFFF', 'GGGGG-HHHHH', 'JJJJJ-KKKKK', 'MMMMM-NNNNN', 'PPPPP-QQQQQ', 'RRRRR-SSSSS'];

function fail(status: number, data: object) {
  return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status, data, statusText: '', headers: {}, config: {} as InternalAxiosRequestConfig,
  });
}

function open(strict = false) {
  const onSignedIn = vi.fn();
  const onExpired = vi.fn();
  const tree = (
    <MemoryRouter>
      <LanguageProvider>
        <MfaSetup challenge="chal-2" device={{ installed: false }} sharedDevice={false} onSignedIn={onSignedIn} onExpired={onExpired} />
      </LanguageProvider>
    </MemoryRouter>
  );
  render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  return { onSignedIn, onExpired };
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mfa.setupStart.mockResolvedValue({ data: { data: { secret: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', otpauthUri: URI } } });
  mfa.setupConfirm.mockResolvedValue({ data: { data: { user: USER, token: 'jwt.token', recoveryCodes: CODES } } });
});

describe('MfaSetup', () => {
  it('shows the steps in order: install, scan, type the code', async () => {
    open();
    await screen.findByTestId('qr');
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings[0]).toMatch(/Install an app/);
    expect(headings[1]).toMatch(/Scan the code/);
    expect(headings[2]).toMatch(/Type the code/);
  });

  it('draws the QR code from the link the server gave, and shows the key to type in groups', async () => {
    open();
    expect((await screen.findByTestId('qr')).getAttribute('data-value')).toBe(URI);
    expect(screen.getByText('ABCD EFGH IJKL MNOP QRST UVWX YZ23 4567')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'QR code for the authenticator app' })).toBeInTheDocument();
  });

  it('asks the server for the secret only once, even when React draws the page twice', async () => {
    open(true);
    await screen.findByTestId('qr');
    expect(mfa.setupStart).toHaveBeenCalledTimes(1);
    expect(mfa.setupStart).toHaveBeenCalledWith('chal-2');
  });

  it('takes the code in six boxes and keeps Turn on off until all six are typed', async () => {
    open();
    await screen.findByTestId('qr');
    expect(document.querySelectorAll('.code-input__box')).toHaveLength(6);
    const confirm = screen.getByRole('button', { name: 'Turn on' });
    expect(confirm).toBeDisabled();
    fireEvent.change(screen.getByLabelText('6 digit code'), { target: { value: '123456' } });
    expect(confirm).toBeEnabled();
  });

  it('says what to do when the code is refused: turn on automatic time', async () => {
    open();
    expect(await screen.findByText(/automatic date and time/)).toBeInTheDocument();
  });

  it('keeps the person on the step and says so when the code is wrong', async () => {
    mfa.setupConfirm.mockRejectedValue(fail(401, { message: "That code isn't right." }));
    const { onSignedIn } = open();
    fireEvent.change(await screen.findByLabelText('6 digit code'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("That code isn't right");
    expect(screen.queryByText('Save your recovery codes')).not.toBeInTheDocument();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('after a right code, shows the recovery codes once and waits for the tick before continuing', async () => {
    const { onSignedIn } = open();
    fireEvent.change(await screen.findByLabelText('6 digit code'), { target: { value: '123 456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Turn on' }));
    expect(await screen.findByText('Save your recovery codes')).toBeInTheDocument();
    expect(mfa.setupConfirm).toHaveBeenCalledWith({ challenge: 'chal-2', code: '123456', device: { installed: false }, sharedDevice: false });
    CODES.forEach((code) => expect(screen.getByText(code)).toBeInTheDocument());

    // Nothing signs in until the codes are saved: the person cannot see them again.
    const next = screen.getByRole('button', { name: 'Continue' });
    expect(next).toBeDisabled();
    expect(onSignedIn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('I saved these codes'));
    expect(next).toBeEnabled();
    fireEvent.click(next);
    expect(onSignedIn).toHaveBeenCalledWith(USER, 'jwt.token');
  });

  it('goes back to the password step when the challenge is gone before the secret arrives', async () => {
    mfa.setupStart.mockRejectedValue(fail(401, { message: 'That sign in took too long.', reason: 'challenge' }));
    const { onExpired } = open();
    await waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1));
  });

  it('speaks French when the person chose French', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    open();
    expect(await screen.findByText('Scannez le code')).toBeInTheDocument();
  });
});
