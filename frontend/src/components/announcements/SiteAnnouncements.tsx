import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useAnnouncements, type AnnouncementsMode } from '../../hooks/useAnnouncements';
import AnnouncementBanners from './AnnouncementBanners';

export interface SiteAnnouncementsProps {
  mode: AnnouncementsMode;
  /** True in the fixed public header, where the page below has to be told how much room the banners took. */
  inHeader?: boolean;
}

const HEIGHT = '--announcement-height';
const GONE = '--announcement-gone';

function HeaderRoom({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = ref.current!;
    const root = document.documentElement.style;
    // How much of the banners has been scrolled past. The header moves up by this, so they leave with the page (nav.css).
    const move = () => root.setProperty(GONE, `${Math.min(Math.max(window.scrollY, 0), box.offsetHeight)}px`);
    const tell = () => {
      root.setProperty(HEIGHT, `${box.offsetHeight}px`);
      move();
    };
    tell();
    // The height changes with the words, the language, the width of the screen and the fonts.
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(tell);
    watch?.observe(box);
    window.addEventListener('scroll', move, { passive: true });
    return () => {
      watch?.disconnect();
      window.removeEventListener('scroll', move);
      root.removeProperty(HEIGHT);
      root.removeProperty(GONE);
    };
  }, []);

  // A browser cannot scroll to something in a fixed header. When the keyboard comes here, the page goes to its top.
  const bringBack = () => {
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
  };

  return <div ref={ref} className="l-nav__announcements" onFocus={bringBack}>{children}</div>;
}

/** The banners, fetched and ready to be put on a page. */
export default function SiteAnnouncements({ mode, inHeader = false }: SiteAnnouncementsProps) {
  const { items, close } = useAnnouncements(mode);
  if (items.length === 0) return null;
  const banners = <AnnouncementBanners items={items} onClose={close} />;
  return inHeader ? <HeaderRoom>{banners}</HeaderRoom> : banners;
}
