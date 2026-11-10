import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { SupplyRound, supplyService } from '../../services/supply.service';
import { fill } from '../../utils/fill';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import RoundFormModal from './RoundFormModal';
import { dateFormat } from '../../utils/dateFormat';

const TONE: Record<string, string> = { draft: 'badge-gray', open: 'badge-green', closed: 'badge-yellow', allocated: 'badge-blue', done: 'badge-gray', cancelled: 'badge-red' };

/** The supply rounds of the cooperative: scheduled supplies of eggs, with the way to make a new one. */
export default function SupplyRoundsPage() {
  const { t, locale } = useLanguage();
  const { user } = useAuth();
  const [rounds, setRounds] = useState<SupplyRound[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [forming, setForming] = useState(false);

  const load = useCallback(() => {
    setStatus('loading');
    supplyService.listRounds().then((r) => { setRounds(r.data.data.rounds); setStatus('ready'); }).catch(() => setStatus('failed'));
  }, []);
  useEffect(load, [load]);

  const day = dateFormat(locale, { dateStyle: 'medium' });
  // An admin names no cooperative on this page, so only a supervisor makes a round here.
  const canMake = user?.role === 'SUPERVISOR';

  return (
    <div>
      <PageHeader
        title={t('ptSupply')}
        actions={canMake ? (
          <button className="btn btn-primary btn-sm" onClick={() => setForming(true)}>
            <Icon name="add" size={15} />
            {t('rsNew')}
          </button>
        ) : undefined}
      />

      {status === 'loading' ? (
        <SkeletonTable rows={3} cols={5} />
      ) : status === 'failed' ? (
        <EmptyState icon={<Icon name="alerts" size={22} />} title={t('rsLoadFailed')} action={{ label: t('dcsRetry'), onClick: load }} />
      ) : rounds.length === 0 ? (
        <EmptyState icon={<Icon name="batches" size={22} />} title={t('rsEmpty')} description={t('rsEmptyBody')} />
      ) : (
        <Panel title={t('ptSupply')} flush>
          <div className="table-wrapper">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>{t('rsColName')}</th>
                  <th>{t('rsColStatus')}</th>
                  <th>{t('rsColStock')}</th>
                  <th>{t('rsColDeadline')}</th>
                  <th>{t('rsColRequests')}</th>
                  <th><span className="sr-only">{t('thActions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {rounds.map((r) => (
                  <tr key={r.id} className="tbody-row">
                    <td className="cell-lead"><span className="cell-strong">{r.name}</span></td>
                    <td data-label={t('rsColStatus')}>
                      <span className={`badge ${TONE[r.status] ?? 'badge-gray'}`}>{t(`rsStatus_${r.status}`)}</span>
                      {r.paused && <span className="badge badge-yellow">{t('rsPaused')}</span>}
                    </td>
                    <td data-label={t('rsColStock')}>{r.stockBoxes}</td>
                    <td data-label={t('rsColDeadline')} className="cell-muted cell-nowrap">{day.format(new Date(r.requestDeadline))}</td>
                    <td data-label={t('rsColRequests')}>{r.requestCount ?? 0}</td>
                    <td data-label="">
                      <Link to={`/supply/${r.id}`} className="btn btn-ghost btn-xs" aria-label={fill(t('rsOpenFor'), { name: r.name })}>{t('dcsOpenRound')}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {forming && <RoundFormModal onClose={() => setForming(false)} onSaved={(made) => setRounds((prev) => [made, ...prev])} />}
    </div>
  );
}
