import { Link } from 'react-router-dom';
import { CoopReport } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { LEVEL_KEY } from '../../utils/farmRisk';
import { fill } from '../../utils/fill';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import Panel from '../../components/ui/Panel';
import { CoopPeriodBar, CoopReportGate } from './CoopReportGate';

const trim = (value: number, places = 2) => parseFloat(value.toFixed(places));

/** Why a farm is at the level it is: the counts behind it, in words. Empty when there is nothing to say. */
function whyText(f: CoopReport['farms'][number], t: (k: string) => string): string {
  const parts = [
    f.diseaseAlerts > 0 && fill(t(f.diseaseAlerts === 1 ? 'fkDiseaseOne' : 'fkDisease'), { n: f.diseaseAlerts }),
    f.openAirAlerts > 0 && fill(t(f.openAirAlerts === 1 ? 'fkAirOne' : 'fkAir'), { n: f.openAirAlerts }),
    f.offlineDevices > 0 && fill(t(f.offlineDevices === 1 ? 'fkDevicesOne' : 'fkDevices'), { n: f.offlineDevices }),
  ].filter(Boolean) as string[];
  return parts.join('; ');
}

/** Every farm of the cooperative once, the riskiest first, with what each did in the period. */
export default function CoopFarmsTab() {
  const { t, locale } = useLanguage();
  const number = new Intl.NumberFormat(locale);

  return (
    <div>
      <CoopPeriodBar />
      <CoopReportGate>
        {({ farms }) => (
          <Panel title={t('cpFarmsTitle')} note={t('crRiskNote')} flush>
            {farms.length === 0 ? (
              <EmptyState icon={<Icon name="farms" size={22} />} title={t('fkNoFarms')} />
            ) : (
              <div className="table-wrapper">
                <table className="table-stack">
                  <thead>
                    <tr>
                      <th>{t('crColFarm')}</th>
                      <th>{t('cpColRisk')}</th>
                      <th>{t('crColBatches')}</th>
                      <th>{t('crColKg')}</th>
                      <th>{t('crColAlerts')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {farms.map((f) => {
                      const why = whyText(f, t);
                      return (
                        <tr key={f.id} className="tbody-row">
                          <td className="cell-lead">
                            <div className="cell-stack">
                              <Link to={`/farms/${f.id}`} className="cell-strong">{f.name}</Link>
                              <span className="cell-sub">{f.ownerName}</span>
                            </div>
                          </td>
                          <td data-label={t('cpColRisk')}>
                            <div className="cell-stack">
                              <span><span className={`risk-badge risk-${f.level.toLowerCase()}`}>{t(LEVEL_KEY[f.level])}</span></span>
                              {why ? <span className="cell-sub cell-sub--wrap">{why}</span> : null}
                            </div>
                          </td>
                          <td data-label={t('crColBatches')}>{number.format(f.activeBatches)}</td>
                          <td data-label={t('crColKg')}>{number.format(trim(f.harvestKg))}</td>
                          <td data-label={t('crColAlerts')}>{number.format(f.alerts)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}
      </CoopReportGate>
    </div>
  );
}
