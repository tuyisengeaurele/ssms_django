import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { mfaService } from '../../services/mfa.service';
import type { MfaStatus, MfaTrigger } from '../../types';
import { Icon } from '../ui/Icon';
import Modal from '../ui/Modal';
import { MfaReminderContext, PROMPT_KEY } from './mfaReminderContext';
import TwoStepSetup from './TwoStepSetup';

/** How long a moment waits to hear whether to remind. Longer than this and the person simply carries on. */
const PATIENCE_MS = 1500;

const SIGN_IN_MOMENTS: readonly string[] = ['login', 'new_device'];

function takeSignInMoment(): MfaTrigger | null {
  try {
    const left = sessionStorage.getItem(PROMPT_KEY);
    sessionStorage.removeItem(PROMPT_KEY);
    return left && SIGN_IN_MOMENTS.includes(left) ? (left as MfaTrigger) : null;
  } catch {
    return null;
  }
}

interface View {
  step: 'intro' | 'setup';
  /** True when SSMS brought it up, false when the person opened it themselves. Only the first can be put off. */
  reminded: boolean;
}

interface Props {
  /** Another dialog is waiting for an answer: a support request, or the warning before an idle sign out. */
  blocked: boolean;
  children: ReactNode;
}

/**
 * The reminder about two-step sign in, for farmers and supervisors. The server decides when (core/mfa_prompt.py). This
 * draws one dialog for it, never on top of another, and never lets anything wait long for the answer.
 */
export default function MfaReminderProvider({ blocked, children }: Props) {
  const { user, acting } = useAuth();
  const { t } = useLanguage();
  const eligible = !acting && (user?.role === 'FARMER' || user?.role === 'SUPERVISOR');

  const [view, setView] = useState<View | null>(null);
  // While a code is being checked, and while the recovery codes are on screen, the dialog cannot be closed.
  const [locked, setLocked] = useState(false);
  const [line, setLine] = useState(false);

  const waiting = useRef<(() => void)[]>([]);
  const blockedNow = useRef(blocked);
  blockedNow.current = blocked;
  const viewNow = useRef(view);
  viewNow.current = view;
  // What the dialog last showed, so it still reads right while it fades out.
  const last = useRef<View>({ step: 'intro', reminded: true });
  if (view) last.current = view;
  const told = useRef(false);

  const letGo = useCallback(() => {
    waiting.current.splice(0).forEach((resolve) => resolve());
  }, []);
  useEffect(() => letGo, [letGo]);

  const close = useCallback(() => {
    setView(null);
    setLocked(false);
    letGo();
  }, [letGo]);

  /** The status, or null when it cannot be had in time. A late answer still keeps the line right, and shows nothing. */
  const read = useCallback((trigger?: MfaTrigger): Promise<MfaStatus | null> => {
    const answer = Promise.resolve()
      .then(() => mfaService.status(trigger))
      .then((res) => {
        setLine(Boolean(res.data.data.reminderLine));
        return res.data.data;
      })
      .catch(() => null);
    if (!trigger) return answer;
    const patience = new Promise<null>((resolve) => { window.setTimeout(() => resolve(null), PATIENCE_MS); });
    return Promise.race([answer, patience]);
  }, []);

  const ask = useCallback(async (trigger: MfaTrigger) => {
    if (!eligible || blockedNow.current || viewNow.current) return;
    const status = await read(trigger);
    if (!status?.prompt?.show || viewNow.current) return;
    told.current = false;
    const closed = new Promise<void>((resolve) => { waiting.current.push(resolve); });
    setView({ step: 'intro', reminded: true });
    await closed;
  }, [eligible, read]);

  // Once for each person who arrives: the moment sign in left behind, or else only whether to show the line. The ref
  // keeps this to once when React draws twice while developing.
  const arrived = useRef<string | null>(null);
  useEffect(() => {
    if (!eligible || !user || arrived.current === user.id) return;
    arrived.current = user.id;
    const moment = takeSignInMoment();
    if (moment) void ask(moment);
    else void read();
  }, [eligible, user, ask, read]);

  // Another dialog hides the reminder, but not a set-up the person is in the middle of: that would throw away what they
  // typed, or the codes they have not kept yet.
  const open = view !== null && !(blocked && view.step === 'intro');

  useEffect(() => {
    if (!open || !view?.reminded || told.current) return;
    told.current = true;
    mfaService.seen().catch(() => {});
  }, [open, view]);

  const putOff = useCallback(() => {
    if (viewNow.current?.reminded) {
      // The dialog closes whether or not the server hears: at worst the reminder comes back sooner.
      Promise.resolve().then(() => mfaService.snooze()).catch(() => {});
      setLine(true);
    }
    close();
  }, [close]);

  const done = () => {
    setLine(false);
    close();
    void read();
  };

  const setUp = useCallback(() => setView({ step: 'setup', reminded: false }), []);
  const refresh = useCallback(() => { if (eligible) void read(); }, [eligible, read]);

  const shown = view ?? last.current;
  const intro = shown.step === 'intro';

  return (
    <MfaReminderContext.Provider value={{ ask, open, line: eligible && line, setUp, refresh }}>
      {children}
      <Modal
        open={open}
        onClose={putOff}
        title={t(intro ? 'adMfaSetupTitle' : 'mfaTurnOnTitle')}
        dismissible={!locked}
        initialFocus="[data-first]"
        footer={
          intro ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={putOff}>{t('mfaRemindLater')}</button>
              <button type="button" className="btn btn-primary" data-first="" onClick={() => setView({ ...shown, step: 'setup' })}>
                <Icon name="lock" size={14} />
                {t('mfaSetUpNow')}
              </button>
            </>
          ) : undefined
        }
      >
        {intro ? (
          <div className="two-step-remind">
            <span className="two-step-remind__mark" aria-hidden="true"><Icon name="lock" size={26} /></span>
            <p>{t('mfaRemindWhy')}</p>
            <p className="two-step-remind__how">{t('mfaRemindHow')}</p>
          </div>
        ) : view ? (
          // Drawn only while it is wanted, so nothing typed or shown outlives the dialog.
          <TwoStepSetup onDone={done} onCancel={putOff} onLock={setLocked} />
        ) : null}
      </Modal>
    </MfaReminderContext.Provider>
  );
}
