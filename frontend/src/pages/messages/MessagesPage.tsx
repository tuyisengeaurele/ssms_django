import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import LoadError from '../../components/ui/LoadError';
import PageHeader from '../../components/ui/PageHeader';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useMessages } from '../../context/MessagesContext';
import { messageService } from '../../services/message.service';
import { teamService } from '../../services/team.service';
import type { ConversationRow } from '../../types';
import { fill } from '../../utils/fill';
import ConversationList from './ConversationList';
import ConversationView, { type Target } from './ConversationView';
import './messages.css';

const latestFirst = (a: ConversationRow, b: ConversationRow) =>
  Date.parse(b.lastMessage?.createdAt ?? '0') - Date.parse(a.lastMessage?.createdAt ?? '0');

/** A farmer's and a supervisor's conversations. An admin has none: the route refuses one, and so does the server. */
export default function MessagesPage() {
  const { id } = useParams<{ id?: string }>();
  const to = useSearchParams()[0].get('to');
  const { user } = useAuth();
  const { t } = useLanguage();
  const { unread } = useMessages();
  const navigate = useNavigate();
  const asFarmer = user?.role === 'FARMER';

  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [pages, setPages] = useState({ loaded: 1, more: false });
  const [writingNew, setWritingNew] = useState(false);
  // For "Message" beside a farmer: who they are, once it is known that no conversation with them exists yet.
  const [chosen, setChosen] = useState<{ id: string; target: Target | null } | null>(null);
  // A conversation made on this screen keeps the key it started with, so the screen is not drawn afresh over it.
  const started = useRef(new Map<string, string>());

  const load = useCallback(async () => {
    try {
      const res = await messageService.list(1);
      setRows(res.data.data);
      setPages({ loaded: 1, more: res.data.pagination.hasNext });
      setStatus('ready');
    } catch {
      setStatus('failed');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /** The first page again, keeping what further pages brought. What it cannot fetch stays as it was. */
  const refresh = useCallback(() => {
    messageService.list(1).then((res) => {
      setRows((held) => {
        const fresh = res.data.data;
        const ids = new Set(fresh.map((r) => r.id));
        return [...fresh, ...held.filter((r) => !ids.has(r.id))].sort(latestFirst);
      });
    }, () => {});
  }, []);

  const seenCount = useRef(unread);
  useEffect(() => {
    if (seenCount.current === unread) return;
    seenCount.current = unread;
    if (status === 'ready') refresh();
  }, [unread, status, refresh]);

  const showMore = () => {
    const next = pages.loaded + 1;
    messageService.list(next).then((res) => {
      setRows((held) => [...held, ...res.data.data.filter((r) => !held.some((h) => h.id === r.id))]);
      setPages({ loaded: next, more: res.data.pagination.hasNext });
    }, () => {});
  };

  useEffect(() => {
    if (asFarmer || id || !to) return undefined;
    let live = true;
    (async () => {
      try {
        const [existing] = (await messageService.list(1, to)).data.data;
        if (!live) return;
        if (existing) {
          navigate(`/messages/${existing.id}`, { replace: true });
          return;
        }
        const farmer = (await teamService.getFarmers()).data.data.find((f) => f.id === to);
        if (live) setChosen({ id: to, target: farmer ? { farmerId: farmer.id, name: farmer.name, photoUrl: farmer.photoUrl } : null });
      } catch {
        if (live) setChosen({ id: to, target: null });
      }
    })();
    return () => { live = false; };
  }, [asFarmer, id, to, navigate]);

  const ownCooperative = asFarmer && user?.cooperativeId ? { id: user.cooperativeId, name: user.cooperativeName ?? '' } : null;
  const canStartNew = status === 'ready' && ownCooperative !== null && !rows.some((r) => r.cooperative.id === ownCooperative.id);

  // A farmer with one conversation, and nowhere else to write, is taken straight into it.
  useEffect(() => {
    if (asFarmer && !id && status === 'ready' && rows.length === 1 && !canStartNew) {
      navigate(`/messages/${rows[0].id}`, { replace: true });
    }
  }, [asFarmer, id, status, rows, canStartNew, navigate]);

  const newTarget: Target | null = asFarmer
    ? canStartNew && (rows.length === 0 || writingNew) ? { name: ownCooperative!.name } : null
    : to && chosen?.id === to ? chosen.target : null;

  const viewKey = id ? started.current.get(id) ?? id : to ? `to:${to}` : 'new';
  const inThread = Boolean(id) || newTarget !== null || (!asFarmer && Boolean(to));
  const noSupervisor = asFarmer && user?.supervisor === null && Boolean(user?.cooperativeId);

  const view = id || newTarget ? (
    <ConversationView
      key={viewKey}
      conversationId={id}
      target={id ? undefined : newTarget ?? undefined}
      asFarmer={asFarmer}
      note={noSupervisor ? t('msgNoSupervisor') : undefined}
      onChanged={refresh}
      onStarted={(made) => {
        started.current.set(made, viewKey);
        setWritingNew(false);
        navigate(`/messages/${made}`, { replace: true });
      }}
    />
  ) : !asFarmer && to && chosen?.id === to ? (
    <div className="msg-status">
      <Link to="/messages" className="btn btn-secondary btn-sm msg-back"><Icon name="back" size={15} />{t('msgBack')}</Link>
      <div className="alert alert-error" role="alert">{t('msgNoFarmer')}</div>
    </div>
  ) : (
    <p className="msg-choose">{to ? '' : t('msgChoose')}</p>
  );

  if (status !== 'ready') {
    return (
      <div>
        <PageHeader title={t('ptMessages')} />
        {status === 'loading' ? <SkeletonTable rows={4} /> : <LoadError onRetry={() => { setStatus('loading'); void load(); }} />}
      </div>
    );
  }

  // Nothing to list and nothing being written.
  if (rows.length === 0 && !id && !to && !newTarget) {
    return (
      <div>
        <PageHeader title={t('ptMessages')} />
        {asFarmer ? (
          <EmptyState icon={<Icon name="chat" size={22} />} title={t('erMsgNoCoop')} />
        ) : !user?.cooperativeId ? (
          <EmptyState icon={<Icon name="chat" size={22} />} title={t('msgNoCoopStaff')} />
        ) : (
          <EmptyState
            icon={<Icon name="chat" size={22} />}
            title={t('msgNoneStaff')}
            description={t('msgNoneStaffHint')}
            action={{ label: t('msgMyFarmers'), icon: 'users', to: '/supervisor/cooperative/farmers' }}
          />
        )}
      </div>
    );
  }

  // A farmer with one conversation or none has no use for a list beside it.
  const withList = !asFarmer || rows.length > 1 || (rows.length === 1 && canStartNew);

  return (
    <div>
      <PageHeader title={t('ptMessages')} />
      <div className={`msg-layout${withList ? '' : ' msg-layout--one'}`} data-view={inThread ? 'thread' : 'list'}>
        {withList ? (
          <div className="msg-side">
            {canStartNew && rows.length > 0 ? (
              <button type="button" className="btn btn-primary msg-start" onClick={() => { setWritingNew(true); navigate('/messages'); }}>
                <Icon name="chat" size={16} />{fill(t('msgNewTo'), { name: ownCooperative!.name })}
              </button>
            ) : null}
            <ConversationList rows={rows} openId={id} asFarmer={asFarmer} />
            {pages.more ? (
              <button type="button" className="btn btn-secondary btn-sm msg-more" onClick={showMore}>
                <Icon name="down" size={14} />{t('msgMore')}
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="msg-main">{view}</div>
      </div>
    </div>
  );
}
