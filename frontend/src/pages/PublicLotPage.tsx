import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Footer } from '../landing/Footer';
import { Nav } from '../landing/Nav';
import '../landing/tokens.css';
import '../landing/landing.css';
import '../landing/lot.css';
import { useLanguage } from '../context/LanguageContext';
import { lotService } from '../services/lot.service';
import type { PublicLot } from '../types';
import { fill } from '../utils/fill';
import { useDocumentTitle } from '../utils/pageTitle';

type State = { lot: PublicLot } | 'loading' | 'gone' | 'failed';

/** A lot is not for search engines. The tag is on the page only while it is open. */
function useNoIndex() {
  useEffect(() => {
    const tag = document.createElement('meta');
    tag.name = 'robots';
    tag.content = 'noindex, nofollow';
    document.head.appendChild(tag);
    return () => tag.remove();
  }, []);
}

/**
 * The page behind a lot's QR code, for a buyer. It needs no sign in and shows only what the farmer agreed to when they made
 * the code: the farm, the district, the dates, the weight and the grade.
 */
export default function PublicLotPage() {
  const { token = '' } = useParams<{ token: string }>();
  const { t, locale } = useLanguage();
  const [state, setState] = useState<State>('loading');
  useNoIndex();

  useEffect(() => {
    let live = true;
    setState('loading');
    lotService.getPublic(token)
      .then((res) => { if (live) setState({ lot: res.data.data }); })
      // A 404 is a link that does not work. Anything else is a problem on our side, and says so.
      .catch((e: { response?: { status?: number } }) => { if (live) setState(e?.response?.status === 404 ? 'gone' : 'failed'); });
    return () => { live = false; };
  }, [token]);

  const lot = typeof state === 'object' ? state.lot : null;
  useDocumentTitle(lot ? fill(t('lotPageTitle'), { farm: lot.farmName }) : t('lotInvalid'));

  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  // A date without a time of day, so it is read as that day wherever the buyer is.
  const dateOf = (iso: string) => day.format(new Date(`${iso}T12:00:00`));

  const facts: Array<[string, string | null]> = lot
    ? [
        [t('lotRowPlace'), [lot.district, lot.province].filter(Boolean).join(', ') || null],
        [t('lotRowCoop'), lot.cooperativeName],
        [t('lotRowBreed'), lot.breed],
        [t('lotRowStarted'), dateOf(lot.startedOn)],
        [t('lotRowHarvested'), dateOf(lot.harvestedOn)],
        [t('lotRowDays'), lot.rearingDays === 1 ? t('lotDayOne') : fill(t('lotDays'), { n: number.format(lot.rearingDays) })],
        [t('lotRowWeight'), `${number.format(lot.cocoonWeightKg)} kg`],
        [t('lotRowSilk'), lot.silkYieldG != null ? `${number.format(lot.silkYieldG)} g` : null],
        [t('lotRowGrade'), fill(t('hpGradeName'), { g: lot.grade })],
      ]
    : [];

  return (
    <div className="landing l-status l-lot">
      <a className="l-skip" href="#main">{t('lpSkip')}</a>
      <Nav />
      <main id="main" tabIndex={-1}>
        <div className="l-container l-lot__inner">
          {state === 'loading' && <p role="status">{t('jnLoading')}</p>}

          {state === 'gone' && (
            <>
              <h1>{t('lotInvalid')}</h1>
              <p className="l-status__body">{t('lotInvalidBody')}</p>
            </>
          )}

          {state === 'failed' && <p role="alert" className="l-status__body">{t('cmpErrorTryAgain')}</p>}

          {lot && (
            <article className="l-lot__card">
              <p className="l-lot__eyebrow">{t('lotPageEyebrow')}</p>
              <h1>{lot.farmName}</h1>
              <dl className="l-lot__facts">
                {facts.filter(([, value]) => value).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="l-lot__note">{t('lotNote')}</p>
            </article>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
