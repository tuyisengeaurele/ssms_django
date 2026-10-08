import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// jsdom has no matchMedia. Tests flip these flags to simulate user settings.
const media = { reduced: false, coarse: false };
export function setReducedMotion(value: boolean) {
  media.reduced = value;
}
export function setCoarsePointer(value: boolean) {
  media.coarse = value;
}

afterEach(() => {
  media.reduced = false;
  media.coarse = false;
});

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: query.includes('prefers-reduced-motion')
      ? media.reduced
      : query.includes('pointer: coarse')
        ? media.coarse
        : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
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
