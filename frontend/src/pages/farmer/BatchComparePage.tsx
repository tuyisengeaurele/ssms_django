import { useEffect, useMemo, useState } from 'react';
import { createSearchParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import StageBadge from '../../components/ui/StageBadge';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import { batchService } from '../../services/batch.service';
import { ActiveBatch, batchSupervisorService } from '../../services/sensor.service';
import type { BatchComparison } from '../../types';
import { bestIndexes, curveRows } from '../../utils/compare';
import { fill } from '../../utils/fill';

const FEWEST = 2;
const MOST = 4;
// A different dash for each line as well as a different colour, so the lines can be told apart without colour.
const DASHES = [undefined, '7 4', '2 4', '9 4 2 4'];

const codeOf = (id: string) => id.slice(-8).toUpperCase();

/** The ids in the address, each once, or null when they are not two to four. */
function idsFrom(raw: string | null): string[] | null {
  const ids = [...new Set((raw ?? '').split(',').map((s) => s.trim()).filter(Boolean))];
  return ids.length >= FEWEST && ids.length <= MOST ? ids : null;
}

// ── Choosing ─────────────────────────────────────────────────────────────────

function Picker() {
  const { t, locale } = useLanguage();
  const { error: showError } = useToast();
  const { getErrorMessage } = useApiError();
  const navigate = useNavigate();
  const [batches, setBatches] = useState<ActiveBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [chosen, setChosen] = useState<string[]>([]);
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  useEffect(() => {
    batchSupervisorService.getActive()
      .then((r) => setBatches(r.data.data))
      .catch((e) => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (id: string) => setChosen((now) => (now.includes(id) ? now.filter((x) => x !== id) : now.length < MOST ? [...now, id] : now));
  const full = chosen.length >= MOST;
  const ready = chosen.length >= FEWEST;

  const go = () => navigate({ pathname: '/batches/compare', search: createSearchParams({ ids: chosen.join(',') }).toString() });

  if (loading) return <SkeletonTable rows={5} cols={3} />;
  if (batches.length < FEWEST) {
    return (
      <EmptyState
        icon={<Icon name="batches" size={22} />}
        title={t('cmpFewTitle')}
        description={t('cmpFewBody')}
        action={{ label: t('btGoFarms'), to: '/farms' }}
      />
    );
  }

  return (
    <Panel
      title={t('cmpPickTitle')}
      note={fill(t('cmpPicked'), { n: chosen.length })}
      actions={<button type="button" className="btn btn-primary btn-sm" disabled={!ready} onClick={go}>{t('cmpGo')}</button>}
    >
      <ul className="compare-options">
        {batches.map((b) => {
          const on = chosen.includes(b.id);
          return (
            <li key={b.id}>
              <label className={`compare-option${on ? ' is-on' : ''}`}>
                <input type="checkbox" checked={on} disabled={!on && full} onChange={() => toggle(b.id)} />
                {/* The spaces keep the name read out as separate words. */}
                <span className="cell-mono">#{codeOf(b.id)}</span>{' '}
                <span className="cell-strong">{b.farm?.name}</span>{' '}
                <StageBadge stage={b.stage} />{' '}
                <span className="cell-muted">{date.format(new Date(b.startDate))}</span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="compare-hint" role="status">
        {full ? t('cmpLimit') : !ready ? t('cmpGoHint') : ''}
      </p>
    </Panel>
  );
}

// ── The comparison ───────────────────────────────────────────────────────────

interface Row {
  label: string;
  /** What to show for each batch, or null for no data. */
  values: Array<string | null>;
  /** Which way is better, when one way is. Left out where more or less says nothing about how a batch did. */
  better?: { numbers: Array<number | null>; way: 'high' | 'low' };
}

function Chart({ batches }: { batches: BatchComparison[] }) {
  const { t } = useLanguage();
  const rows = useMemo(() => curveRows(batches), [batches]);
  if (rows.length === 0) return <p className="compare-hint">{t('cmpChartEmpty')}</p>;

  const kg = (n: number | null) => (n === null ? t('cmpNoData') : `${n} kg`);
  return (
    <div className="compare-chart" role="img" aria-label={t('cmpChartTitle')}>
      <ul className="compare-legend">
        {batches.map((b, i) => (
          <li key={b.id}>
            <svg width="26" height="8" aria-hidden="true">
              <line x1="0" y1="4" x2="26" y2="4" stroke={`var(--chart-${i + 1})`} strokeWidth="2.5" strokeDasharray={DASHES[i]} />
            </svg>
            #{b.code}
          </li>
        ))}
      </ul>
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="day" type="number" domain={['dataMin - 1', 'dataMax + 1']} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} />
          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: 'var(--chart-axis)' }} />
          <Tooltip
            cursor={{ stroke: 'var(--chart-cursor)' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="chart-tip">
                  <p className="chart-tip-label">{t('cmpChartDay')} {label}</p>
                  {payload.map((p) => (
                    <p key={String(p.dataKey)} className="chart-tip-value">#{codeOf(String(p.dataKey))}: {kg(p.value as number | null)}</p>
                  ))}
                </div>
              ) : null
            }
          />
          {batches.map((b, i) => (
            <Line key={b.id} dataKey={b.id} type="stepAfter" stroke={`var(--chart-${i + 1})`} strokeDasharray={DASHES[i]} strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <table className="sr-only">
        <caption>{t('cmpChartTitle')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('cmpChartDay')}</th>
            {batches.map((b) => <th key={b.id} scope="col">#{b.code}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.day}>
              <th scope="row">{r.day}</th>
              {batches.map((b) => <td key={b.id}>{kg(r[b.id])}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Result({ ids }: { ids: string[] }) {
  const { t, locale } = useLanguage();
  const [state, setState] = useState<{ batches: BatchComparison[] } | 'loading' | 'missing' | 'failed'>('loading');
  const key = ids.join(',');

  useEffect(() => {
    let live = true;
    setState('loading');
    batchService.compare(ids)
      .then((r) => { if (live) setState(r.data.data); })
      // A 404 means a batch is gone or not the person's to see. Anything else is a problem on our side.
      .catch((e: { response?: { status?: number } }) => { if (live) setState(e?.response?.status === 404 ? 'missing' : 'failed'); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (state === 'loading') return <SkeletonTable rows={8} cols={ids.length + 1} />;
  if (state === 'missing' || state === 'failed') {
    return (
      <EmptyState
        icon={<Icon name="batches" size={22} />}
        title={t('cmpErrorTitle')}
        description={t(state === 'missing' ? 'cmpErrorBody' : 'cmpErrorTryAgain')}
        action={{ label: t('cmpChange'), to: '/batches/compare' }}
      />
    );
  }

  const { batches } = state;
  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const some = (unit: 'BOXES' | 'WORMS') => batches.some((b) => b.quantityUnit === unit);
  const perUnit = (unit: 'BOXES' | 'WORMS') => batches.map((b) => (b.harvest.yieldPerUnit?.unit === unit ? b.harvest.yieldPerUnit.kg : null));
  const startedWith = (b: BatchComparison) => {
    if (!b.quantity) return null;
    if (b.quantityUnit === 'WORMS') return fill(t('cmpStartWorms'), { n: num.format(b.quantity) });
    return b.quantity === 1 ? t('cmpStartBoxOne') : fill(t('cmpStartBoxes'), { n: num.format(b.quantity) });
  };

  const groups: Array<{ title: string; rows: Row[] }> = [
    {
      title: t('cmpGroupBatch'),
      rows: [
        { label: t('cmpRowBreed'), values: batches.map((b) => b.breed || null) },
        { label: t('cmpRowStarted'), values: batches.map((b) => date.format(new Date(b.startDate))) },
        { label: t('cmpRowDays'), values: batches.map((b) => num.format(b.daysRunning)) },
        { label: t('cmpRowStart'), values: batches.map(startedWith) },
        { label: t('cmpRowRoom'), values: batches.map((b) => b.room) },
      ],
    },
    {
      title: t('cmpGroupGave'),
      rows: [
        {
          label: t('cmpRowCocoons'),
          values: batches.map((b) => `${num.format(b.harvest.cocoonKg)} kg`),
          better: { numbers: batches.map((b) => b.harvest.cocoonKg), way: 'high' },
        },
        {
          label: t('cmpRowSilk'),
          values: batches.map((b) => `${num.format(b.harvest.silkG)} g`),
          better: { numbers: batches.map((b) => b.harvest.silkG), way: 'high' },
        },
        // Per egg box and per thousand worms are different measures, so each has its own row and they are never ranked together.
        ...(some('BOXES') ? [{ label: t('cmpRowYieldBox'), values: perUnit('BOXES').map((v) => (v === null ? null : `${num.format(v)} kg`)), better: { numbers: perUnit('BOXES'), way: 'high' as const } }] : []),
        ...(some('WORMS') ? [{ label: t('cmpRowYieldWorms'), values: perUnit('WORMS').map((v) => (v === null ? null : `${num.format(v)} kg`)), better: { numbers: perUnit('WORMS'), way: 'high' as const } }] : []),
        { label: t('cmpRowRecords'), values: batches.map((b) => num.format(b.harvest.records)) },
        { label: t('cmpRowGrades'), values: batches.map((b) => `A ${b.harvest.grades.A} · B ${b.harvest.grades.B} · C ${b.harvest.grades.C}`) },
      ],
    },
    {
      title: t('cmpGroupHealth'),
      rows: [
        { label: t('cmpRowDeaths'), values: batches.map((b) => num.format(b.deaths)) },
        {
          label: t('cmpRowDeathRate'),
          values: batches.map((b) => (b.deathRatePct === null ? null : `${num.format(b.deathRatePct)} %`)),
          better: { numbers: batches.map((b) => b.deathRatePct), way: 'low' },
        },
        {
          label: t('cmpRowSafe'),
          values: batches.map((b) => (b.conditions ? `${num.format(b.conditions.inRangePct)} %` : null)),
          better: { numbers: batches.map((b) => b.conditions?.inRangePct ?? null), way: 'high' },
        },
        { label: t('cmpRowChecks'), values: batches.map((b) => num.format(b.checks.total)) },
        {
          label: t('cmpRowGrasserie'),
          values: batches.map((b) => num.format(b.checks.grasserie)),
          better: { numbers: batches.map((b) => b.checks.grasserie), way: 'low' },
        },
        {
          label: t('cmpRowAlerts'),
          values: batches.map((b) => num.format(b.alerts)),
          better: { numbers: batches.map((b) => b.alerts), way: 'low' },
        },
      ],
    },
  ];

  return (
    <>
      <Panel title={t('ptCompare')} flush actions={<Link to="/batches/compare" className="btn btn-secondary btn-sm">{t('cmpChange')}</Link>}>
        <div className="table-wrapper">
          <table className="compare-table">
            <caption className="sr-only">{t('ptCompare')}</caption>
            <thead>
              <tr>
                <td />
                {batches.map((b) => (
                  <th key={b.id} scope="col">
                    <Link to={`/batches/${b.id}`} className="compare-code">#{b.code}</Link>
                    <span className="compare-farm">{b.farm.name}</span>
                    <StageBadge stage={b.stage} />
                  </th>
                ))}
              </tr>
            </thead>
            {groups.map((group) => (
              <tbody key={group.title}>
                <tr className="compare-group">
                  <th colSpan={batches.length + 1} scope="colgroup">{group.title}</th>
                </tr>
                {group.rows.map((row) => {
                  const best = row.better ? bestIndexes(row.better.numbers, row.better.way) : [];
                  return (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      {row.values.map((value, i) => (
                        <td key={batches[i].id} className={best.includes(i) ? 'is-best' : undefined}>
                          {value ?? <span className="cell-muted">{t('cmpNoData')}</span>}
                          {best.includes(i) && <> <span className="compare-best" title={t('cmpBestTip')}>{t('cmpBest')}</span></>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      </Panel>

      <Panel title={t('cmpChartTitle')} note={t('cmpChartSub')}>
        <Chart batches={batches} />
      </Panel>
    </>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

export default function BatchComparePage() {
  const { t } = useLanguage();
  const [params] = useSearchParams();
  const ids = idsFrom(params.get('ids'));

  return (
    <div>
      <PageHeader
        title={t('ptCompare')}
        subtitle={ids ? t('cmpResultSubtitle') : t('cmpPickSubtitle')}
      />
      {ids ? <Result ids={ids} /> : <Picker />}
    </div>
  );
}
