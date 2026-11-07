import { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import Modal from '../../components/ui/Modal';

interface Props {
  title: string;
  body: string;
  yesLabel: string;
  /** Runs the action. Returns the message to show inside the dialog, or null when it worked and the dialog may close. */
  onYes: () => Promise<string | null>;
  onClose: () => void;
  danger?: boolean;
}

/** A question before something that tells farmers or cannot be undone. */
export function ConfirmDialog({ title, body, yesLabel, onYes, onClose, danger }: Props) {
  const { t } = useLanguage();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const yes = async () => {
    setBusy(true);
    const message = await onYes();
    if (message) {
      setError(message);
      setBusy(false);
    } else {
      onClose();
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>{t('btnCancel')}</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={yes} disabled={busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : null}
            {yesLabel}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <p className="modal-text">{body}</p>
    </Modal>
  );
}
