import { afterEach, describe, expect, it, vi } from 'vitest';

// A fresh copy of the catalog for each test, so French has not been loaded yet. (The shared test setup loads it for the others.)
async function freshCatalog() {
  vi.resetModules();
  return import('./catalog');
}

afterEach(() => {
  vi.doUnmock('./translations?locale=fr');
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
