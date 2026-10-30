import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { setPrefersDark } from '../test/setup';

// public/theme-boot.js runs before the app, so a signed in person on dark never sees a cream page flash.
const script = readFileSync(join(__dirname, '../../public/theme-boot.js'), 'utf8');
const appSource = readFileSync(join(__dirname, '../App.tsx'), 'utf8');

function boot(path: string) {
  document.documentElement.removeAttribute('data-theme');
  new Function('location', 'localStorage', 'document', 'window', script)({ pathname: path }, localStorage, document, window);
  return document.documentElement.getAttribute('data-theme');
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
});

describe('theme boot script', () => {
  it('sets dark for a signed in person who chose dark', () => {
    localStorage.setItem('ssms_session', '1');
    localStorage.setItem('ssms_theme', 'dark');
    expect(boot('/farmer')).toBe('dark');
  });

  it('sets dark for a signed in person whose computer is on dark and who chose nothing', () => {
    localStorage.setItem('ssms_session', '1');
    setPrefersDark(true);
    expect(boot('/farmer')).toBe('dark');
  });

  it('leaves the page light when light was chosen, whatever the computer says', () => {
    localStorage.setItem('ssms_session', '1');
    localStorage.setItem('ssms_theme', 'light');
    setPrefersDark(true);
    expect(boot('/farmer')).toBeNull();
  });

  it('leaves the page light for a computer on light', () => {
    localStorage.setItem('ssms_session', '1');
    expect(boot('/farmer')).toBeNull();
  });

  it('does nothing for a visitor who is not signed in', () => {
    localStorage.setItem('ssms_theme', 'dark');
    expect(boot('/farmer')).toBeNull();
  });

  it('survives storage that cannot be read', () => {
    const broken = { getItem: () => { throw new Error('blocked'); } };
    document.documentElement.removeAttribute('data-theme');
    expect(() => new Function('location', 'localStorage', 'document', 'window', script)({ pathname: '/farmer' }, broken, document, window)).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBeNull();
  });

  describe('public pages stay light', () => {
    beforeEach(() => {
      localStorage.setItem('ssms_session', '1');
      localStorage.setItem('ssms_theme', 'dark');
    });

    it.each(['/', '/login', '/register', '/join/abc123', '/privacy', '/terms'])('%s', (path) => {
      expect(boot(path)).toBeNull();
    });

    it('covers every public route in App.tsx', () => {
      // Everything before the signed in layout, plus the legal pages after it.
      const publicPart = appSource.slice(0, appSource.indexOf('All authenticated pages')) + appSource.slice(appSource.indexOf('{/* Legal */}'));
      const paths = [...publicPart.matchAll(/<Route\s+path="(\/[^"*]*)"/g)].map((m) => m[1].replace(/:[A-Za-z]+/g, 'x'));
      expect(paths.length).toBeGreaterThan(8);
      for (const path of paths) expect(boot(path), path).toBeNull();
    });
  });
});
