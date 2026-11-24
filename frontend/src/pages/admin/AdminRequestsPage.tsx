import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { AdminCooperativeRequest, cooperativeRequestService } from '../../services/cooperativeRequest.service';
import { dateFormat } from '../../utils/dateFormat';
import { fill } from '../../utils/fill';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import PageHeader from '../../components/ui/PageHeader';
import PhoneLink from '../../components/ui/PhoneLink';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import { ROLE_LABEL_KEY } from '../../components/layout/Sidebar';
import { NoteDialog } from '../supervisor/DecisionDialogs';

/** Approving moves a person, so the dialog says who goes where, and what else follows for a farmer. The note is optional. */
function ApproveDialog({ request, onSend, onClose }: { request: AdminCooperativeRequest; onSend: (note: string) => Promise<string | null>; onClose: () => void }) {
  const { t } = useLanguage();
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const from = request.from?.name ?? t('arqNoCoop');
  const to = request.to?.name ?? t('arqNoCoop');

  const send = async () => {
    setSending(true);
    const message = await onSend(note.trim());
    if (message) {
      setError(message);
      setSending(false);
    } else {
      onClose();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('arqApproveTitle')}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('btnCancel')}</button>
          <button type="button" className="btn btn-primary" onClick={send} disabled={sending}>
            {sending ? <span className="spinner" aria-hidden="true" /> : null}
            {t('arqApproveSend')}
          </button>
        </>
      }
    >
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <p className="modal-text">{fill(t('arqApproveText'), { person: request.person.name, from, to })}</p>
      {request.person.role === 'FARMER' && request.from ? <p className="form-hint form-hint--gap">{fill(t('arqApproveFarmer'), { from, to })}</p> : null}
      <div className="form-group">
        <label className="form-label" htmlFor="arq-note">{t('arqNoteOptional')}</label>
        <textarea id="arq-note" className="form-textarea" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}

/** The requests to change cooperative that wait for the SSMS team, the one waiting longest first. */
export default function AdminRequestsPage() {
  const { t, tn, locale } = useLanguage();
  const { success, error: showError } = useToast();
  const { getErrorMessage } = useApiError();
  const [requests, setRequests] = useState<AdminCooperativeRequest[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [approving, setApproving] = useState<AdminCooperativeRequest | null>(null);
  const [declining, setDeclining] = useState<AdminCooperativeRequest | null>(null);

  const load = useCallback(() => {
    return cooperativeRequestService.list('requested')
      .then((res) => { setRequests(res.data.data.requests); setStatus('ready'); })
      .catch(() => setStatus('failed'));
  }, []);

  useEffect(() => { load(); }, [load]);

  const asked = dateFormat(locale, { dateStyle: 'medium' });

  /** Runs one decision. Returns the message to show in the dialog, or null when it worked. */
  const decide = async (request: AdminCooperativeRequest, decision: 'approve' | 'decline', note: string): Promise<string | null> => {
    try {
      await cooperativeRequestService.decide(request.id, { decision, note });
      setRequests((prev) => prev.filter((r) => r.id !== request.id));
      success(t(decision === 'approve' ? 'arqApproved' : 'arqDeclined'));
      return null;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data?.code === 'coop_already_decided') {
        showError(t('arqDecidedElsewhere'));
        await load();
        return null;
      }
      return getErrorMessage(err);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('arqTitle')}
        subtitle={status === 'ready' && requests.length > 0 ? tn(requests.length, 'arqSummaryOne', 'arqSummary', { n: requests.length }) : undefined}
      />
      {status === 'loading' ? (
        <SkeletonTable rows={3} />
      ) : status === 'failed' ? (
        <EmptyState
          icon={<Icon name="alerts" size={22} />}
          title={t('arqLoadFailed')}
          action={{ label: t('arqRetry'), onClick: () => { setStatus('loading'); load(); } }}
        />
      ) : requests.length === 0 ? (
        <EmptyState icon={<Icon name="inbox" size={22} />} title={t('arqEmpty')} description={t('arqEmptyBody')} />
      ) : (
        <ul className="decision-list">
          {requests.map((r) => (
            <li key={r.id} className="decision">
              <div className="cell-person">
                <Avatar name={r.person.name} />
                <div className="cell-stack">
                  <span className="cell-strong">{r.person.name}</span>
                  <span className="cell-sub">{r.person.email}</span>
                  <PhoneLink phone={r.person.phone} name={r.person.name} />
                  <span className="badge badge-gray">{t(ROLE_LABEL_KEY[r.person.role])}</span>
                </div>
              </div>
              <div className="decision-body">
                <p className="decision-title">
                  <span className="cell-sub">{t('arqFrom')} </span>
                  <strong>{r.from?.name ?? t('arqNoCoop')}</strong>
                  <span className="cell-sub"> {t('arqTo')} </span>
                  <strong>{r.to?.name ?? t('arqNoCoop')}</strong>
                </p>
                <p className="decision-reason">{r.reason}</p>
                <p className="cell-sub">{fill(t('arqAsked'), { date: asked.format(new Date(r.createdAt)) })}</p>
                {r.onlySupervisor && r.from ? <p className="form-hint" role="note">{fill(t('arqOnlySupervisor'), { name: r.from.name })}</p> : null}
              </div>
              <div className="decision-actions">
                <button type="button" className="btn btn-primary btn-sm" onClick={() => setApproving(r)}>{t('arqApprove')}</button>
                <button type="button" className="btn btn-ghost btn-sm btn-quiet-danger" onClick={() => setDeclining(r)}>{t('arqDecline')}</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {approving ? <ApproveDialog request={approving} onSend={(note) => decide(approving, 'approve', note)} onClose={() => setApproving(null)} /> : null}
      {declining ? (
        <NoteDialog
          title={t('arqDeclineTitle')}
          sendLabel={t('arqDeclineSend')}
          farmerName={declining.person.name}
          label={fill(t('arqDeclineNote'), { name: declining.person.name })}
          onSend={(note) => decide(declining, 'decline', note)}
          onClose={() => setDeclining(null)}
        />
      ) : null}
    </div>
  );
}
