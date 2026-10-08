import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { batchSupervisorService, ActiveBatch } from '../../services/sensor.service';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { fill } from '../../utils/fill';
import { STAGE_LABELS, STAGE_ORDER } from '../../utils/constants';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import StageBadge from '../../components/ui/StageBadge';

type Tab = 'ALL' | (typeof STAGE_ORDER)[number];

export default function BatchesPage() {
  const { error: showError } = useToast();
  const { getErrorMessage } = useApiError();
  const { t, locale } = useLanguage();

  const [batches, setBatches] = useState<ActiveBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('ALL');

  useEffect(() => {
    batchSupervisorService.getActive()
      .then((r) => setBatches(r.data.data))
      .catch((e) => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const query = search.trim().toLowerCase();
  const inStage = (stage: Tab) => (stage === 'ALL' ? batches : batches.filter((b) => b.stage === stage));
  const visible = inStage(tab).filter((b) => !query || (b.farm?.name ?? '').toLowerCase().includes(query));
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'ALL', label: t('btTabAll') },
    ...STAGE_ORDER.map((s) => ({ id: s as Tab, label: STAGE_LABELS[s] })),
  ];

  return (
    <div>
      <PageHeader
        title={t('ptBatches')}
        subtitle={loading ? undefined : fill(t(batches.length === 1 ? 'btSubtitleOne' : 'btSubtitleMany'), { n: batches.length })}
        actions={
          <Link to="/farms" className="btn btn-primary btn-sm">
            <Icon name="add" size={15} />
            {t('btNew')}
          </Link>
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

        {loading ? (
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
                    <td data-label={t('btColHarvest')} className="cell-muted cell-nowrap">{date.format(new Date(b.expectedHarvestDate))}</td>
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
