import { describe, expect, it } from 'vitest';
import { decideStart } from './startup';

// What the app does before it draws anything, from the address and from the language the person chose earlier (nothing is
// guessed from the browser here). The landing page has an address in each language, and the address says which language it is.

const at = (pathname: string, saved: 'en' | 'fr' | 'rw' | null = null, extra: { search?: string; hash?: string } = {}) =>
  decideStart({ pathname, search: extra.search ?? '', hash: extra.hash ?? '', saved });

describe('the English address, /', () => {
  it('is English, whatever the browser says, when no language was chosen', () => {
    expect(at('/')).toEqual({ redirectTo: null, initialLocale: 'en', remember: null });
  });

  it('is English for someone who chose English', () => {
    expect(at('/', 'en')).toEqual({ redirectTo: null, initialLocale: 'en', remember: null });
  });

  it.each(['fr', 'rw'] as const)('goes to the %s page for someone who chose that language, keeping the rest of the address', (saved) => {
    expect(at('/', saved)).toEqual({ redirectTo: `/${saved}`, initialLocale: saved, remember: null });
    expect(at('/', saved, { search: '?utm=a', hash: '#contact' }).redirectTo).toBe(`/${saved}?utm=a#contact`);
  });
});

describe('a language address, /fr and /rw', () => {
  it.each(['fr', 'rw'] as const)('is %s, and opening it is a choice that the rest of the app follows', (language) => {
    expect(at(`/${language}`)).toEqual({ redirectTo: null, initialLocale: language, remember: language });
  });

  it('is its own language even when another was chosen before, since the address was asked for', () => {
    expect(at('/fr', 'rw')).toEqual({ redirectTo: null, initialLocale: 'fr', remember: 'fr' });
  });

  it('is read the same with a slash at the end', () => {
    expect(at('/rw/').initialLocale).toBe('rw');
  });
});

describe('/en, which is not a page', () => {
  it('goes to the English page, keeping the rest of the address, and counts as choosing English', () => {
    expect(at('/en', 'fr', { hash: '#faq' })).toEqual({ redirectTo: '/#faq', initialLocale: 'en', remember: 'en' });
  });
});

describe('every other address', () => {
  it.each(['/login', '/farms', '/privacy', '/fr/privacy', '/lot/abc'])('leaves the language to the usual rules at %s', (path) => {
    expect(at(path, 'fr')).toEqual({ redirectTo: null, initialLocale: undefined, remember: null });
  });
});
