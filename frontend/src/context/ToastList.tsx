import { AnimatePresence, motion } from 'framer-motion';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error:   '✕',
  warning: '⚠',
  info:    'ℹ',
};

/** Loaded on the first toast, so pages that never show one skip the animation library. */
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
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          <span className="toast-icon" style={{ fontSize: '0.9rem', fontWeight: 700 }}>
            {ICONS[t.type]}
          </span>
          <span className="toast-msg">{t.message}</span>
          <button className="toast-close" aria-label="Close" onClick={() => onDismiss(t.id)}>✕</button>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}
