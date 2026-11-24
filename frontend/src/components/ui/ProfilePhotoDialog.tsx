import { ChangeEvent, useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { useApiError } from '../../hooks/useApiError';
import { accountService } from '../../services/account.service';
import { User } from '../../types';
import { CropState, cropToFile, loadImage } from '../../utils/photoCrop';
import Avatar from './Avatar';
import { Icon } from './Icon';
import Modal from './Modal';
import PhotoCropper, { CROP_WINDOW } from './PhotoCropper';

/** What can be chosen. The upload is the cropped square, a small file, so the original may be a full size phone photo. */
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_ORIGINAL = 25 * 1024 * 1024;
const FRESH: CropState = { zoom: 1, x: 0, y: 0 };

interface Props {
  open: boolean;
  name: string;
  /** The photo the person has now, if any. */
  photoUrl?: string | null;
  onClose: () => void;
  /** The account as the server now has it, after a photo was saved or removed. */
  onChanged: (user: User) => void;
}

/** Add, replace or remove the profile photo. The person picks a picture, moves and zooms it inside a round window, and saves. */
export default function ProfilePhotoDialog({ open, name, photoUrl, onClose, onChanged }: Props) {
  const { t } = useLanguage();
  const { getErrorMessage } = useApiError();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<CropState>(FRESH);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);
  const address = useRef<string | null>(null);

  const forget = () => {
    if (address.current) URL.revokeObjectURL(address.current);
    address.current = null;
  };

  // A dialog opened again starts empty. The address of the chosen file is given back when it is no longer shown.
  useEffect(() => {
    if (!open) return;
    forget();
    setImage(null);
    setCrop(FRESH);
    setError('');
    setBusy(false);
    setRemoving(false);
  }, [open]);
  useEffect(() => forget, []);

  const choose = async (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0] ?? null;
    e.target.value = '';   // so the same file can be chosen again
    forget();
    setImage(null);
    setCrop(FRESH);
    setError('');
    if (!picked) return;
    if (!TYPES.includes(picked.type)) { setError(t('erPhotoNotImage')); return; }
    if (picked.size > MAX_ORIGINAL) { setError(t('erPhotoTooLarge')); return; }
    address.current = URL.createObjectURL(picked);
    try {
      setImage(await loadImage(address.current));
    } catch {
      forget();
      setError(t('erPhotoNotImage'));
    }
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

  const save = () => {
    if (image) run(async () => accountService.uploadPhoto(await cropToFile(image, crop, CROP_WINDOW)));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('ppTitle')}
      footer={removing ? (
        <>
          <button type="button" className="btn btn-secondary" onClick={() => setRemoving(false)} disabled={busy}>{t('btnCancel')}</button>
          <button type="button" className="btn btn-danger" onClick={() => run(() => accountService.removePhoto())} disabled={busy}>
            {busy ? <><span className="spinner" aria-hidden="true" />{t('ppBusy')}</> : <><Icon name="remove" size={15} />{t('ppRemove')}</>}
          </button>
        </>
      ) : (
        <>
          {photoUrl ? (
            <button type="button" className="btn btn-secondary btn-quiet-danger" onClick={() => setRemoving(true)} disabled={busy}><Icon name="remove" size={15} />{t('ppRemove')}</button>
          ) : null}
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>{t('btnCancel')}</button>
          <button type="button" className="btn btn-primary" onClick={save} disabled={!image || busy}>
            {busy ? <><span className="spinner" aria-hidden="true" />{t('ppBusy')}</> : t('ppSave')}
          </button>
        </>
      )}
    >
      {removing ? (
        <div className="photo-picker">
          <Avatar name={name} photoUrl={photoUrl} className="photo-preview" />
          <p className="modal-text">{t('ppRemoveAsk')}</p>
          {error ? <span className="form-error" role="alert">{error}</span> : null}
        </div>
      ) : (
      <div className="photo-picker">
        {image ? <PhotoCropper image={image} state={crop} onChange={setCrop} /> : <Avatar name={name} photoUrl={photoUrl} className="photo-preview" />}
        <div className="photo-picker__choose">
          <input
            id="pp-file"
            className="sr-only"
            type="file"
            accept={TYPES.join(',')}
            onChange={choose}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'pp-error pp-hint' : 'pp-hint'}
          />
          <label htmlFor="pp-file" className="btn btn-secondary btn-sm file-button"><Icon name="camera" size={15} />{t('ppChoose')}</label>
          <span id="pp-hint" className="form-hint">{t('ppHint')}</span>
          {error ? <span id="pp-error" className="form-error" role="alert">{error}</span> : null}
        </div>
      </div>
      )}
    </Modal>
  );
}
