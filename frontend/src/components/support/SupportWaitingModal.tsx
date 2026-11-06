import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useApiError } from '../../hooks/useApiError';
import { useStepUp } from '../../hooks/useStepUp';
import { supportService } from '../../services/support.service';
import type { SupportAdminRow } from '../../types';
import { fill } from '../../utils/fill';
import Modal from '../ui/Modal';
import '../../styles/support.css';

/** How often the admin's page asks whether the person has answered. */
const POLL_MS = 3000;

interface Props {
  open: boolean;
  accessId: string | null;
  personName: string;
  onClose: () => void;
}

/** Waits for the person to answer, then lets the admin start. Starting needs a fresh code from the authenticator app. */
export default function SupportWaitingModal({ open, accessId, personName, onClose }: Props) {
  const { t } = useLanguage();
  const { getErrorMessage } = useApiError();
  const navigate = useNavigate();
  const { startActing } = useAuth();
  const { run: runWithCode, modal: codeModal } = useStepUp();
  const [row, setRow] = useState<SupportAdminRow | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setRow(null);
    setError('');
    setBusy(false);
    if (!open || !accessId) return undefined;
    let live = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const res = await supportService.get(accessId);
        if (!live) return;
        setRow(res.data.data);
        // Only a request that is still waiting is asked about again.
        if (res.data.data.status !== 'requested') return;
      } catch {
        // A moment without a connection says nothing about the request, so try again.
      }
      if (live) timer = window.setTimeout(poll, POLL_MS);
    };
    poll();
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [open, accessId]);

  const status = row?.status ?? 'requested';

  const start = async () => {
    if (!accessId || !row) return;
    setError('');
    setBusy(true);
    try {
      const res = await runWithCode(() => supportService.start(accessId));
      const { access, token } = res.data.data;
      await startActing(token, { id: accessId, mode: access.grantedMode || 'view', endsAt: access.endsAt ?? '' });
      onClose();
      navigate('/');
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  const withdraw = async () => {
    if (!accessId) return;
    try {
      await supportService.cancel(accessId);
    } catch {
      // It may have been answered a moment ago. Either way this window is done.
    }
    onClose();
  };

  return (
    <>
      <Modal open={open} onClose={onClose} title={fill(t('adSupportWaitTitle'), { name: personName })}>
        {error ? <div className="alert alert-error" role="alert">{error}</div> : null}

        {status === 'requested' && <p className="modal-text">{fill(t('adSupportWaitBody'), { name: personName })}</p>}

        {status === 'approved' && (
          <>
            <p className="modal-text">{fill(t('adSupportAllowed'), { name: personName })}</p>
            <p className="modal-text">{row?.grantedMode === 'edit' ? t('adSupportAllowedEdit') : t('adSupportAllowedView')}</p>
          </>
        )}

        {status === 'rejected' && <p className="modal-text">{fill(t('adSupportRejected'), { name: personName })}</p>}
        {status === 'expired' && <p className="modal-text">{fill(t('adSupportExpired'), { name: personName })}</p>}

        <div className="support-waiting-actions">
          {status === 'approved' && (
            <button type="button" className="btn btn-primary" onClick={start} disabled={busy}>
              {busy ? <><span className="spinner" />{t('adSupportStarting')}</> : t('adSupportStart')}
            </button>
          )}
          {(status === 'requested' || status === 'approved') && (
            <button type="button" className="btn btn-secondary" onClick={withdraw}>{t('adSupportCancel')}</button>
          )}
        </div>
      </Modal>
      {codeModal}
    </>
  );
}
