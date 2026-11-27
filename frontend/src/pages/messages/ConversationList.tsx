import { Link } from 'react-router-dom';
import Avatar from '../../components/ui/Avatar';
import { useLanguage } from '../../context/LanguageContext';
import type { ConversationRow } from '../../types';
import { dateFormat } from '../../utils/dateFormat';
import { fill } from '../../utils/fill';

interface Props {
  rows: ConversationRow[];
  openId?: string;
  /** A farmer knows a conversation by its cooperative, a supervisor by its farmer. */
  asFarmer: boolean;
}

export default function ConversationList({ rows, openId, asFarmer }: Props) {
  const { t, locale } = useLanguage();
  const day = dateFormat(locale, { dateStyle: 'medium' });

  return (
    <ul className="msg-list" aria-label={t('msgList')}>
      {rows.map((row) => {
        const name = asFarmer ? row.cooperative.name : row.farmer.former ? t('msgFormer') : row.farmer.name;
        const last = row.lastMessage;
        const shown = row.unread > 99 ? '99+' : String(row.unread);
        return (
          <li key={row.id}>
            <Link to={`/messages/${row.id}`} className="msg-row" aria-current={row.id === openId ? 'page' : undefined}>
              <Avatar name={name} photoUrl={asFarmer ? null : row.farmer.photoUrl} />
              <span className="msg-row-text">
                <span className="msg-row-name">{name}</span>
                {last ? <span className="msg-row-preview">{last.mine ? fill(t('msgYouPrefix'), { text: last.preview }) : last.preview}</span> : null}
              </span>
              <span className="msg-row-side">
                {last ? <span className="msg-row-day">{day.format(new Date(last.createdAt))}</span> : null}
                {row.unread > 0 ? <span className="msg-badge" aria-label={fill(t('msgUnread'), { n: shown })}>{shown}</span> : null}
                {row.isOpen ? null : <span className="badge badge-gray">{t('msgClosedTag')}</span>}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
