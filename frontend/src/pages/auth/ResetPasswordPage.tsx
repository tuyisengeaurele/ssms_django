import { useState, FormEvent } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import { useApiError } from '../../hooks/useApiError';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { AuthAlert, AuthButton, AuthField, AuthShell } from '../../landing/auth/AuthShell';
import { passwordRules } from '../../landing/auth/NewAccountFields';

const RULE_LABELS = [['length', 'regRuleLength'], ['upper', 'regRuleUpper'], ['lower', 'regRuleLower'], ['digit', 'regRuleDigit']] as const;

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { success } = useToast();
  const { getErrorMessage } = useApiError();
  const { t } = useLanguage();

  const uid = searchParams.get('uid') ?? '';
  const token = searchParams.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const met = passwordRules(password);
  const allRulesPass = Object.values(met).every(Boolean);

  if (!uid || !token) {
    return (
      <AuthShell title={t('rpInvalidTitle')} subtitle={t('rpInvalidBody')}>
        <Link to="/forgot-password" className="l-auth__submit">
          {t('verifyEmailResendLink')}
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
      success(t('rpDone'));
      navigate('/login', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title={t('pfFieldNew')} subtitle={t('rpSubtitle')}>
      {error ? <AuthAlert>{error}</AuthAlert> : null}

      <form onSubmit={handleSubmit}>
        <AuthField
          id="password"
          label={t('pfFieldNew')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
        />

        <ul className="l-auth__rules" aria-label={t('regRulesTitle')}>
          {RULE_LABELS.map(([key, label]) => (
            <li key={key} className={met[key] ? 'is-met' : undefined}>
              {t(label)}
            </li>
          ))}
        </ul>

        <AuthButton loading={loading} loadingLabel={t('adMfaResetBusy')} disabled={!allRulesPass}>
          {t('rpSubmit')}
        </AuthButton>
      </form>

      <p className="l-auth__alt">
        {t('forgotRemember')}{' '}
        <Link className="l-auth__link" to="/login">
          {t('loginSignIn')}
        </Link>
      </p>
    </AuthShell>
  );
}
