import { useLanguage } from '../../context/LanguageContext';
import { LOCALE_LABELS, Locale } from '../../i18n/translations';
import { THEME_OPTIONS, useTheme } from '../../utils/theme';
import Panel from '../../components/ui/Panel';

/** The language and the look of SSMS on this device. The top bar menu offers the same two as a shortcut. */
export default function AppearanceSettings() {
  const { t, locale, setLocale } = useLanguage();
  const { choice, setChoice } = useTheme();

  return (
    <div className="profile-stack">
      <Panel title={t('pfLanguage')} note={t('pfLanguageHint')}>
        <div className="segmented" role="group" aria-label={t('pfLanguage')}>
          {(Object.entries(LOCALE_LABELS) as [Locale, string][]).map(([code, label]) => (
            <button key={code} type="button" className={locale === code ? 'is-on' : ''} aria-pressed={locale === code} onClick={() => setLocale(code)}>
              {label}
            </button>
          ))}
        </div>
      </Panel>

      <Panel title={t('stThemeTitle')} note={t('stThemeHint')}>
        <div className="segmented" role="group" aria-label={t('stThemeTitle')}>
          {THEME_OPTIONS.map(([value, key]) => (
            <button key={value} type="button" className={choice === value ? 'is-on' : ''} aria-pressed={choice === value} onClick={() => setChoice(value)}>
              {t(key)}
            </button>
          ))}
        </div>
      </Panel>
    </div>
  );
}
