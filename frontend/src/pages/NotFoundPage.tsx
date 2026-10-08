import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { StatusLayout } from '../landing/StatusLayout';

export default function NotFoundPage() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const dashboardPath = user?.role === 'ADMIN' ? '/admin' : user?.role === 'SUPERVISOR' ? '/supervisor' : '/farmer';

  return (
    <StatusLayout code="404" title={t('lpNotFoundTitle')} body={t('lpNotFoundBody')}>
      <button type="button" className="l-btn l-btn--ghost" onClick={() => navigate(-1)}>
        {t('lpGoBack')}
      </button>
      {isAuthenticated ? (
        <Link to={dashboardPath} className="l-btn">
          {t('lpDashboard')}
        </Link>
      ) : (
        <Link to="/" className="l-btn">
          {t('lpGoHome')}
        </Link>
      )}
    </StatusLayout>
  );
}
