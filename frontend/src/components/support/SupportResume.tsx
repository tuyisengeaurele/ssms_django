import { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { supportService } from '../../services/support.service';
import { takeSupportEnded } from '../../services/session';
import type { SupportAdminRow } from '../../types';
import { fill } from '../../utils/fill';
import { minutesLeft } from './ActingBanner';
import SupportBanner from './SupportBanner';

const NOTICE_MS = 8000;

/**
 * For an admin who is not acting. After a reload the support token is gone (it lives in memory), but the visit may
 * still be running. This offers to continue it or end it. It also says so when a visit has just ended.
 */
export default function SupportResume() {
  const { user, acting, startActing } = useAuth();
  const { t } = useLanguage();
  const [open, setOpen] = useState<SupportAdminRow | null>(null);
  const [notice, setNotice] = useState(false);
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    if (!isAdmin || acting) {
      setOpen(null);
      return undefined;
    }
    // The visit may have just ended: the server said so, or its time ran out. Say it once.
    if (takeSupportEnded()) {
      setNotice(true);
      const timer = window.setTimeout(() => setNotice(false), NOTICE_MS);
      return () => window.clearTimeout(timer);
    }
    let live = true;
    supportService.mine()
      .then((res) => {
        const found = res.data.data.open;
        if (live) setOpen(found && found.status === 'active' ? found : null);
      })
      .catch(() => {
        // Nothing to offer when the server cannot be reached.
      });
    return () => { live = false; };
  }, [isAdmin, acting]);

  if (!isAdmin || acting) return null;
  if (notice) return <SupportBanner text={t('adSupportEndedNotice')} />;
  if (!open || !open.endsAt) return null;

  const text = fill(t('adSupportResume'), { name: open.person.name, minutes: minutesLeft(open.endsAt, Date.now()) });
  const endsAt = open.endsAt;

  const resume = async () => {
    try {
      const res = await supportService.token(open.id);
      await startActing(res.data.data.token, { id: open.id, mode: open.grantedMode || 'view', endsAt });
    } catch {
      // The visit may have ended a moment ago. The strip goes away at the next load.
      setOpen(null);
    }
  };

  const end = async () => {
    try {
      await supportService.end(open.id);
    } catch {
      // The server ends it at its time limit anyway.
    }
    setOpen(null);
  };

  return (
    <SupportBanner
      text={text}
      endLabel={t('adSupportEnd')}
      onEnd={end}
      extra={<button type="button" className="support-banner-btn" onClick={resume}>{t('adSupportContinue')}</button>}
    />
  );
}
