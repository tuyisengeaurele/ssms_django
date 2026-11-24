import { ReactNode, useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { usePresence } from '../../hooks/usePresence';
import { Icon } from './Icon';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  maxWidth?: number;
  footer?: ReactNode;
  /** An alert dialog is read out at once. For a question that cannot wait, such as a sign out about to happen. */
  role?: 'dialog' | 'alertdialog';
  /** A selector for what gets the focus first. Without it the first field, or else the first control, does. */
  initialFocus?: string;
  /** False for a question that needs an answer: no close button, and Escape or a click outside do nothing. */
  dismissible?: boolean;
}

/** How long a closed dialog stays to play its leaving animation. The same as --duration-fast in index.css. */
const LEAVE_MS = 120;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ open, onClose, title, children, maxWidth = 480, footer, role = 'dialog', initialFocus, dismissible = true }: ModalProps) {
  const titleId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const { mounted, leaving } = usePresence(open, LEAVE_MS);

  // Close on ESC
  useEffect(() => {
    if (!open || !dismissible) return;
    function handler(e: globalThis.KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose, dismissible]);

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
    const wanted = initialFocus ? box?.querySelector<HTMLElement>(initialFocus) : null;
    const first = wanted ?? box?.querySelector<HTMLElement>('input, select, textarea') ?? box?.querySelector<HTMLElement>(FOCUSABLE);
    // Without scrolling: on a phone the field can be far down a long dialog, and a jump to it would hide what the dialog says.
    (first ?? box)?.focus({ preventScroll: true });
    return () => before?.focus?.();
    // The target is read once, when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  if (!mounted) return null;

  return createPortal(
    <div
      className="modal-overlay"
      data-leaving={leaving ? '' : undefined}
      // While it fades out it is no longer a dialog anyone can use, so it is not announced as one.
      aria-hidden={leaving ? true : undefined}
      onClick={(e) => { if (dismissible && e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={boxRef}
        className="modal-box"
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapTab}
        style={{ maxWidth }}
      >
        <div className="modal-header">
          <h2 id={titleId} className="modal-title">{title}</h2>
          {dismissible && (
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>

        <div className="modal-body">{children}</div>

        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
