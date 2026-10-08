import { useState, FormEvent } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import { useApiError } from '../../hooks/useApiError';
import { useToast } from '../../context/ToastContext';
import { AuthAlert, AuthButton, AuthField, AuthShell } from '../../landing/auth/AuthShell';

const PASSWORD_RULES = [
  { test: (v: string) => v.length >= 8, label: 'At least 8 characters' },
  { test: (v: string) => /[A-Z]/.test(v), label: 'One uppercase letter' },
  { test: (v: string) => /[a-z]/.test(v), label: 'One lowercase letter' },
  { test: (v: string) => /\d/.test(v), label: 'One number' },
];

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { success } = useToast();
  const { getErrorMessage } = useApiError();

  const uid = searchParams.get('uid') ?? '';
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const allRulesPass = PASSWORD_RULES.every((r) => r.test(password));

  if (!uid || !token) {
    return (
      <AuthShell title="Invalid reset link" subtitle="This password reset link is invalid or has expired.">
        <Link to="/forgot-password" className="l-auth__submit">
          Request new link
        </Link>
      </AuthShell>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!allRulesPass) return;
    setError('');
    setLoading(true);
    try {
      await authService.confirmPasswordReset({ uid, token, newPassword: password });
      success('Your password is updated. You can sign in now.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="New password" subtitle="Choose a strong password to secure your account.">
      {error ? <AuthAlert>{error}</AuthAlert> : null}

      <form onSubmit={handleSubmit}>
        <AuthField
          id="password"
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />

        <ul className="l-auth__rules" aria-label="Password rules">
          {PASSWORD_RULES.map((rule) => (
            <li key={rule.label} className={rule.test(password) ? 'is-met' : undefined}>
              {rule.label}
            </li>
          ))}
        </ul>

        <AuthButton loading={loading} loadingLabel="Resetting" disabled={!allRulesPass}>
          Reset password
        </AuthButton>
      </form>

      <p className="l-auth__alt">
        Remembered it?{' '}
        <Link className="l-auth__link" to="/login">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
