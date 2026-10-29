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

  describe('an account whose email is not verified', () => {
    const tryToSignIn = async () => {
      api.login.mockRejectedValue(apiError('email_not_verified'));
      open();
      fill('Email address', 'a@b.rw');
      fill('Password', 'Secret123');
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      return screen.findByText(/Your email address is not verified yet/);
    };

    it('stays on the page and says so, with the values still in the boxes', async () => {
      await tryToSignIn();
      expect(screen.queryByTestId('where')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Email address')).toHaveValue('a@b.rw');
      expect(screen.getByLabelText('Password')).toHaveValue('Secret123');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('offers a new link and sends it to the address typed', async () => {
      api.resendVerification.mockResolvedValue({});
      await tryToSignIn();
      fireEvent.click(screen.getByRole('button', { name: 'Send a new link' }));
      await waitFor(() => expect(api.resendVerification).toHaveBeenCalledWith('a@b.rw'));
      expect(await screen.findByText(/a new link is on its way/)).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Send a new link' })).not.toBeInTheDocument();
    });

    it('says so, and keeps the button, when the link could not be sent', async () => {
      api.resendVerification.mockRejectedValue(apiError('x'));
      await tryToSignIn();
      fireEvent.click(screen.getByRole('button', { name: 'Send a new link' }));
      expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't send the link. Please try again.");
      expect(screen.getByRole('button', { name: 'Send a new link' })).toBeEnabled();
    });

    it('cannot send twice at once', async () => {
      api.resendVerification.mockReturnValue(new Promise(() => {}));
      await tryToSignIn();
      fireEvent.click(screen.getByRole('button', { name: 'Send a new link' }));
      expect(await screen.findByRole('button', { name: 'Sending' })).toBeDisabled();
      expect(api.resendVerification).toHaveBeenCalledTimes(1);
    });

    it('is forgotten when the email is changed, because it was about the old one', async () => {
      await tryToSignIn();
      fill('Email address', 'other@b.rw');
      expect(screen.queryByText(/Your email address is not verified yet/)).not.toBeInTheDocument();
    });

    it('is forgotten at the next attempt', async () => {
      await tryToSignIn();
      api.login.mockRejectedValue(apiError('Wrong email or password'));
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      expect(await screen.findByRole('alert')).toHaveTextContent('Wrong email or password');
      expect(screen.queryByText(/Your email address is not verified yet/)).not.toBeInTheDocument();
    });

    it('is not shown for any other failure', async () => {
      api.login.mockRejectedValue(apiError('Wrong email or password'));
      open();
      fill('Email address', 'a@b.rw');
      fill('Password', 'x');
      fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
      await screen.findByRole('alert');
      expect(screen.queryByText(/not verified yet/)).not.toBeInTheDocument();
    });

    it('is written in French', async () => {
      localStorage.setItem('ssms_locale', 'fr');
      api.login.mockRejectedValue(apiError('email_not_verified'));
      open();
      fill('Adresse e-mail', 'a@b.rw');
      fill('Mot de passe', 'Secret123');
      fireEvent.click(screen.getByRole('button', { name: 'Se connecter' }));
      expect(await screen.findByRole('button', { name: 'Envoyer un nouveau lien' })).toBeInTheDocument();
    });
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

  it('tells a farmer who just joined through an invitation that the account is ready', () => {
    sessionStorage.setItem('ssms_notice', 'account_ready');
    open();
    expect(screen.getByRole('status')).toHaveTextContent('Your account is ready. Sign in to continue.');
    expect(sessionStorage.getItem('ssms_notice')).toBeNull();
  });

  it('comes back to the invitation link after signing in', async () => {
    api.login.mockResolvedValue({ data: { data: { user: { role: 'FARMER' }, token: 'abc' } } });
    renderAt('/login?next=/join/tok123', <LoginPage />, '/login');
    fill('Email address', 'a@b.rw');
    fill('Password', 'Secret123');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/join/tok123'));
  });

  it.each(['https://evil.example/', '//evil.example', '/admin', '/join/../admin', 'join/tok'])('ignores a next address that is not an invitation link: %s', async (next) => {
    api.login.mockResolvedValue({ data: { data: { user: { role: 'FARMER' }, token: 'abc' } } });
    renderAt(`/login?next=${encodeURIComponent(next)}`, <LoginPage />, '/login');
    fill('Email address', 'a@b.rw');
    fill('Password', 'Secret123');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/farmer'));
  });

  it('shows the password on request', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'text');
  });
});

describe('Register page', () => {
  const open = () => renderAt('/register', <RegisterPage />, '/register');
  const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  const fillAll = (over: { password?: string; confirm?: string; terms?: boolean } = {}) => {
    const { password = 'Secret123', confirm = password, terms = true } = over;
    fill('Full name', 'Aline U');
    fill('Email address', 'aline@b.rw');
    fill('Password', password);
    fill('Confirm password', confirm);
    if (terms) fireEvent.click(screen.getByRole('checkbox', { name: /I agree to the/ }));
  };

  it('registers a farmer, says the terms were accepted, and opens the check email page', async () => {
    api.register.mockResolvedValue({ data: {} });
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Create account' })).toBeInTheDocument();
    fillAll();
    submit();
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/check-email?email=aline%40b.rw'));
    expect(api.register).toHaveBeenCalledWith({ name: 'Aline U', email: 'aline@b.rw', password: 'Secret123', acceptedTerms: true });
  });

  it('does not send a role, because the server decides it', async () => {
    api.register.mockResolvedValue({ data: {} });
    open();
    fillAll();
    submit();
    await waitFor(() => expect(api.register).toHaveBeenCalled());
    expect(api.register.mock.calls[0][0]).not.toHaveProperty('role');
  });

  it('has no note about roles and links to sign in', () => {
    const { container } = open();
    expect(container.querySelector('.l-auth__note')).toBeNull();
    expect(screen.queryByText(/farmer account|administrator/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login');
  });

  it('shows the password rules, which replace the old one line hint', () => {
    open();
    expect(screen.getByRole('list', { name: 'Your password needs' })).toBeInTheDocument();
    expect(screen.queryByText(/one uppercase letter and one digit/)).not.toBeInTheDocument();
  });

  it('does not ask the server when the password breaks a rule', async () => {
    open();
    fillAll({ password: 'secret' });
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Please choose a password that meets every rule.');
    expect(api.register).not.toHaveBeenCalled();
  });

  it('does not ask the server when the two passwords differ', async () => {
    open();
    fillAll({ confirm: 'Secret124' });
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('The two passwords do not match.');
    expect(api.register).not.toHaveBeenCalled();
  });

  it('does not ask the server until the terms are accepted', async () => {
    open();
    fillAll({ terms: false });
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Please tick the box to accept the terms.');
    expect(api.register).not.toHaveBeenCalled();
  });

  it('clears that message when the problem is put right and tried again', async () => {
    api.register.mockResolvedValue({ data: {} });
    open();
    fillAll({ terms: false });
    submit();
    await screen.findByRole('alert');
    fireEvent.click(screen.getByRole('checkbox', { name: /I agree to the/ }));
    submit();
    await waitFor(() => expect(api.register).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the server message when registration fails', async () => {
    api.register.mockRejectedValue(apiError('Email already registered'));
    open();
    fillAll();
    submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Email already registered');
  });

  it('is written in French', () => {
    localStorage.setItem('ssms_locale', 'fr');
    open();
    expect(screen.getByRole('heading', { level: 1, name: 'Créer un compte' })).toBeInTheDocument();
    expect(screen.getByLabelText('Nom complet')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Créer un compte' })).toBeInTheDocument();
  });

  it('is written in Kinyarwanda, with no English left on the form', () => {
    localStorage.setItem('ssms_locale', 'rw');
    const { container } = open();
    expect(container.textContent).not.toMatch(/Full name|Create account|Confirm password|Already have an account/);
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
  it('confirms the email but does not sign the person in', async () => {
    api.verifyEmail.mockResolvedValue({ data: { data: null } });
    renderAt('/verify-email?uid=u1&token=t1', <VerifyEmailPage />, '/verify-email');
    expect(await screen.findByRole('heading', { level: 1, name: 'Email verified!' })).toBeInTheDocument();
    expect(api.verifyEmail).toHaveBeenCalledWith({ uid: 'u1', token: 't1' });
    expect(login).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/login?verified=1');
  });

  it('takes the person to the sign in page a moment later', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      api.verifyEmail.mockResolvedValue({ data: { data: null } });
      renderAt('/verify-email?uid=u1&token=t1', <VerifyEmailPage />, '/verify-email');
      await screen.findByRole('heading', { level: 1, name: 'Email verified!' });
      await vi.advanceTimersByTimeAsync(2500);
      expect(screen.getByTestId('where')).toHaveTextContent('/login?verified=1');
    } finally {
      vi.useRealTimers();
    }
  });

  it('explains a bad link and offers a new one', async () => {
    renderAt('/verify-email', <VerifyEmailPage />, '/verify-email');
    expect(await screen.findByRole('heading', { level: 1, name: "We couldn't verify your email" })).toBeInTheDocument();
    expect(screen.getByText("This verification link isn't valid. Please request a new one.")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Request new link' })).toHaveAttribute('href', '/check-email');
  });
});
