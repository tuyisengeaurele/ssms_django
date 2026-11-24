import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ closeAccount: vi.fn() }));
vi.mock('../../services/account.service', () => ({ accountService: api }));

import CloseAccountDialog from './CloseAccountDialog';

const onClose = vi.fn();
const onClosed = vi.fn();

function open(openBatches?: number) {
  return render(
    <LanguageProvider>
      <CloseAccountDialog open email="aline@example.rw" openBatches={openBatches} onClose={onClose} onClosed={onClosed} />
    </LanguageProvider>,
  );
}
const typed = () => screen.getByLabelText('Type your email, aline@example.rw, to confirm');
const password = () => screen.getByLabelText('Your password');
const send = () => screen.getByRole('button', { name: 'Close my account' });
const change = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });

function refused(code: string, field: string, message: string) {
  return new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 422, data: { code, message: 'Check what you entered and try again.', errors: { [field]: [message] } },
  } as never);
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.closeAccount.mockResolvedValue({ data: { data: { deletionDate: '2026-12-24' } } });
});

describe('The close account dialog', () => {
  it('is a dialog that lists what happens', () => {
    open();
    const dialog = screen.getByRole('dialog', { name: 'Close your account?' });
    for (const line of [
      'Signed out on every device.',
      'Removed after 30 days. Until then you can sign in and keep it.',
      'Your farms and batches stay as history, without your name.',
      'Your open egg requests are cancelled.',
    ]) {
      expect(within(dialog).getByText(line)).toBeInTheDocument();
    }
    expect(within(dialog).getByText(/You can still change your mind until that date/)).toBeInTheDocument();
  });

  it('is a red panel with a red button', () => {
    open();
    expect(send()).toHaveClass('btn-danger');
  });

  it('names the running batches only when it is told there are some', () => {
    const { unmount } = open();
    expect(screen.queryByText(/still running/)).not.toBeInTheDocument();
    unmount();
    open(1);
    expect(screen.getByText('1 running batch stays as history. No one takes it over.')).toBeInTheDocument();
    unmount();
    open(3);
    expect(screen.getByText(/^3 running batches stay as history/)).toBeInTheDocument();
  });

  it('keeps the button off until the email is typed and the password is given', () => {
    open();
    expect(send()).toBeDisabled();
    change(password(), 'Secret123');
    expect(send()).toBeDisabled();
    change(typed(), 'aline@example');
    expect(send()).toBeDisabled();
    change(typed(), 'ALINE@example.rw');
    expect(send()).toBeEnabled();
    change(password(), '');
    expect(send()).toBeDisabled();
  });

  it('asks for the password with the right kind of field', () => {
    open();
    expect(password()).toHaveAttribute('type', 'password');
    expect(password()).toHaveAttribute('autocomplete', 'current-password');
  });

  it('sends the typed email and the password, and hands the date on', async () => {
    open();
    change(password(), 'Secret123');
    change(typed(), ' aline@example.rw ');
    fireEvent.click(send());
    await waitFor(() => expect(api.closeAccount).toHaveBeenCalledWith({ confirmEmail: 'aline@example.rw', password: 'Secret123' }));
    await waitFor(() => expect(onClosed).toHaveBeenCalledWith('2026-12-24'));
  });

  it('shows a wrong password beside the password and keeps what was typed', async () => {
    api.closeAccount.mockRejectedValue(refused('wrong_password', 'password', 'That password is not right.'));
    open();
    change(password(), 'Wrong');
    change(typed(), 'aline@example.rw');
    fireEvent.click(send());
    const message = await screen.findByText('That password is not right.');
    expect(message).toHaveAttribute('role', 'alert');
    expect(password()).toHaveAttribute('aria-invalid', 'true');
    expect(typed()).toHaveValue('aline@example.rw');
    expect(onClosed).not.toHaveBeenCalled();
    change(password(), 'Right');
    expect(screen.queryByText('That password is not right.')).not.toBeInTheDocument();
  });

  it('shows a typed email the server did not accept beside the typed field', async () => {
    api.closeAccount.mockRejectedValue(refused('confirm_mismatch', 'confirmEmail', 'Type it exactly as shown to confirm.'));
    open();
    change(password(), 'Secret123');
    change(typed(), 'aline@example.rw');
    fireEvent.click(send());
    expect(await screen.findByText('Type it exactly as shown to confirm.')).toBeInTheDocument();
  });

  it('shows any other refusal as a plain message', async () => {
    api.closeAccount.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 429, data: { code: 'throttled', message: 'Too many tries.' },
    } as never));
    open();
    change(password(), 'Secret123');
    change(typed(), 'aline@example.rw');
    fireEvent.click(send());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onClosed).not.toHaveBeenCalled();
  });

  it('closes with Escape and with Cancel', () => {
    open();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
