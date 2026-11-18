import { afterEach, describe, expect, it, vi } from 'vitest';

// A fresh copy of the catalog for each test, so French has not been loaded yet. (The shared test setup loads it for the others.)
async function freshCatalog() {
  vi.resetModules();
  return import('./catalog');
}

afterEach(() => {
  vi.doUnmock('./translations?locale=fr');
  vi.doUnmock('./translations?locale=rw');
  Reflect.deleteProperty(navigator, 'connection');
  vi.resetModules();
});

describe('the catalog of texts', () => {
  it('has English from the start', async () => {
    const { say, isLoaded } = await freshCatalog();
    expect(isLoaded('en')).toBe(true);
    expect(say('en', 'navFarms')).toBe('Farms');
  });

  it('answers in English until the other language has arrived, never with the key', async () => {
    const { say, isLoaded } = await freshCatalog();
    expect(isLoaded('fr')).toBe(false);
    expect(say('fr', 'navFarms')).toBe('Farms');
  });

  it('answers in the other language once it has been loaded', async () => {
    const { say, isLoaded, loadCatalog } = await freshCatalog();
    await loadCatalog('fr');
    expect(isLoaded('fr')).toBe(true);
    expect(say('fr', 'navFarms')).toBe('Fermes');
    expect(say('en', 'navFarms')).toBe('Farms');
  });

  it('gives the key itself for a text that does not exist, so a gap is visible and nothing throws', async () => {
    const { say, loadCatalog } = await freshCatalog();
    await loadCatalog('rw');
    expect(say('rw', 'noSuchText')).toBe('noSuchText');
  });

  it('loads a language once, however many places ask', async () => {
    const { loadCatalog } = await freshCatalog();
    const first = loadCatalog('rw');
    expect(loadCatalog('rw')).toBe(first);
    await first;
    await expect(loadCatalog('rw')).resolves.toBeUndefined();
  });

  it('says so when a language cannot be fetched, and tries again on the next request', async () => {
    let attempts = 0;
    vi.doMock('./translations?locale=fr', () => {
      attempts += 1;
      if (attempts === 1) throw new Error('offline');
      return { translations: { navFarms: 'Fermes' } };
    });
    const { say, loadCatalog, isLoaded } = await freshCatalog();
    await expect(loadCatalog('fr')).rejects.toThrow();
    expect(isLoaded('fr')).toBe(false);
    await loadCatalog('fr');
    expect(say('fr', 'navFarms')).toBe('Fermes');
  });
});

// A person about to switch language shows it by hovering or focusing the control. Fetching then means the file is already here
// when they choose. It must never cost data a person has asked to save, and never show an error for a download nobody asked for.

function connection(value: { saveData?: boolean; effectiveType?: string }) {
  Object.defineProperty(navigator, 'connection', { value, configurable: true });
}

function countDownloads(locale: 'fr' | 'rw', failFirst = false) {
  const counter = { n: 0 };
  vi.doMock(`./translations?locale=${locale}`, () => {
    counter.n += 1;
    if (failFirst && counter.n === 1) throw new Error('offline');
    return { translations: { navFarms: 'x' } };
  });
  return counter;
}

describe('fetching a language before it is chosen', () => {
  it('starts one download, however often it is asked', async () => {
    const downloads = countDownloads('rw');
    const { prefetchCatalog, loadCatalog, isLoaded } = await freshCatalog();
    prefetchCatalog('rw');
    prefetchCatalog('rw');
    await loadCatalog('rw');
    expect(downloads.n).toBe(1);
    expect(isLoaded('rw')).toBe(true);
  });

  it('does nothing when the person has asked to save data', async () => {
    const downloads = countDownloads('rw');
    connection({ saveData: true });
    const { prefetchCatalog, isLoaded } = await freshCatalog();
    prefetchCatalog('rw');
    await Promise.resolve();
    expect(downloads.n).toBe(0);
    expect(isLoaded('rw')).toBe(false);
  });

  it.each(['slow-2g', '2g'])('does nothing on a %s connection', async (effectiveType) => {
    const downloads = countDownloads('rw');
    connection({ effectiveType });
    const { prefetchCatalog } = await freshCatalog();
    prefetchCatalog('rw');
    await Promise.resolve();
    expect(downloads.n).toBe(0);
  });

  it('goes ahead on a 3g or better connection', async () => {
    const downloads = countDownloads('rw');
    connection({ effectiveType: '3g', saveData: false });
    const { prefetchCatalog, loadCatalog } = await freshCatalog();
    prefetchCatalog('rw');
    await loadCatalog('rw');
    expect(downloads.n).toBe(1);
  });

  it('does nothing for English, which is always here', async () => {
    const { prefetchCatalog } = await freshCatalog();
    expect(() => prefetchCatalog('en')).not.toThrow();
  });

  it('does not fetch a language that has already arrived', async () => {
    const downloads = countDownloads('rw');
    const { prefetchCatalog, loadCatalog } = await freshCatalog();
    await loadCatalog('rw');
    prefetchCatalog('rw');
    expect(downloads.n).toBe(1);
  });

  it('says nothing when the download fails, and the real choice can try again', async () => {
    const downloads = countDownloads('fr', true);
    const { prefetchCatalog, loadCatalog, isLoaded } = await freshCatalog();
    prefetchCatalog('fr');
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(isLoaded('fr')).toBe(false);
    await loadCatalog('fr');
    expect(downloads.n).toBe(2);
    expect(isLoaded('fr')).toBe(true);
  });
});

// The page drawn by the build stays on screen while the app starts. For a language other than English the app waits a moment for
// the language file before it draws, so what it draws is already in that language. A slow or failed download must never keep the
// person waiting, so it waits only so long.

describe('waiting a moment for a language before drawing', () => {
  it('is done at once for English and for a language that is already here', async () => {
    const { loadWithin, loadCatalog } = await freshCatalog();
    await expect(loadWithin('en', 400)).resolves.toBeUndefined();
    await loadCatalog('rw');
    await expect(loadWithin('rw', 400)).resolves.toBeUndefined();
  });

  it('is done as soon as the language arrives, well before the limit', async () => {
    const downloads = countDownloads('fr');
    const { loadWithin, isLoaded } = await freshCatalog();
    await loadWithin('fr', 5000);
    expect(isLoaded('fr')).toBe(true);
    expect(downloads.n).toBe(1);
  });

  it('gives up at the limit when the language is slow, and the download carries on', async () => {
    vi.useFakeTimers();
    let arrive: () => void = () => {};
    vi.doMock('./translations?locale=fr', () => new Promise((resolve) => (arrive = () => resolve({ translations: { navFarms: 'Fermes' } }))));
    const { loadWithin, isLoaded } = await freshCatalog();
    const waited = loadWithin('fr', 400);
    await vi.advanceTimersByTimeAsync(400);
    await expect(waited).resolves.toBeUndefined();
    expect(isLoaded('fr')).toBe(false);
    arrive();
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
  });

  it('is done, and says nothing, when the download fails', async () => {
    countDownloads('fr', true);
    const { loadWithin, isLoaded } = await freshCatalog();
    await expect(loadWithin('fr', 400)).resolves.toBeUndefined();
    expect(isLoaded('fr')).toBe(false);
  });
});
