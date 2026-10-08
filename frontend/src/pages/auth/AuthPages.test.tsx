import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AxiosError } from 'axios';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LanguageProvider } from '../../context/LanguageContext';
import { ToastProvider } from '../../context/ToastContext';

const login = vi.hoisted(() => vi.fn());
const api = vi.hoisted(() => ({
  login: vi.fn(),
  register: vi.fn(),
  requestPasswordReset: vi.fn(),
  confirmPasswordReset: vi.fn(),
  resendVerification: vi.fn(),
  verifyEmail: vi.fn(),
}));

vi.mock('../../services/auth.service', () => ({ authService: api }));
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({ login }) }));

import CheckEmailPage from './CheckEmailPage';
import ForgotPasswordPage from './ForgotPasswordPage';
import LoginPage from './LoginPage';
import RegisterPage from './RegisterPage';
import ResetPasswordPage from './ResetPasswordPage';
import VerifyEmailPage from './VerifyEmailPage';

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}

function renderAt(path: string, page: JSX.Element, route: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <ToastProvider>
          <Routes>
            <Route path={route} element={page} />
            <Route path="*" element={<Where />} />
          </Routes>
        </ToastProvider>
      </LanguageProvider>
    </MemoryRouter>,
  );
}

function apiError(message: string) {
  return new AxiosError('failed', '400', undefined, undefined, {
    data: { message },
    status: 400,
    statusText: 'Bad Request',
    headers: {},
    config: {} as never,
  });
}

function fill(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
});

describe('Login page', () => {
  const open = () => renderAt('/login', <LoginPage />, '/login');

  it('asks for email and password and links to the other account pages', () => {
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Welcome back' })).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/forgot-password');
    expect(screen.getByRole('link', { name: 'Create account' })).toHaveAttribute('href', '/register');
    expect(screen.getByRole('link', { name: 'Skip to content' })).toBeInTheDocument();
  });

  it('signs in and opens the dashboard for the role', async () => {
    api.login.mockResolvedValue({ data: { data: { user: { role: 'SUPERVISOR' }, token: 'abc' } } });
    open();
    fill('Email address', 'a@b.rw');
    fill('Password', 'Secret123');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/supervisor'));
    expect(api.login).toHaveBeenCalledWith({ email: 'a@b.rw', password: 'Secret123' });
    expect(login).toHaveBeenCalledWith({ role: 'SUPERVISOR' }, 'abc');
  });

  it('shows the server message when sign in fails', async () => {
    api.login.mockRejectedValue(apiError('Wrong email or password'));
    open();
    fill('Email address', 'a@b.rw');
    fill('Password', 'nope');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password');
  });

  it('sends an unverified account to the check email page', async () => {
    api.login.mockRejectedValue(apiError('email_not_verified'));
    open();
    fill('Email address', 'a@b.rw');
    fill('Password', 'Secret123');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/check-email?email=a%40b.rw'));
  });

  it('explains why the person was sent back when their session ended', () => {
    sessionStorage.setItem('ssms_notice', 'session_ended');
    open();
    expect(screen.getByRole('status')).toHaveTextContent('Your session ended, so we signed you out. Please sign in again.');
    expect(sessionStorage.getItem('ssms_notice')).toBeNull();
  });

  it('shows no notice on a normal visit', () => {
    open();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the password on request', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
  });
});

describe('Register page', () => {
  const open = () => renderAt('/register', <RegisterPage />, '/register');

  it('registers a farmer and opens the check email page', async () => {
    api.register.mockResolvedValue({ data: {} });
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Create account' })).toBeInTheDocument();
    fill('Full name', 'Aline U');
    fill('Email address', 'aline@b.rw');
    fill('Password', 'Secret123');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/check-email?email=aline%40b.rw'));
    expect(api.register).toHaveBeenCalledWith({ name: 'Aline U', email: 'aline@b.rw', password: 'Secret123', role: 'FARMER' });
  });

  it('has no note about roles and links to sign in', () => {
    const { container } = open();
    expect(container.querySelector('.l-auth__note')).toBeNull();
    expect(screen.queryByText(/farmer account|administrator/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('shows the server message when registration fails', async () => {
    api.register.mockRejectedValue(apiError('Email already registered'));
    open();
    fill('Full name', 'A');
    fill('Email address', 'a@b.rw');
    fill('Password', 'Secret123');
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Email already registered');
  });
});

describe('Forgot password page', () => {
  it('sends the link and confirms in the same place', async () => {
    api.requestPasswordReset.mockResolvedValue({});
    renderAt('/forgot-password', <ForgotPasswordPage />, '/forgot-password');
    fill('Email address', 'a@b.rw');
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Check your inbox' })).toBeInTheDocument();
    expect(api.requestPasswordReset).toHaveBeenCalledWith({ email: 'a@b.rw' });
    expect(screen.getByText('a@b.rw')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Back to login/ })).toHaveAttribute('href', '/login');
  });
});

describe('Reset password page', () => {
  it('explains an invalid link and offers a new one', () => {
    renderAt('/reset-password', <ResetPasswordPage />, '/reset-password');
    expect(screen.getByRole('heading', { level: 1, name: 'Invalid reset link' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request new link' })).toHaveAttribute('href', '/forgot-password');
  });

  it('ticks off the password rules and keeps the button off until all pass', () => {
    renderAt('/reset-password?uid=u1&token=t1', <ResetPasswordPage />, '/reset-password');
    const button = screen.getByRole('button', { name: 'Reset password' });
    expect(button).toBeDisabled();
    fill('New password', 'abc');
    expect(screen.getByText('One number').closest('li')).not.toHaveClass('is-met');
    fill('New password', 'Secret123');
    expect(screen.getByText('One number').closest('li')).toHaveClass('is-met');
    expect(button).toBeEnabled();
  });

  it('saves the new password and returns to sign in', async () => {
    api.confirmPasswordReset.mockResolvedValue({});
    renderAt('/reset-password?uid=u1&token=t1', <ResetPasswordPage />, '/reset-password');
    fill('New password', 'Secret123');
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/login'));
    expect(api.confirmPasswordReset).toHaveBeenCalledWith({ uid: 'u1', token: 't1', newPassword: 'Secret123' });
  });
});

describe('Check email page', () => {
  it('shows the address and resends the link once', async () => {
    api.resendVerification.mockResolvedValue({});
    renderAt('/check-email?email=a%40b.rw', <CheckEmailPage />, '/check-email');
    expect(screen.getByRole('heading', { level: 1, name: 'Check your inbox' })).toBeInTheDocument();
    expect(screen.getByText('a@b.rw')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));
    expect(await screen.findByText(/Verification email resent/)).toBeInTheDocument();
    expect(api.resendVerification).toHaveBeenCalledWith('a@b.rw');
  });

  it('shows a message when the resend fails', async () => {
    api.resendVerification.mockRejectedValue(new Error('x'));
    renderAt('/check-email?email=a%40b.rw', <CheckEmailPage />, '/check-email');
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));
    expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't resend the email");
  });
});

describe('Verify email page', () => {
  it('confirms the email and signs the person in', async () => {
    api.verifyEmail.mockResolvedValue({ data: { data: { user: { role: 'FARMER' }, token: 'jwt' } } });
    renderAt('/verify-email?uid=u1&token=t1', <VerifyEmailPage />, '/verify-email');
    expect(await screen.findByRole('heading', { level: 1, name: 'Email verified!' })).toBeInTheDocument();
    expect(api.verifyEmail).toHaveBeenCalledWith({ uid: 'u1', token: 't1' });
    expect(login).toHaveBeenCalledWith({ role: 'FARMER' }, 'jwt');
  });

  it('explains a bad link and offers a new one', async () => {
    renderAt('/verify-email', <VerifyEmailPage />, '/verify-email');
    expect(await screen.findByRole('heading', { level: 1, name: "We couldn't verify your email" })).toBeInTheDocument();
    expect(screen.getByText("This verification link isn't valid. Please request a new one.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request new link' })).toHaveAttribute('href', '/check-email');
  });
});
