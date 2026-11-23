import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useApiError } from '../../hooks/useApiError';
import { CooperativeName, CooperativeRequest, cooperativeRequestService } from '../../services/cooperativeRequest.service';
import { fill } from '../../utils/fill';
import Modal from './Modal';

const REASON_MAX = 500;
/** The value of the option that asks to leave. A real cooperative id never looks like this, and '' is the unchosen state. */
const LEAVE = '__none__';

interface Props {
  open: boolean;
  /** The cooperative the person is in now. It is not offered, because a move to it is no move. */
  currentCooperativeId: string | null;
  onClose: () => void;
  /** The request the server made, so the page can show it as waiting. */
  onSent: (request: CooperativeRequest) => void;
}

/** A farmer or supervisor asks to move to another cooperative, or to leave theirs, and says why. The SSMS team decides. */
export default function CooperativeRequestModal({ open, currentCooperativeId, onClose, onSent }: Props) {
  const { t } = useLanguage();
  const { getErrorMessage } = useApiError();
  const [options, setOptions] = useState<CooperativeName[] | null>(null);
  const [choice, setChoice] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let live = true;
    setChoice('');
    setReason('');
    setError('');
    setBusy(false);
    setOptions(null);
    cooperativeRequestService.options()
      .then((res) => { if (live) setOptions(res.data.data); })
      .catch(() => { if (live) { setOptions([]); setError(t('cqLoadFailed')); } });
    return () => { live = false; };
    // The words are read when the dialog opens, so a change of language while it is open does not reload the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const text = reason.trim();
  const ready = choice !== '' && text !== '' && !busy;

  const send = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await cooperativeRequestService.ask({ toCooperativeId: choice === LEAVE ? null : choice, reason: text });
      onSent(res.data.data);
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  const others = (options ?? []).filter((o) => o.id !== currentCooperativeId);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('cqTitle')}
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('btnCancel')}</button>
          <button type="button" className="btn btn-primary" onClick={send} disabled={!ready}>
            {busy ? <><span className="spinner" aria-hidden="true" />{t('cqSending')}</> : t('cqSend')}
          </button>
        </>
      }
    >
      <p className="form-hint form-hint--gap">{t('cqIntro')}</p>
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      <div className="form-group">
        <label className="form-label" htmlFor="cq-choice">{t('cqChoose')}</label>
        <select id="cq-choice" className="form-select" value={choice} disabled={options === null} onChange={(e) => setChoice(e.target.value)}>
          <option value="">{t('cqPick')}</option>
          {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          {currentCooperativeId ? <option value={LEAVE}>{t('cqNone')}</option> : null}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="cq-reason">{t('cqReason')} <span className="required" aria-hidden="true">*</span></label>
        <textarea
          id="cq-reason"
          className="form-textarea"
          rows={3}
          maxLength={REASON_MAX}
          value={reason}
          aria-describedby="cq-count"
          onChange={(e) => setReason(e.target.value)}
        />
        <span id="cq-count" className="form-hint">{fill(t('cqCount'), { n: reason.length })}</span>
      </div>
    </Modal>
  );
}
