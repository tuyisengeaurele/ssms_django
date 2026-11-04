import { useEffect } from 'react';

const WRAP = '.table-wrapper';
const MARK = 'data-cramped';

/** Try the wrapper as a table first, then mark it when the table is wider than the space it has. */
function measure(wrap: HTMLElement) {
  wrap.removeAttribute(MARK);
  if (wrap.scrollWidth > wrap.clientWidth + 1) wrap.setAttribute(MARK, '');
}

/**
 * A table never scrolls sideways. When a table card is too narrow for its columns, the card is marked and the
 * stylesheet turns that table into the same list of cards a phone gets. Which tables fit depends on the screen, the
 * open menu and the data, so this watches the page instead of guessing a width per table.
 */
export function useCrampedTables() {
  useEffect(() => {
    let frame = 0;
    const measureAll = () => {
      frame = 0;
      document.querySelectorAll<HTMLElement>(WRAP).forEach(measure);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measureAll);
    };

    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    resizeObserver?.observe(document.body);
    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', measureAll);
    measureAll();

    return () => {
      if (frame) cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', measureAll);
    };
  }, []);
}
