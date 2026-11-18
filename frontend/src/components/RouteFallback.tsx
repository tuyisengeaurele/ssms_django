import { useRef } from 'react';
import { useIsoLayoutEffect } from '../hooks/useIsoLayoutEffect';
import { isLandingPath } from '../i18n/landingAddress';
import { continueEntrance, prerenderedHtml } from '../utils/prerendered';

/**
 * What the app shows while the code of a page is arriving. On the home address, when the build already wrote the landing page,
 * that is the same picture, so nothing changes on screen when the real page takes over. Everywhere else it is a quiet page in
 * the app colour.
 */
export default function RouteFallback() {
  const copy = isLandingPath(window.location.pathname) ? prerenderedHtml() : null;
  const ref = useRef<HTMLDivElement>(null);
  // The copy's elements are new, so the hero entrance would start over. Carry it on from where the first page had got to.
  useIsoLayoutEffect(() => {
    if (ref.current) continueEntrance(ref.current);
  }, []);
  if (copy) return <div ref={ref} dangerouslySetInnerHTML={{ __html: copy }} />;
  return <div style={{ minHeight: '100vh', background: '#F6F3EC' }} />;
}
