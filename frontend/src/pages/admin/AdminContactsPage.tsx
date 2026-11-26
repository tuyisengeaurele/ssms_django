import { useEffect, useRef, useState } from 'react';
import { contactsService } from '../../services/contacts.service';
import { ContactMessage } from '../../types';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { usePresence } from '../../hooks/usePresence';
import type { Locale } from '../../i18n/locales';
import ReplyBox from '../../components/contacts/ReplyBox';
import { fill } from '../../utils/fill';
import EmptyState from '../../components/ui/EmptyState';
import LoadError from '../../components/ui/LoadError';
import { Icon } from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import { dateFormat } from '../../utils/dateFormat';

type Filter = 'all' | 'unread' | 'read' | 'unanswered' | 'answered';

const previewOf = (text: string) => text.replace(/\s+/g, ' ').trim();
/** How long the reply box stays to play its closing. The same as --duration-fast in index.css. */
const BOX_LEAVE_MS = 120;
const statusOf = (e: unknown) => (e as { response?: { status?: number } })?.response?.status;

export default function AdminContactsPage() {
  const { success, error: showError } = useToast();
  const { getErrorMessage } = useApiError();
  const { t, tn, locale } = useLanguage();

  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [askAll, setAskAll] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [composing, setComposing] = useState(false);
  // What was written, and the language chosen for it, are kept for each message while the page is open.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState<Record<string, Locale>>({});
  const [sending, setSending] = useState(false);
  const [replyError, setReplyError] = useState('');
  const [takenId, setTakenId] = useState<string | null>(null);
  const inFlight = useRef(false);
  const replyButton = useRef<HTMLButtonElement>(null);
  const backToReply = useRef(false);
  const boxFor = useRef<string | null>(null);
  const box = usePresence(composing, BOX_LEAVE_MS);

  useEffect(() => {
    if (!composing && backToReply.current) replyButton.current?.focus();
    backToReply.current = false;
  }, [composing]);

  useEffect(() => {
    setLoading(true);
    setFailed(false);
    contactsService.getAll()
      .then((r) => setMessages(r.data.data))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [attempt]);

  const setRead = (ids: string[]) =>
    setMessages((prev) => prev.map((m) => (ids.includes(m.id) ? { ...m, isRead: true } : m)));

  // The open message is read from the list, so a change made while it is open shows at once.
  const selected = messages.find((m) => m.id === selectedId) ?? null;

  const leaveReply = () => {
    setComposing(false);
    setReplyError('');
    setTakenId(null);
  };

  const closeMessage = () => {
    leaveReply();
    setSelectedId(null);
  };

  const startReply = (id: string) => {
    boxFor.current = id;
    setTakenId(null);
    setComposing(true);
  };

  const cancelReply = () => {
    backToReply.current = true;
    leaveReply();
  };

  const draft = selected ? drafts[selected.id] ?? '' : '';
  const language: Locale = selected ? chosen[selected.id] ?? selected.language : 'en';
  const writing = composing && !!selected && selected.replies.length === 0;

  const sendReply = async () => {
    const body = draft.trim();
    if (!selected || !body || inFlight.current) return;
    const { id } = selected;
    inFlight.current = true;
    setSending(true);
    setReplyError('');
    try {
      const res = await contactsService.reply(id, { body, language });
      setMessages((prev) => prev.map((x) => (x.id === id ? res.data.data : x)));
      setDrafts(({ [id]: _sent, ...rest }) => rest);
      setComposing(false);
      success(t('msSent'));
    } catch (e) {
      if (statusOf(e) === 409) {
        // Another admin answered while this was being written. Their reply is fetched and shown.
        setComposing(false);
        setTakenId(id);
        contactsService.getAll().then((r) => setMessages(r.data.data)).catch(() => {});
      } else {
        setReplyError(t(statusOf(e) === 429 ? 'msTooMany' : 'msNotSent'));
      }
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  const openMessage = (m: ContactMessage) => {
    leaveReply();
    setSelectedId(m.id);
    if (m.isRead) return;
    contactsService.markRead(m.id)
      .then(() => setRead([m.id]))
      .catch((e) => showError(getErrorMessage(e)));
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    const unread = messages.filter((m) => !m.isRead);
    const results = await Promise.allSettled(unread.map((m) => contactsService.markRead(m.id)));
    const done = unread.filter((_, i) => results[i].status === 'fulfilled').map((m) => m.id);
    setRead(done);
    if (done.length === unread.length) success(t('msMarkedAll'));
    else showError(t('genericTryAgain'));
    setMarkingAll(false);
    setAskAll(false);
  };

  const unreadCount = messages.filter((m) => !m.isRead).length;
  const readCount = messages.length - unreadCount;
  const answeredCount = messages.filter((m) => !!m.repliedAt).length;
  const when = dateFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const query = search.trim().toLowerCase();

  const visible = messages.filter((m) => {
    if (filter === 'unread' && m.isRead) return false;
    if (filter === 'read' && !m.isRead) return false;
    if (filter === 'unanswered' && m.repliedAt) return false;
    if (filter === 'answered' && !m.repliedAt) return false;
    return !query || [m.name, m.email, m.message, ...m.replies.map((r) => r.body)].some((v) => v.toLowerCase().includes(query));
  });

  const tabs: Array<{ id: Filter; label: string; count: number }> = [
    { id: 'all', label: t('msTabAll'), count: messages.length },
    { id: 'unread', label: t('msTabUnread'), count: unreadCount },
    { id: 'read', label: t('msTabRead'), count: readCount },
    { id: 'unanswered', label: t('msTabUnanswered'), count: messages.length - answeredCount },
    { id: 'answered', label: t('msTabAnswered'), count: answeredCount },
  ];

  return (
    <div>
      <Modal
        open={!!selected}
        onClose={closeMessage}
        dismissible={!sending}
        title={selected?.subject ?? ''}
        maxWidth={560}
        footer={
          !selected ? undefined : writing ? (
            <>
              <button className="btn btn-secondary" onClick={cancelReply} disabled={sending}>{t('btnCancel')}</button>
              <button className="btn btn-primary" onClick={sendReply} disabled={sending || !draft.trim()}>
                {sending ? <span className="spinner" aria-hidden="true" /> : <Icon name="forward" size={15} />}
                {t(sending ? 'msSending' : 'msSend')}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={closeMessage}>{t('msClose')}</button>
              {selected.replies.length === 0 && (
                <button ref={replyButton} className="btn btn-primary" onClick={() => startReply(selected.id)}>
                  <Icon name="messages" size={15} />
                  {t('msReply')}
                </button>
              )}
            </>
          )
        }
      >
        {selected && (
          <div>
            <dl className="facts">
              <div><dt>{t('msFrom')}</dt><dd>{selected.name}</dd></div>
              <div><dt>{t('msEmail')}</dt><dd className="cell-trim">{selected.email}</dd></div>
            </dl>
            <p className="message-date">{when.format(new Date(selected.createdAt))}</p>
            {/* A message marked answered by hand, before replies were sent from the app, still says who and when. */}
            {selected.replies.length === 0 && selected.repliedAt && selected.repliedBy && (
              <p className="message-answered">{fill(t('msAnsweredBy'), { name: selected.repliedBy.name, when: when.format(new Date(selected.repliedAt)) })}</p>
            )}
            <p className="message-body">{selected.message}</p>
            {takenId === selected.id && <div className="alert alert-warning reply-error" role="status"><span>{t('msTaken')}</span></div>}
            {selected.replies.map((reply) => (
              <div key={reply.id} className="reply-sent">
                <p className="message-answered">
                  {reply.sentBy
                    ? fill(t('msRepliedBy'), { name: reply.sentBy.name, when: when.format(new Date(reply.sentAt)) })
                    : fill(t('msRepliedOn'), { when: when.format(new Date(reply.sentAt)) })}
                </p>
                <p className="message-body">{reply.body}</p>
              </div>
            ))}
            {selected.replies.length > 0 && <p className="form-hint reply-after">{t('msInMailbox')}</p>}
            {box.mounted && selected.replies.length === 0 && boxFor.current === selected.id && (
              <ReplyBox
                key={selected.id}
                email={selected.email}
                draft={draft}
                language={language}
                error={replyError}
                sending={sending}
                leaving={box.leaving}
                onDraft={(value) => {
                  setReplyError('');
                  setDrafts((all) => ({ ...all, [selected.id]: value }));
                }}
                onLanguage={(value) => setChosen((all) => ({ ...all, [selected.id]: value }))}
                onSubmit={sendReply}
                onClose={cancelReply}
              />
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={askAll}
        onClose={() => setAskAll(false)}
        title={t('msMarkAllTitle')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setAskAll(false)} disabled={markingAll}>{t('btnCancel')}</button>
            <button className="btn btn-primary" onClick={handleMarkAll} disabled={markingAll}>
              {markingAll ? <span className="spinner" aria-hidden="true" /> : null}
              {t('msMarkAllYes')}
            </button>
          </>
        }
      >
        <p className="modal-text">{t('msMarkAllBody')}</p>
      </Modal>

      <PageHeader
        title={t('ptMessages')}
        subtitle={loading || failed ? undefined : tn(messages.length, 'msSummaryOne', 'msSummary', { total: messages.length, unread: unreadCount })}
        actions={
          unreadCount > 0 ? (
            <button className="btn btn-secondary btn-sm" onClick={() => setAskAll(true)}>
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

        {failed ? (
          <LoadError onRetry={() => setAttempt((n) => n + 1)} />
        ) : loading ? (
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
                  <span className="inbox-who">{m.name}</span>
                  <span className="inbox-preview">{previewOf(m.message)}</span>
                  <span className="inbox-when">{when.format(new Date(m.createdAt))}</span>
                  {(!m.isRead || m.repliedAt) && (
                    <span className="inbox-badges">
                      {!m.isRead && <span className="badge badge-ink">{t('msNew')}</span>}
                      {m.repliedAt && <span className="badge badge-quiet">{t('msAnswered')}</span>}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
