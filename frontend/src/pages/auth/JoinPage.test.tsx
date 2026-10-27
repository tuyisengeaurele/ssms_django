import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AxiosError } from 'axios';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';
import { setReducedMotion } from '../../test/setup';

const auth = vi.hoisted(() => ({
  value: { user: null, isAuthenticated: false, isLoading: false } as { user: object | null; isAuthenticated: boolean; isLoading: boolean },
}));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => auth.value }));

const api = vi.hoisted(() => ({ get: vi.fn(), accept: vi.fn(), register: vi.fn() }));
vi.mock('../../services/team.service', () => ({ invitationService: { get: api.get, accept: api.accept } }));
vi.mock('../../services/auth.service', () => ({ authService: { register: api.register } }));

import JoinPage from './JoinPage';

const details = { cooperativeName: 'Gatsibo Silk', invitedByName: 'Claire Uwimana', email: '' };

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

const open = () => render(
  <MemoryRouter initialEntries={['/join/tok123']}>
    <LanguageProvider>
      <ToastProvider>
        <Routes>
          <Route path="/join/:token" element={<JoinPage />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </ToastProvider>
    </LanguageProvider>
  </MemoryRouter>,
);

beforeAll(async () => {
  await import('../../context/ToastList');
}, 30000);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  setReducedMotion(true);
  auth.value = { user: null, isAuthenticated: false, isLoading: false };
  api.get.mockResolvedValue({ data: { data: details } });
});

const farmer = (over: object = {}) => ({ id: 'u1', name: 'Aline Uwase', email: 'aline@example.rw', role: 'FARMER', cooperativeName: null, ...over });

describe('Join page, signed out', () => {
  it('names the cooperative and who invited, and has one title', async () => {
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'Join Gatsibo Silk' })).toBeInTheDocument();
    expect(screen.getByText('Claire Uwimana invited you. Create your account to join.')).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('tok123');
  });

  it('says the same plain thing for every link that cannot be used', async () => {
    api.get.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status: 404, data: { message: 'This invitation is no longer valid.' } } as never));
    open();
    expect(await screen.findByRole('heading', { level: 1, name: 'This invitation is no longer valid.' })).toBeInTheDocument();
    expect(screen.getByText('Ask your supervisor for a new link.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it('registers through the link and asks to verify the email when the link carried no address', async () => {
    api.register.mockResolvedValue({ data: { data: { user: { isEmailVerified: false } } } });
    open();
    await screen.findByRole('heading', { level: 1, name: 'Join Gatsibo Silk' });
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Aline Uwase' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'aline@example.rw' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Zebra-Quartz-84' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account and join' }));
    await waitFor(() => expect(api.register).toHaveBeenCalledWith({ name: 'Aline Uwase', email: 'aline@example.rw', password: 'Zebra-Quartz-84', invitation: 'tok123' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/check-email?email=aline%40example.rw'));
  });

  it('goes straight to sign in when the link was sent to that address and so proves it', async () => {
    api.get.mockResolvedValue({ data: { data: { ...details, email: 'aline@example.rw' } } });
    api.register.mockResolvedValue({ data: { data: { user: { isEmailVerified: true } } } });
    open();
    const email = await screen.findByLabelText('Email address');
    expect(email).toHaveValue('aline@example.rw');
    expect(email).toHaveAttribute('readonly');
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Aline Uwase' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Zebra-Quartz-84' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account and join' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login'));
    expect(sessionStorage.getItem('ssms_notice')).toBe('account_ready');
  });

  it('shows what went wrong when the registration is refused', async () => {
    api.register.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status: 422, data: { message: 'x', errors: { email: ['An account with this email already exists.'] } } } as never));
    open();
    await screen.findByRole('heading', { level: 1, name: 'Join Gatsibo Silk' });
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Aline' } });
    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'aline@example.rw' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Zebra-Quartz-84' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account and join' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('An account with this email already exists.');
  });

  it('lets someone who already has an account sign in and come back to the link', async () => {
    open();
    const link = await screen.findByRole('link', { name: 'Sign in' });
    expect(link).toHaveAttribute('href', '/login?next=/join/tok123');
  });
});

describe('Join page, signed in', () => {
  const signIn = (user: object) => { auth.value = { user, isAuthenticated: true, isLoading: false }; };

  it('lets a farmer with no cooperative join in one step', async () => {
    signIn(farmer());
    api.accept.mockResolvedValue({ data: { data: null } });
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Join Gatsibo Silk' }));
    await waitFor(() => expect(api.accept).toHaveBeenCalledWith('tok123'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/farmer'));
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();
  });

  it('asks before taking a farmer out of the cooperative they are in', async () => {
    signIn(farmer({ cooperativeName: 'Nyamagabe Silk' }));
    api.accept.mockResolvedValue({ data: { data: null } });
    open();
    expect(await screen.findByText('You are in Nyamagabe Silk now. Joining Gatsibo Silk takes you out of it.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Join Gatsibo Silk' }));
    // An inline question, because this public page does not load the app's pop-up styles.
    const question = await screen.findByRole('group', { name: 'Leave Nyamagabe Silk and join Gatsibo Silk?' });
    expect(api.accept).not.toHaveBeenCalled();
    fireEvent.click(within(question).getByRole('button', { name: 'Yes, switch' }));
    await waitFor(() => expect(api.accept).toHaveBeenCalledWith('tok123'));
  });

  it('says so when the farmer is already in that cooperative', async () => {
    signIn(farmer({ cooperativeName: 'Gatsibo Silk' }));
    open();
    expect(await screen.findByText('You are already in this cooperative.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join Gatsibo Silk' })).not.toBeInTheDocument();
  });

  it('tells a supervisor or admin that only farmers join this way', async () => {
    signIn(farmer({ role: 'SUPERVISOR' }));
    open();
    expect(await screen.findByText('Only farmers can join a cooperative with a link.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Join Gatsibo Silk' })).not.toBeInTheDocument();
  });

  it('shows the server answer when the link was meant for another address', async () => {
    signIn(farmer());
    api.accept.mockRejectedValue(new AxiosError('x', 'ERR_BAD_REQUEST', undefined, undefined, { status: 403, data: { message: 'This invitation was sent to a different email address.' } } as never));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Join Gatsibo Silk' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('This invitation was sent to a different email address.');
  });
});
