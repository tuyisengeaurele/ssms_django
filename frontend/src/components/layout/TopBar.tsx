import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { alertService } from '../../services/alert.service';
import { AlertLog, AlertType } from '../../types';

const BREADCRUMB_MAP: Record<string, string> = {
  farmer:     'Dashboard',
  supervisor: 'Overview',
  admin:      'Admin',
  farms:      'Farms',
  batches:    'Batches',
  detections: 'Detections',
  reports:    'Reports',
  alerts:     'Alerts',
  users:      'Users',
  new:        'New',
  detect:     'Detection',
  profile:    'Profile',
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
    const isLast = i === segments.length - 1;
    return { path, label, isLast };
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

export default function TopBar({ onMenuToggle, alertCount = 0 }: TopBarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // User dropdown
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // Notification dropdown
  const [notifOpen, setNotifOpen]       = useState(false);
  const [notifAlerts, setNotifAlerts]   = useState<AlertLog[]>([]);
  const [notifLoading, setNotifLoading] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleNotifToggle = async () => {
    const opening = !notifOpen;
    setNotifOpen(opening);
    if (opening && notifAlerts.length === 0) {
      setNotifLoading(true);
      try {
        const res = await alertService.getAll();
        setNotifAlerts(res.data.data.slice(0, 5));
      } catch { /* silent */ } finally {
        setNotifLoading(false);
      }
    }
  };

  const handleSignOut = () => {
    setDropdownOpen(false);
    logout();
    navigate('/login', { replace: true });
  };

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : 'U';

  return (
    <header className="app-topbar">
      {/* Hamburger */}
      <button className="topbar-toggle" onClick={onMenuToggle} aria-label="Toggle menu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6"  x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      <Breadcrumb />
      <div className="topbar-spacer" />

      <div className="topbar-actions">
        {/* Notification bell — dropdown */}
        <div ref={notifRef} style={{ position: 'relative' }}>
          <button
            className="topbar-icon-btn"
            onClick={handleNotifToggle}
            title={alertCount > 0 ? `${alertCount} unread alerts` : 'Notifications'}
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            {alertCount > 0 && <span className="topbar-notif-dot" />}
          </button>

          {notifOpen && (
            <div className="topbar-dropdown" style={{ width: 320, right: 0, left: 'auto' }}>
              {/* Header */}
              <div style={{ padding: '0.75rem 0.875rem 0.5rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text)' }}>Notifications</p>
                {alertCount > 0 && (
                  <span style={{ fontSize: '0.62rem', fontWeight: 700, background: 'var(--danger)', color: '#fff', padding: '0.1rem 0.45rem', borderRadius: '9999px' }}>
                    {alertCount} unread
                  </span>
                )}
              </div>

              <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                {notifLoading ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-faint)', fontSize: '0.8rem' }}>
                    <span className="spinner" style={{ display: 'inline-block', marginRight: '0.4rem' }} />Loading…
                  </div>
                ) : notifAlerts.length === 0 ? (
                  <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-faint)', fontSize: '0.8rem' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: '0.4rem', opacity: 0.4 }}>
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                    <p>No alerts</p>
                  </div>
                ) : (
                  notifAlerts.map(a => {
                    const col = ALERT_TYPE_COLOR[a.type] ?? '#6b7280';
                    return (
                      <div key={a.id} style={{ padding: '0.625rem 0.875rem', borderBottom: '1px solid var(--border-light)', opacity: a.isRead ? 0.55 : 1, display: 'flex', gap: '0.625rem', alignItems: 'flex-start' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: col, flexShrink: 0, marginTop: '0.35rem' }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '0.75rem', fontWeight: a.isRead ? 400 : 600, color: 'var(--text)', marginBottom: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {a.message}
                          </p>
                          <p style={{ fontSize: '0.68rem', color: 'var(--text-faint)' }}>
                            {a.type.replace('_', ' ')} · {timeAgo(a.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer link */}
              <div style={{ padding: '0.5rem 0.875rem', borderTop: '1px solid var(--border-light)' }}>
                <Link
                  to="/alerts"
                  onClick={() => setNotifOpen(false)}
                  style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--primary)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                >
                  View all alerts
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="topbar-divider" />

        {/* User dropdown */}
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
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
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
                <Link to="/profile"
                  onClick={() => setDropdownOpen(false)}
                  className="topbar-dropdown-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
                  </svg>
                  My Profile
                </Link>

                <Link to="/alerts"
                  onClick={() => setDropdownOpen(false)}
                  className="topbar-dropdown-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  Notifications
                  {alertCount > 0 && (
                    <span style={{ marginLeft: 'auto', background: 'var(--danger)', color: '#fff', fontSize: '0.62rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '9999px' }}>
                      {alertCount}
                    </span>
                  )}
                </Link>

                <Link to="/detections/reports"
                  onClick={() => setDropdownOpen(false)}
                  className="topbar-dropdown-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 20V10M12 20V4M6 20v-6" />
                  </svg>
                  Detection Reports
                </Link>

                <Link to="/farms"
                  onClick={() => setDropdownOpen(false)}
                  className="topbar-dropdown-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                  My Farms
                </Link>

                <div style={{ height: 1, background: 'var(--border-light)', margin: '0.375rem 0' }} />

                <button
                  onClick={handleSignOut}
                  className="topbar-dropdown-item topbar-dropdown-danger"
                  style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
