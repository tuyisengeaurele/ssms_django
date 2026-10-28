import { Suspense, lazy, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { farmService } from '../../services/farm.service';
import { FarmRisk } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { fill } from '../../utils/fill';
import { LEVEL_KEY, riskReasons } from '../../utils/farmRisk';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import Panel from '../../components/ui/Panel';

// The map brings in a mapping library, so it is only fetched when someone opens the Map tab.
const FarmMap = lazy(() => import('./FarmMap'));

// Only this many farms are listed at first, so the dashboard stays short.
const FIRST = 5;

/** The farms that need a look first, and why, as a list or on a map. The server ranks them; this only shows the answer. */
export default function FarmRiskPanel() {
  const { t } = useLanguage();
  const [rows, setRows] = useState<FarmRisk[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [all, setAll] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    farmService.getRisk()
      .then((res) => live && setRows(res.data.data))
      .catch(() => live && setFailed(true))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [attempt]);

  const needing = rows.filter((r) => r.level !== 'OK');
  const shown = all ? rows : needing.slice(0, FIRST);
  const toggle = all || rows.length > shown.length;
  const tabs = !loading && !failed && rows.length > 0;

  return (
    <Panel title={t('fkTitle')} note={t('fkRule')} flush>
      {tabs && (
        <div className="tabs" role="tablist">
          {(['list', 'map'] as const).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} className={view === id ? 'is-on' : ''} onClick={() => setView(id)}>
              {t(id === 'list' ? 'mpTabList' : 'mpTabMap')}
            </button>
          ))}
        </div>
      )}
      {loading ? (
        <p className="panel-loading"><span className="spinner" /></p>
      ) : failed ? (
        <div className="panel-body">
          <div className="alert alert-error" role="alert">
            <span>{t('fkLoadError')}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAttempt((n) => n + 1)}>{t('fkRetry')}</button>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState icon={<Icon name="farms" size={22} />} title={t('fkNoFarms')} />
      ) : view === 'map' ? (
        <Suspense fallback={<p className="panel-loading"><span className="spinner" /></p>}>
          <FarmMap rows={rows} />
        </Suspense>
      ) : (
        <>
          {shown.length === 0 ? (
            <p className="risk-calm">{t('fkNone')}</p>
          ) : (
            <ul className="risk-list" aria-label={t('fkTitle')}>
              {shown.map((r) => (
                <li key={r.id}>
                  <div className="risk-head">
                    <Link to={`/farms/${r.id}`} className="risk-name">{r.name}</Link>
                    <span className={`risk-badge risk-${r.level.toLowerCase()}`}>{t(LEVEL_KEY[r.level])}</span>
                    <span className="risk-owner">{r.ownerName}</span>
                  </div>
                  {riskReasons(r, t).length > 0 && (
                    <ul className="risk-why">
                      {riskReasons(r, t).map((why) => <li key={why}>{why}</li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
          {toggle && (
            <div className="risk-foot">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll((v) => !v)}>
                {all ? t('fkShowLess') : fill(t(rows.length === 1 ? 'fkShowOne' : 'fkShowAll'), { n: rows.length })}
              </button>
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
