import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { setReducedMotion } from '../../test/setup';
import type { User } from '../../types';

const api = vi.hoisted(() => ({ setPhone: vi.fn() }));
vi.mock('../../services/admin.service', () => ({ adminService: api }));

import AdminPhoneDialog from './AdminPhoneDialog';

const TAKEN = 'This phone number is already used by another account. Contact the SSMS team if it is yours.';
const aline = { id: 'u1', name: 'Aline Uwase', email: 'aline@example.rw', role: 'FARMER', phone: '+250788123456' } as User;
const nobody = { ...aline, phone: null } as User;
const saved = { ...aline, phone: '+250733000000' } as User;

const onClose = vi.fn();
const onSaved = vi.fn();

function open(user: User = aline) {
  return render(
    <LanguageProvider>
      <AdminPhoneDialog open user={user} onClose={onClose} onSaved={onSaved} />
    </LanguageProvider>,
  );
}
const field = () => screen.getByLabelText('New phone number');
const save = () => screen.getByRole('button', { name: 'Save number' });
const type = (value: string) => fireEvent.change(field(), { target: { value } });

function refused(code: string, message: string) {
  return new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 422, data: { code, message: 'Please check what you entered and try again.', errors: { phone: [message] } },
  } as never);
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  api.setPhone.mockResolvedValue({ data: { data: saved } });
});

describe('The dialog for the number of someone else', () => {
  it('names the person, shows their number without spaces, and puts the focus on the new number', () => {
    open();
    expect(screen.getByRole('dialog', { name: 'Phone number of Aline Uwase' })).toBeInTheDocument();
    expect(screen.getByText('0788123456')).toBeInTheDocument();
    expect(field()).toHaveFocus();
    expect(field()).toHaveAttribute('type', 'tel');
  });

  it('says so when the person has no number, and offers no clear button', () => {
    open(nobody);
    expect(screen.getByText('No number yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear number' })).not.toBeInTheDocument();
  });

  it('keeps Save off until a number is typed', () => {
    open();
    expect(save()).toBeDisabled();
    type('   ');
    expect(save()).toBeDisabled();
    type('0733 000 000');
    expect(save()).toBeEnabled();
  });

  it('sends the number as typed, with no confirmation to type, and hands the saved person on', async () => {
    open();
    type(' 0733 000 000 ');
    fireEvent.click(save());
    await waitFor(() => expect(api.setPhone).toHaveBeenCalledWith('u1', '0733 000 000'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved, 'saved'));
  });

  it('does not ask the server to set the number a person already has', async () => {
    open();
    type('+250 788 123 456');
    fireEvent.click(save());
    expect(await screen.findByText('That is already their number.')).toHaveAttribute('role', 'alert');
    expect(api.setPhone).not.toHaveBeenCalled();
  });

  it('shows a number someone else holds beside the field and keeps what was typed', async () => {
    api.setPhone.mockRejectedValue(refused('phone_taken', TAKEN));
    open();
    type('0733 000 000');
    fireEvent.click(save());
    expect(await screen.findByText(TAKEN)).toBeInTheDocument();
    expect(field()).toHaveAttribute('aria-invalid', 'true');
    expect(field()).toHaveValue('0733 000 000');
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('shows a number that is not a Rwandan mobile beside the field', async () => {
    api.setPhone.mockRejectedValue(refused('invalid_phone', 'Enter a Rwandan mobile number, for example 0788123456.'));
    open();
    type('12345');
    fireEvent.click(save());
    expect(await screen.findByText('Enter a Rwandan mobile number, for example 0788123456.')).toBeInTheDocument();
  });

  it('shows any other failure in an alert and stays open', async () => {
    api.setPhone.mockRejectedValue(new AxiosError('x', 'ERR_NETWORK'));
    open();
    type('0733 000 000');
    fireEvent.click(save());
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('asks before clearing, and Keep it goes back without sending anything', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Clear number' }));
    expect(screen.getByText('Clear the number of Aline Uwase? They will be asked for one the next time they sign in.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByText(/Clear the number of/)).not.toBeInTheDocument();
    expect(api.setPhone).not.toHaveBeenCalled();
  });

  it('clears the number with null after the person has said yes', async () => {
    api.setPhone.mockResolvedValue({ data: { data: nobody } });
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Clear number' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, clear it' }));
    await waitFor(() => expect(api.setPhone).toHaveBeenCalledWith('u1', null));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(nobody, 'cleared'));
  });

  it('closes on Cancel and on Escape without sending anything', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(api.setPhone).not.toHaveBeenCalled();
  });

  it('is written in French and Kinyarwanda, with no English left on the buttons', () => {
    localStorage.setItem('ssms_locale', 'fr');
    const { unmount } = open();
    expect(screen.getByRole('button', { name: 'Enregistrer le numéro' })).toBeInTheDocument();
    unmount();
    localStorage.setItem('ssms_locale', 'rw');
    open();
    expect(screen.queryByRole('button', { name: 'Save number' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear number' })).not.toBeInTheDocument();
  });
});
