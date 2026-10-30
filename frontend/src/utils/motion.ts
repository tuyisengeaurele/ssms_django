import type { Transition, Variants } from 'framer-motion';

/**
 * One motion style for the app. These values are the --ease-out and --duration-* tokens of index.css, so a fade in code
 * and a fade in the stylesheet feel the same. A test keeps the two in step.
 */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;
export const DURATION = { fast: 0.12, base: 0.2, slow: 0.35 } as const;

/** Something arriving or moving into place. */
export const settle: Transition = { duration: DURATION.base, ease: EASE_OUT };
/** Something leaving. Shorter, so the next thing is not kept waiting. */
export const leave: Transition = { duration: DURATION.fast, ease: EASE_OUT };

/** A page change: a short fade with a small slide. For people who ask for less motion the slide is dropped, the fade stays. */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  enter: { opacity: 1, y: 0, transition: settle },
  exit: { opacity: 0, y: -6, transition: leave },
};
