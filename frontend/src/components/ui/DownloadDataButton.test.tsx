import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ downloadMyData: vi.fn() }));
vi.mock('../../services/account.service', () => ({ accountService: api }));

import DownloadDataButton from './DownloadDataButton';

function open() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <DownloadDataButton />
      </ToastProvider>
    </LanguageProvider>,
  );
}
const openDialog = () => fireEvent.click(screen.getByRole('button', { name: 'Download my data' }));
const password = () => screen.getByLabelText('Your password');
const send = () => screen.getByRole('button', { name: 'Download' });

function refused(code: string, message: string, status = 422) {
  return new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, {
    status, data: { code, message: 'Please check what you entered and try again.', errors: code === 'wrong_password' ? { password: [message] } : undefined },
  } as never);
}

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.downloadMyData.mockResolvedValue(undefined);
});

describe('The download my data button', () => {
  it('is a button that opens a small dialog saying what the file holds', () => {
    open();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    openDialog();
    const dialog = screen.getByRole('dialog', { name: 'Download your data' });
    expect(within(dialog).getByText(/It holds no photos and no password/)).toBeInTheDocument();
    expect(password()).toHaveFocus();
  });

  it('asks for the password with the right kind of field', () => {
    open();
    openDialog();
    expect(password()).toHaveAttribute('type', 'password');
    expect(password()).toHaveAttribute('autocomplete', 'current-password');
  });

  it('keeps the button off until a password is given', () => {
    open();
    openDialog();
    expect(send()).toBeDisabled();
    fireEvent.change(password(), { target: { value: 'Secret123' } });
    expect(send()).toBeEnabled();
  });

  it('downloads with the password, then closes and says so', async () => {
    open();
    openDialog();
    fireEvent.change(password(), { target: { value: 'Secret123' } });
    fireEvent.click(send());
    await waitFor(() => expect(api.downloadMyData).toHaveBeenCalledWith('Secret123'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Your file was downloaded.', {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it('shows a wrong password beside the field, keeps the dialog open and clears the message when the person types again', async () => {
    api.downloadMyData.mockRejectedValue(refused('wrong_password', 'That password is not right.'));
    open();
    openDialog();
    fireEvent.change(password(), { target: { value: 'Wrong' } });
    fireEvent.click(send());
    const message = await screen.findByText('That password is not right.');
    expect(message).toHaveAttribute('role', 'alert');
    expect(password()).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.change(password(), { target: { value: 'Right' } });
    expect(screen.queryByText('That password is not right.')).not.toBeInTheDocument();
  });

  it('shows any other refusal as a plain message', async () => {
    api.downloadMyData.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 429, data: { code: 'throttled', message: 'Too many tries.', retryAfter: 120 },
    } as never));
    open();
    openDialog();
    fireEvent.change(password(), { target: { value: 'Secret123' } });
    fireEvent.click(send());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('closes with Escape and starts empty when opened again', () => {
    open();
    openDialog();
    fireEvent.change(password(), { target: { value: 'Secret123' } });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    openDialog();
    expect(password()).toHaveValue('');
  });
});
