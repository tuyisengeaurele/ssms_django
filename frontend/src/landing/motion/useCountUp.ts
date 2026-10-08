import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';

interface Options {
  duration?: number;
  /** false turns the animation off and returns the final number. */
  enabled?: boolean;
  /** false holds the number at zero until it is time to count. */
  play?: boolean;
}

export function useCountUp(target: number, opts: Options = {}): number {
  const { duration = 1400, enabled = true, play = true } = opts;
  const reduced = usePrefersReducedMotion();
  const animate = enabled && !reduced;
  const [value, setValue] = useState(animate ? 0 : target);

  useEffect(() => {
    if (!animate || !play) {
      setValue(animate ? 0 : target);
      return;
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setValue(Math.round(target * eased));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [animate, play, target, duration]);

  return animate ? value : target;
}
