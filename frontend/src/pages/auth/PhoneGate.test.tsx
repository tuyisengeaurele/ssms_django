import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';

const auth = vi.hoisted(() => ({
  user: { id: 'u1', name: 'Aline Uwase', email: 'aline@example.rw', role: 'FARMER', phone: null, phoneRequired: true },
  updateUser: vi.fn(),
  logout: vi.fn(),
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth }));

const api = vi.hoisted(() => ({ updateProfile: vi.fn() }));
vi.mock('../../services/auth.service', () => ({ authService: api }));

import PhoneGate from './PhoneGate';

const TAKEN = 'This phone number is already used by another account. Contact the SSMS team if it is yours.';

const open = () => render(
  <MemoryRouter>
    <LanguageProvider>
      <PhoneGate />
    </LanguageProvider>
  </MemoryRouter>,
);
const phone = () => screen.getByLabelText('Phone number');
const save = () => fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));

function refused(code: string, field: string, message: string) {
  return new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, {
    status: 422, data: { code, message: 'Please check what you entered and try again.', errors: { [field]: [message] } },
  } as never);
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  api.updateProfile.mockResolvedValue({ data: { data: { ...auth.user, phone: '+250788123456', phoneRequired: false } } });
});

describe('The phone number gate', () => {
  it('says what is needed and why, with one field', () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Add your phone number' })).toBeInTheDocument();
    expect(screen.getByText(/Every SSMS account has a phone number/)).toBeInTheDocument();
    expect(phone()).toHaveAttribute('type', 'tel');
    expect(phone()).toHaveAttribute('autocomplete', 'tel');
    expect(phone()).toHaveAttribute('aria-required', 'true');
    expect(screen.getByText('A Rwandan mobile number, for example 0788123456.')).toBeInTheDocument();
    expect(screen.queryByText(/can see it/)).not.toBeInTheDocument();
  });

  it('saves the number and hands the new account to the app', async () => {
    open();
    fireEvent.change(phone(), { target: { value: ' 0788 123 456 ' } });
    save();
    await waitFor(() => expect(api.updateProfile).toHaveBeenCalledWith({ phone: '0788 123 456' }));
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalledWith(expect.objectContaining({ phone: '+250788123456', phoneRequired: false })));
  });

  it.each(['', '   '])('does not ask the server for an empty number (%j), and says so beside the field', async (empty) => {
    open();
    fireEvent.change(phone(), { target: { value: empty } });
    save();
    const message = await screen.findByText('Please enter your phone number.');
    expect(message).toHaveAttribute('role', 'alert');
    expect(phone()).toHaveAttribute('aria-invalid', 'true');
    expect(api.updateProfile).not.toHaveBeenCalled();
    fireEvent.change(phone(), { target: { value: '0788' } });
    expect(screen.queryByText('Please enter your phone number.')).not.toBeInTheDocument();
  });

  it('shows a number that is not a Rwandan mobile beside the field and keeps what was typed', async () => {
    api.updateProfile.mockRejectedValue(refused('invalid_phone', 'phone', 'Enter a Rwandan mobile number, for example 0788123456.'));
    open();
    fireEvent.change(phone(), { target: { value: '12345' } });
    save();
    expect(await screen.findByText('Enter a Rwandan mobile number, for example 0788123456.')).toHaveAttribute('role', 'alert');
    expect(phone()).toHaveValue('12345');
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it('shows a number that someone else holds beside the field', async () => {
    api.updateProfile.mockRejectedValue(refused('phone_taken', 'phone', TAKEN));
    open();
    fireEvent.change(phone(), { target: { value: '0788 123 456' } });
    save();
    expect(await screen.findByText(TAKEN)).toBeInTheDocument();
    expect(phone()).toHaveAttribute('aria-invalid', 'true');
  });

  it('writes the refusal in the language of the screen, not the language of the answer', async () => {
    localStorage.setItem('ssms_locale', 'fr');
    api.updateProfile.mockRejectedValue(refused('phone_taken', 'phone', TAKEN));
    open();
    fireEvent.change(screen.getByLabelText('Numéro de téléphone'), { target: { value: '0788 123 456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer et continuer' }));
    expect(await screen.findByText(/Ce numéro de téléphone est déjà utilisé/)).toBeInTheDocument();
  });

  it('lets the person sign out instead', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(auth.logout).toHaveBeenCalled();
  });

  it('is written in Kinyarwanda with no English left on it', () => {
    localStorage.setItem('ssms_locale', 'rw');
    const { container } = open();
    expect(container.textContent).not.toMatch(/Add your phone number|Save and continue|Sign out|Every SSMS account/);
  });
});
