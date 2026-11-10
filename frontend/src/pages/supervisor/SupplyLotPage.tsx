import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { LotTrace, LotTraceBatch, supplyService } from '../../services/supply.service';
import { stageLabel } from '../../utils/constants';
import { boxesText } from '../../utils/boxes';
import { fill } from '../../utils/fill';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import StatTile from '../../components/ui/StatTile';

type Status = 'loading' | 'ready' | 'missing' | 'failed';

const BADGE: Record<LotTraceBatch['status'], { badge: string; word: string }> = {
  disease: { badge: 'badge-red', word: 'trcStatusDisease' },
  not_checked: { badge: 'badge-gray', word: 'trcStatusUnchecked' },
  healthy: { badge: 'badge-green', word: 'trcStatusHealthy' },
};

/** Every batch that got the same lot of eggs, so a disease on one farm can be followed to the others. Staff only. */
export default function SupplyLotPage() {
  const { code = '' } = useParams<{ code: string }>();
  const { t, locale } = useLanguage();
  const [lot, setLot] = useState<LotTrace | null>(null);
  const [status, setStatus] = useState<Status>('loading');

  const load = useCallback(() => {
    setStatus('loading');
    supplyService.lot(code)
      .then((r) => { setLot(r.data.data); setStatus('ready'); })
      // A lot of another cooperative and a lot that does not exist both answer 404, so one message serves both.
      .catch((err) => setStatus(axios.isAxiosError(err) && err.response?.status === 404 ? 'missing' : 'failed'));
  }, [code]);
  useEffect(() => { load(); }, [load]);

  const title = fill(t('trcTitle'), { code });

  if (status === 'loading') return <div><PageHeader title={title} showTitle /><SkeletonTable rows={3} cols={4} /></div>;
  if (status === 'missing') {
    return <div><PageHeader title={title} showTitle /><EmptyState icon={<Icon name="alerts" size={22} />} title={t('trcNotFound')} /></div>;
  }
  if (status === 'failed' || !lot) {
    return (
      <div>
        <PageHeader title={title} showTitle />
        <EmptyState icon={<Icon name="alerts" size={22} />} title={t('trcLoadFailed')} action={{ label: t('dcsRetry'), onClick: load }} />
      </div>
    );
  }

  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const s = lot.summary;
  const quantity = (b: LotTraceBatch) => (b.quantityUnit === 'BOXES' ? boxesText(t, b.quantity as number) : String(b.quantity));

  return (
    <div>
      <PageHeader title={fill(t('trcTitle'), { code: lot.lotCode })} showTitle />

      <div className="stack-24">
        {lot.round && (
          <p className="cell-sub cell-sub--wrap">
            {t('trcRound')} <Link to={`/supply/${lot.round.id}`} className="link">{lot.round.name}</Link>
          </p>
        )}

        <div className="grid-5">
          <StatTile label={t('trcStatBatches')} value={s.batches} />
          <StatTile label={t('trcStatFarms')} value={s.farms} />
          <StatTile label={t('trcStatDisease')} value={s.disease} />
          <StatTile label={t('trcStatHealthy')} value={s.healthy} good />
          <StatTile label={t('trcStatUnchecked')} value={s.notChecked} />
        </div>

        <Panel title={t('trcBatches')}>
          <div className="table-wrapper">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>{t('trcColFarmer')}</th>
                  <th>{t('trcColRoom')}</th>
                  <th>{t('trcColBatch')}</th>
                  <th>{t('trcColStatus')}</th>
                  <th>{t('trcColLastCheck')}</th>
                </tr>
              </thead>
              <tbody>
                {lot.batches.map((b) => (
                  <tr key={b.id} className="tbody-row">
                    <td className="cell-lead">
                      <div className="cell-person">
                        <Avatar name={b.owner.name} />
                        <div className="cell-stack">
                          <span className="cell-strong">{b.owner.name}</span>
                          <span className="cell-sub">{b.owner.email}</span>
                          <span className="cell-sub">{b.farm.name}</span>
                        </div>
                      </div>
                    </td>
                    <td data-label={t('trcColRoom')}>{b.room ? b.room.name : '-'}</td>
                    <td data-label={t('trcColBatch')} className="cell-mono">
                      <Link to={`/batches/${b.id}`} className="link">#{b.id.slice(-8).toUpperCase()}</Link>
                      <div className="cell-sub">{stageLabel(t, b.stage)}</div>
                      {b.quantity != null && <div className="cell-sub">{quantity(b)}</div>}
                    </td>
                    <td data-label={t('trcColStatus')}>
                      <div className="badge-row">
                        <span className={`badge ${BADGE[b.status].badge}`}>{t(BADGE[b.status].word)}</span>
                        {b.openAlert && <span className="badge badge-yellow">{t('trcOpenAlert')}</span>}
                      </div>
                    </td>
                    <td data-label={t('trcColLastCheck')} className="cell-muted">
                      {b.lastCheck ? fill(t('trcLastCheck'), { result: b.lastCheck.result, date: day.format(new Date(b.lastCheck.at)) }) : t('trcNoCheck')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
