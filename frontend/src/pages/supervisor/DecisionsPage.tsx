import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { roomService, WaitingRoom } from '../../services/room.service';
import { SupplyRound, supplyService, WaitingAllowanceRequest } from '../../services/supply.service';
import { fill } from '../../utils/fill';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import { RequestItem, RoomItem, RoundItem } from './DecisionItems';

type Filter = 'all' | 'rooms' | 'allowance' | 'rounds';
type Item =
  | { kind: 'room'; at: string; id: string; room: WaitingRoom }
  | { kind: 'request'; at: string; id: string; request: WaitingAllowanceRequest }
  | { kind: 'round'; at: string; id: string; round: SupplyRound };

/** Tells the menu and the dashboard to count again. */
const RECOUNT = 'ssms:decisions';

/** What waits for this person: new rooms, room size changes and allowance requests, the one waiting longest first. */
export default function DecisionsPage() {
  const { t } = useLanguage();
  const { success, error: showError } = useToast();
  const { getErrorMessage } = useApiError();

  const [rooms, setRooms] = useState<WaitingRoom[]>([]);
  const [requests, setRequests] = useState<WaitingAllowanceRequest[]>([]);
  const [toSplit, setToSplit] = useState<SupplyRound[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [filter, setFilter] = useState<Filter>('all');

  const load = useCallback(() => {
    // The list of rounds is extra: without it the rooms and requests still show.
    const rounds = supplyService.listRounds().catch(() => ({ data: { data: { rounds: [] as SupplyRound[] } } }));
    return Promise.all([roomService.waiting(), supplyService.waiting(), rounds])
      .then(([r, q, rs]) => {
        setRooms(r.data.data.rooms);
        setRequests(q.data.data.requests);
        // A round to split is one that has closed with requests in it and was not confirmed yet.
        setToSplit(rs.data.data.rounds.filter((x) => x.status === 'closed' && (x.requestCount ?? 0) > 0));
        setStatus('ready');
      })
      .catch(() => setStatus((current) => (current === 'ready' ? 'ready' : 'failed')));
  }, []);

  useEffect(() => { load(); }, [load]);

  const items = useMemo<Item[]>(
    () => [
      ...rooms.map((room): Item => ({ kind: 'room', at: room.createdAt, id: `r-${room.id}`, room })),
      ...requests.map((request): Item => ({ kind: 'request', at: request.createdAt, id: `q-${request.id}`, request })),
      ...toSplit.map((round): Item => ({ kind: 'round', at: round.requestDeadline, id: `s-${round.id}`, round })),
    ].sort((a, b) => a.at.localeCompare(b.at)),
    [rooms, requests, toSplit],
  );
  const KIND: Record<Exclude<Filter, 'all'>, Item['kind']> = { rooms: 'room', allowance: 'request', rounds: 'round' };
  const shown = items.filter((i) => filter === 'all' || i.kind === KIND[filter]);

  /**
   * Runs one decision. When it worked the item leaves, a toast says so and the menu recounts. When someone else decided
   * first the list is refreshed. Anything else comes back as a message for the caller to show.
   */
  const perform = async (action: () => Promise<unknown>, done: () => void, toast: string): Promise<string | null> => {
    try {
      await action();
      done();
      success(toast);
      window.dispatchEvent(new Event(RECOUNT));
      return null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        showError(t('dcsAlready'));
        await load();
        window.dispatchEvent(new Event(RECOUNT));
        return null;
      }
      return getErrorMessage(err);
    }
  };
  const alone = async (run: Promise<string | null>) => {
    const message = await run;
    if (message) showError(message);
  };

  const roomActions = (room: WaitingRoom) => {
    const name = room.owner.name;
    const gone = () => setRooms((prev) => prev.filter((r) => r.id !== room.id));
    return {
      approve: () => alone(perform(() => roomService.review(room.id, { decision: 'approve', note: '' }), gone, fill(t('dcsRoomApproved'), { name }))),
      reject: (note: string) => perform(() => roomService.review(room.id, { decision: 'reject', note }), gone, fill(t('dcsRoomRejected'), { name })),
    };
  };

  const requestActions = (request: WaitingAllowanceRequest) => {
    const name = request.farmer.name;
    const gone = () => setRequests((prev) => prev.filter((r) => r.id !== request.id));
    return {
      approve: () => alone(perform(() => supplyService.decide(request.id, { decision: 'approve' }), gone, fill(t('dcsRequestApproved'), { name }))),
      approveAmount: (boxes: number, note: string) =>
        perform(() => supplyService.decide(request.id, { decision: 'approve', boxes, ...(note ? { note } : {}) }), gone, fill(t('dcsRequestApproved'), { name })),
      decline: (note: string) => perform(() => supplyService.decide(request.id, { decision: 'decline', note }), gone, fill(t('dcsRequestDeclined'), { name })),
    };
  };

  const FILTERS: { key: Filter; label: string; n: number }[] = [
    { key: 'all', label: t('dcsFilterAll'), n: items.length },
    { key: 'rooms', label: t('dcsFilterRooms'), n: rooms.length },
    { key: 'allowance', label: t('dcsFilterAllowance'), n: requests.length },
    ...(toSplit.length > 0 ? [{ key: 'rounds' as Filter, label: t('dcsFilterRounds'), n: toSplit.length }] : []),
  ];

  return (
    <div>
      <PageHeader title={t('ptDecisions')} subtitle={t('dcsSubtitle')} />

      {status === 'loading' ? (
        <SkeletonTable rows={3} cols={3} />
      ) : status === 'failed' ? (
        <EmptyState
          icon={<Icon name="alerts" size={22} />}
          title={t('dcsLoadFailed')}
          action={{ label: t('dcsRetry'), onClick: () => { setStatus('loading'); load(); } }}
        />
      ) : items.length === 0 ? (
        <EmptyState icon={<Icon name="alerts" size={22} />} title={t('dcsEmpty')} description={t('dcsEmptyBody')} />
      ) : (
        <>
          <div className="segmented" role="group" aria-label={t('ptDecisions')}>
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className={filter === f.key ? 'is-on' : ''} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>
                {fill(f.label, { n: f.n })}
              </button>
            ))}
          </div>
          <ul className="decision-list">
            {shown.map((i) => {
              if (i.kind === 'room') return <RoomItem key={i.id} room={i.room} actions={roomActions(i.room)} />;
              if (i.kind === 'round') return <RoundItem key={i.id} round={i.round} />;
              return <RequestItem key={i.id} request={i.request} actions={requestActions(i.request)} />;
            })}
          </ul>
        </>
      )}
    </div>
  );
}
