import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';

const api = vi.hoisted(() => ({ updateProfile: vi.fn() }));
vi.mock('../../services/auth.service', () => ({ authService: api }));

import ConfirmPhoneChangeDialog from './ConfirmPhoneChangeDialog';

const TAKEN = 'This phone number is already used by another account. Contact the SSMS team if it is yours.';
const saved = { id: 'u1', name: 'Aline', email: 'a@b.rw', role: 'FARMER', phone: '+250733000000' };

const onClose = vi.fn();
const onSaved = vi.fn();

function open(currentPhone = '+250788123456') {
  return render(
    <LanguageProvider>
      <ConfirmPhoneChangeDialog open currentPhone={currentPhone} onClose={onClose} onSaved={onSaved} />
    </LanguageProvider>,
  );
}
const newNumber = () => screen.getByLabelText('New phone number');
const confirm = () => screen.getByLabelText('Type 0788 123 456 to confirm');
const change = () => screen.getByRole('button', { name: 'Change number' });
const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } });

function refused(code: string, field: string, message: string) {
  return new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 422, data: { code, message: 'Please check what you entered and try again.', errors: { [field]: [message] } },
  } as never);
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.updateProfile.mockResolvedValue({ data: { data: saved } });
});

describe('The change phone number dialog', () => {
  it('is a dialog with a title, and puts the focus on the new number', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Change your phone number' })).toBeInTheDocument();
    expect(newNumber()).toHaveFocus();
    expect(newNumber()).toHaveAttribute('type', 'tel');
    expect(newNumber()).toHaveAttribute('autocomplete', 'off');
  });

  it('asks for the current number, written as the person writes it, and says why', () => {
    open();
    expect(confirm()).toBeInTheDocument();
    expect(screen.getByText(/stops a stray click/i)).toBeInTheDocument();
  });

  it('keeps the button off until the current number has been typed', () => {
    open();
    type(newNumber(), '0733 000 000');
    expect(change()).toBeDisabled();
    type(confirm(), '0788 123 45');
    expect(change()).toBeDisabled();
    type(confirm(), '0733 000 000');
    expect(change()).toBeDisabled();
    type(confirm(), '0788 123 456');
    expect(change()).toBeEnabled();
  });

  it.each(['+250788123456', '+250 788 123 456', '788123456', ' 0788-123-456 '])('takes the current number written as %j', (typed) => {
    open();
    type(newNumber(), '0733 000 000');
    type(confirm(), typed);
    expect(change()).toBeEnabled();
  });

  it('sends the new number with the confirmation and hands the saved account on', async () => {
    open();
    type(newNumber(), '0733 000 000');
    type(confirm(), '0788 123 456');
    fireEvent.click(change());
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ phone: '0733 000 000', confirmPhone: '0788 123 456' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
  });

  it('does not ask the server for an empty new number, and says so beside that field', async () => {
    open();
    type(confirm(), '0788 123 456');
    fireEvent.click(change());
    const message = await screen.findByText('Please enter your phone number.');
    expect(message).toHaveAttribute('role', 'alert');
    expect(newNumber()).toHaveAttribute('aria-invalid', 'true');
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it('does not ask the server to change a number into itself', async () => {
    open();
    type(newNumber(), '+250 788 123 456');
    type(confirm(), '0788 123 456');
    fireEvent.click(change());
    expect(await screen.findByText('That is already your number.')).toBeInTheDocument();
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it('shows a number someone else holds beside the new number, and keeps what was typed', async () => {
    api.updateProfile.mockRejectedValue(refused('phone_taken', 'phone', TAKEN));
    open();
    type(newNumber(), '0733 000 000');
    type(confirm(), '0788 123 456');
    fireEvent.click(change());
    expect(await screen.findByText(TAKEN)).toBeInTheDocument();
    expect(newNumber()).toHaveAttribute('aria-invalid', 'true');
    expect(newNumber()).toHaveValue('0733 000 000');
    expect(confirm()).toHaveValue('0788 123 456');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows a number that is not a Rwandan mobile beside the new number', async () => {
    api.updateProfile.mockRejectedValue(refused('invalid_phone', 'phone', 'Enter a Rwandan mobile number, for example 0788 123 456.'));
    open();
    type(newNumber(), '12345');
    type(confirm(), '0788 123 456');
    fireEvent.click(change());
    expect(await screen.findByText('Enter a Rwandan mobile number, for example 0788 123 456.')).toBeInTheDocument();
  });

  it('shows a confirmation the server did not accept beside the confirmation field', async () => {
    api.updateProfile.mockRejectedValue(refused('phone_confirm_mismatch', 'confirmPhone', 'Type your current phone number to confirm the change.'));
    open();
    type(newNumber(), '0733 000 000');
    type(confirm(), '0788 123 456');
    fireEvent.click(change());
    const message = await screen.findByText('Type your current phone number to confirm the change.');
    expect(confirm()).toHaveAttribute('aria-invalid', 'true');
    expect(confirm().getAttribute('aria-describedby')).toContain(message.id);
  });

  it('clears a message when the person types in that field again', async () => {
    api.updateProfile.mockRejectedValue(refused('phone_taken', 'phone', TAKEN));
    open();
    type(newNumber(), '0733 000 000');
    type(confirm(), '0788 123 456');
    fireEvent.click(change());
    await screen.findByText(TAKEN);
    type(newNumber(), '0733 000 001');
    expect(screen.queryByText(TAKEN)).not.toBeInTheDocument();
  });

  it('closes on Cancel and on Escape without sending anything', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(api.updateProfile).not.toHaveBeenCalled();
  });

  it('is written in French, with the current number as the French write it', () => {
    localStorage.setItem('ssms_locale', 'fr');
    open();
    expect(screen.getByRole('dialog', { name: 'Changer votre numéro de téléphone' })).toBeInTheDocument();
    expect(screen.getByLabelText('Saisissez 0788 123 456 pour confirmer')).toBeInTheDocument();
  });

  it('is written in Kinyarwanda with no English left on it', () => {
    localStorage.setItem('ssms_locale', 'rw');
    open();
    const text = screen.getByRole('dialog').textContent ?? '';
    expect(text).not.toMatch(/Change your phone number|New phone number|to confirm|Change number|Cancel/);
  });
});
