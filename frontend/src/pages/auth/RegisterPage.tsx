import { useEffect, useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { AuthAlert, AuthButton, AuthField, AuthShell } from '../../landing/auth/AuthShell';
import GoogleButton from '../../landing/auth/GoogleButton';
import NewAccountFields, { newAccountProblem } from '../../landing/auth/NewAccountFields';
import { warmUp } from '../../services/warmUp';
import { phoneFieldError } from '../../utils/phone';

export default function RegisterPage() {
  // The person is about to press Create account. If the free API is asleep, this starts the wake while they type.
  useEffect(() => warmUp(), []);
  const [form, setForm] = useState({ name: '', email: '', phone: '' });
  const [secret, setSecret] = useState({ password: '', confirm: '', accepted: false });
  const [error, setError] = useState('');
  // About the number only: written beside its field, and gone as soon as the person types again.
  const [phoneError, setPhoneError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { getErrorMessage } = useApiError();
  const { t } = useLanguage();

  const set = (field: 'name' | 'email' | 'phone') => (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }));
    if (field === 'phone') setPhoneError('');
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Said here, in plain words, so the person is not sent to the server to be told what the page already knows.
    const phone = form.phone.trim();
    if (!phone) {
      setPhoneError(t('erPhoneRequired'));
      return;
    }
    const problem = newAccountProblem(secret);
    if (problem) {
      setError(t(problem));
      return;
    }
    setError('');
    setPhoneError('');
    setLoading(true);
    try {
      // The server decides the role, so none is sent. Public sign up always makes a farmer.
      await authService.register({ name: form.name, email: form.email, password: secret.password, acceptedTerms: true, phone });
      navigate(`/check-email?email=${encodeURIComponent(form.email)}`, { replace: true });
    } catch (err) {
      const aboutThePhone = phoneFieldError(err, t);
      if (aboutThePhone) setPhoneError(aboutThePhone);
      else setError(getErrorMessage(err));
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
        <AuthField
          id="reg-phone"
          label={t('pnLabel')}
          hint={t('pnHint')}
          error={phoneError}
          aria-required="true"
          type="tel"
          inputMode="tel"
          value={form.phone}
          onChange={set('phone')}
          placeholder="0788 123 456"
          autoComplete="tel"
        />
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
