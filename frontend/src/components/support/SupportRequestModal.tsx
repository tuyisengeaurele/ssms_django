import { useEffect, useId, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useApiError } from '../../hooks/useApiError';
import { supportService } from '../../services/support.service';
import type { SupportPersonRow } from '../../types';
import { fill } from '../../utils/fill';
import Modal from '../ui/Modal';
import '../../styles/support.css';

interface Props {
  /** The question waiting for this person, or null. */
  request: SupportPersonRow | null;
  /** Called after an answer, and when the time is up, so the page can ask the server and close this. */
  onAnswered: () => void;
}

const clock = (milliseconds: number) => {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

/**
 * SSMS support asks to look at the person's account. Nothing happens unless they allow it. It is a question that needs
 * an answer, so there is no close button, and the focus starts on Reject so Enter cannot allow by accident.
 */
export default function SupportRequestModal({ request, onAnswered }: Props) {
  const { t } = useLanguage();
  const { getErrorMessage } = useApiError();
  const editId = useId();
  const [allowEdit, setAllowEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const id = request?.id ?? null;

  // A new question starts clean: the tick is off and no old complaint is shown.
  useEffect(() => {
    setAllowEdit(false);
    setBusy(false);
    setError('');
  }, [id]);

  useEffect(() => {
    if (!id) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [id]);

  const left = request ? Date.parse(request.expiresAt) - now : 0;
  const timeUp = !!request && left <= 0;
  useEffect(() => {
    if (timeUp) onAnswered();
    // Once, when the time runs out. The page then asks the server and the question goes away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeUp]);

  const answer = async (decision: 'allow' | 'reject') => {
    if (!request) return;
    setError('');
    setBusy(true);
    try {
      await supportService.respond(request.id, { decision, allowEdit: decision === 'allow' && allowEdit });
      onAnswered();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!request}
      onClose={() => undefined}
      dismissible={false}
      role="alertdialog"
      title={t('supportRequestTitle')}
      initialFocus="[data-support-reject]"
      footer={
        <>
          <button type="button" className="btn btn-secondary" data-support-reject onClick={() => answer('reject')} disabled={busy}>
            {t('supportReject')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => answer('allow')} disabled={busy}>
            {t('supportAllow')}
          </button>
        </>
      }
    >
      {request && (
        <>
          {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
          <p className="modal-text">{fill(t('supportRequestBody'), { name: request.admin.name, minutes: request.minutes })}</p>
          {/* Always plain text: React escapes it, so markup in a reason is shown as typed. */}
          <p className="modal-text">{fill(t('supportRequestReason'), { reason: request.reason })}</p>
          {request.requestedMode === 'edit' && (
            <>
              <p className="modal-text">{t('supportRequestEditAsked')}</p>
              <label className="support-choice" htmlFor={editId}>
                <input id={editId} type="checkbox" checked={allowEdit} onChange={(e) => setAllowEdit(e.target.checked)} />
                {t('supportAllowEdit')}
              </label>
            </>
          )}
          <p className="modal-text">{fill(t('supportTimeLeft'), { time: clock(left) })}</p>
        </>
      )}
    </Modal>
  );
}
