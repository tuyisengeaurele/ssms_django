import { useCallback, useRef, useState, type ReactElement } from 'react';
import axios from 'axios';
import CodeModal from '../components/auth/CodeModal';
import { useLanguage } from '../context/LanguageContext';
import { mfaService } from '../services/mfa.service';

/** The server wants a fresh code from the authenticator app before it does this. */
export function needsRecentCode(error: unknown): boolean {
  return (
    axios.isAxiosError(error) &&
    error.response?.status === 403 &&
    (error.response.data as { code?: string } | undefined)?.code === 'mfa_recent_required'
  );
}

interface Waiting {
  succeeded: () => void;
  cancelled: () => void;
}

/**
 * Runs a sensitive action, and when the server says it needs a recent code, asks for one and runs it once more.
 * Put `modal` somewhere in the page. Cancelling hands the original error back. Asking happens once per run, so a
 * second refusal after a good code is passed on and the person is never stuck in a loop.
 */
export function useStepUp(): { run: <T>(action: () => Promise<T>) => Promise<T>; modal: ReactElement } {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const waiting = useRef<Waiting | null>(null);

  const ask = useCallback(
    () =>
      new Promise<void>((resolve, reject) => {
        waiting.current = { succeeded: resolve, cancelled: () => reject(new Error('cancelled')) };
        setOpen(true);
      }),
    [],
  );

  const run = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T> => {
      try {
        return await action();
      } catch (error) {
        if (!needsRecentCode(error)) throw error;
        try {
          await ask();
        } catch {
          throw error;
        }
        return action();
      }
    },
    [ask],
  );

  const submit = async (code: string) => {
    await mfaService.stepUp(code);
    setOpen(false);
    waiting.current?.succeeded();
    waiting.current = null;
  };

  const cancel = () => {
    setOpen(false);
    waiting.current?.cancelled();
    waiting.current = null;
  };

  const modal = (
    <CodeModal
      open={open}
      title={t('adMfaStepUpTitle')}
      body={t('adMfaStepUpBody')}
      confirmLabel={t('adMfaStepUpConfirm')}
      onSubmit={submit}
      onCancel={cancel}
    />
  );

  return { run, modal };
}
