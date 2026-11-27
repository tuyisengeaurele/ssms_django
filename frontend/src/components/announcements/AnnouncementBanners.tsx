import { useEffect, useId, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { isLoaded, loadCatalog, say } from '../../i18n/catalog';
import type { Locale } from '../../i18n/locales';
import type { Announcement, AnnouncementKind } from '../../types';
import { Icon, type IconName } from '../ui/Icon';
import './announcements.css';
import { KIND_WORDS } from './kinds';

// The type is told three ways: the word, the icon and the colour.
const ICON: Record<AnnouncementKind, IconName> = { information: 'info', maintenance: 'settings', urgent: 'warning' };

interface Props {
  items: Announcement[];
  /** Called when a person closes one. Without it there is no close button. */
  onClose?: (item: Announcement) => void;
  /** Draw in this language instead of the screen language, as the admin's preview does. */
  locale?: Locale;
  /** False where the words change as somebody types, so a screen reader is not told each time. */
  live?: boolean;
}

export default function AnnouncementBanners({ items, onClose, locale, live = true }: Props) {
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
    <section className="announcements" aria-label={say(shown, 'annRegion')} aria-live={live ? 'polite' : undefined} lang={locale}>
      <ul>
        {items.map((item) => {
          const own = item.text[shown];
          const textId = `${id}-${item.id}`;
          return (
            <li key={item.id} className={`announcement announcement--${item.kind}`}>
              <Icon name={ICON[item.kind]} className="announcement-icon" strokeWidth={2} />
              <p className="announcement-body">
                <strong className="announcement-kind">{say(shown, KIND_WORDS[item.kind])}</strong>{' '}
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
