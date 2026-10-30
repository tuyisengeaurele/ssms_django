import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  if (typeof document !== 'undefined') cleanup();
});

// jsdom has no matchMedia. Tests flip these flags to simulate user settings.
const media = { reduced: false, coarse: false, dark: false };
const changeListeners = new Set<() => void>();
/** Flip the "reduce motion" setting of the computer, and tell whoever listens, as a browser does. */
export function setReducedMotion(value: boolean) {
  media.reduced = value;
  changeListeners.forEach((listener) => listener());
}
/** Flip the "prefers dark" setting of the computer, and tell whoever listens, as a browser does. */
export function setPrefersDark(value: boolean) {
  media.dark = value;
  changeListeners.forEach((listener) => listener());
}
export function setCoarsePointer(value: boolean) {
  media.coarse = value;
}

afterEach(() => {
  media.reduced = false;
  media.coarse = false;
  media.dark = false;
  changeListeners.clear();
});

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      // A getter, as in a browser: the list keeps answering with the setting as it is now.
      get matches() {
        return query.includes('prefers-reduced-motion')
          ? media.reduced
          : query.includes('pointer: coarse')
            ? media.coarse
            : query.includes('prefers-color-scheme: dark')
              ? media.dark
              : false;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => {
        changeListeners.add(listener);
      },
      removeEventListener: (_type: string, listener: () => void) => {
        changeListeners.delete(listener);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });

  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', NoopObserver);
  vi.stubGlobal('ResizeObserver', NoopObserver);

  window.scrollTo = (() => {}) as typeof window.scrollTo;
}
