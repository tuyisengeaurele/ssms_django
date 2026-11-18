import { usePresenceList } from '../hooks/usePresence';

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

/** How long a closed toast stays to play its leaving animation. The same as --duration-fast in index.css. */
const LEAVE_MS = 120;

/**
 * The kind of toast is told by its colour alone. A symbol next to the cross that closes it only confused the two.
 */
export default function ToastList({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  const rows = usePresenceList(toasts, LEAVE_MS);
  return (
    <>
      {rows.map(({ item: t, leaving }) => (
        <div key={t.id} className={`toast toast-${t.type}`} data-leaving={leaving ? '' : undefined}>
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
        </div>
      ))}
    </>
  );
}
