import { useEffect, useState } from 'react';
import { coopReportService, CoopReportParams } from '../../services/coopReport.service';
import { CoopReport } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useAutoFilters } from '../../hooks/useAutoFilters';

const DEFAULT_DAYS = 30;
const MAX_DAYS = 366;

interface Dates {
  from: string;
  to: string;
}

type DateProblem = 'cpNeedDates' | 'cpEndBefore' | 'cpTooLong';

/** A date as the year-month-day the server asks for, in the person's own calendar day. */
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function lastThirtyDays(): Dates {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (DEFAULT_DAYS - 1));
  return { from: iso(start), to: iso(today) };
}

/** The key of the sentence that says why these dates cannot make a report, or null when they can. */
function problemWith(d: Dates): DateProblem | null {
  if (!d.from || !d.to) return 'cpNeedDates';
  if (d.to < d.from) return 'cpEndBefore';
  const days = Math.round((Date.parse(d.to) - Date.parse(d.from)) / 86_400_000) + 1;
  return days > MAX_DAYS ? 'cpTooLong' : null;
}

/**
 * The report of a cooperative for the days the person chose. `cooperativeId` is the one cooperative an admin opened;
 * left out, the report is for every cooperative (an admin) or for the supervisor's own. The report is only asked for
 * while `enabled`, so a section that does not show it does not make the server build it.
 */
export function useCoopReport(cooperativeId: string | undefined, enabled: boolean) {
  const { t, locale } = useLanguage();
  const { error: showError } = useToast();
  const [start] = useState(lastThirtyDays);
  const { draft, applied, set, reset, changed } = useAutoFilters<Dates>(start);

  const [report, setReport] = useState<CoopReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [making, setMaking] = useState<'csv' | 'pdf' | null>(null);

  const draftProblem = problemWith(draft);
  const appliedProblem = problemWith(applied);
  const params: CoopReportParams = { ...applied, ...(cooperativeId ? { cooperative: cooperativeId } : {}) };

  useEffect(() => {
    if (!enabled || appliedProblem) return undefined;
    let live = true;
    setLoading(true);
    setFailed(false);
    coopReportService.get(params)
      .then((res) => live && setReport(res.data.data))
      .catch(() => live && setFailed(true))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, applied, cooperativeId, attempt]);

  const download = (kind: 'csv' | 'pdf') => async () => {
    setMaking(kind);
    try {
      await coopReportService.download(params, kind, locale);
    } catch {
      showError(t('auExportError'));
    } finally {
      setMaking(null);
    }
  };

  return {
    report, loading, failed, retry: () => setAttempt((n) => n + 1),
    draft, set, reset, changed, draftProblem, appliedProblem,
    making, download, blocked: !!draftProblem || !!appliedProblem || loading || failed || making !== null,
  };
}

export type CoopPeriod = ReturnType<typeof useCoopReport>;
