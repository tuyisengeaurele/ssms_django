import { useEffect, useState, type RefObject } from 'react';

/** True once the element has scrolled into view. True straight away if we cannot observe. */
export function useInViewOnce(ref: RefObject<Element>): boolean {
  const [seen, setSeen] = useState(typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);

  return seen;
}
