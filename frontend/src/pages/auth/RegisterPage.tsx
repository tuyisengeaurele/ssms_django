import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import { useApiError } from '../../hooks/useApiError';
import { AuthAlert, AuthButton, AuthField, AuthShell } from '../../landing/auth/AuthShell';

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'FARMER' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { getErrorMessage } = useApiError();

  const set = (field: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authService.register(form);
      navigate(`/check-email?email=${encodeURIComponent(form.email)}`, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Only FARMER is available through public registration.
  // SUPERVISOR and ADMIN accounts are created by administrators only.
  return (
    <AuthShell title="Create account" subtitle="Fill in your details to get started.">
      {error ? <AuthAlert>{error}</AuthAlert> : null}

      <form onSubmit={handleSubmit}>
        <AuthField id="name" label="Full name" value={form.name} onChange={set('name')} placeholder="Your full name" autoComplete="name" required />
        <AuthField id="reg-email" label="Email address" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" autoComplete="email" required />
        <AuthField
          id="reg-password"
          label="Password"
          type="password"
          value={form.password}
          onChange={set('password')}
          autoComplete="new-password"
          hint="At least 8 characters, with one uppercase letter and one digit."
          required
        />

        <AuthButton loading={loading} loadingLabel="Creating account">
          Create account
        </AuthButton>
      </form>

      <p className="l-auth__alt">
        Already have an account?{' '}
        <Link className="l-auth__link" to="/login">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
