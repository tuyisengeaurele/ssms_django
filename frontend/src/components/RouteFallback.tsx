import { isLandingPath } from '../i18n/landingAddress';
import { prerenderedHtml } from '../utils/prerendered';

/**
 * What the app shows while the code of a page is arriving. On the home address, when the build already wrote the landing page,
 * that is the same picture, so nothing changes on screen when the real page takes over. Everywhere else it is a quiet page in
 * the app colour.
 */
export default function RouteFallback() {
  const copy = isLandingPath(window.location.pathname) ? prerenderedHtml() : null;
  if (copy) return <div dangerouslySetInnerHTML={{ __html: copy }} />;
  return <div style={{ minHeight: '100vh', background: '#F6F3EC' }} />;
}
