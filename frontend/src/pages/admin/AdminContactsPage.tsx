import { useEffect, useState } from 'react';
import { contactsService } from '../../services/contacts.service';
import { ContactMessage } from '../../types';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { fill } from '../../utils/fill';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';

type Filter = 'all' | 'unread' | 'read';

const previewOf = (text: string) => text.replace(/\s+/g, ' ').trim();

export default function AdminContactsPage() {
  const { success, error: showError } = useToast();
  const { getErrorMessage } = useApiError();
  const { t, locale } = useLanguage();

  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<ContactMessage | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    contactsService.getAll()
      .then((r) => setMessages(r.data.data))
      .catch((e) => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setRead = (ids: string[]) =>
    setMessages((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, isRead: true } : m)));

  const openMessage = (m: ContactMessage) => {
    setSelected(m);
    if (m.isRead) return;
    contactsService.markRead(m.id)
      .then(() => setRead([m.id]))
      .catch((e) => showError(getErrorMessage(e)));
  };

  const handleMarkAll = async () => {
    const unread = messages.filter((m) => !m.isRead);
    const results = await Promise.allSettled(unread.map((m) => contactsService.markRead(m.id)));
    const done = unread.filter((_, i) => results[i].status === 'fulfilled').map((m) => m.id);
    setRead(done);
    if (done.length === unread.length) success(t('msMarkedAll'));
    else showError(t('genericTryAgain'));
  };

  const unreadCount = messages.filter((m) => !m.isRead).length;
  const readCount = messages.length - unreadCount;
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const query = search.trim().toLowerCase();

  const visible = messages.filter((m) => {
    if (filter === 'unread' && m.isRead) return false;
    if (filter === 'read' && !m.isRead) return false;
    return !query || [m.name, m.email, m.subject, m.message].some((v) => v.toLowerCase().includes(query));
  });

  const tabs: Array<{ id: Filter; label: string; count: number }> = [
    { id: 'all', label: t('msTabAll'), count: messages.length },
    { id: 'unread', label: t('msTabUnread'), count: unreadCount },
    { id: 'read', label: t('msTabRead'), count: readCount },
  ];

  return (
    <div>
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.subject ?? ''}
        maxWidth={560}
        footer={
          selected ? (
            <>
              <a
                className="btn btn-secondary"
                href={`mailto:${selected.email}?subject=${encodeURIComponent(`Re: ${selected.subject}`)}`}
              >
                <Icon name="messages" size={15} />
                {t('msReply')}
              </a>
              <button className="btn btn-primary" onClick={() => setSelected(null)}>{t('msClose')}</button>
            </>
          ) : undefined
        }
      >
        {selected && (
          <div>
            <dl className="facts">
              <div><dt>{t('msFrom')}</dt><dd>{selected.name}</dd></div>
              <div><dt>{t('msEmail')}</dt><dd className="cell-trim">{selected.email}</dd></div>
            </dl>
            <p className="message-date">{when.format(new Date(selected.createdAt))}</p>
            <p className="message-body">{selected.message}</p>
          </div>
        )}
      </Modal>

      <PageHeader
        title={t('ptMessages')}
        subtitle={loading ? undefined : fill(t(messages.length === 1 ? 'msSummaryOne' : 'msSummary'), { total: messages.length, unread: unreadCount })}
        actions={
          unreadCount > 0 ? (
            <button className="btn btn-secondary btn-sm" onClick={handleMarkAll}>
              <Icon name="check" size={15} />
              {t('msMarkAll')}
            </button>
          ) : undefined
        }
      />

      <Panel
        title={t('msInbox')}
        flush
        actions={
          <div className="search-box">
            <Icon name="search" size={16} className="icon" />
            <input type="search" aria-label={t('msSearch')} placeholder={t('msSearch')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        }
      >
        <div className="tabs" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filter === tab.id}
              className={filter === tab.id ? 'is-on' : ''}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>

        {loading ? (
          <SkeletonTable rows={5} cols={4} />
        ) : messages.length === 0 ? (
          <EmptyState icon={<Icon name="inbox" size={22} />} title={t('msNone')} description={t('msNoneBody')} />
        ) : visible.length === 0 ? (
          <EmptyState icon={<Icon name="search" size={22} />} title={t('msNoMatch')} description={t('msNoMatchBody')} />
        ) : (
          <ul className="inbox">
            {visible.map((m) => (
              <li key={m.id}>
                <button type="button" className={`inbox-row${m.isRead ? '' : ' is-unread'}`} onClick={() => openMessage(m)}>
                  <span className="inbox-dot" aria-hidden="true" />
                  <span className="inbox-who">{m.name}</span>
                  <span className="inbox-text">
                    <span className="inbox-subject">{m.subject}</span>
                    <span className="inbox-preview">{previewOf(m.message)}</span>
                  </span>
                  <span className="inbox-when">{when.format(new Date(m.createdAt))}</span>
                  {!m.isRead && <span className="badge badge-ink">{t('msNew')}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
