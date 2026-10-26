import { ReactNode, useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from './Icon';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: number;
  footer?: ReactNode;
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ open, onClose, title, children, maxWidth = 480, footer }: ModalProps) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);

  // Close on ESC
  useEffect(() => {
    if (!open) return;
    function handler(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (open) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Move focus into the dialog, and give it back when the dialog closes.
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    const first = box?.querySelector<HTMLElement>('input, select, textarea') ?? box?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? box)?.focus();
    return () => before?.focus?.();
  }, [open]);

  // Keep Tab inside the dialog.
  const trapTab = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !boxRef.current) return;
    const items = Array.from(boxRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            ref={boxRef}
            className="modal-box"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            onKeyDown={trapTab}
            style={{ maxWidth }}
            initial={{ opacity: 0, scale: 0.96, y: 14 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 8 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="modal-header">
              <h2 id={titleId} className="modal-title">{title}</h2>
              <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
                <Icon name="close" size={16} />
              </button>
            </div>

            <div className="modal-body">{children}</div>

            {footer && <div className="modal-footer">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
