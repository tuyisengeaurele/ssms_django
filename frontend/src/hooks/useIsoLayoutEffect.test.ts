import { useEffect, useLayoutEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

// The build renders the landing page on a server. React warns about a layout effect there, and it would do nothing anyway. In the
// browser the layout effect is needed: it runs before the first paint, so an animation is set in place before anyone sees a frame.

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('useIsoLayoutEffect', () => {
  it('is the layout effect in the browser', async () => {
    const { useIsoLayoutEffect } = await import('./useIsoLayoutEffect');
    expect(useIsoLayoutEffect).toBe(useLayoutEffect);
  });

  it('is a plain effect when the server build renders the page, so React has nothing to warn about', async () => {
    vi.stubEnv('SSR', true);
    vi.resetModules();
    const { useIsoLayoutEffect } = await import('./useIsoLayoutEffect');
    expect(useIsoLayoutEffect).toBe(useEffect);
  });
});
