import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { alertService } from '../../services/alert.service';
import { contactsService } from '../../services/contacts.service';
import { AlertLog, AlertType, ContactMessage } from '../../types';
import Modal from '../ui/Modal';

const BREADCRUMB_MAP: Record<string, string> = {
  farmer: 'Dashboard', supervisor: 'Overview', admin: 'Admin',
  farms: 'Farms', batches: 'Batches', detections: 'Detections',
  reports: 'Reports', alerts: 'Alerts', users: 'Users',
  new: 'New', detect: 'Detection', profile: 'Profile',
  contacts: 'Messages', devices: 'Devices', harvests: 'Harvests',
};

const ALERT_TYPE_COLOR: Record<AlertType, string> = {
  TEMPERATURE:  '#d97706',
  HUMIDITY:     '#2563eb',
  DISEASE:      '#dc2626',
  STAGE_CHANGE: '#7c3aed',
  SYSTEM:       '#4b5563',
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function Breadcrumb() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);
  const crumbs = segments.map((seg, i) => {
    const path  = '/' + segments.slice(0, i + 1).join('/');
    const label = BREADCRUMB_MAP[seg] ?? (seg.length > 14 ? seg.slice(0, 10) + '…' : seg);
    return { path, label, isLast: i === segments.length - 1 };
  });
  if (crumbs.length <= 1) return null;
  return (
    <nav style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.78rem', color: 'var(--text-faint)' }}>
      {crumbs.map((c, i) => (
        <span key={c.path} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          {i > 0 && <span style={{ opacity: 0.35, fontSize: '0.7rem' }}>/</span>}
          {c.isLast
            ? <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>{c.label}</span>
            : <Link to={c.path} style={{ color: 'var(--text-faint)', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-faint)')}
              >{c.label}</Link>
          }
        </span>
      ))}
    </nav>
  );
}

interface TopBarProps {
  onMenuToggle: () => void;
  alertCount?: number;
}

// ── Tab-style notification dropdown ──────────────────────────────────────────

interface NotifDropdownProps {
  isAdmin: boolean;
  alertCount: number;
  onClose: () => void;
}

function NotifDropdown({ isAdmin, alertCount, onClose }: NotifDropdownProps) {
  const [tab, setTab]             = useState<'alerts' | 'messages'>('alerts');
  const [alerts, setAlerts]       = useState<AlertLog[]>([]);
  const [messages, setMessages]   = useState<ContactMessage[]>([]);
  const [msgCount, setMsgCount]   = useState(0);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    const loads: Promise<void>[] = [
      alertService.getAll()
        .then(r => setAlerts(r.data.data.slice(0, 5)))
        .catch(() => {}),
    ];
    if (isAdmin) {
      loads.push(
        contactsService.getUnread()
          .then(r => {
            setMessages(r.data.data.messages);
            setMsgCount(r.data.data.count);
          })
          .catch(() => {}),
      );
    }
    Promise.allSettled(loads).finally(() => setLoading(false));
  }, [isAdmin]);

  const totalBadge = alertCount + msgCount;

  // ── tab button style ──────────────────────────────────────────────────────
  const tabStyle = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '0.45rem 0',
    border: 'none',
    background: 'none',
    fontSize: '0.76rem',
    fontWeight: active ? 700 : 500,
    color: active ? 'var(--primary)' : 'var(--text-faint)',
    borderBottom: active ? '2px solid var(--primary)' : '2px solid transparent',
    cursor: 'pointer',
    transition: 'all 0.15s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.35rem',
  });

  return (
    <div className="topbar-dropdown" style={{ width: 340, right: 0, left: 'auto' }}>

      {/* Header */}
      <div style={{ padding: '0.625rem 0.875rem 0', borderBottom: '1px solid var(--border-light)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
          <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)' }}>Notifications</p>
          {totalBadge > 0 && (
            <span style={{ fontSize: '0.62rem', fontWeight: 700, background: 'var(--danger)', color: '#fff', padding: '0.1rem 0.45rem', borderRadius: '9999px' }}>
              {totalBadge} new
            </span>
          )}
        </div>

        {/* Tabs (only shown for admin) */}
        {isAdmin && (
          <div style={{ display: 'flex', gap: 0, marginTop: '0.25rem' }}>
            <button style={tabStyle(tab === 'alerts')} onClick={() => setTab('alerts')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              Alerts
              {alertCount > 0 && (
                <span style={{ background: '#dc2626', color: '#fff', fontSize: '0.6rem', fontWeight: 700, padding: '0 0.3rem', borderRadius: '9999px', lineHeight: '1.4' }}>
                  {alertCount}
                </span>
              )}
            </button>
            <button style={tabStyle(tab === 'messages')} onClick={() => setTab('messages')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
              </svg>
              Messages
              {msgCount > 0 && (
                <span style={{ background: '#2563eb', color: '#fff', fontSize: '0.6rem', fontWeight: 700, padding: '0 0.3rem', borderRadius: '9999px', lineHeight: '1.4' }}>
                  {msgCount}
                </span>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-faint)', fontSize: '0.8rem' }}>
            <span className="spinner" style={{ display: 'inline-block', marginRight: '0.4rem' }} />Loading…
          </div>
        ) : tab === 'alerts' ? (
          alerts.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-faint)', fontSize: '0.8rem' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ marginBottom: '0.4rem', opacity: 0.4, display: 'block', margin: '0 auto 0.4rem' }}>
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              No alerts
            </div>
          ) : (
            alerts.map(a => {
              const col = ALERT_TYPE_COLOR[a.type] ?? '#6b7280';
              return (
                <div key={a.id} style={{ padding: '0.625rem 0.875rem', borderBottom: '1px solid var(--border-light)', opacity: a.isRead ? 0.55 : 1, display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: col, flexShrink: 0, marginTop: '0.3rem' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '0.75rem', fontWeight: a.isRead ? 400 : 600, color: 'var(--text)', marginBottom: '0.12rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.message}
                    </p>
                    <p style={{ fontSize: '0.67rem', color: 'var(--text-faint)' }}>
                      {a.type.replace('_', ' ')} · {timeAgo(a.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })
          )
        ) : (
          /* Messages tab — admin only */
          messages.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-faint)', fontSize: '0.8rem' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ display: 'block', margin: '0 auto 0.4rem', opacity: 0.4 }}>
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
              </svg>
              No unread messages
            </div>
          ) : (
            messages.map(m => (
              <Link
                key={m.id}
                to="/admin/contacts"
                onClick={onClose}
                style={{ display: 'flex', gap: '0.625rem', alignItems: 'flex-start', padding: '0.625rem 0.875rem', borderBottom: '1px solid var(--border-light)', textDecoration: 'none', color: 'inherit' }}
              >
                {/* Unread dot */}
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2563eb', flexShrink: 0, marginTop: '0.3rem' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.12rem' }}>
                    <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {m.subject}
                    </p>
                    <span style={{ fontSize: '0.6rem', fontWeight: 700, background: '#eff6ff', color: '#2563eb', padding: '0.05rem 0.35rem', borderRadius: 4, flexShrink: 0 }}>
                      New
                    </span>
                  </div>
                  <p style={{ fontSize: '0.67rem', color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name} · {timeAgo(m.createdAt)}
                  </p>
                </div>
              </Link>
            ))
          )
        )}
      </div>

      {/* Footer */}
      <div style={{ padding: '0.5rem 0.875rem', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Link
          to={tab === 'messages' ? '/admin/contacts' : '/alerts'}
          onClick={onClose}
          style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
        >
          {tab === 'messages' ? 'View all messages' : 'View all alerts'}
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </Link>
      </div>
    </div>
  );
}

// ── TopBar ────────────────────────────────────────────────────────────────────

export default function TopBar({ onMenuToggle, alertCount = 0 }: TopBarProps) {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  const [dropdownOpen, setDropdownOpen]     = useState(false);
  const [notifOpen, setNotifOpen]           = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const dropRef  = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current  && !dropRef.current.contains(e.target as Node))  setDropdownOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSignOut   = () => { setDropdownOpen(false); setShowLogoutConfirm(true); };
  const confirmSignOut  = () => { setShowLogoutConfirm(false); logout(); navigate('/login', { replace: true }); };

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : 'U';

  return (
    <>
      <Modal
        open={showLogoutConfirm}
        onClose={() => setShowLogoutConfirm(false)}
        title={t('btnSignOut')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowLogoutConfirm(false)}>{t('btnCancel')}</button>
            <button className="btn btn-danger"    onClick={confirmSignOut}>{t('btnSignOut')}</button>
          </>
        }
      >
        <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Are you sure you want to sign out?
        </p>
      </Modal>

      <header className="app-topbar">
        {/* Hamburger */}
        <button className="topbar-toggle" onClick={onMenuToggle} aria-label="Toggle menu">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6"  x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>

        <Breadcrumb />
        <div className="topbar-spacer" />

        <div className="topbar-actions">

          {/* ── Notification bell ── */}
          <div ref={notifRef} style={{ position: 'relative' }}>
            <button
              className="topbar-icon-btn"
              onClick={() => setNotifOpen(o => !o)}
              title="Notifications"
              style={{ background: 'none', border: 'none', cursor: 'pointer', position: 'relative' }}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {alertCount > 0 && <span className="topbar-notif-dot" />}
            </button>

            {notifOpen && (
              <NotifDropdown
                isAdmin={isAdmin}
                alertCount={alertCount}
                onClose={() => setNotifOpen(false)}
              />
            )}
          </div>

          <div className="topbar-divider" />

          {/* ── User dropdown ── */}
          <div ref={dropRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setDropdownOpen(o => !o)}
              className="topbar-user"
              style={{ background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <div className="topbar-avatar">{initials}</div>
              <div className="topbar-user-info">
                <div className="t-name">{user?.name}</div>
                <div className="t-role">{user?.role}</div>
              </div>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ color: 'var(--text-faint)', marginLeft: '0.2rem', flexShrink: 0 }}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {dropdownOpen && (
              <div className="topbar-dropdown">
                {/* User header */}
                <div style={{ padding: '0.75rem 0.875rem 0.625rem', borderBottom: '1px solid var(--border-light)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    <div className="topbar-avatar" style={{ width: 34, height: 34, fontSize: '0.82rem', flexShrink: 0 }}>{initials}</div>
                    <div>
                      <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)' }}>{user?.name}</p>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-faint)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{user?.role}</p>
                    </div>
                  </div>
                </div>

                <div style={{ padding: '0.375rem' }}>
                  <Link to="/profile" onClick={() => setDropdownOpen(false)} className="topbar-dropdown-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                    </svg>
                    {t('btnMyProfile')}
                  </Link>

                  <Link to="/alerts" onClick={() => setDropdownOpen(false)} className="topbar-dropdown-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    {t('navAlerts')}
                    {alertCount > 0 && (
                      <span style={{ marginLeft: 'auto', background: 'var(--danger)', color: '#fff', fontSize: '0.62rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '9999px' }}>
                        {alertCount}
                      </span>
                    )}
                  </Link>

                  <Link to="/detections/reports" onClick={() => setDropdownOpen(false)} className="topbar-dropdown-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 20V10M12 20V4M6 20v-6" />
                    </svg>
                    {t('navReports')}
                  </Link>

                  <Link to="/farms" onClick={() => setDropdownOpen(false)} className="topbar-dropdown-item">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                      <polyline points="9 22 9 12 15 12 15 22" />
                    </svg>
                    {t('navMyFarms')}
                  </Link>

                  {isAdmin && (
                    <Link to="/admin/contacts" onClick={() => setDropdownOpen(false)} className="topbar-dropdown-item">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                      </svg>
                      {t('navMessages')}
                    </Link>
                  )}

                  <div style={{ height: 1, background: 'var(--border-light)', margin: '0.375rem 0' }} />

                  <button
                    onClick={handleSignOut}
                    className="topbar-dropdown-item topbar-dropdown-danger"
                    style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    {t('btnSignOut')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
