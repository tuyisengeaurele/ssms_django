import { useCallback, useEffect, useState } from 'react';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { Allowance, supplyService } from '../../services/supply.service';
import { boxesText } from '../../utils/boxes';
import { fill } from '../../utils/fill';
import Panel from '../ui/Panel';
import AllowanceRequestModal from './AllowanceRequestModal';

/** What a farmer may take per round, where it came from, and the one thing they can do about it. */
export default function AllowanceCard() {
  const { t, locale } = useLanguage();
  const { success, error: showError } = useToast();
  const { getErrorMessage } = useApiError();
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [asking, setAsking] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

  const load = useCallback(() => {
    // A card that cannot load stays out of the way, so the dashboard around it is never blanked.
    supplyService.getAllowance().then((r) => setAllowance(r.data.data)).catch(() => setAllowance(null));
  }, []);
  useEffect(load, [load]);

  if (!allowance || allowance.source === 'none') return null;

  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const last = allowance.history.find((line) => line.kind !== 'start');
  const lastText = last
    ? fill(t(last.kind === 'reduction' ? 'alwLowered' : 'alwChanged'), {
        boxes: boxesText(t, last.newBoxes), name: last.byName ?? t('alwYourCooperative'), reason: last.reason,
      })
    : '';
  const waiting = allowance.openRequest;

  const withdraw = async () => {
    if (!waiting) return;
    setWithdrawing(true);
    try {
      await supplyService.withdraw(waiting.id);
      success(t('alwWithdrawn'));
      load();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setWithdrawing(false);
    }
  };

  return (
    <Panel title={t('alwTitle')}>
      <p className="allowance-amount">{boxesText(t, allowance.boxes)}</p>
      <p className="cell-sub">
        {allowance.source === 'set' && allowance.since ? fill(t('alwSourceSet'), { date: date.format(new Date(allowance.since)) }) : t('alwSourceDefault')}
      </p>
      {lastText && <p className="cell-sub">{lastText}</p>}
      <div className="allowance-actions">
        {waiting ? (
          <>
            <p role="status">{fill(t('alwWaiting'), { boxes: boxesText(t, waiting.boxesAsked) })}</p>
            <button className="btn btn-secondary btn-sm" onClick={withdraw} disabled={withdrawing}>{t('alwWithdraw')}</button>
          </>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={() => setAsking(true)}>{t('alwAsk')}</button>
        )}
      </div>
      {asking && <AllowanceRequestModal allowance={allowance} onClose={() => setAsking(false)} onSent={load} />}
    </Panel>
  );
}
