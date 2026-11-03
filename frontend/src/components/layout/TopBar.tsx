import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { alertService } from '../../services/alert.service';
import { contactsService } from '../../services/contacts.service';
import { AlertLog, ContactMessage } from '../../types';
import { ALERT_TYPE_KEY } from '../../utils/alertTypes';
import { usePageTitle } from '../../utils/pageTitle';
import { timeAgo } from '../../utils/timeAgo';
import { Icon } from '../ui/Icon';
import LanguageSwitcher from '../ui/LanguageSwitcher';
import { ROLE_LABEL_KEY } from './Sidebar';

interface TopBarProps {
  onMenuToggle: () => void;
  /** Opens quick search. The button shows only when this is given. */
  onSearch?: () => void;
  alertCount?: number;
}

/** What the shortcut is called on this computer. */
const SHORTCUT = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘K' : 'Ctrl K';


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
                <div>
                  <p className="note-text">{a.message}</p>
                  <p className="note-meta">{t(ALERT_TYPE_KEY[a.type] ?? 'alTypeSystem')} · {timeAgo(a.createdAt, locale)}</p>
                </div>
              </div>
            ))
          )
        ) : messages.length === 0 ? (
          <p className="topbar-panel-empty">{t('shellNoMessages')}</p>
        ) : (
          messages.map((m) => (
            <Link key={m.id} to="/admin/contacts" onClick={onClose} className="topbar-note">
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

export default function TopBar({ onMenuToggle, onSearch, alertCount = 0 }: TopBarProps) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { title, section } = usePageTitle();

  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    function onPointer(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setNotifOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : 'U';
  const bellLabel = alertCount > 0 ? `${t('shellNotifications')}, ${alertCount}` : t('shellNotifications');

  return (
    <>
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
          {onSearch && (
            <button type="button" className="topbar-search" onClick={onSearch} aria-label={t('qsOpen')} aria-keyshortcuts="Control+K Meta+K">
              <Icon name="search" size={17} />
              <span className="topbar-search-text">{t('qsOpen')}</span>
              <kbd className="topbar-search-key" aria-hidden="true">{SHORTCUT}</kbd>
            </button>
          )}

          <div className="topbar-lang-switch">
            <LanguageSwitcher />
          </div>

          <div ref={notifRef} className="topbar-anchor">
            <button
              type="button"
              className="topbar-icon-btn"
              aria-label={bellLabel}
              aria-expanded={notifOpen}
              aria-haspopup="true"
              onClick={() => setNotifOpen((o) => !o)}
            >
              <Icon name="alerts" size={19} />
              {alertCount > 0 && <span className="topbar-notif-dot" aria-hidden="true" />}
            </button>
            {notifOpen && <NotificationPanel isAdmin={isAdmin} alertCount={alertCount} onClose={() => setNotifOpen(false)} />}
          </div>

          <Link to="/settings/account" className="topbar-user" aria-label={`${user?.name ?? ''}, ${t('btnSettings')}`}>
            <span className="topbar-avatar" aria-hidden="true">{initials}</span>
            <span className="topbar-user-info">
              <span className="t-name">{user?.name}</span>
              <span className="t-role">{user ? t(ROLE_LABEL_KEY[user.role]) : ''}</span>
            </span>
          </Link>
        </div>
      </header>
    </>
  );
}
