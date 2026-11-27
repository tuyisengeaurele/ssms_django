import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Avatar from '../../components/ui/Avatar';
import { Icon } from '../../components/ui/Icon';
import LoadError from '../../components/ui/LoadError';
import { useLanguage } from '../../context/LanguageContext';
import type { ChatMessage } from '../../types';
import { dateFormat } from '../../utils/dateFormat';
import { fill } from '../../utils/fill';
import Composer from './Composer';
import { useConversation } from './useConversation';

/** Closer to the end than this counts as reading the newest message. */
const NEAR_END_PX = 40;
const SPOKEN = 150;

export interface Target {
  /** Left out for a farmer writing to their own cooperative. */
  farmerId?: string;
  name: string;
  photoUrl?: string | null;
}

interface Props {
  conversationId?: string;
  /** Who it is with, before there is a conversation. */
  target?: Target;
  asFarmer: boolean;
  /** A line above the box, such as that nobody can answer yet. */
  note?: string;
  onStarted: (id: string) => void;
  onChanged: () => void;
}

export default function ConversationView({ conversationId, target, asFarmer, note, onStarted, onChanged }: Props) {
  const { t, locale } = useLanguage();
  const box = useRef<HTMLDivElement>(null);
  const followEnd = useRef(true);
  /** Where the reader was, while older messages are put in above. */
  const keepPlace = useRef<{ height: number; top: number } | null>(null);
  const [newBelow, setNewBelow] = useState(false);
  const [announcement, setAnnouncement] = useState('');

  const nameOf = (m: ChatMessage) => (m.mine ? t('msgYou') : m.sender && !m.sender.former ? m.sender.name : t('msgFormer'));

  const { state, conversation, messages, pending, hasOlder, otherReadAt, isOpen, send, retry, loadOlder, reload, markIfSeen } = useConversation({
    conversationId,
    farmerId: target?.farmerId,
    asFarmer,
    onStarted,
    onChanged,
    onArrived: (m) => {
      setAnnouncement(fill(t('msgNewFrom'), { name: nameOf(m), text: m.body.replace(/\s+/g, ' ').slice(0, SPOKEN) }));
      if (!followEnd.current) setNewBelow(true);
    },
    atEnd: () => followEnd.current,
  });

  const toEnd = () => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
    followEnd.current = true;
    setNewBelow(false);
  };

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const place = keepPlace.current;
    if (place) {
      el.scrollTop = el.scrollHeight - place.height + place.top;
      keepPlace.current = null;
    } else if (followEnd.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, pending, state]);

  useEffect(() => { markIfSeen(); }, [messages, state, markIfSeen]);

  const scrolled = () => {
    const el = box.current!;
    followEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_END_PX;
    if (followEnd.current) {
      setNewBelow(false);
      markIfSeen();
    }
  };

  const earlier = async () => {
    const el = box.current!;
    keepPlace.current = { height: el.scrollHeight, top: el.scrollTop };
    if (!(await loadOlder())) keepPlace.current = null;
  };

  const title = conversation
    ? asFarmer ? conversation.cooperative.name : conversation.farmer.former ? t('msgFormer') : conversation.farmer.name
    : target?.name ?? '';
  const photo = asFarmer ? null : conversation?.farmer.photoUrl ?? target?.photoUrl;

  const day = dateFormat(locale, { dateStyle: 'medium' });
  const time = dateFormat(locale, { timeStyle: 'short' });
  const readUpTo = otherReadAt ? Date.parse(otherReadAt) : null;
  // "Read" goes under one message only: the last of mine the other side has seen.
  const lastSeen = readUpTo === null ? undefined : [...messages].reverse().find((m) => m.mine && Date.parse(m.createdAt) <= readUpTo)?.id;

  return (
    <div className="msg-view">
      <header className="msg-head">
        <Link to="/messages" className="btn btn-secondary btn-sm msg-back"><Icon name="back" size={15} />{t('msgBack')}</Link>
        {title ? <Avatar name={title} photoUrl={photo} /> : null}
        {title ? <h2 className="msg-title">{title}</h2> : null}
      </header>

      {state === 'loading' ? (
        <div className="msg-status" role="status"><span className="spinner" aria-hidden="true" /><span className="sr-only">{t('jnLoading')}</span></div>
      ) : state === 'failed' ? (
        <div className="msg-status"><LoadError onRetry={reload} /></div>
      ) : state === 'missing' ? (
        <div className="msg-status"><div className="alert alert-error" role="alert">{t('msgNoConversation')}</div></div>
      ) : (
        <>
          <div ref={box} className="msg-scroll" onScroll={scrolled} tabIndex={0} role="group" aria-label={fill(t('msgThreadLabel'), { name: title })}>
            {hasOlder ? (
              <button type="button" className="btn btn-secondary btn-sm msg-earlier" onClick={earlier}>
                <Icon name="refresh" size={14} />{t('msgEarlier')}
              </button>
            ) : null}
            {messages.length === 0 && pending.length === 0 ? <p className="msg-empty">{t('msgNone')}</p> : null}
            <ol className="msg-thread" aria-label={fill(t('msgThreadLabel'), { name: title })}>
              {messages.map((m, i) => {
                const when = new Date(m.createdAt);
                const newDay = i === 0 || new Date(messages[i - 1].createdAt).toDateString() !== when.toDateString();
                return (
                  <Fragment key={m.id}>
                    {newDay ? <li className="msg-day">{day.format(when)}</li> : null}
                    <li className={`msg${m.mine ? ' msg--mine' : ''}`}>
                      <div className="msg-bubble">
                        <span className="msg-who">{nameOf(m)}</span>
                        <p className="msg-body">{m.body}</p>
                      </div>
                      <span className="msg-meta">
                        <time dateTime={m.createdAt}>{time.format(when)}</time>
                        {m.id === lastSeen ? <span className="msg-read"><Icon name="check" size={12} />{t('msgRead')}</span> : null}
                      </span>
                    </li>
                  </Fragment>
                );
              })}
              {pending.map((item) => (
                <li key={item.clientId} className={`msg msg--mine${item.failed ? ' msg--failed' : ''}`}>
                  <div className="msg-bubble">
                    <span className="msg-who">{t('msgYou')}</span>
                    <p className="msg-body">{item.body}</p>
                  </div>
                  {item.failed ? (
                    <div className="msg-failed" role="alert">
                      <span className="msg-failed-word">{t('msgNotSent')}</span>
                      <span className="msg-problem">{item.problem}</span>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => retry(item)}>
                        <Icon name="refresh" size={14} />{t('btnRetry')}
                      </button>
                    </div>
                  ) : (
                    <span className="msg-meta">{t('msgSending')}</span>
                  )}
                </li>
              ))}
            </ol>
          </div>
          {newBelow ? (
            <button type="button" className="btn btn-primary btn-sm msg-new" onClick={() => { toEnd(); markIfSeen(); }}>
              <Icon name="down" size={14} />{t('msgNewBelow')}
            </button>
          ) : null}
          {note ? <p className="msg-note">{note}</p> : null}
          <Composer closed={!isOpen} onSend={(words) => { followEnd.current = true; send(words); }} />
        </>
      )}
      <p className="sr-only" aria-live="polite" data-announcer="">{announcement}</p>
    </div>
  );
}
