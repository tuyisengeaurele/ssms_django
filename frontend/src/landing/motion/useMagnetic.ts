import { useEffect, useRef } from 'react';
import { prefersReducedMotion } from './usePrefersReducedMotion';

/**
 * Pulls an element a little toward the pointer. Desktop only, and off for
 * reduced motion. Returns the ref to attach.
 */
export function useMagnetic<T extends HTMLElement>(strength = 0.3) {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || window.matchMedia('(pointer: coarse)').matches) return;

    const onMove = (event: PointerEvent) => {
      const box = el.getBoundingClientRect();
      const dx = event.clientX - (box.left + box.width / 2);
      const dy = event.clientY - (box.top + box.height / 2);
      el.style.transform = `translate3d(${Math.round(dx * strength)}px, ${Math.round(dy * strength)}px, 0)`;
    };
    const onLeave = () => {
      el.style.transform = '';
    };

    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [strength]);

  return ref;
}
