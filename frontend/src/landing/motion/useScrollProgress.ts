import { useEffect, useRef, type RefObject } from 'react';
import { prefersReducedMotion } from './usePrefersReducedMotion';

/**
 * leave: 0 until the element's top reaches the top of the screen, 1 once it has fully scrolled away.
 * pin:   for a tall element with a sticky stage inside, 0 at the start and 1 at the end of the pin.
 */
export type ScrollMode = 'leave' | 'pin';

export function progressFor(rect: { top: number; height: number }, viewportHeight: number, mode: ScrollMode): number {
  const span = mode === 'pin' ? rect.height - viewportHeight : rect.height;
  if (!(span > 0) || !Number.isFinite(rect.top)) return 0;
  return Math.min(1, Math.max(0, -rect.top / span));
}

/**
 * Calls onProgress with a number from 0 to 1 as the page scrolls. No React state is involved,
 * so writing a CSS variable from the callback costs almost nothing. Returns the ref to attach.
 */
export function useScrollProgress<T extends HTMLElement>(
  onProgress: (progress: number) => void,
  mode: ScrollMode,
): RefObject<T> {
  const ref = useRef<T>(null);
  const callback = useRef(onProgress);
  callback.current = onProgress;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      callback.current(0);
      return;
    }

    let last = -1;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const p = progressFor(el.getBoundingClientRect(), window.innerHeight, mode);
      if (p !== last) {
        last = p;
        callback.current(p);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [mode]);

  return ref;
}
