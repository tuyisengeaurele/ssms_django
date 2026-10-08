import { Link } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext';
import { StatusLayout } from '../landing/StatusLayout';

export default function UnauthorizedPage() {
  const { t } = useLanguage();

  return (
    <StatusLayout title={t('lpDeniedTitle')} body={t('lpDeniedBody')}>
      <Link to="/" className="l-btn">
        {t('lpGoHome')}
      </Link>
    </StatusLayout>
  );
}
