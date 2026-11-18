import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { loadCatalog, say } from './i18n/catalog';
import type { Locale } from './i18n/locales';
import { LanguageProvider } from './context/LanguageContext';
import LandingPage from './pages/LandingPage';
import { landingAddress } from './i18n/landingAddress';

/** The landing page as HTML in one language, for the build to write into the site. English is the root, the others have a prefix. */
export async function renderLanding(locale: Locale): Promise<string> {
  await loadCatalog(locale);
  return renderToString(
    <StaticRouter location={landingAddress(locale)}>
      <LanguageProvider initialLocale={locale}>
        <LandingPage />
      </LanguageProvider>
    </StaticRouter>,
  );
}

/** The texts search engines and share previews read for the landing page in one language. */
export async function landingMeta(locale: Locale): Promise<{ description: string; share: string; schema: string }> {
  await loadCatalog(locale);
  return { description: say(locale, 'lpMetaDescription'), share: say(locale, 'lpMetaShare'), schema: say(locale, 'lpMetaSchema') };
}
