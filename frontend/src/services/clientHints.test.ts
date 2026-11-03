import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectDeviceHints } from './clientHints';

type Nav = Navigator & { userAgentData?: unknown; standalone?: boolean };
const nav = navigator as Nav;

function setHighEntropy(impl: (keys: string[]) => Promise<Record<string, unknown>>) {
  Object.defineProperty(nav, 'userAgentData', { configurable: true, value: { getHighEntropyValues: impl } });
}

afterEach(() => {
  Reflect.deleteProperty(nav, 'userAgentData');
  Reflect.deleteProperty(nav, 'standalone');
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('collectDeviceHints', () => {
  it('says only that the app is not installed when the browser tells nothing', async () => {
    expect(await collectDeviceHints()).toEqual({ installed: false });
  });

  it('asks the browser for the model and the system', async () => {
    const ask = vi.fn().mockResolvedValue({ model: 'Pixel 9', platform: 'Android' });
    setHighEntropy(ask);
    expect(await collectDeviceHints()).toEqual({ installed: false, model: 'Pixel 9', platform: 'Android' });
    expect(ask).toHaveBeenCalledWith(['model', 'platform']);
  });

  it('leaves out an empty model, as a computer reports', async () => {
    setHighEntropy(() => Promise.resolve({ model: '', platform: 'Windows' }));
    expect(await collectDeviceHints()).toEqual({ installed: false, platform: 'Windows' });
  });

  it('cuts a long value and ignores values that are not text', async () => {
    setHighEntropy(() => Promise.resolve({ model: 'x'.repeat(100), platform: 7 }));
    const hints = await collectDeviceHints();
    expect(hints.model).toHaveLength(40);
    expect(hints.platform).toBeUndefined();
  });

  it('does not throw when the browser refuses', async () => {
    setHighEntropy(() => Promise.reject(new Error('blocked')));
    expect(await collectDeviceHints()).toEqual({ installed: false });
  });

  it('does not wait for a browser that never answers', async () => {
    vi.useFakeTimers();
    setHighEntropy(() => new Promise(() => {}));
    const pending = collectDeviceHints();
    await vi.advanceTimersByTimeAsync(1500);
    expect(await pending).toEqual({ installed: false });
  });

  it('knows when the app runs installed', async () => {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) => ({ matches: query.includes('display-mode: standalone') }) as MediaQueryList,
    );
    expect((await collectDeviceHints()).installed).toBe(true);
  });

  it('knows an installed app on an iPhone, which says it another way', async () => {
    Object.defineProperty(nav, 'standalone', { configurable: true, value: true });
    expect((await collectDeviceHints()).installed).toBe(true);
  });
});
