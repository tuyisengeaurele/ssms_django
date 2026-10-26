import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../landing/motion/usePrefersReducedMotion';

/** Counts from 0 up to the target. Shows the target at once for people who asked for less motion. */
export function useCountUp(target: number, duration = 900): number {
  const reduced = prefersReducedMotion();
  const [value, setValue] = useState(() => (reduced ? target : 0));

  useEffect(() => {
    if (!target || reduced) {
      setValue(target || 0);
      return;
    }
    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start === null) start = now;
      const progress = Math.min((now - start) / duration, 1);
      setValue(Math.round((1 - Math.pow(1 - progress, 3)) * target));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, duration, reduced]);

  // Read the target straight away so a change never shows one stale render first.
  return reduced ? target || 0 : value;
}
