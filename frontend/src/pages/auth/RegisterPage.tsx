import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { AuthAlert, AuthButton, AuthField, AuthShell } from '../../landing/auth/AuthShell';
import GoogleButton from '../../landing/auth/GoogleButton';
import NewAccountFields, { newAccountProblem } from '../../landing/auth/NewAccountFields';

export default function RegisterPage() {
  const [form, setForm] = useState({ name: '', email: '' });
  const [secret, setSecret] = useState({ password: '', confirm: '', accepted: false });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { getErrorMessage } = useApiError();
  const { t } = useLanguage();

  const set = (field: 'name' | 'email') => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Said here, in plain words, so the person is not sent to the server to be told what the page already knows.
    const problem = newAccountProblem(secret);
    if (problem) {
      setError(t(problem));
      return;
    }
    setError('');
    setLoading(true);
    try {
      // The server decides the role, so none is sent. Public sign up always makes a farmer.
      await authService.register({ name: form.name, email: form.email, password: secret.password, acceptedTerms: true });
      navigate(`/check-email?email=${encodeURIComponent(form.email)}`, { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title={t('regTitle')} subtitle={t('regSubtitle')}>
      {error ? <AuthAlert>{error}</AuthAlert> : null}

      <form onSubmit={handleSubmit}>
        <AuthField id="name" label={t('regName')} value={form.name} onChange={set('name')} placeholder={t('regNamePlace')} autoComplete="name" required />
        <AuthField id="reg-email" label={t('loginEmailLabel')} type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" autoComplete="email" required />
        <NewAccountFields idPrefix="reg" {...secret} onChange={(patch) => setSecret((s) => ({ ...s, ...patch }))} />

        <AuthButton loading={loading} loadingLabel={t('regCreating')}>
          {t('regTitle')}
        </AuthButton>
      </form>

      <GoogleButton />

      <p className="l-auth__alt">
        {t('regHaveAccount')}{' '}
        <Link className="l-auth__link" to="/login">
          {t('loginSignIn')}
        </Link>
      </p>
    </AuthShell>
  );
}
