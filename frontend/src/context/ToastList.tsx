import { AnimatePresence, motion } from 'framer-motion';
import { settle } from '../utils/motion';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

/** A button on the toast, for example Undo. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

/**
 * Loaded on the first toast, so pages that never show one skip the animation library.
 * The kind of toast is told by its colour alone. A symbol next to the cross that closes it only confused the two.
 */
export default function ToastList({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <AnimatePresence initial={false}>
      {toasts.map(t => (
        <motion.div
          key={t.id}
          className={`toast toast-${t.type}`}
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.95 }}
          transition={settle}
        >
          <span className="toast-msg">{t.message}</span>
          {t.action ? (
            <button
              className="toast-action"
              onClick={() => {
                t.action?.onClick();
                onDismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          ) : null}
          <button className="toast-close" aria-label="Close" onClick={() => onDismiss(t.id)}>✕</button>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
