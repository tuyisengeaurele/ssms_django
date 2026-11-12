import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { batchSupervisorService, ActiveBatch } from '../../services/sensor.service';
import { useLanguage } from '../../context/LanguageContext';
import { fill } from '../../utils/fill';
import { harvestHint } from '../../utils/harvestHint';
import { stageLabel, STAGE_ORDER } from '../../utils/constants';
import EmptyState from '../../components/ui/EmptyState';
import LoadError from '../../components/ui/LoadError';
import { Icon } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import StageBadge from '../../components/ui/StageBadge';
import { dateFormat } from '../../utils/dateFormat';

type Tab = 'ALL' | (typeof STAGE_ORDER)[number];

export default function BatchesPage() {
  const { t, locale } = useLanguage();

  const [batches, setBatches] = useState<ActiveBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('ALL');

  useEffect(() => {
    setLoading(true);
    setFailed(false);
    batchSupervisorService.getActive()
      .then((r) => setBatches(r.data.data))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [attempt]);

  const query = search.trim().toLowerCase();
  const inStage = (stage: Tab) => (stage === 'ALL' ? batches : batches.filter((b) => b.stage === stage));
  const visible = inStage(tab).filter((b) => !query || (b.farm?.name ?? '').toLowerCase().includes(query));
  const date = dateFormat(locale, { dateStyle: 'medium' });

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'ALL', label: t('btTabAll') },
    ...STAGE_ORDER.map((s) => ({ id: s as Tab, label: stageLabel(t, s) })),
  ];

  return (
    <div>
      <PageHeader
        title={t('ptBatches')}
        subtitle={loading || failed ? undefined : fill(t(batches.length === 1 ? 'btSubtitleOne' : 'btSubtitleMany'), { n: batches.length })}
        actions={
          <>
            <Link to="/batches/compare" className="btn btn-secondary btn-sm">{t('ptCompare')}</Link>
            <Link to="/farms" className="btn btn-primary btn-sm">
              <Icon name="add" size={15} />
              {t('btNew')}
            </Link>
          </>
        }
      />

      <Panel
        title={t('ptBatches')}
        flush
        actions={
          <div className="search-box">
            <Icon name="search" size={16} className="icon" />
            <input type="search" aria-label={t('btSearch')} placeholder={t('btSearch')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        }
      >
        <div className="tabs" role="tablist">
          {tabs.map((x) => (
            <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} className={tab === x.id ? 'is-on' : ''} onClick={() => setTab(x.id)}>
              {x.label} ({inStage(x.id).length})
            </button>
          ))}
        </div>

        {failed ? (
          <LoadError onRetry={() => setAttempt((n) => n + 1)} />
        ) : loading ? (
          <SkeletonTable rows={6} cols={5} />
        ) : batches.length === 0 ? (
          <EmptyState
            icon={<Icon name="batches" size={22} />}
            title={t('btNone')}
            description={t('btNoneBody')}
            action={{ label: t('btGoFarms'), to: '/farms' }}
          />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<Icon name="search" size={22} />}
            title={query ? t('btNoMatch') : t('btNoStage')}
            description={query ? t('btNoMatchBody') : undefined}
          />
        ) : (
          <div className="table-wrapper">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>{t('btColBatch')}</th>
                  <th>{t('btColFarm')}</th>
                  <th>{t('btColStage')}</th>
                  <th>{t('btColStarted')}</th>
                  <th>{t('btColHarvest')}</th>
                  <th><span className="sr-only">{t('btDetails')}</span></th>
                </tr>
              </thead>
              <tbody>
                {visible.map((b) => (
                  <tr key={b.id} className="tbody-row">
                    <td className="cell-lead cell-mono cell-muted">#{b.id.slice(-8).toUpperCase()}</td>
                    <td data-label={t('btColFarm')} className="cell-strong">{b.farm?.name ?? '-'}</td>
                    <td data-label={t('btColStage')}><StageBadge stage={b.stage} /></td>
                    <td data-label={t('btColStarted')} className="cell-muted cell-nowrap">{date.format(new Date(b.startDate))}</td>
                    <td data-label={t('btColHarvest')} className="cell-muted cell-nowrap">
                      {date.format(new Date(b.expectedHarvestDate))}
                      {(() => {
                        const hint = harvestHint(b.expectedHarvestDate, b.stage);
                        if (!hint) return null;
                        const words = hint.kind === 'left' ? fill(t('btLeft'), { n: hint.days })
                          : hint.kind === 'tomorrow' ? t('btTomorrow')
                          : hint.kind === 'today' ? t('btToday')
                          : hint.days === 1 ? t('btLateOne') : fill(t('btLate'), { n: hint.days });
                        return <span className="cell-hint" data-kind={hint.kind}>{words}</span>;
                      })()}
                    </td>
                    <td data-label="">
                      <div className="table-actions">
                        <Link to={`/batches/${b.id}`} className="btn btn-ghost btn-xs" aria-label={`${t('btDetails')} ${b.farm?.name ?? ''}`}>{t('btDetails')}</Link>
                        <Link to={`/batches/${b.id}/detect`} className="btn btn-ghost btn-xs" aria-label={`${t('btCheck')} ${b.farm?.name ?? ''}`}>
                          <Icon name="detections" size={14} />
                          {t('btCheck')}
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
