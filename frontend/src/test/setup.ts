import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  if (typeof document !== 'undefined') cleanup();
});

// jsdom has no matchMedia. Tests flip these flags to simulate user settings.
const media = { reduced: false, coarse: false, dark: false };
const darkListeners = new Set<() => void>();
export function setReducedMotion(value: boolean) {
  media.reduced = value;
}
/** Flip the "prefers dark" setting of the computer, and tell whoever listens, as a browser does. */
export function setPrefersDark(value: boolean) {
  media.dark = value;
  darkListeners.forEach((listener) => listener());
}
export function setCoarsePointer(value: boolean) {
  media.coarse = value;
}

afterEach(() => {
  media.reduced = false;
  media.coarse = false;
  media.dark = false;
  darkListeners.clear();
});

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion')
        ? media.reduced
        : query.includes('pointer: coarse')
          ? media.coarse
          : query.includes('prefers-color-scheme: dark')
            ? media.dark
            : false,
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: () => void) => {
        if (query.includes('prefers-color-scheme')) darkListeners.add(listener);
      },
      removeEventListener: (_type: string, listener: () => void) => {
        darkListeners.delete(listener);
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
