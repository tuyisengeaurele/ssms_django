import { useLanguage } from '../../context/LanguageContext';
import Avatar from './Avatar';
import { Icon } from './Icon';
import Modal from './Modal';

interface Props {
  open: boolean;
  name: string;
  photoUrl?: string | null;
  onClose: () => void;
  /** The pencil on the photo: leave the view and change the picture. */
  onChange: () => void;
}

/** The profile photo, larger. The one control on it is a pencil, with its words only for a screen reader. */
export default function PhotoViewer({ open, name, photoUrl, onClose, onChange }: Props) {
  const { t } = useLanguage();
  return (
    <Modal open={open} onClose={onClose} title={t('ppViewTitle')} maxWidth={440} initialFocus=".photo-large__edit">
      <div className="photo-large-wrap">
        <Avatar name={name} photoUrl={photoUrl} className="photo-large" />
        <button type="button" className="btn btn-primary btn-icon photo-large__edit" aria-label={t('ppChange')} title={t('ppChange')} onClick={onChange}>
          <Icon name="edit" size={18} />
        </button>
      </div>
    </Modal>
  );
}
