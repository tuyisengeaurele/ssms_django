import { useEffect, useId, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { isLoaded, loadCatalog, say } from '../../i18n/catalog';
import type { Locale } from '../../i18n/locales';
import type { Announcement, AnnouncementKind } from '../../types';
import { Icon, type IconName } from '../ui/Icon';
import './announcements.css';

// The type is told three ways: the word, the icon and the colour.
const LOOK: Record<AnnouncementKind, { word: string; icon: IconName }> = {
  information: { word: 'annInformation', icon: 'info' },
  maintenance: { word: 'annMaintenance', icon: 'settings' },
  urgent: { word: 'annUrgent', icon: 'warning' },
};

interface Props {
  items: Announcement[];
  /** Called when a person closes one. Without it there is no close button. */
  onClose?: (item: Announcement) => void;
  /** Draw in this language instead of the screen language, as the admin's preview does. */
  locale?: Locale;
}

export default function AnnouncementBanners({ items, onClose, locale }: Props) {
  const screen = useLanguage().locale;
  const shown = locale ?? screen;
  const id = useId();
  // The screen language is fetched by the app. Another one, asked for by the preview, is fetched here and then drawn.
  const [, setArrived] = useState<Locale | null>(null);
  useEffect(() => {
    if (!isLoaded(shown)) loadCatalog(shown).then(() => setArrived(shown), () => {});
  }, [shown]);

  if (items.length === 0) return null;

  return (
    <section className="announcements" aria-label={say(shown, 'annRegion')} aria-live="polite" lang={locale}>
      <ul>
        {items.map((item) => {
          const own = item.text[shown];
          const textId = `${id}-${item.id}`;
          return (
            <li key={item.id} className={`announcement announcement--${item.kind}`}>
              <Icon name={LOOK[item.kind].icon} className="announcement-icon" strokeWidth={2} />
              <p className="announcement-body">
                <strong className="announcement-kind">{say(shown, LOOK[item.kind].word)}</strong>{' '}
                <span id={textId} className="announcement-text" lang={own ? shown : 'en'}>{own || item.text.en}</span>
              </p>
              {onClose && item.kind !== 'urgent' && (
                <button
                  type="button"
                  className="announcement-close"
                  aria-label={say(shown, 'annClose')}
                  aria-describedby={textId}
                  onClick={() => onClose(item)}
                >
                  <Icon name="close" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
