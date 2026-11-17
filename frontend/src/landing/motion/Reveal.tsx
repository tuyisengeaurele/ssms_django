import {
  createElement,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEventHandler,
  type ReactNode,
} from 'react';
import { usePrefersReducedMotion } from './usePrefersReducedMotion';
import './motion.css';

interface RevealProps {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: 'div' | 'li' | 'p' | 'h2' | 'h3' | 'span' | 'article' | 'section';
  onPointerMove?: PointerEventHandler<HTMLElement>;
}

/**
 * Fades and rises into view once. The hidden state is only applied after
 * mount, and only when we can actually observe scrolling, so content is
 * never stuck invisible. What is already on screen when the page first shows is
 * left alone: it was drawn on the server, and hiding it to fade it in again would
 * make the first view blink.
 */
export function Reveal({ children, delay = 0, y = 24, className = '', as = 'div', onPointerMove }: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  const reduced = usePrefersReducedMotion();
  const [armed, setArmed] = useState(false);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (reduced || !el || typeof IntersectionObserver === 'undefined') {
      setArmed(false);
      return;
    }
    const box = el.getBoundingClientRect();
    if (box.height > 0 && box.bottom > 0 && box.top < window.innerHeight) {
      setArmed(false);
      return;
    }
    setArmed(true);
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [reduced]);

  const classes = [armed ? 'l-reveal' : '', armed && shown ? 'is-in' : '', className].filter(Boolean).join(' ');
  const style = {
    '--l-reveal-delay': `${delay}ms`,
    '--l-reveal-y': `${y}px`,
  } as CSSProperties;

  return createElement(as, { ref, className: classes || undefined, style, onPointerMove }, children);
}
