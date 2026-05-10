import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { contactsService } from '../../services/contacts.service';
import { ContactMessage } from '../../types';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString([], {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function MessageModal({
  msg,
  onClose,
  onRead,
}: {
  msg: ContactMessage;
  onClose: () => void;
  onRead: (id: string) => void;
}) {
  const { success: showSuccess, error: showError } = useToast();
  const { getErrorMessage } = useApiError();
  const [marking, setMarking] = useState(false);

  const handleRead = async () => {
    if (msg.isRead) return;
    setMarking(true);
    try {
      await contactsService.markRead(msg.id);
      showSuccess('Marked as read');
      onRead(msg.id);
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setMarking(false);
    }
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
          zIndex: 200, backdropFilter: 'blur(2px)',
        }}
      />
      <div style={{
        position: 'fixed', inset: 0, zIndex: 201,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          style={{
            background: 'var(--surface)', borderRadius: 16,
            boxShadow: 'var(--shadow-xl)', width: '100%', maxWidth: 540,
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          }}>
            <div style={{ flex: 1, marginRight: '1rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                <h2 style={{ fontWeight: 800, fontSize: '1rem', letterSpacing: '-0.02em' }}>
                  {msg.subject}
                </h2>
                {!msg.isRead && (
                  <span style={{ padding: '0.1rem 0.45rem', borderRadius: 6, fontSize: '0.65rem', fontWeight: 700, background: '#eff6ff', color: '#2563eb' }}>
                    New
                  </span>
                )}
              </div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>
                {fmtDate(msg.createdAt)}
              </p>
            </div>
            <button onClick={onClose} className="btn btn-ghost btn-sm" style={{ padding: '0.3rem 0.5rem' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          {/* Sender */}
          <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', gap: '1.5rem' }}>
            <div>
              <p style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: '0.15rem' }}>From</p>
              <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>{msg.name}</p>
            </div>
            <div>
              <p style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: '0.15rem' }}>Email</p>
              <a href={`mailto:${msg.email}`} style={{ fontWeight: 600, fontSize: '0.875rem', color: '#2563eb' }}>{msg.email}</a>
            </div>
          </div>

          {/* Message body */}
          <div style={{ padding: '1.25rem 1.5rem' }}>
            <p style={{ fontSize: '0.875rem', color: 'var(--text)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {msg.message}
            </p>
          </div>

          {/* Footer */}
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
            <a
              href={`mailto:${msg.email}?subject=Re: ${encodeURIComponent(msg.subject)}`}
              className="btn btn-secondary btn-sm"
            >
              Reply by Email
            </a>
            {!msg.isRead && (
              <button
                className="btn btn-primary btn-sm"
                onClick={handleRead}
                disabled={marking}
              >
                {marking ? 'Marking…' : 'Mark as Read'}
              </button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
          </div>
        </motion.div>
      </div>
    </>
  );
}

export default function AdminContactsPage() {
  const { error: showError } = useToast();
  const { getErrorMessage }  = useApiError();
  const { t } = useLanguage();
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [selected, setSelected] = useState<ContactMessage | null>(null);
  const [filter,   setFilter]   = useState<'all' | 'unread' | 'read'>('all');
  const [search,   setSearch]   = useState('');

  useEffect(() => {
    contactsService.getAll()
      .then(r => setMessages(r.data.data))
      .catch(e => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  const handleRead = (id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, isRead: true } : m));
    if (selected?.id === id) setSelected(prev => prev ? { ...prev, isRead: true } : prev);
  };

  const handleMarkAllRead = async () => {
    const unread = messages.filter(m => !m.isRead);
    await Promise.allSettled(unread.map(m => contactsService.markRead(m.id)));
    setMessages(prev => prev.map(m => ({ ...m, isRead: true })));
  };

  const unreadCount = messages.filter(m => !m.isRead).length;

  const filtered = messages.filter(m => {
    if (filter === 'unread' && m.isRead)  return false;
    if (filter === 'read'   && !m.isRead) return false;
    const q = search.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      m.subject.toLowerCase().includes(q) ||
      m.message.toLowerCase().includes(q)
    );
  });

  return (
    <div>
      {/* Page header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('pageTitleMessages')}</h1>
          <p className="page-subtitle">
            {messages.length} total · {unreadCount} unread
          </p>
        </div>
        {unreadCount > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={handleMarkAllRead}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '0.3rem' }}>
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Mark all read
          </button>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
        {[
          { label: 'Total',  value: messages.length,                    color: '#2563eb', bg: '#eff6ff', f: 'all'    as const },
          { label: 'Unread', value: unreadCount,                        color: '#d97706', bg: '#fef3c7', f: 'unread' as const },
          { label: 'Read',   value: messages.length - unreadCount,      color: '#16a34a', bg: '#f0fdf4', f: 'read'   as const },
        ].map((s, i) => (
          <motion.div
            key={s.label}
            className="stat-card"
            style={{ cursor: 'pointer', outline: filter === s.f ? `2px solid ${s.color}` : 'none' }}
            onClick={() => setFilter(f => f === s.f ? 'all' : s.f)}
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="stat-card-glow" style={{ background: s.color }} />
            <p style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: '0.6rem' }}>{s.label}</p>
            <p style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em' }}>{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonTable rows={5} cols={5} />
      ) : messages.length === 0 ? (
        <div className="table-container">
          <EmptyState
            icon={
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            }
            title="No contact messages yet"
            description="Messages submitted via the landing page contact form will appear here."
          />
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.35 }}>
          <div className="table-container">
            <div className="table-header">
              <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>
                Messages ({filtered.length}{filter !== 'all' ? ` · ${filter}` : ''})
              </p>
              <div style={{ maxWidth: 280 }}>
                <div className="input-wrapper">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="input-icon-left">
                    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                  <input
                    className="form-input has-left"
                    placeholder="Search messages…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ paddingBlock: '0.4rem' }}
                  />
                </div>
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState
                icon={<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>}
                title="No results"
                description="Try adjusting your search or filter"
                action={{ label: 'Clear', onClick: () => { setSearch(''); setFilter('all'); } }}
              />
            ) : (
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 12 }}></th>
                      <th>Name</th>
                      <th>Subject</th>
                      <th>Email</th>
                      <th>Received</th>
                      <th>Status</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence>
                      {filtered.map((m, i) => (
                        <motion.tr
                          key={m.id}
                          className="tbody-row"
                          style={{ cursor: 'pointer', fontWeight: m.isRead ? 400 : 600 }}
                          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.02 }}
                          onClick={() => setSelected(m)}
                        >
                          <td>
                            {!m.isRead && (
                              <span style={{ display: 'block', width: 8, height: 8, borderRadius: '50%', background: '#2563eb', margin: '0 auto' }} />
                            )}
                          </td>
                          <td style={{ fontWeight: m.isRead ? 500 : 700, fontSize: '0.83rem' }}>{m.name}</td>
                          <td style={{ fontSize: '0.82rem', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.subject}
                          </td>
                          <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                            <a href={`mailto:${m.email}`} onClick={e => e.stopPropagation()} style={{ color: '#2563eb' }}>
                              {m.email}
                            </a>
                          </td>
                          <td style={{ fontSize: '0.75rem', color: 'var(--text-faint)', whiteSpace: 'nowrap' }}>
                            {fmtDate(m.createdAt)}
                          </td>
                          <td>
                            {m.isRead ? (
                              <span style={{ fontSize: '0.7rem', fontWeight: 600, color: '#6b7280', background: '#f9fafb', padding: '0.15rem 0.45rem', borderRadius: 6 }}>Read</span>
                            ) : (
                              <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#2563eb', background: '#eff6ff', padding: '0.15rem 0.45rem', borderRadius: 6 }}>New</span>
                            )}
                          </td>
                          <td>
                            <button
                              className="btn btn-ghost btn-xs"
                              onClick={e => { e.stopPropagation(); setSelected(m); }}
                            >
                              View →
                            </button>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Message modal */}
      {selected && (
        <MessageModal
          msg={selected}
          onClose={() => setSelected(null)}
          onRead={handleRead}
        />
      )}
    </div>
  );
}
