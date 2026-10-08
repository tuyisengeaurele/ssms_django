import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { LOCALE_LABELS, type Locale } from '../../i18n/translations';
import { alertService } from '../../services/alert.service';
import { contactsService } from '../../services/contacts.service';
import { AlertLog, AlertType, ContactMessage } from '../../types';
import { usePageTitle } from '../../utils/pageTitle';
import { timeAgo } from '../../utils/timeAgo';
import { Icon } from '../ui/Icon';
import Modal from '../ui/Modal';
import { ROLE_LABEL_KEY } from './Sidebar';

const ALERT_DOT: Record<AlertType, string> = {
  TEMPERATURE: 'temperature',
  HUMIDITY: 'humidity',
  DISEASE: 'disease',
  STAGE_CHANGE: 'stage',
  SYSTEM: 'system',
};

interface TopBarProps {
  onMenuToggle: () => void;
  alertCount?: number;
}

// ── Notifications ────────────────────────────────────────────────────────────

function NotificationPanel({ isAdmin, alertCount, onClose }: { isAdmin: boolean; alertCount: number; onClose: () => void }) {
  const { t, locale } = useLanguage();
  const [tab, setTab] = useState<'alerts' | 'messages'>('alerts');
  const [alerts, setAlerts] = useState<AlertLog[]>([]);
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [msgCount, setMsgCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loads: Promise<void>[] = [
      alertService.getAll().then((r) => setAlerts(r.data.data.slice(0, 5))).catch(() => {}),
    ];
    if (isAdmin) {
      loads.push(
        contactsService.getUnread()
          .then((r) => {
            setMessages(r.data.data.messages);
            setMsgCount(r.data.data.count);
          })
          .catch(() => {}),
      );
    }
    Promise.allSettled(loads).finally(() => setLoading(false));
  }, [isAdmin]);

  const total = alertCount + msgCount;

  return (
    <div className="topbar-panel" role="region" aria-label={t('shellNotifications')}>
      <div className="topbar-panel-head">
        <p className="topbar-panel-title">{t('shellNotifications')}</p>
        {total > 0 && <span className="topbar-panel-count">{total}</span>}
      </div>

      {isAdmin && (
        <div className="topbar-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'alerts'} className={tab === 'alerts' ? 'is-on' : ''} onClick={() => setTab('alerts')}>
            {t('ptAlerts')}{alertCount > 0 ? ` (${alertCount})` : ''}
          </button>
          <button type="button" role="tab" aria-selected={tab === 'messages'} className={tab === 'messages' ? 'is-on' : ''} onClick={() => setTab('messages')}>
            {t('ptMessages')}{msgCount > 0 ? ` (${msgCount})` : ''}
          </button>
        </div>
      )}

      <div className="topbar-panel-body">
        {loading ? (
          <p className="topbar-panel-empty"><span className="spinner" /></p>
        ) : tab === 'alerts' ? (
          alerts.length === 0 ? (
            <p className="topbar-panel-empty">{t('shellNoAlerts')}</p>
          ) : (
            alerts.map((a) => (
              <div key={a.id} className={`topbar-note${a.isRead ? ' is-read' : ''}`}>
                <span className={`note-dot note-dot--${ALERT_DOT[a.type] ?? 'system'}`} aria-hidden="true" />
                <div>
                  <p className="note-text">{a.message}</p>
                  <p className="note-meta">{a.type.replace('_', ' ').toLowerCase()} · {timeAgo(a.createdAt, locale)}</p>
                </div>
              </div>
            ))
          )
        ) : messages.length === 0 ? (
          <p className="topbar-panel-empty">{t('shellNoMessages')}</p>
        ) : (
          messages.map((m) => (
            <Link key={m.id} to="/admin/contacts" onClick={onClose} className="topbar-note">
              <span className="note-dot note-dot--humidity" aria-hidden="true" />
              <div>
                <p className="note-text">{m.subject}</p>
                <p className="note-meta">{m.name} · {timeAgo(m.createdAt, locale)}</p>
              </div>
            </Link>
          ))
        )}
      </div>

      <Link to={tab === 'messages' ? '/admin/contacts' : '/alerts'} onClick={onClose} className="topbar-panel-foot">
        {tab === 'messages' ? t('shellViewAllMessages') : t('shellViewAllAlerts')}
        <Icon name="forward" size={14} />
      </Link>
    </div>
  );
}

// ── Top bar ──────────────────────────────────────────────────────────────────

export default function TopBar({ onMenuToggle, alertCount = 0 }: TopBarProps) {
  const { user, logout } = useAuth();
  const { t, locale, setLocale } = useLanguage();
  const { title, section } = usePageTitle();
  const navigate = useNavigate();

  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    function onPointer(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const confirmSignOut = () => {
    setConfirmOpen(false);
    logout();
    navigate('/login', { replace: true });
  };

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : 'U';
  const bellLabel = alertCount > 0 ? `${t('shellNotifications')}, ${alertCount}` : t('shellNotifications');

  return (
    <>
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title={t('btnSignOut')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmOpen(false)}>{t('btnCancel')}</button>
            <button className="btn btn-danger" onClick={confirmSignOut}>{t('btnSignOut')}</button>
          </>
        }
      >
        <p className="modal-text">{t('shellSignOutAsk')}</p>
      </Modal>

      <header className="app-topbar">
        <button type="button" className="topbar-toggle" onClick={onMenuToggle} aria-label={t('shellOpenMenu')}>
          <Icon name="menu" />
        </button>

        <div className="topbar-title">
          <span className="topbar-section">{section}</span>
          <span className="topbar-page" data-testid="page-title">{title}</span>
        </div>

        <div className="topbar-spacer" />

        <div className="topbar-actions">
          <select
            className="topbar-lang"
            aria-label={t('lpLangLabel')}
            value={locale}
            onChange={(e) => setLocale(e.target.value as Locale)}
          >
            {(Object.keys(LOCALE_LABELS) as Locale[]).map((code) => (
              <option key={code} value={code}>{LOCALE_LABELS[code]}</option>
            ))}
          </select>

          <div ref={notifRef} className="topbar-anchor">
            <button
              type="button"
              className="topbar-icon-btn"
              aria-label={bellLabel}
              aria-expanded={notifOpen}
              aria-haspopup="true"
              onClick={() => { setNotifOpen((o) => !o); setMenuOpen(false); }}
            >
              <Icon name="alerts" size={19} />
              {alertCount > 0 && <span className="topbar-notif-dot" aria-hidden="true" />}
            </button>
            {notifOpen && <NotificationPanel isAdmin={isAdmin} alertCount={alertCount} onClose={() => setNotifOpen(false)} />}
          </div>

          <div ref={menuRef} className="topbar-anchor">
            <button
              type="button"
              className="topbar-user"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => { setMenuOpen((o) => !o); setNotifOpen(false); }}
            >
              <span className="topbar-avatar" aria-hidden="true">{initials}</span>
              <span className="topbar-user-info">
                <span className="t-name">{user?.name}</span>
                <span className="t-role">{user ? t(ROLE_LABEL_KEY[user.role]) : ''}</span>
              </span>
              <Icon name="down" size={15} className="topbar-user-caret" />
            </button>

            {menuOpen && (
              <div className="topbar-menu" role="menu">
                <div className="topbar-menu-head">
                  <span className="topbar-avatar topbar-avatar--lg" aria-hidden="true">{initials}</span>
                  <div>
                    <p className="menu-name">{user?.name}</p>
                    <p className="menu-email">{user?.email}</p>
                  </div>
                </div>
                <Link to="/profile" role="menuitem" className="topbar-menu-item" onClick={() => setMenuOpen(false)}>
                  <Icon name="profile" size={16} />{t('btnMyProfile')}
                </Link>
                <Link to="/alerts" role="menuitem" className="topbar-menu-item" onClick={() => setMenuOpen(false)}>
                  <Icon name="alerts" size={16} />{t('ptAlerts')}
                  {alertCount > 0 && <span className="menu-count">{alertCount}</span>}
                </Link>
                <div className="topbar-menu-rule" />
                <button
                  type="button"
                  role="menuitem"
                  className="topbar-menu-item topbar-menu-item--danger"
                  onClick={() => { setMenuOpen(false); setConfirmOpen(true); }}
                >
                  <Icon name="logout" size={16} />{t('btnSignOut')}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
    </>
  );
}
