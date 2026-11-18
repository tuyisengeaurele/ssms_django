import './suggestion.css';
import { useEffect, useState, type KeyboardEvent } from 'react';
import { landingAddress, languageOfLandingPath } from '../i18n/landingAddress';
import { savedLocale } from '../i18n/savedLocale';
import { dismissHint, hintDismissed, suggestedLanguage } from '../i18n/suggest';

/** How long to wait before showing the line, so it does not compete with the page that is still loading. */
export const SHOW_AFTER_MS = 1200;

// Written in the language it offers, because that is the language the person reads. It is not part of the app's texts: those
// are in the language on screen, and this is in another one on purpose. Drafts until the native review.
const WORDS = {
  fr: { label: 'Langue du site', text: 'Voir ce site en français ?', accept: 'Voir en français', dismiss: 'Non merci' },
  rw: { label: "Ururimi rw'urubuga", text: "Reba uru rubuga mu Kinyarwanda?", accept: 'Yego, mu Kinyarwanda', dismiss: 'Oya, urakoze' },
} as const;

/**
 * One quiet line for a first time visitor whose browser prefers French or Kinyarwanda, on the English page. It offers the page in
 * that language and is never a redirect. It appears after the page is up (so it is not in the page the build writes), is laid
 * over the page (so it never pushes it down), and can be dismissed for good.
 */
export function LanguageSuggestion() {
  const [offer, setOffer] = useState<'fr' | 'rw' | null>(null);

  useEffect(() => {
    const ranked = navigator.languages?.length ? navigator.languages : [navigator.language ?? ''];
    const found = suggestedLanguage({ ranked, saved: savedLocale(), dismissed: hintDismissed(), pageLanguage: languageOfLandingPath(window.location.pathname) });
    if (!found) return;
    const timer = setTimeout(() => setOffer(found), SHOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!offer) return null;
  const words = WORDS[offer];

  const dismiss = () => {
    dismissHint();
    setOffer(null);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') dismiss();
  };

  return (
    <aside className="l-suggest" lang={offer} aria-label={words.label} onKeyDown={onKeyDown}>
      <p className="l-suggest__text">{words.text}</p>
      <div className="l-suggest__actions">
        <a className="l-suggest__yes" href={landingAddress(offer)} hrefLang={offer}>
          {words.accept}
        </a>
        <button type="button" className="l-suggest__no" onClick={dismiss}>
          {words.dismiss}
        </button>
      </div>
    </aside>
  );
}
