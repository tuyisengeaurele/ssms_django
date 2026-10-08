import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { authService } from '../../services/auth.service';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { LOCALE_LABELS, Locale } from '../../i18n/translations';
import { ROLE_LABEL_KEY } from '../../components/layout/Sidebar';
import { initialsOf } from '../../components/ui/Avatar';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';

export default function ProfilePage() {
  const { user, refreshUser, updateUser } = useAuth();
  const { success, error: showError } = useToast();
  const { getErrorMessage } = useApiError();
  const { t, locale, setLocale } = useLanguage();

  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [changing, setChanging] = useState(false);

  // Fetch the latest details, so the cooperative and name are never stale.
  useEffect(() => {
    refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  const joined = user?.createdAt
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(user.createdAt))
    : '-';

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await authService.updateProfile({ name });
      updateUser(res.data.data);
      success(t('pfSaved'));
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const closePassword = () => {
    setShowPassword(false);
    setCurrent('');
    setNext('');
    setRepeat('');
    setPasswordError('');
  };

  const handlePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordError('');
    if (next !== repeat) {
      setPasswordError(t('pfMismatch'));
      return;
    }
    setChanging(true);
    try {
      await authService.changePassword({ currentPassword: current, newPassword: next, confirmPassword: repeat });
      success(t('pfPasswordChanged'));
      closePassword();
    } catch (err) {
      setPasswordError(getErrorMessage(err));
    } finally {
      setChanging(false);
    }
  };

  return (
    <div>
      <PageHeader title={t('ptProfile')} subtitle={t('pfSubtitle')} />

      <div className="profile-layout">
        <section className="panel identity" aria-label={t('pfAbout')}>
          <span className="identity-avatar" aria-hidden="true">{initialsOf(user?.name ?? '')}</span>
          <h2 className="identity-name">{user?.name}</h2>
          <p className="identity-email">{user?.email}</p>
          {user && <span className="badge badge-ink">{t(ROLE_LABEL_KEY[user.role])}</span>}

          <dl className="identity-facts">
            <div><dt>{t('pfSince')}</dt><dd>{joined}</dd></div>
            <div><dt>{t('pfAccountId')}</dt><dd className="cell-mono">{user?.id?.slice(-8).toUpperCase() ?? '-'}</dd></div>
            <div><dt>{t('pfCooperative')}</dt><dd>{user?.cooperativeName ?? t('pfNotAssigned')}</dd></div>
          </dl>
        </section>

        <div className="profile-stack">
          <Panel title={t('pfAccount')}>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label className="form-label" htmlFor="pf-name">{t('pfFieldName')}</label>
                <input id="pf-name" className="form-input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="pf-email">{t('pfFieldEmail')}</label>
                <input id="pf-email" className="form-input is-fixed" type="email" value={user?.email ?? ''} readOnly aria-describedby="pf-email-note" />
                <span id="pf-email-note" className="form-hint">{t('pfEmailNote')}</span>
              </div>

              <p className="form-hint profile-note">
                {t('pfRoleNote')}
                {!user?.cooperativeId && user?.role !== 'ADMIN' ? ` ${t('pfCoopHelp')}` : ''}
              </p>

              <button type="submit" className="btn btn-primary" disabled={saving || name === user?.name}>
                {saving ? <><span className="spinner" />{t('pfSaving')}</> : t('pfSave')}
              </button>
            </form>
          </Panel>

          <Panel
            title={t('pfSecurity')}
            note={t('pfSecurityHint')}
            flush={!showPassword}
            actions={
              showPassword ? undefined : (
                <button className="btn btn-secondary btn-sm" onClick={() => setShowPassword(true)}>{t('pfChangePassword')}</button>
              )
            }
          >
            {showPassword ? (
              <form onSubmit={handlePassword}>
                {passwordError && <div className="alert alert-error" role="alert">{passwordError}</div>}
                <div className="form-group">
                  <label className="form-label" htmlFor="pf-current">{t('pfFieldCurrent')}</label>
                  <input id="pf-current" type="password" className="form-input" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="pf-new">{t('pfFieldNew')}</label>
                  <input id="pf-new" type="password" className="form-input" value={next} onChange={(e) => setNext(e.target.value)} required autoComplete="new-password" aria-describedby="pf-new-hint" />
                  <span id="pf-new-hint" className="form-hint">{t('pfPasswordHint')}</span>
                </div>
                <div className="form-group">
                  <label className="form-label" htmlFor="pf-repeat">{t('pfFieldRepeat')}</label>
                  <input id="pf-repeat" type="password" className="form-input" value={repeat} onChange={(e) => setRepeat(e.target.value)} required autoComplete="new-password" />
                </div>
                <div className="profile-actions">
                  <button type="submit" className="btn btn-primary" disabled={changing}>
                    {changing ? <><span className="spinner" />{t('pfUpdating')}</> : t('pfUpdatePassword')}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={closePassword}>{t('btnCancel')}</button>
                </div>
              </form>
            ) : null}
          </Panel>

          <Panel title={t('pfLanguage')} note={t('pfLanguageHint')}>
            <div className="segmented" role="group" aria-label={t('pfLanguage')}>
              {(Object.entries(LOCALE_LABELS) as [Locale, string][]).map(([code, label]) => (
                <button key={code} type="button" className={locale === code ? 'is-on' : ''} aria-pressed={locale === code} onClick={() => setLocale(code)}>
                  {label}
                </button>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
