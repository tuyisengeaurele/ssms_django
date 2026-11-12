import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetWarmUp, warmOnIntent, warmUp } from './warmUp';

// The free API host sleeps and takes about a minute to wake. A visitor who is about to sign in gives us a few seconds of
// warning (they are reading the page, or typing their email), so the page asks the health route once to start the wake.

const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetWarmUp();
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
});

afterEach(() => vi.unstubAllGlobals());

describe('warming the API before it is needed', () => {
  it('asks the health route once, however many times it is called', () => {
    warmUp();
    warmUp();
    warmUp();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(String(fetchMock().mock.calls[0][0])).toMatch(/\/health$/);
  });

  it('can run again after a reset, for a new page load', () => {
    warmUp();
    resetWarmUp();
    warmUp();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('never throws and never shows an error when the request fails', async () => {
    fetchMock().mockRejectedValue(new Error('offline'));
    expect(() => warmUp()).not.toThrow();
    await Promise.resolve();
  });

  it('never throws when the browser has no fetch at all', () => {
    vi.stubGlobal('fetch', undefined);
    expect(() => warmUp()).not.toThrow();
  });

  it('does nothing when the visitor asked the browser to save data', () => {
    vi.stubGlobal('navigator', { connection: { saveData: true } });
    warmUp();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('sends no cookie and no token', () => {
    warmUp();
    const options = fetchMock().mock.calls[0][1];
    expect(options.method).toBe('GET');
    expect(options.credentials).toBe('omit');
    expect(options.headers).toBeUndefined();
  });
});

describe('warming when a visitor shows they are about to sign in', () => {
  it('warms on hover and on keyboard focus, which are the two ways to reach a button', () => {
    warmOnIntent.onPointerEnter();
    expect(fetch).toHaveBeenCalledTimes(1);
    resetWarmUp();
    warmOnIntent.onFocus();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('also warms on a touch, because a phone has no hover', () => {
    warmOnIntent.onTouchStart();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
