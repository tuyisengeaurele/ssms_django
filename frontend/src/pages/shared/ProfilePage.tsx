import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { authService } from '../../services/auth.service';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { LOCALE_LABELS, Locale } from '../../i18n/translations';

const ROLE_META: Record<string, { label: string; color: string; bg: string }> = {
  FARMER:     { label: 'Farmer',     color: '#16a34a', bg: '#dcfce7' },
  SUPERVISOR: { label: 'Supervisor', color: '#2563eb', bg: '#dbeafe' },
  ADMIN:      { label: 'Admin',      color: '#d97706', bg: '#fef3c7' },
};

export default function ProfilePage() {
  const { user, refreshUser, updateUser } = useAuth();
  const { success, error: showError } = useToast();
  const { getErrorMessage } = useApiError();
  const { locale, setLocale } = useLanguage();

  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);

  const [showPwForm, setShowPwForm]     = useState(false);
  const [currentPw, setCurrentPw]       = useState('');
  const [newPw, setNewPw]               = useState('');
  const [confirmPw, setConfirmPw]       = useState('');
  const [changingPw, setChangingPw]     = useState(false);

  // Refresh user data from server so cooperative/name is always up to date
  useEffect(() => { refreshUser(); }, []);

  // Sync name field if refreshUser updates user
  useEffect(() => {
    if (user?.name) setName(user.name);
  }, [user?.name]);

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : 'U';

  const roleMeta = ROLE_META[user?.role ?? ''] ?? { label: user?.role ?? '', color: '#6b7280', bg: '#f3f4f6' };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await authService.updateProfile({ name });
      updateUser(res.data.data);
      success('Profile updated successfully.');
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setChangingPw(true);
    try {
      await authService.changePassword({ currentPassword: currentPw, newPassword: newPw, confirmPassword: confirmPw });
      success('Password changed successfully.');
      setShowPwForm(false);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setChangingPw(false);
    }
  };

  const joinedDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : '—';

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">My Profile</h1>
          <p className="page-subtitle">Manage your account information</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1.5rem', maxWidth: 860, alignItems: 'start' }}>

        {/* Left — avatar card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="card" style={{ textAlign: 'center', padding: '2rem 1.5rem' }}>
            {/* Avatar */}
            <div style={{
              width: 80, height: 80, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--brand-600), var(--brand-400))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '1.75rem', fontWeight: 800, color: '#fff',
              margin: '0 auto 1rem', letterSpacing: '-0.02em',
              boxShadow: '0 4px 16px rgba(45,106,79,0.3)',
            }}>
              {initials}
            </div>

            <h2 style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--text)', marginBottom: '0.25rem' }}>
              {user?.name}
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-faint)', marginBottom: '0.875rem' }}>
              {user?.email}
            </p>

            {/* Role badge */}
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
              padding: '0.3rem 0.75rem', borderRadius: '9999px',
              fontSize: '0.72rem', fontWeight: 700,
              background: roleMeta.bg, color: roleMeta.color,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: roleMeta.color }} />
              {roleMeta.label}
            </span>

            <div style={{ marginTop: '1.5rem', paddingTop: '1rem', borderTop: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>Member since</span>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-2)' }}>{joinedDate}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>Account ID</span>
                  <span style={{ fontFamily: 'monospace', fontSize: '0.7rem', background: 'var(--gray-100)', padding: '0.1rem 0.4rem', borderRadius: 4, color: 'var(--text-2)' }}>
                    {user?.id?.slice(-8).toUpperCase() ?? '—'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>Cooperative</span>
                  {user?.cooperativeName ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.7rem', fontWeight: 600, color: '#7c3aed', background: '#f3e8ff', padding: '0.1rem 0.45rem', borderRadius: '9999px' }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                      {user.cooperativeName}
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>Not assigned</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Right — edit form */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="card">
            <h3 style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '1.5rem' }}>Account Information</h3>

            <form onSubmit={handleSave}>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <div className="input-wrapper">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="input-icon-left" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="form-input has-left"
                    placeholder="Your full name"
                    required
                    maxLength={100}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Email Address</label>
                <div className="input-wrapper">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="input-icon-left" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                  </svg>
                  <input
                    type="email"
                    value={user?.email ?? ''}
                    className="form-input has-left"
                    readOnly
                    style={{ background: 'var(--gray-50)', cursor: 'not-allowed', color: 'var(--text-muted)' }}
                  />
                </div>
                <span className="form-hint">Email cannot be changed. Contact admin if needed.</span>
              </div>

              <div className="form-group">
                <label className="form-label">Role</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.875rem', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: roleMeta.color }} />
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>{roleMeta.label}</span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-faint)' }}>Assigned by admin</span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Cooperative</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.55rem 0.875rem', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                  </svg>
                  <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 500 }}>
                    {user?.cooperativeName ?? 'Not assigned to a cooperative'}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-faint)' }}>Managed by admin</span>
                </div>
                {!user?.cooperativeId && (
                  <span className="form-hint">Contact your administrator to be assigned to a cooperative.</span>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                <button type="submit" className="btn btn-primary" disabled={saving || name === user?.name}>
                  {saving ? <><span className="spinner" />Saving…</> : (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                      Save changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Security card */}
          <div className="card" style={{ marginTop: '1rem' }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem' }}>Security</h3>

            <div style={{ padding: '0.75rem 0', borderBottom: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>Password</p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: '0.1rem' }}>
                    {showPwForm ? 'Enter your current and new password below' : 'Click to update your password'}
                  </p>
                </div>
                <button
                  className={showPwForm ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
                  onClick={() => { setShowPwForm(v => !v); setCurrentPw(''); setNewPw(''); setConfirmPw(''); }}
                >
                  {showPwForm ? 'Cancel' : 'Change password'}
                </button>
              </div>

              {showPwForm && (
                <form onSubmit={handleChangePassword} style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Current password</label>
                    <input type="password" className="form-input" value={currentPw} onChange={e => setCurrentPw(e.target.value)} required placeholder="Your current password" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">New password</label>
                    <input type="password" className="form-input" value={newPw} onChange={e => setNewPw(e.target.value)} required placeholder="Min 8 chars, upper + lower + digit" />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label">Confirm new password</label>
                    <input type="password" className="form-input" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} required placeholder="Repeat new password" />
                  </div>
                  <button type="submit" className="btn btn-primary" disabled={changingPw} style={{ alignSelf: 'flex-start' }}>
                    {changingPw ? <><span className="spinner" />Updating…</> : 'Update password'}
                  </button>
                </form>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.75rem' }}>
              <div>
                <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)' }}>Session</p>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-faint)', marginTop: '0.1rem' }}>JWT token — active until expiry</p>
              </div>
              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.2rem 0.6rem', borderRadius: '9999px', background: '#f0fdf4', color: '#16a34a' }}>
                Active
              </span>
            </div>
          </div>

          {/* Language selector card */}
          <div className="card" style={{ marginTop: '1rem' }}>
            <h3 style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '1rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                Language / Langue / Ururimi
              </span>
            </h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-faint)', marginBottom: '0.875rem' }}>
              Choose the interface language. Your preference is saved in this browser.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {(Object.entries(LOCALE_LABELS) as [Locale, string][]).map(([code, label]) => (
                <button
                  key={code}
                  onClick={() => setLocale(code)}
                  className={locale === code ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                  style={{ minWidth: 110 }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
