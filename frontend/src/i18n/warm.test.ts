import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prefetchCatalog } from './catalog';
import { likelyLanguages, warmLikelyLanguages } from './warm';

vi.mock('./catalog', () => ({ prefetchCatalog: vi.fn() }));

// A person whose browser lists French or Kinyarwanda after English may well switch to it. Once the page is idle, those
// languages are fetched, so the switch finds them here.

describe('likelyLanguages', () => {
  it('is the app languages the browser lists, apart from the one in use', () => {
    expect(likelyLanguages(['en-US', 'fr-FR', 'rw'], 'en')).toEqual(['fr', 'rw']);
  });

  it('leaves out the language already in use', () => {
    expect(likelyLanguages(['fr', 'en'], 'fr')).toEqual([]);
  });

  it('understands the three letter code of Kinyarwanda', () => {
    expect(likelyLanguages(['kin'], 'en')).toEqual(['rw']);
  });

  it('ignores languages the app does not speak', () => {
    expect(likelyLanguages(['de-DE', 'en'], 'en')).toEqual([]);
  });

  it('names each language once, in the order the browser ranks them', () => {
    expect(likelyLanguages(['rw', 'fr-CA', 'fr', 'rw-RW'], 'en')).toEqual(['rw', 'fr']);
  });

  it('is empty for an empty list', () => {
    expect(likelyLanguages([], 'en')).toEqual([]);
  });
});

describe('warmLikelyLanguages', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(prefetchCatalog).mockClear();
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US', 'fr']);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('waits for the browser to be idle before fetching, so it never competes with the page', () => {
    let idle: (() => void) | undefined;
    vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
      idle = callback;
      return 1;
    });
    warmLikelyLanguages('en');
    expect(prefetchCatalog).not.toHaveBeenCalled();
    idle?.();
    expect(prefetchCatalog).toHaveBeenCalledTimes(1);
    expect(prefetchCatalog).toHaveBeenCalledWith('fr');
  });

  it('falls back to a timer in a browser without idle callbacks', () => {
    vi.stubGlobal('requestIdleCallback', undefined);
    warmLikelyLanguages('en');
    expect(prefetchCatalog).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(prefetchCatalog).toHaveBeenCalledWith('fr');
  });

  it('fetches nothing when the browser lists no other language the app speaks', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
    vi.stubGlobal('requestIdleCallback', undefined);
    warmLikelyLanguages('en');
    vi.advanceTimersByTime(3000);
    expect(prefetchCatalog).not.toHaveBeenCalled();
  });
});
