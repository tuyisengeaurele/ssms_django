import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Icon } from '../../components/ui/Icon';
import { useLanguage } from '../../context/LanguageContext';
import { fill } from '../../utils/fill';

const LONGEST = 2000;
/** From here the box says how much room is left. */
const COUNT_FROM = 1800;

/**
 * Where a message is written. The words live only here, while the page is open: saving a draft on the device would leave
 * private words on a computer others use.
 */
export default function Composer({ closed, onSend }: { closed: boolean; onSend: (words: string) => void }) {
  const { t } = useLanguage();
  const [words, setWords] = useState('');
  const id = useId();
  const length = words.trim().length;
  const ready = length > 0 && length <= LONGEST;
  const note = length > LONGEST
    ? fill(t('msgTooMany'), { n: length - LONGEST })
    : length >= COUNT_FROM ? fill(t('annLeft'), { n: LONGEST - length }) : '';

  if (closed) {
    return (
      <div className="msg-closed" role="status">
        <p>{t('erMsgClosed')}</p>
        {words.trim() ? (
          <>
            <span className="form-hint">{t('msgNotSent')}</span>
            <p className="msg-unsent">{words}</p>
          </>
        ) : null}
      </div>
    );
  }

  const send = (event?: FormEvent) => {
    event?.preventDefault();
    if (!ready) return;
    onSend(words.trim());
    setWords('');
  };

  // Enter makes a new line, as people expect on a phone. Ctrl or Cmd with Enter sends.
  const keys = (event: KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) send(event as unknown as FormEvent);
  };

  return (
    <form className="msg-composer" onSubmit={send}>
      <div className="msg-composer-box">
        <label className="sr-only" htmlFor={id}>{t('msgYourMessage')}</label>
        <textarea
          id={id}
          className="form-textarea msg-input"
          rows={2}
          value={words}
          placeholder={t('msgPlaceholder')}
          aria-describedby={note ? `${id}-note` : undefined}
          aria-invalid={length > LONGEST ? true : undefined}
          onChange={(e) => setWords(e.target.value)}
          onKeyDown={keys}
        />
        {note ? <span id={`${id}-note`} className={length > LONGEST ? 'form-error' : 'form-hint'}>{note}</span> : null}
      </div>
      <button type="submit" className="btn btn-primary msg-send" disabled={!ready}>
        <Icon name="send" size={16} />
        {t('msgSend')}
      </button>
    </form>
  );
}
