import type { ReactNode } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import './mockups.css';

interface WindowProps {
  title: string;
  label: string;
  className?: string;
  children: ReactNode;
}

/** The frame shared by every sample screen. Decorative, so one image label covers it. */
export function Window({ title, label, className = '', children }: WindowProps) {
  const { t } = useLanguage();
  return (
    <div className={`l-mock ${className}`.trim()} role="img" aria-label={label}>
      <div className="l-mock__bar">
        <span className="l-mock__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="l-mock__title">{title}</span>
        <span className="l-mock__badge">{t('lpSample')}</span>
      </div>
      <div className="l-mock__body">{children}</div>
    </div>
  );
}
