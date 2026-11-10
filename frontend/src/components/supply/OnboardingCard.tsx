import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { Onboarding, OnboardingStep, supplyService } from '../../services/supply.service';
import { boxesText } from '../../utils/boxes';
import { fill } from '../../utils/fill';
import Panel from '../ui/Panel';
import { localDay } from './SupplyRoundCard';
import { dateFormat } from '../../utils/dateFormat';

type Mark = 'done' | 'next' | 'waiting' | 'later';

/** What a new farmer has done, what they do next, and who they are waiting for. It is not there once they are past every step. */
export default function OnboardingCard() {
  const { t, locale } = useLanguage();
  const [data, setData] = useState<Onboarding | null>(null);

  useEffect(() => {
    // A card that cannot load stays out of the way, so the dashboard around it is never blanked.
    supplyService.onboarding().then((r) => setData(r.data.data)).catch(() => setData(null));
  }, []);

  if (!data || data.complete) return null;

  const names = (list?: string[]) => new Intl.ListFormat(locale, { type: 'conjunction' }).format(list ?? []);
  const day = dateFormat(locale, { dateStyle: 'medium' });
  const farm = data.steps.find((s) => s.key === 'farm');

  const body = (step: OnboardingStep) => {
    const d = step.detail;
    switch (`${step.key}:${step.state}`) {
      case 'cooperative:todo': return t('onbCoopTodo');
      case 'farm:todo': return <Link to="/farms/new" className="link">{t('onbFarmLink')}</Link>;
      case 'room:todo': return farm?.detail.farmId
        ? <Link to={`/farms/${farm.detail.farmId}`} className="link">{t('onbRoomLink')}</Link>
        : t('onbNeedFarm');
      case 'room:waiting': return fill(t('onbRoomWaiting'), { names: names(d.waitingFor) });
      case 'room:rejected': {
        const why = d.note ? fill(t('onbRoomRejected'), { note: d.note }) : t('onbRoomRejectedNoNote');
        if (!farm?.detail.farmId) return why;
        return <>{why} <Link to={`/farms/${farm.detail.farmId}`} className="link">{t('onbRoomOpenFarm')}</Link></>;
      }
      case 'eggs:no_round': return t('onbEggsNoRound');
      case 'eggs:needs_room': return fill(t('onbEggsNeedsRoom'), { round: d.roundName ?? '' });
      case 'eggs:ready': return fill(t('onbEggsReady'), { round: d.roundName ?? '' });
      case 'eggs:waiting': return fill(t('onbEggsWaiting'), { round: d.roundName ?? '', names: names(d.waitingFor) });
      case 'eggs:approved': return fill(t('onbEggsApproved'), {
        boxes: boxesText(t, d.boxes ?? 0), date: d.deliveryDate ? day.format(localDay(d.deliveryDate)) : '', place: d.deliveryPlace ?? '',
      });
      case 'eggs:not_given': return d.note ? fill(t('onbEggsNotGiven'), { note: d.note }) : t('onbEggsNotGivenNoNote');
      default: return null;
    }
  };

  const labelOf: Record<OnboardingStep['key'], string> = { cooperative: 'onbCoop', farm: 'onbFarm', room: 'onbRoom', eggs: 'onbEggs' };
  const markText: Record<Mark, string> = { done: t('onbMarkDone'), next: t('onbMarkNext'), waiting: t('onbMarkWaiting'), later: t('onbMarkLater') };

  // The first step that is not done is the one to look at. A state of waiting says the farmer cannot move it themselves.
  let firstOpen = true;
  const rows = data.steps.map((step) => {
    const done = step.state === 'done';
    let mark: Mark = 'done';
    if (!done) {
      mark = firstOpen ? (step.state === 'waiting' ? 'waiting' : 'next') : 'later';
      firstOpen = false;
    }
    return { step, mark };
  });

  return (
    <Panel title={t('onbTitle')}>
      <ol className="onboarding-steps">
        {rows.map(({ step, mark }) => (
          <li key={step.key} data-mark={mark} aria-current={mark === 'next' || mark === 'waiting' ? 'step' : undefined}>
            <span className="onboarding-mark">{markText[mark]}</span>
            <div>
              <p className="cell-strong">{t(labelOf[step.key])}</p>
              {mark !== 'done' && <p className="cell-sub cell-sub--wrap">{body(step)}</p>}
            </div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}
