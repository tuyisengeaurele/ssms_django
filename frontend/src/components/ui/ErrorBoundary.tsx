import { Component, ErrorInfo, ReactNode } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { Icon } from './Icon';
import '../../styles/errorScreen.css';

interface Props { children: ReactNode }
interface State { hasError: boolean; error: Error | null }

/** What the person sees when a page breaks. It sits outside the router, so the way out is a plain link. */
function ErrorScreen() {
  const { t } = useLanguage();
  return (
    <div className="error-screen" role="alert">
      <div className="error-screen-card">
        <span className="error-screen-mark" aria-hidden="true"><Icon name="warning" size={34} /></span>
        <h1>{t('errTitle')}</h1>
        <p>{t('errBody')}</p>
        <div className="error-screen-actions">
          <button type="button" className="error-screen-btn" onClick={() => window.location.reload()}>{t('errRefresh')}</button>
          <a href="/" className="error-screen-btn error-screen-btn--primary">{t('errHome')}</a>
        </div>
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return <ErrorScreen />;
  }
}
