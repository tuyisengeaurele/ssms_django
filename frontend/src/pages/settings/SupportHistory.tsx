import { useEffect, useState } from 'react';
import Panel from '../../components/ui/Panel';
import { useLanguage } from '../../context/LanguageContext';
import { useApiError } from '../../hooks/useApiError';
import { supportService } from '../../services/support.service';
import type { SupportPersonRow } from '../../types';
import { fill } from '../../utils/fill';
import { dateFormat } from '../../utils/dateFormat';

/** Every time SSMS support asked to look at this person's account, and what became of it. */
export default function SupportHistory() {
  const { t, locale } = useLanguage();
  const { getErrorMessage } = useApiError();
  const [rows, setRows] = useState<SupportPersonRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    supportService.history()
      .then((res) => { if (live) setRows(res.data.data); })
      .catch((err: unknown) => { if (live) setError(getErrorMessage(err)); });
    return () => { live = false; };
    // The error text is built from the language, which is read once when the list loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const when = (iso: string) => dateFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  const mode = (row: SupportPersonRow) => (row.grantedMode === 'edit' ? t('supportModeEdit') : t('supportModeView'));
  const outcome = (row: SupportPersonRow) => {
    switch (row.status) {
      case 'ended': return fill(t('supportStatusEnded'), { mode: mode(row) });
      case 'active': return fill(t('supportStatusActive'), { mode: mode(row) });
      case 'approved': return t('supportStatusApproved');
      case 'rejected': return t('supportStatusRejected');
      case 'expired': return t('supportStatusExpired');
      case 'cancelled': return t('supportStatusCancelled');
      default: return t('supportStatusRequested');
    }
  };

  return (
    <Panel title={t('supportHistoryTitle')}>
      {error ? <div className="alert alert-error" role="alert">{error}</div> : null}
      {rows && rows.length === 0 && <p className="cell-muted">{t('supportHistoryEmpty')}</p>}
      {rows && rows.length > 0 && (
        <ul className="plain-list">
          {rows.map((row) => (
            <li key={row.id}>
              <span>
                {fill(t('supportHistoryRow'), { name: row.admin.name, when: when(row.requestedAt), outcome: outcome(row), reason: row.reason })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
