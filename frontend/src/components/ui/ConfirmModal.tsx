import { ReactNode } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { Icon, IconName } from './Icon';
import Modal from './Modal';

interface Props {
  open: boolean;
  title: string;
  /** One short sentence under the title, when the title alone does not say enough. */
  children?: ReactNode;
  confirmLabel: string;
  confirmIcon?: IconName;
  /** The way out. "Keep" by default, for something that would be taken away. */
  keepLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** The question before something is taken back or removed. The red button does it, the other one leaves things as they are. */
export default function ConfirmModal({ open, title, children, confirmLabel, confirmIcon = 'close', keepLabel, busy = false, onConfirm, onClose }: Props) {
  const { t } = useLanguage();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      maxWidth={420}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>{keepLabel ?? t('cfKeep')}</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}><Icon name={confirmIcon} size={15} />{confirmLabel}</button>
        </>
      )}
    >
      {children ?? null}
    </Modal>
  );
}
