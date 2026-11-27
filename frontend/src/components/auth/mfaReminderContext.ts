import { createContext, useContext } from 'react';
import type { MfaTrigger } from '../../types';

/** Sign in leaves the moment here, and the signed in app reads it once. A reload therefore asks nothing again. */
export const PROMPT_KEY = 'ssms_prompt';

export interface MfaReminder {
  /** A moment has come. Resolves when the reminder is closed, or at once when none is shown. It never fails. */
  ask: (trigger: MfaTrigger) => Promise<void>;
  /** The reminder is on screen, so another dialog should step aside. */
  open: boolean;
  /** Whether a dashboard shows the quiet "Secure your account" line. */
  line: boolean;
  /** Opens the set-up with nothing in front of it, for the person who asked for it. */
  setUp: () => void;
  /** Two-step sign in was just turned on or off. */
  refresh: () => void;
}

// Outside the signed in app there is nothing to remind about, so nobody ever waits.
const NONE: MfaReminder = { ask: () => Promise.resolve(), open: false, line: false, setUp: () => {}, refresh: () => {} };

export const MfaReminderContext = createContext<MfaReminder>(NONE);

export const useMfaReminder = () => useContext(MfaReminderContext);
