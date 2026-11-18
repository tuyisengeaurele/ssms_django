import { describe, expect, it } from 'vitest';
import { isLandingPath, landingAddress, languageOfLandingPath } from './landingAddress';

// The landing page has an address in each language: English at the root, French at /fr, Kinyarwanda at /rw. Nothing else in the
// app has a language in its address.

describe('landingAddress', () => {
  it('is the root for English and a short prefix for the others', () => {
    expect(landingAddress('en')).toBe('/');
    expect(landingAddress('fr')).toBe('/fr');
    expect(landingAddress('rw')).toBe('/rw');
  });
});

describe('languageOfLandingPath', () => {
  it.each([
    ['/', 'en'],
    ['/fr', 'fr'],
    ['/rw', 'rw'],
    ['/fr/', 'fr'],
    ['/rw/', 'rw'],
  ])('reads %s as %s', (path, language) => {
    expect(languageOfLandingPath(path)).toBe(language);
  });

  it.each(['/en', '/en/', '/FR', '/fr/privacy', '/rw/login', '/farms', '/login', '/privacy', '/frx', '/f', '', '//', '/fr//'])(
    'does not read %j as a landing page address',
    (path) => {
      expect(languageOfLandingPath(path)).toBeNull();
    },
  );
});

describe('isLandingPath', () => {
  it('is true for the three addresses and false for everything else', () => {
    expect(['/', '/fr', '/rw'].every(isLandingPath)).toBe(true);
    expect(['/en', '/login', '/privacy', '/fr/privacy', '/farms'].some(isLandingPath)).toBe(false);
  });
});
