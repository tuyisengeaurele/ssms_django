import { useLayoutEffect, useRef, type ReactNode } from 'react';
import '../../styles/support.css';

interface Props {
  text: string;
  /** The button that ends it. Left out for a note that only needs reading. */
  endLabel?: string;
  onEnd?: () => void;
  busy?: boolean;
  /** Another button before End, such as Continue. */
  extra?: ReactNode;
}

/**
 * A bar that stays at the top of the screen while support access is on. It is a status region, so a screen reader is
 * told when it appears. The top bar is sticky as well, so the banner tells the page how tall it is (see support.css).
 */
export default function SupportBanner({ text, endLabel, onEnd, busy = false, extra }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const set = () => document.documentElement.style.setProperty('--support-banner-height', `${ref.current?.offsetHeight ?? 0}px`);
    set();
    window.addEventListener('resize', set);
    return () => {
      window.removeEventListener('resize', set);
      document.documentElement.style.removeProperty('--support-banner-height');
    };
  }, []);

  return (
    <div ref={ref} className="support-banner" role="status">
      <span>{text}</span>
      {(extra || (endLabel && onEnd)) && (
        <span className="support-banner-actions">
          {extra}
          {endLabel && onEnd && (
            <button type="button" className="support-banner-btn" onClick={onEnd} disabled={busy}>{endLabel}</button>
          )}
        </span>
      )}
    </div>
  );
}
