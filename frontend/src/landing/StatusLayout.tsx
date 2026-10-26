import '@fontsource-variable/fraunces/wght.css';
import '@fontsource-variable/fraunces/wght-italic.css';
import '@fontsource-variable/geist';
import './tokens.css';
import './landing.css';
import { useEffect, type ReactNode } from 'react';
import { useLanguage } from '../context/LanguageContext';
import { Footer } from './Footer';
import { Nav } from './Nav';
import './status.css';

interface StatusLayoutProps {
  /** Short mark above the title, for example an error code. Decoration only. */
  code?: string;
  title: string;
  body: string;
  children: ReactNode;
}

/** A short centred message inside the site navigation and footer. */
export function StatusLayout({ code, title, body, children }: StatusLayoutProps) {
  const { t } = useLanguage();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="landing l-status">
      <a className="l-skip" href="#main">
        {t('lpSkip')}
      </a>
      <Nav />
      <main id="main" tabIndex={-1}>
        <div className="l-container l-status__inner">
          {code ? (
            <p className="l-status__code" aria-hidden="true">
              {code}
            </p>
          ) : null}
          <h1>{title}</h1>
          <p className="l-status__body">{body}</p>
          <div className="l-status__actions">{children}</div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
