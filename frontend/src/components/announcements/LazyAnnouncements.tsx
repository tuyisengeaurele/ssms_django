import { lazy, Suspense, useEffect, useState } from 'react';
import type { SiteAnnouncementsProps } from './SiteAnnouncements';

// Public pages fetch the banners' code after they are on screen, so it adds nothing to what a visitor waits for. If it does
// not arrive, there is no banner: a notice must never take down the page it sits on.
const SiteAnnouncements = lazy(() => import('./SiteAnnouncements').catch(() => ({ default: () => null })));

export default function LazyAnnouncements(props: SiteAnnouncementsProps) {
  // Not on the first drawing, so the home page written on the build machine has no banner and no gap left for one.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <SiteAnnouncements {...props} />
    </Suspense>
  );
}
