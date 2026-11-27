import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { useAnnouncements, type AnnouncementsMode } from '../../hooks/useAnnouncements';
import AnnouncementBanners from './AnnouncementBanners';

export interface SiteAnnouncementsProps {
  mode: AnnouncementsMode;
  /** True in the fixed public header, where the page below has to be told how much room the banners took. */
  inHeader?: boolean;
}

const HEIGHT = '--announcement-height';

function HeaderRoom({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = ref.current!;
    const tell = () => document.documentElement.style.setProperty(HEIGHT, `${box.offsetHeight}px`);
    tell();
    // The height changes with the words, the language, the width of the screen and the fonts.
    const watch = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(tell);
    watch?.observe(box);
    return () => {
      watch?.disconnect();
      document.documentElement.style.removeProperty(HEIGHT);
    };
  }, []);

  return <div ref={ref} className="l-nav__announcements">{children}</div>;
}

/** The banners, fetched and ready to be put on a page. */
export default function SiteAnnouncements({ mode, inHeader = false }: SiteAnnouncementsProps) {
  const { items, close } = useAnnouncements(mode);
  if (items.length === 0) return null;
  const banners = <AnnouncementBanners items={items} onClose={close} />;
  return inHeader ? <HeaderRoom>{banners}</HeaderRoom> : banners;
}
