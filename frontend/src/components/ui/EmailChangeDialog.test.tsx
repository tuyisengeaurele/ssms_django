import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ startEmailChange: vi.fn() }));
vi.mock('../../services/account.service', () => ({ accountService: api }));

import EmailChangeDialog from './EmailChangeDialog';

const pending = { id: 'c1', newEmail: 'n***@example.rw', createdAt: '2026-11-23T10:00:00Z', expiresAt: '2026-11-24T10:00:00Z' };
const onClose = vi.fn();
const onStarted = vi.fn();

function open() {
  return render(
    <LanguageProvider>
      <EmailChangeDialog open currentEmail="aline@example.rw" onClose={onClose} onStarted={onStarted} />
    </LanguageProvider>,
  );
}
const newEmail = () => screen.getByLabelText('New email address');
const password = () => screen.getByLabelText('Your password');
const typed = () => screen.getByLabelText('Type aline@example.rw to confirm');
const send = () => screen.getByRole('button', { name: 'Send the link' });
const change = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });
const fillAll = () => {
  change(newEmail(), 'new@example.rw');
  change(password(), 'Secret123');
  change(typed(), 'aline@example.rw');
};

function refused(code: string, field: string, message: string) {
  return new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 422, data: { code, message: 'Please check what you entered and try again.', errors: { [field]: [message] } },
  } as never);
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.startEmailChange.mockResolvedValue({ data: { data: pending } });
});

describe('The change email dialog', () => {
  it('is a dialog that says what happens, and puts the focus on the new address', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Change your email address' })).toBeInTheDocument();
    expect(screen.getByText(/Your email changes only when you open it/)).toBeInTheDocument();
    expect(newEmail()).toHaveFocus();
  });

  it('has the right kind of field for each answer', () => {
    open();
    expect(newEmail()).toHaveAttribute('type', 'email');
    expect(newEmail()).toHaveAttribute('autocomplete', 'off');
    expect(password()).toHaveAttribute('type', 'password');
    expect(password()).toHaveAttribute('autocomplete', 'current-password');
  });

  it('keeps the button off until the new address, the password and the typed current address are all there', () => {
    open();
    expect(send()).toBeDisabled();
    change(newEmail(), 'new@example.rw');
    change(password(), 'Secret123');
    expect(send()).toBeDisabled();
    change(typed(), 'aline@example');
    expect(send()).toBeDisabled();
    change(typed(), 'ALINE@example.rw');
    expect(send()).toBeEnabled();
    change(password(), '');
    expect(send()).toBeDisabled();
  });

  it('sends the new address, the typed address and the password, and hands the pending change on', async () => {
    open();
    change(newEmail(), ' new@example.rw ');
    change(password(), 'Secret123');
    change(typed(), ' aline@example.rw ');
    fireEvent.click(send());
    await waitFor(() => expect(api.startEmailChange).toHaveBeenCalledWith({ newEmail: 'new@example.rw', confirmEmail: 'aline@example.rw', password: 'Secret123' }));
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith(pending));
  });

  it('shows an address someone else holds beside the new address, and keeps everything typed', async () => {
    api.startEmailChange.mockRejectedValue(refused('email_taken', 'newEmail', 'An account with this email already exists.'));
    open();
    fillAll();
    fireEvent.click(send());
    const message = await screen.findByText('An account with this email already exists.');
    expect(message).toHaveAttribute('role', 'alert');
    expect(newEmail()).toHaveAttribute('aria-invalid', 'true');
    expect(newEmail().getAttribute('aria-describedby')).toContain(message.id);
    expect(newEmail()).toHaveValue('new@example.rw');
    expect(password()).toHaveValue('Secret123');
    expect(onStarted).not.toHaveBeenCalled();
  });

  it('shows the same address beside the new address', async () => {
    api.startEmailChange.mockRejectedValue(refused('email_same', 'newEmail', 'That is already your email address.'));
    open();
    fillAll();
    fireEvent.click(send());
    expect(await screen.findByText('That is already your email address.')).toBeInTheDocument();
  });

  it('shows a wrong password beside the password', async () => {
    api.startEmailChange.mockRejectedValue(refused('wrong_password', 'password', 'That password is not right.'));
    open();
    fillAll();
    fireEvent.click(send());
    const message = await screen.findByText('That password is not right.');
    expect(password()).toHaveAttribute('aria-invalid', 'true');
    expect(password().getAttribute('aria-describedby')).toContain(message.id);
  });

  it('shows a typed address the server did not accept beside the typed field', async () => {
    api.startEmailChange.mockRejectedValue(refused('confirm_mismatch', 'confirmEmail', 'Type it exactly as shown to confirm.'));
    open();
    fillAll();
    fireEvent.click(send());
    const message = await screen.findByText('Type it exactly as shown to confirm.');
    expect(typed()).toHaveAttribute('aria-invalid', 'true');
    expect(typed().getAttribute('aria-describedby')).toContain(message.id);
  });

  it('clears a refusal when the person types in that field again', async () => {
    api.startEmailChange.mockRejectedValue(refused('wrong_password', 'password', 'That password is not right.'));
    open();
    fillAll();
    fireEvent.click(send());
    await screen.findByText('That password is not right.');
    change(password(), 'Secret1234');
    expect(screen.queryByText('That password is not right.')).not.toBeInTheDocument();
  });

  it('says so in an alert when the link could not be sent, and stays open', async () => {
    api.startEmailChange.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 422, data: { code: 'email_not_sent', message: 'We could not send the link. Please try again in a minute.' },
    } as never));
    open();
    fillAll();
    fireEvent.click(send());
    expect(await screen.findByText('We could not send the link. Please try again in a minute.')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Cancel and on Escape without sending anything', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(api.startEmailChange).not.toHaveBeenCalled();
  });

  it('is written in French and Kinyarwanda, with no English left on the buttons', () => {
    localStorage.setItem('ssms_locale', 'fr');
    const { unmount } = open();
    expect(screen.getByRole('button', { name: 'Envoyer le lien' })).toBeInTheDocument();
    expect(screen.getByLabelText('Saisissez aline@example.rw pour confirmer')).toBeInTheDocument();
    unmount();
    localStorage.setItem('ssms_locale', 'rw');
    open();
    expect(screen.queryByRole('button', { name: 'Send the link' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Type aline@example.rw/)).not.toBeInTheDocument();
  });
});
