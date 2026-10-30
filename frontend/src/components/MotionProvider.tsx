import { MotionConfig } from 'framer-motion';
import type { ReactNode } from 'react';
import { usePrefersReducedMotion } from '../landing/motion/usePrefersReducedMotion';

/**
 * Tells every framer animation in the app whether the person asked their computer for less motion. When they did, slides
 * and scaling are dropped and only fades remain. It follows the setting while the page is open.
 */
export default function MotionProvider({ children }: { children: ReactNode }) {
  const reduced = usePrefersReducedMotion();
  return <MotionConfig reducedMotion={reduced ? 'always' : 'never'}>{children}</MotionConfig>;
}
