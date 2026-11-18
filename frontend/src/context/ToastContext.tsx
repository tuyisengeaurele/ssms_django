import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import ToastList, { type Toast, type ToastAction, type ToastType } from './ToastList';

interface ToastContextValue {
  toast: (message: string, type?: ToastType, action?: ToastAction) => void;
  /** A toast with an action stays up longer, so there is time to use it. */
  success: (message: string, action?: ToastAction) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'info', action?: ToastAction) => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    // Several requests on one page can fail for the same reason at the same moment. One toast says it.
    setToasts(prev => (prev.some(t => t.message === message && t.type === type) ? prev : [...prev, { id, message, type, action }]));
    setTimeout(() => dismiss(id), action ? 7000 : 4000);
  }, [dismiss]);

  const success = useCallback((msg: string, action?: ToastAction) => toast(msg, 'success', action), [toast]);
  const error   = useCallback((msg: string) => toast(msg, 'error'),   [toast]);
  const warning = useCallback((msg: string) => toast(msg, 'warning'), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, warning }}>
      {children}
      <div className="toast-container">
        <ToastList toasts={toasts} onDismiss={dismiss} />
      </div>
    </ToastContext.Provider>
  );
}

/** For a place that can say something in a toast but works without one, such as a control shown outside the app. */
export function useOptionalToast(): ToastContextValue | null {
  return useContext(ToastContext);
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
