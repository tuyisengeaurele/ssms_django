import { useEffect, useId, useRef, type KeyboardEvent } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { LOCALE_LABELS, type Locale } from '../../i18n/locales';
import { fill } from '../../utils/fill';

// The server has the same limit (contacts/serializers.py).
const MAX_REPLY = 5000;
const COUNT_FROM = 4500;

interface ReplyBoxProps {
  email: string;
  draft: string;
  /** The language the email goes out in. The person writing writes in it too: their words are sent as typed. */
  language: Locale;
  error: string;
  sending: boolean;
  /** True while the box is closing, so the stylesheet can play it. */
  leaving: boolean;
  onDraft: (value: string) => void;
  onLanguage: (value: Locale) => void;
  onSubmit: () => void;
  onClose: () => void;
}

/** The place under a contact message where an admin writes the reply. Its Cancel and Send buttons are the dialog's own. */
export default function ReplyBox({ email, draft, language, error, sending, leaving, onDraft, onLanguage, onSubmit, onClose }: ReplyBoxProps) {
  const { t } = useLanguage();
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLTextAreaElement>(null);

  const bringIntoView = () => box.current?.scrollIntoView?.({ block: 'nearest' });

  useEffect(() => {
    text.current?.focus({ preventScroll: true });
    // At once for people with less motion, and again when the box has grown to its full height (onAnimationEnd).
    bringIntoView();
    // Once, as the box opens.
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      // The first Escape belongs to the box. Stopped here, the dialog does not close with it.
      event.preventDefault();
      event.stopPropagation();
      if (!sending) onClose();
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <div
      ref={box}
      className="reply-box"
      data-leaving={leaving ? '' : undefined}
      aria-hidden={leaving ? true : undefined}
      onKeyDown={onKeyDown}
      onAnimationEnd={bringIntoView}
    >
      <div className="reply-box-inner">
        <div className="reply-head">
          <p className="reply-to">{fill(t('msReplyTo'), { email })}</p>
          <label className="reply-lang">
            <span>{t('msReplyLang')}</span>
            <select className="form-select" value={language} disabled={sending} onChange={(e) => onLanguage(e.target.value as Locale)}>
              {(Object.keys(LOCALE_LABELS) as Locale[]).map((code) => (
                <option key={code} value={code}>{LOCALE_LABELS[code]}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="form-label" htmlFor={id}>{t('msReplyText')}</label>
        <textarea
          id={id}
          ref={text}
          className="form-textarea"
          rows={6}
          lang={language}
          maxLength={MAX_REPLY}
          value={draft}
          readOnly={sending}
          onChange={(e) => onDraft(e.target.value)}
        />
        {draft.length > COUNT_FROM && <p className="form-hint reply-count">{fill(t('msCount'), { n: String(draft.length) })}</p>}
        {error && <div className="alert alert-error reply-error" role="alert"><span>{error}</span></div>}
      </div>
    </div>
  );
}
