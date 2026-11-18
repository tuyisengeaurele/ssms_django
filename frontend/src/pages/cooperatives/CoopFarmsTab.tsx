import { Link } from 'react-router-dom';
import { CoopReport } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import { LEVEL_KEY } from '../../utils/farmRisk';
import type { PluralText } from '../../i18n/plural';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import Panel from '../../components/ui/Panel';
import { CoopPeriodBar, CoopReportGate } from './CoopReportGate';

const trim = (value: number, places = 2) => parseFloat(value.toFixed(places));

/** Why a farm is at the level it is: the counts behind it, in words. Empty when there is nothing to say. */
function whyText(f: CoopReport['farms'][number], tn: PluralText): string {
  const parts = [
    f.diseaseAlerts > 0 && tn(f.diseaseAlerts, 'fkDiseaseOne', 'fkDisease'),
    f.openAirAlerts > 0 && tn(f.openAirAlerts, 'fkAirOne', 'fkAir'),
    f.offlineDevices > 0 && tn(f.offlineDevices, 'fkDevicesOne', 'fkDevices'),
  ].filter(Boolean) as string[];
  return parts.join('; ');
}

/** Every farm of the cooperative once, the riskiest first, with what each did in the period. */
export default function CoopFarmsTab() {
  const { t, tn, locale } = useLanguage();
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
                      const why = whyText(f, tn);
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
