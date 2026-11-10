import { FormEvent, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import { authService } from '../../services/auth.service';
import { ROLE_LABEL_KEY } from '../../components/layout/Sidebar';
import { initialsOf } from '../../components/ui/Avatar';
import Panel from '../../components/ui/Panel';
import { dateFormat } from '../../utils/dateFormat';

/** Who the person is, and the one thing they can change about it: their name. */
export default function AccountSettings() {
  const { user, refreshUser, updateUser } = useAuth();
  const { success, error: showError } = useToast();
  const { getErrorMessage } = useApiError();
  const { t, locale } = useLanguage();

  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);

  // Fetch the latest details, so the cooperative and name are never stale.
  useEffect(() => {
    refreshUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  const joined = user?.createdAt
    ? dateFormat(locale, { dateStyle: 'medium' }).format(new Date(user.createdAt))
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

  return (
    <div className="profile-stack">
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
    </div>
  );
}
