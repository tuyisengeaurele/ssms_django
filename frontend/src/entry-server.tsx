import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { LanguageProvider } from './context/LanguageContext';
import LandingPage from './pages/LandingPage';

/** The landing page as HTML, in English, for the build to write into dist/index.html. */
export function renderLanding(): string {
  return renderToString(
    <StaticRouter location="/">
      <LanguageProvider initialLocale="en">
        <LandingPage />
      </LanguageProvider>
    </StaticRouter>,
  );
}
