import { useCallback, useEffect, useState } from 'react';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { CurrentRound, EggRequestRow, supplyService } from '../../services/supply.service';
import { boxesText } from '../../utils/boxes';
import { fill } from '../../utils/fill';
import Panel from '../ui/Panel';
import ConfirmReceiptModal from './ConfirmReceiptModal';
import RequestEggsModal from './RequestEggsModal';
import { dateFormat } from '../../utils/dateFormat';

/** A day sent as YYYY-MM-DD, read as that day wherever the person is, not shifted by the time zone. */
export function localDay(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

const ALIVE = ['submitted', 'approved', 'part_approved', 'waitlisted'];

/** The timeline of a request in plain words: what was asked, what was decided, where the eggs are. */
function Timeline({ request, deliveredText }: { request: EggRequestRow; deliveredText: string }) {
  const { t } = useLanguage();
  const lines: string[] = [fill(t('rndAsked'), { boxes: boxesText(t, request.boxesAsked), room: request.room.name })];
  const approved = request.boxesApproved ?? 0;
  switch (request.status) {
    case 'submitted':
      lines.push(t('rndWaiting'));
      break;
    case 'approved':
      lines.push(fill(t('rndApproved'), { boxes: boxesText(t, approved) }), deliveredText);
      break;
    case 'part_approved':
      lines.push(fill(t('rndPart'), { approved: boxesText(t, approved), asked: request.boxesAsked }), deliveredText);
      break;
    case 'waitlisted':
      lines.push(t('rndWaitlist'));
      break;
    case 'declined':
      lines.push(request.decisionNote ? fill(t('rndDeclined'), { note: request.decisionNote }) : t('rndDeclinedNoNote'));
      break;
    case 'received':
      lines.push(fill(t('rndReceived'), { boxes: boxesText(t, request.boxesReceived ?? 0), condition: request.condition === 'damaged' ? t('rndDamaged') : t('rndGood') }));
      break;
    case 'not_collected':
      lines.push(t('rndNotCollected'));
      break;
    default:
      break;
  }
  return (
    <ol className="supply-steps">
      {lines.map((line, i) => <li key={i} aria-current={i === lines.length - 1 ? 'step' : undefined}>{line}</li>)}
    </ol>
  );
}

/** The round of eggs a farmer can ask in, their request, and the one thing to do next. */
export default function SupplyRoundCard() {
  const { t, locale } = useLanguage();
  const { success, error: showError } = useToast();
  const { getErrorMessage } = useApiError();
  const [current, setCurrent] = useState<CurrentRound | null>(null);
  const [asking, setAsking] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(() => {
    // A card that cannot load stays out of the way, so the dashboard around it is never blanked.
    supplyService.currentRound().then((r) => setCurrent(r.data.data)).catch(() => setCurrent(null));
  }, []);
  useEffect(load, [load]);

  if (!current?.round) return null;
  const { round, myRequest, rooms } = current;

  const day = dateFormat(locale, { dateStyle: 'medium' });
  const deliveredText = fill(t('rndOnTheWay'), { date: day.format(localDay(round.deliveryDate)), place: round.deliveryPlace });

  const cancel = async () => {
    if (!myRequest) return;
    setCancelling(true);
    try {
      await supplyService.cancelRequest(myRequest.id);
      success(t('rndCancelled'));
      load();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setCancelling(false);
    }
  };

  // A request that can only fail is not offered. A room with no space says so instead.
  const canAsk = rooms.some((r) => r.limit > 0);
  const promised = myRequest && (myRequest.status === 'approved' || myRequest.status === 'part_approved');
  const canReceive = promised && round.status === 'allocated' && !round.paused;

  return (
    <Panel title={t('rndTitle')}>
      <p className="cell-strong">{round.name}</p>
      <p className="cell-sub">{fill(t('rndAskBefore'), { date: day.format(new Date(round.requestDeadline)) })}</p>
      <p className="cell-sub">{fill(t('rndHandover'), { date: day.format(localDay(round.deliveryDate)), place: round.deliveryPlace })}</p>

      {myRequest ? (
        <>
          <Timeline request={myRequest} deliveredText={deliveredText} />
          {myRequest.note && <p className="cell-sub">{myRequest.note}</p>}
          {promised && round.paused && <p role="status">{t('rndPaused')}</p>}
        </>
      ) : round.status !== 'open' ? (
        <p role="status">{t('rndClosed')}</p>
      ) : rooms.length === 0 ? (
        <p role="status">{t('rndNeedRoom')}</p>
      ) : !canAsk ? (
        <p role="status">{t('rndNoSpace')}</p>
      ) : null}

      <div className="allowance-actions">
        {!myRequest && round.status === 'open' && canAsk && (
          <button className="btn btn-primary btn-sm" onClick={() => setAsking(true)}>{t('rndRequest')}</button>
        )}
        {canReceive && <button className="btn btn-primary btn-sm" onClick={() => setReceiving(true)}>{t('rndConfirm')}</button>}
        {myRequest && ALIVE.includes(myRequest.status) && (
          <button className="btn btn-secondary btn-sm" onClick={cancel} disabled={cancelling}>{t('rndCancel')}</button>
        )}
      </div>

      {asking && <RequestEggsModal round={round} rooms={rooms} onClose={() => setAsking(false)} onSent={load} />}
      {receiving && myRequest && <ConfirmReceiptModal request={myRequest} onClose={() => setReceiving(false)} onDone={load} />}
    </Panel>
  );
}
