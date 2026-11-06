import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { supportService } from '../../services/support.service';
import { fill } from '../../utils/fill';
import SupportBanner from './SupportBanner';

const MINUTE = 60_000;

/** Whole minutes from now to `endsAt`, never below zero. */
export function minutesLeft(endsAt: string, now: number): number {
  return Math.max(0, Math.ceil((Date.parse(endsAt) - now) / MINUTE));
}

/** The banner of an admin who is acting as a person. It says who, how, and for how long, and ends the visit. */
export default function ActingBanner() {
  const { acting, stopActing } = useAuth();
  const { t } = useLanguage();
  const [now, setNow] = useState(() => Date.now());

  // Once a minute, not every second: a screen reader would otherwise read it out all the time.
  useEffect(() => {
    if (!acting) return undefined;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), MINUTE);
    return () => window.clearInterval(timer);
  }, [acting]);

  if (!acting) return null;

  const end = async () => {
    // Go back to the admin first, so the call to the server goes out with the admin's own token.
    stopActing();
    try {
      await supportService.end(acting.id);
    } catch {
      // The server ends the visit at its time limit anyway.
    }
  };

  const mode = acting.mode === 'edit' ? t('adSupportModeEditShort') : t('adSupportModeViewShort');
  const text = fill(t('adSupportBanner'), { name: acting.person.name, mode, minutes: minutesLeft(acting.endsAt, now) });
  return <SupportBanner text={text} endLabel={t('adSupportEnd')} onEnd={end} />;
}
