import { useEffect, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { fill } from '../../utils/fill';
import Modal from '../ui/Modal';

interface Props {
  open: boolean;
  secondsLeft: number;
  onStay: () => void;
  onSignOut: () => void;
}

/** Shown a minute before an idle sign out. Escape or a click outside counts as staying, because the person is there. */
export default function IdleWarningModal({ open, secondsLeft, onStay, onSignOut }: Props) {
  const { t } = useLanguage();

  // A screen reader hears the countdown every 10 seconds. Every second would talk over everything else.
  const [announced, setAnnounced] = useState(secondsLeft);
  useEffect(() => {
    if (open && secondsLeft % 10 === 0) setAnnounced(secondsLeft);
  }, [open, secondsLeft]);
  useEffect(() => {
    if (open) setAnnounced(secondsLeft);
    // Only when it opens: the line above takes over from there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onStay}
      title={t('idTitle')}
      role="alertdialog"
      initialFocus="[data-autofocus]"
      maxWidth={440}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onSignOut}>{t('idSignOut')}</button>
          <button type="button" className="btn btn-primary" onClick={onStay} data-autofocus>{t('idStay')}</button>
        </>
      }
    >
      <p className="modal-text">{fill(t(secondsLeft === 1 ? 'idBodyOne' : 'idBody'), { n: secondsLeft })}</p>
      <p className="idle-count" aria-hidden="true">{secondsLeft}</p>
      <p className="sr-only" role="status" aria-live="polite">{fill(t('idLeft'), { n: announced })}</p>
    </Modal>
  );
}
