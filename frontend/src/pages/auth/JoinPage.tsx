import { FormEvent, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { authService } from '../../services/auth.service';
import { invitationService, InvitationDetails } from '../../services/team.service';
import { useApiError } from '../../hooks/useApiError';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { fill } from '../../utils/fill';
import { AuthAlert, AuthButton, AuthField, AuthShell } from '../../landing/auth/AuthShell';

/** The page behind an invitation link from a supervisor. Public, so it does not rely on the app's pop-up styles. */
export default function JoinPage() {
  const { token = '' } = useParams<{ token: string }>();
  const { t } = useLanguage();
  const { user, isAuthenticated } = useAuth();
  const { getErrorMessage } = useApiError();
  const navigate = useNavigate();

  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'invalid'>('loading');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    invitationService.get(token)
      .then((res) => {
        setInvitation(res.data.data);
        // A link made for one address can only be used with that address.
        setForm((f) => ({ ...f, email: res.data.data.email }));
        setState('ready');
      })
      .catch(() => setState('invalid'));
  }, [token]);

  if (state === 'loading') {
    return <AuthShell title={t('jnLoading')}><p className="l-auth__note" role="status">{t('jnLoadingBody')}</p></AuthShell>;
  }

  if (state === 'invalid' || !invitation) {
    return (
      <AuthShell title={t('jnInvalidTitle')} subtitle={t('jnInvalidBody')}>
        <p className="l-auth__alt">
          <Link className="l-auth__link" to="/">{t('jnHome')}</Link>
        </p>
      </AuthShell>
    );
  }

  const coop = invitation.cooperativeName;
  const title = fill(t('jnTitle'), { coop });

  const register = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const res = await authService.register({ name: form.name, email: form.email, password: form.password, invitation: token });
      if (res.data.data.user.isEmailVerified) {
        // The link went to this address, so there is nothing to verify.
        try { sessionStorage.setItem('ssms_notice', 'account_ready'); } catch { /* the notice is a courtesy */ }
        navigate('/login', { replace: true });
      } else {
        navigate(`/check-email?email=${encodeURIComponent(form.email)}`, { replace: true });
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setError('');
    setBusy(true);
    try {
      await invitationService.accept(token);
      navigate('/farmer', { replace: true });
    } catch (err) {
      setError(getErrorMessage(err));
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  };

  // ── signed in ──
  if (isAuthenticated && user) {
    if (user.role !== 'FARMER') {
      return (
        <AuthShell title={title} subtitle={fill(t('jnBy'), { name: invitation.invitedByName })}>
          <p className="l-auth__note">{t('jnOnlyFarmers')}</p>
          <p className="l-auth__alt"><Link className="l-auth__link" to="/">{t('jnToDashboard')}</Link></p>
        </AuthShell>
      );
    }
    if (user.cooperativeName === coop) {
      return (
        <AuthShell title={title} subtitle={fill(t('jnBy'), { name: invitation.invitedByName })}>
          <p className="l-auth__note">{t('jnAlready')}</p>
          <p className="l-auth__alt"><Link className="l-auth__link" to="/farmer">{t('jnToDashboard')}</Link></p>
        </AuthShell>
      );
    }
    const current = user.cooperativeName;
    return (
      <AuthShell title={title} subtitle={fill(t('jnBy'), { name: invitation.invitedByName })}>
        {error ? <AuthAlert>{error}</AuthAlert> : null}
        {current ? <p className="l-auth__note">{fill(t('jnSwitchWarn'), { current, coop })}</p> : null}
        {confirming && current ? (
          <section role="group" aria-label={fill(t('jnSwitchTitle'), { current, coop })} className="l-auth__ask">
            <p>{fill(t('jnSwitchTitle'), { current, coop })}</p>
            <div className="l-auth__actions">
              <AuthButton type="button" loading={busy} loadingLabel={t('jnJoining')} onClick={join}>{t('jnSwitchYes')}</AuthButton>
              <button type="button" className="l-btn l-btn--ghost" onClick={() => setConfirming(false)}>{t('btnCancel')}</button>
            </div>
          </section>
        ) : (
          <AuthButton type="button" loading={busy} loadingLabel={t('jnJoining')} onClick={current ? () => setConfirming(true) : join}>
            {fill(t('jnJoin'), { coop })}
          </AuthButton>
        )}
      </AuthShell>
    );
  }

  // ── signed out: make an account that joins ──
  return (
    <AuthShell title={title} subtitle={fill(t('jnByCreate'), { name: invitation.invitedByName })}>
      {error ? <AuthAlert>{error}</AuthAlert> : null}
      <form onSubmit={register}>
        <AuthField id="join-name" label={t('jnName')} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} autoComplete="name" required />
        <AuthField
          id="join-email"
          label={t('loginEmailLabel')}
          type="email"
          value={form.email}
          onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
          readOnly={!!invitation.email}
          autoComplete="email"
          required
        />
        <AuthField
          id="join-password"
          label={t('loginPasswordLabel')}
          type="password"
          value={form.password}
          onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          autoComplete="new-password"
          hint={t('jnPasswordHint')}
          required
        />
        <AuthButton loading={busy} loadingLabel={t('jnCreating')}>{t('jnCreate')}</AuthButton>
      </form>

      <p className="l-auth__alt">
        {t('jnHaveAccount')}{' '}
        <Link className="l-auth__link" to={`/login?next=/join/${token}`}>{t('loginSignIn')}</Link>
      </p>
    </AuthShell>
  );
}
