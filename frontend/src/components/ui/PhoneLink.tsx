import { useLanguage } from '../../context/LanguageContext';
import { fill } from '../../utils/fill';
import { formatRwandaMobile } from '../../utils/phone';

interface Props {
  /** The number as the server keeps it (+250 and nine digits). Nothing is drawn without one, so a person who may not see it sees no gap. */
  phone?: string | null;
  /** Whose number it is, so a screen reader hears "Call Aline Uwase" and not just "Call". */
  name?: string;
}

const STORED = /^\+250(\d{9})$/;

/** A number written the way people write it, with a link to call it and one to message it on WhatsApp. */
export default function PhoneLink({ phone, name }: Props) {
  const { t } = useLanguage();
  const match = phone ? STORED.exec(phone) : null;
  if (!match) return null;
  return (
    <span className="phone-link">
      <span className="phone-link__number">{formatRwandaMobile(phone)}</span>
      <a className="phone-link__action" href={`tel:${phone}`} aria-label={name ? fill(t('plCallName'), { name }) : undefined}>{t('plCall')}</a>
      <a
        className="phone-link__action"
        href={`https://wa.me/250${match[1]}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={name ? fill(t('plChatName'), { name }) : undefined}
      >
        {t('plChat')}
      </a>
    </span>
  );
}
