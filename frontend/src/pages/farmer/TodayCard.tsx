import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import type { AttentionItem, AttentionKind } from '../../utils/attention';
import { fill } from '../../utils/fill';
import Panel from '../../components/ui/Panel';

const KEY: Record<AttentionKind, string> = {
  tempLow: 'taTempLow', tempHigh: 'taTempHigh', humLow: 'taHumLow', humHigh: 'taHumHigh',
  silent: 'taSilent', harvestLate: 'taHarvestLate', harvestToday: 'taHarvestToday',
  harvestTomorrow: 'taHarvestTomorrow', harvestSoon: 'taHarvestSoon',
};

/** What to look at today: rooms out of range, sensors gone quiet and harvests that are due. */
export default function TodayCard({ items }: { items: AttentionItem[] }) {
  const { t } = useLanguage();

  const words = (item: AttentionItem) => {
    // One day ago reads better as "yesterday", so it has its own sentence.
    const key = item.kind === 'harvestLate' && item.days === 1 ? 'taHarvestLateOne' : KEY[item.kind];
    return fill(t(key), {
      // A room problem names the room too, so a farm with several rooms says which one.
      farm: item.roomName ? `${item.farmName}, ${item.roomName}` : item.farmName, value: item.value ?? '', min: item.min ?? '', max: item.max ?? '',
      hours: item.hours ?? '', days: item.days ?? '',
    });
  };

  return (
    <Panel title={t('taTitle')} flush>
      {items.length === 0 ? (
        <div className="attention-clear">
          <p className="attention-clear-title">{t('taClear')}</p>
          <p className="attention-clear-body">{t('taClearBody')}</p>
        </div>
      ) : (
        <ul className="attention-list" aria-label={t('taTitle')}>
          {items.map((item) => (
            <li key={`${item.batchId}-${item.kind}`}>
              <Link to={`/batches/${item.batchId}`}>{words(item)}</Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
