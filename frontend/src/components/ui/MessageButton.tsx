import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { fill } from '../../utils/fill';
import { Icon } from './Icon';

/** For a supervisor beside a farmer's name: opens the conversation with them, or an empty one to start it. */
export default function MessageButton({ farmerId, name }: { farmerId: string; name: string }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  if (user?.role !== 'SUPERVISOR') return null;
  return (
    <Link className="btn btn-secondary btn-xs" to={`/messages?to=${encodeURIComponent(farmerId)}`} aria-label={fill(t('msgToName'), { name })}>
      <Icon name="chat" size={13} />{t('msgButton')}
    </Link>
  );
}
