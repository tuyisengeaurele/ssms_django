import { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { EggRequestRow, SplitRow, SupplyRound, supplyService } from '../../services/supply.service';
import { boxesText } from '../../utils/boxes';
import { fill } from '../../utils/fill';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import ConfirmReceiptModal from '../../components/supply/ConfirmReceiptModal';
import { localDay } from '../../components/supply/SupplyRoundCard';
import { NoteDialog } from './DecisionDialogs';
import { ConfirmDialog } from './RoundDialogs';
import RoundFormModal from './RoundFormModal';
import SplitTable from './SplitTable';
import { dateFormat } from '../../utils/dateFormat';

type Dialog = 'edit' | 'open' | 'close' | 'cancel' | 'confirm' | { notCollected: EggRequestRow } | { receipt: EggRequestRow } | null;

const RECOUNT = 'ssms:decisions';

/** One supply round: its facts, the requests, the split to confirm, and the eggs being handed out. */
export default function SupplyRoundPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { t, locale } = useLanguage();
  const { success, error: showError } = useToast();
  const { getErrorMessage } = useApiError();

  const [round, setRound] = useState<SupplyRound | null>(null);
  const [requests, setRequests] = useState<EggRequestRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [rows, setRows] = useState<SplitRow[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [dialog, setDialog] = useState<Dialog>(null);

  const load = useCallback(async () => {
    try {
      const res = await supplyService.getRound(id);
      const loaded = res.data.data;
      setRound(loaded.round);
      setRequests(loaded.requests);
      setStatus('ready');
      if (loaded.round.status === 'closed') {
        const proposal = await supplyService.roundProposal(id);
        setRows(proposal.data.data.requests);
        setValues(Object.fromEntries(proposal.data.data.requests.map((r) => [r.id, String(r.proposed)])));
        setNotes({});
      }
    } catch {
      setStatus((current) => (current === 'ready' ? 'ready' : 'failed'));
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const total = useMemo(() => rows.reduce((sum, r) => sum + (Number(values[r.id]) || 0), 0), [rows, values]);
  const valid = rows.every((r) => {
    const raw = values[r.id];
    const n = Number(raw);
    return raw !== undefined && raw.trim() !== '' && Number.isInteger(n) && n >= 0 && n <= r.asked;
  });
  const overStock = round ? total > round.stockBoxes : false;

  const day = dateFormat(locale, { dateStyle: 'medium' });
  const moment = dateFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  /**
   * Runs one action. When it worked a toast says so and the page reloads. When someone else was first the page says so and
   * reloads. Anything else comes back as a message for the dialog to show.
   */
  const perform = async (action: () => Promise<unknown>, toast: string): Promise<string | null> => {
    try {
      await action();
      success(toast);
      window.dispatchEvent(new Event(RECOUNT));
      await load();
      return null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        showError(t('rsAlready'));
        await load();
        return null;
      }
      return getErrorMessage(err);
    }
  };

  const act = (action: 'open' | 'close' | 'pause' | 'resume' | 'cancel', toast: string, note?: string) =>
    perform(() => supplyService.roundAction(id, { action, ...(note ? { note } : {}) }), toast);

  const confirmSplit = () => perform(
    () => supplyService.confirmRound(id, rows.map((r) => ({
      id: r.id, boxes: Number(values[r.id]), ...((notes[r.id] ?? '').trim() ? { declineNote: notes[r.id].trim() } : {}),
    }))),
    t('rsSplitDone'),
  );

  if (status === 'loading') return <div><PageHeader title={t('ptSupply')} /><SkeletonTable rows={3} cols={4} /></div>;
  if (status === 'failed' || !round) {
    return (
      <div>
        <PageHeader title={t('ptSupply')} />
        <EmptyState icon={<Icon name="alerts" size={22} />} title={t('rsRoundLoadFailed')} action={{ label: t('dcsRetry'), onClick: () => { setStatus('loading'); load(); } }} />
      </div>
    );
  }

  const state = round.status;
  const running = state === 'open' || state === 'closed' || state === 'allocated';
  const handing = state === 'allocated' && !round.paused;

  const result = (q: EggRequestRow): string => {
    const approved = q.boxesApproved ?? 0;
    switch (q.status) {
      case 'submitted': return t('rsReqWaiting');
      case 'approved': return fill(t('rndApproved'), { boxes: boxesText(t, approved) });
      case 'part_approved': return fill(t('rndPart'), { approved: boxesText(t, approved), asked: q.boxesAsked });
      case 'waitlisted': return t('rndWaitlist');
      case 'declined': return q.decisionNote ? fill(t('rndDeclined'), { note: q.decisionNote }) : t('rndDeclinedNoNote');
      case 'received': return fill(t('rndReceived'), { boxes: boxesText(t, q.boxesReceived ?? 0), condition: q.condition === 'damaged' ? t('rndDamaged') : t('rndGood') });
      case 'not_collected': return t('rndNotCollected');
      default: return t('rsReqCancelled');
    }
  };

  return (
    <div>
      <PageHeader
        title={round.name}
        actions={<Link to="/supply" className="btn btn-secondary btn-sm">{t('rsBack')}</Link>}
      />

      <div className="stack-24">
        <Panel
          title={round.name}
          actions={
            <>
              <span className="badge badge-gray">{t(`rsStatus_${state}`)}</span>
              {round.paused && <span className="badge badge-yellow">{t('rsPaused')}</span>}
              {(state === 'draft' || state === 'open') && <button className="btn btn-secondary btn-sm" onClick={() => setDialog('edit')}>{t('rsEdit')}</button>}
              {state === 'draft' && <button className="btn btn-primary btn-sm" onClick={() => setDialog('open')}>{t('rsOpenRound')}</button>}
              {state === 'open' && <button className="btn btn-secondary btn-sm" onClick={() => setDialog('close')}>{t('rsCloseRound')}</button>}
              {running && (
                <button className="btn btn-secondary btn-sm" onClick={async () => { const m = await act(round.paused ? 'resume' : 'pause', round.paused ? t('rsResumedToast') : t('rsPausedToast')); if (m) showError(m); }}>
                  {round.paused ? t('rsResume') : t('rsPause')}
                </button>
              )}
              {running && <button className="btn btn-ghost btn-sm btn-quiet-danger" onClick={() => setDialog('cancel')}>{t('rsCancelRound')}</button>}
            </>
          }
        >
          <dl className="facts">
            <div><dt>{t('rsFactStock')}</dt><dd>{boxesText(t, round.stockBoxes)}</dd></div>
            <div><dt>{t('rsFactDeadline')}</dt><dd>{moment.format(new Date(round.requestDeadline))}</dd></div>
            <div><dt>{t('rsFactDelivery')}</dt><dd>{day.format(localDay(round.deliveryDate))}</dd></div>
            <div><dt>{t('rsFactPlace')}</dt><dd>{round.deliveryPlace}</dd></div>
            <div><dt>{t('rsFactHarvest')}</dt><dd>{day.format(localDay(round.expectedHarvestDate))}</dd></div>
            {round.lotCode && <div><dt>{t('rsFactLot')}</dt><dd className="cell-mono">{round.lotCode}</dd></div>}
          </dl>
          {state === 'allocated' && round.paused && <p role="status">{t('rndPaused')}</p>}
        </Panel>

        {state === 'closed' ? (
          <Panel title={t('rsSplitTitle')} note={t('rsSplitHelp')}>
            {rows.length === 0 ? (
              <p className="cell-sub">{t('rsNothingToSplit')}</p>
            ) : (
              <>
                <SplitTable rows={rows} values={values} notes={notes} onValue={(rid, v) => setValues((p) => ({ ...p, [rid]: v }))} onNote={(rid, v) => setNotes((p) => ({ ...p, [rid]: v }))} />
                <p className="decision-total" aria-live="polite">{fill(t('rsTotal'), { total, stock: round.stockBoxes })}</p>
                {overStock && <p className="form-error" role="alert">{t('rsOverStock')}</p>}
                <button className="btn btn-primary" disabled={!valid || overStock} onClick={() => setDialog('confirm')}>{t('rsConfirmSplit')}</button>
              </>
            )}
          </Panel>
        ) : (
          <Panel title={t('rsRequestsTitle')} flush>
            {requests.length === 0 ? (
              <EmptyState icon={<Icon name="batches" size={22} />} title={t('rsNobody')} />
            ) : (
              <div className="table-wrapper">
                <table className="table-stack">
                  <thead>
                    <tr>
                      <th>{t('rsColFarmer')}</th>
                      <th>{t('rsColRoom')}</th>
                      <th>{t('rsColAsked')}</th>
                      <th>{t('rsColResult')}</th>
                      <th><span className="sr-only">{t('thActions')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((q) => (
                      <tr key={q.id} className="tbody-row">
                        <td className="cell-lead">
                          <div className="cell-person">
                            <Avatar name={q.farmer.name} />
                            <div className="cell-stack">
                              <span className="cell-strong">{q.farmer.name}</span>
                              <span className="cell-sub">{q.farmer.email}</span>
                              {q.note && <span className="cell-sub">{q.note}</span>}
                            </div>
                          </div>
                        </td>
                        <td data-label={t('rsColRoom')}>{q.room.name}</td>
                        <td data-label={t('rsColAsked')}>{q.boxesAsked}</td>
                        <td data-label={t('rsColResult')}>{result(q)}</td>
                        <td data-label="">
                          {handing && (q.status === 'approved' || q.status === 'part_approved') && (
                            <div className="table-actions">
                              <button className="btn btn-primary btn-xs" aria-label={fill(t('rsRecordFor'), { name: q.farmer.name })} onClick={() => setDialog({ receipt: q })}>{t('rsRecord')}</button>
                              <button className="btn btn-ghost btn-xs" aria-label={fill(t('rsNotCollectedFor'), { name: q.farmer.name })} onClick={() => setDialog({ notCollected: q })}>{t('rsNotCollectedYes')}</button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}
      </div>

      {dialog === 'edit' && <RoundFormModal round={round} onClose={() => setDialog(null)} onSaved={() => { load(); }} />}
      {dialog === 'open' && (
        <ConfirmDialog title={t('rsOpenTitle')} body={t('rsOpenBody')} yesLabel={t('rsOpenRound')} onYes={() => act('open', t('rsRoundOpened'))} onClose={() => setDialog(null)} />
      )}
      {dialog === 'close' && (
        <ConfirmDialog title={t('rsCloseTitle')} body={t('rsCloseBody')} yesLabel={t('rsCloseRound')} onYes={() => act('close', t('rsRoundClosed'))} onClose={() => setDialog(null)} />
      )}
      {dialog === 'confirm' && (
        <ConfirmDialog title={t('rsConfirmTitle')} body={t('rsConfirmBody')} yesLabel={t('rsConfirmSplit')} onYes={confirmSplit} onClose={() => setDialog(null)} />
      )}
      {dialog === 'cancel' && (
        <NoteDialog
          title={t('rsCancelTitle')} sendLabel={t('rsCancelRound')} farmerName="" label={t('rsCancelLabel')}
          onSend={(note) => act('cancel', t('rsRoundCancelled'), note)} onClose={() => setDialog(null)}
        />
      )}
      {dialog && typeof dialog === 'object' && 'notCollected' in dialog && (
        <ConfirmDialog
          title={t('rsNotCollectedTitle')} body={fill(t('rsNotCollectedBody'), { name: dialog.notCollected.farmer.name })} yesLabel={t('rsNotCollectedYes')} danger
          onYes={() => perform(() => supplyService.notCollected(dialog.notCollected.id), t('rsMarked'))} onClose={() => setDialog(null)}
        />
      )}
      {dialog && typeof dialog === 'object' && 'receipt' in dialog && (
        <ConfirmReceiptModal
          request={dialog.receipt} doneText={fill(t('rsRecorded'), { name: dialog.receipt.farmer.name })}
          onDone={() => { window.dispatchEvent(new Event(RECOUNT)); load(); }} onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
