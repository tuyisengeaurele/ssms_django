import { ChangeEvent, useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useApiError } from '../../hooks/useApiError';
import { accountService } from '../../services/account.service';
import { User } from '../../types';
import Avatar from './Avatar';
import Modal from './Modal';

/** The same limits as the server, so a file that would be refused is stopped before it is sent. */
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface Props {
  open: boolean;
  name: string;
  /** The photo the person has now, if any. */
  photoUrl?: string | null;
  onClose: () => void;
  /** The account as the server now has it, after a photo was saved or removed. */
  onChanged: (user: User) => void;
}

/** Add, replace or remove the profile photo. What is chosen is shown first, and nothing is sent until the person saves. */
export default function ProfilePhotoDialog({ open, name, photoUrl, onClose, onChanged }: Props) {
  const { t } = useLanguage();
  const { getErrorMessage } = useApiError();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // A dialog opened again starts empty. The preview address is given back when it is no longer shown.
  useEffect(() => {
    if (!open) return;
    setFile(null);
    setPreview(null);
    setError('');
    setBusy(false);
  }, [open]);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const choose = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    setFile(null);
    setPreview(null);
    setError('');
    if (!picked) return;
    if (!TYPES.includes(picked.type)) { setError(t('erPhotoNotImage')); return; }
    if (picked.size > MAX_BYTES) { setError(t('erPhotoTooLarge')); return; }
    setFile(picked);
    setPreview(URL.createObjectURL(picked));
  };

  const run = async (job: () => Promise<{ data: { data: User } }>) => {
    setBusy(true);
    setError('');
    try {
      const res = await job();
      onChanged(res.data.data);
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  };

  const shown = preview ?? photoUrl ?? null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('ppTitle')}
      footer={(
        <>
          {photoUrl ? (
            <button type="button" className="btn btn-ghost btn-quiet-danger" onClick={() => run(() => accountService.removePhoto())} disabled={busy}>{t('ppRemove')}</button>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>{t('btnCancel')}</button>
          <button type="button" className="btn btn-primary" onClick={() => file && run(() => accountService.uploadPhoto(file))} disabled={!file || busy}>
            {busy ? <><span className="spinner" aria-hidden="true" />{t('ppBusy')}</> : t('ppSave')}
          </button>
        </>
      )}
    >
      <div className="photo-picker">
        <Avatar name={name} photoUrl={shown} className="photo-preview" />
        <div className="form-group">
          <label className="form-label" htmlFor="pp-file">{t('ppChoose')}</label>
          <input
            id="pp-file"
            className="form-input"
            type="file"
            accept={TYPES.join(',')}
            onChange={choose}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'pp-error pp-hint' : 'pp-hint'}
          />
          {error ? <span id="pp-error" className="form-error" role="alert">{error}</span> : null}
          <span id="pp-hint" className="form-hint">{t('ppHint')}</span>
        </div>
      </div>
    </Modal>
  );
}
