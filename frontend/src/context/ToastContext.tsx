import { createContext, lazy, Suspense, useContext, useState, useCallback, ReactNode } from 'react';
import type { Toast, ToastType } from './ToastList';

const ToastList = lazy(() => import('./ToastList'));

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Once the first toast has appeared the list stays mounted, so exit animations can finish.
  const [shown, setShown] = useState(false);

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
    setShown(true);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);

  const success = useCallback((msg: string) => toast(msg, 'success'), [toast]);
  const error   = useCallback((msg: string) => toast(msg, 'error'),   [toast]);
  const warning = useCallback((msg: string) => toast(msg, 'warning'), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, warning }}>
      {children}
      <div className="toast-container">
        {shown && (
          <Suspense fallback={null}>
            <ToastList toasts={toasts} onDismiss={dismiss} />
          </Suspense>
        )}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
