import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

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
  detect:     'Run Detection',
};

function Breadcrumb() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  const crumbs = segments.map((seg, i) => {
    const path = '/' + segments.slice(0, i + 1).join('/');
    const label = BREADCRUMB_MAP[seg] ?? (seg.length > 16 ? seg.slice(0, 8) + '…' : seg);
    const isLast = i === segments.length - 1;
    return { path, label, isLast };
  });

  if (crumbs.length <= 1) return null;

  return (
    <nav className="flex-start gap-1" style={{ fontSize: '0.78rem', color: 'var(--text-faint)' }}>
      {crumbs.map((c, i) => (
        <span key={c.path} className="flex-start gap-1">
          {i > 0 && <span style={{ opacity: 0.4 }}>/</span>}
          {c.isLast
            ? <span style={{ color: 'var(--text-2)', fontWeight: 500 }}>{c.label}</span>
            : <Link to={c.path} style={{ color: 'var(--text-faint)' }}
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
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const initials = user?.name
    ? user.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : 'U';

  const dashPath = user?.role === 'ADMIN' ? '/admin' : user?.role === 'SUPERVISOR' ? '/supervisor' : '/farmer';

  return (
    <header className="app-topbar">
      {/* Hamburger — mobile */}
      <button className="topbar-toggle" onClick={onMenuToggle} aria-label="Toggle menu">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="3" y1="6"  x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
      </button>

      {/* Breadcrumb */}
      <Breadcrumb />

      <div className="topbar-spacer" />

      <div className="topbar-actions">
        {/* Alerts shortcut */}
        {alertCount > 0 && (
          <Link to="/alerts" className="topbar-icon-btn" title={`${alertCount} unread alerts`}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span className="topbar-notif-dot" />
          </Link>
        )}

        <div className="topbar-divider" />

        {/* User dropdown */}
        <div ref={dropRef} style={{ position: 'relative' }}>
          <div className="topbar-user" onClick={() => setDropdownOpen(o => !o)}>
            <div className="topbar-avatar">{initials}</div>
            <div className="topbar-user-info">
              <div className="t-name">{user?.name}</div>
              <div className="t-role">{user?.role}</div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              style={{ color: 'var(--text-faint)', marginLeft: '0.25rem' }}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>

          {dropdownOpen && (
            <div style={{
              position: 'absolute', right: 0, top: 'calc(100% + 6px)',
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
              minWidth: '180px', zIndex: 300, padding: '0.375rem',
            }}>
              <Link to={dashPath} onClick={() => setDropdownOpen(false)}
                style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius)', fontSize: '0.82rem', color: 'var(--text-2)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--gray-50)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>
                Dashboard
              </Link>
              <div style={{ height: 1, background: 'var(--border-light)', margin: '0.25rem 0' }} />
              <button
                onClick={() => { logout(); navigate('/login'); }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.55rem 0.75rem', borderRadius: 'var(--radius)', fontSize: '0.82rem', color: 'var(--danger)', background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--danger-bg)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
