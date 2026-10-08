import { renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';
import { LanguageProvider } from '../context/LanguageContext';
import { translations } from '../i18n/translations';
import { formatDocumentTitle, getPageInfo, useDocumentTitle, usePageTitle } from './pageTitle';

const APP_PATHS = [
  '/farmer', '/supervisor', '/farms', '/farms/new', '/farms/abc123', '/farms/abc123/batches/new',
  '/batches', '/batches/abc123', '/batches/abc123/detect', '/batches/abc123/harvest',
  '/harvests', '/detections/reports', '/alerts', '/devices', '/profile',
  '/admin', '/admin/users', '/admin/cooperatives', '/admin/contacts', '/admin/audit-log', '/admin/reports',
];

describe('getPageInfo', () => {
  it.each([
    ['/admin', 'Admin dashboard', 'Administration'],
    ['/admin/users', 'Users', 'Administration'],
    ['/admin/cooperatives', 'Cooperatives', 'Administration'],
    ['/admin/contacts', 'Messages', 'Administration'],
    ['/admin/audit-log', 'Audit log', 'Administration'],
    ['/admin/reports', 'System report', 'Administration'],
    ['/farms', 'Farms', 'Farming'],
    ['/farms/new', 'New farm', 'Farming'],
    ['/farms/abc123', 'Farm details', 'Farming'],
    ['/farms/abc123/batches/new', 'New batch', 'Farming'],
    ['/batches/abc123/detect', 'Disease check', 'Farming'],
    ['/batches/abc123/harvest', 'Record a harvest', 'Farming'],
    ['/alerts', 'Alerts', 'Monitoring'],
    ['/devices', 'Devices', 'Monitoring'],
    ['/profile', 'Profile', 'Account'],
  ])('%s is titled %s under %s', (path, title, section) => {
    const info = getPageInfo(path);
    expect(translations[info.titleKey].en).toBe(title);
    expect(translations[info.sectionKey].en).toBe(section);
  });

  it('ignores a trailing slash and the query string', () => {
    expect(getPageInfo('/admin/users/').titleKey).toBe(getPageInfo('/admin/users').titleKey);
    expect(getPageInfo('/admin/users?x=1').titleKey).toBe(getPageInfo('/admin/users').titleKey);
  });

  it('gives every page of the app its own title in all three languages', () => {
    const seen = new Set<string>();
    for (const path of APP_PATHS) {
      const info = getPageInfo(path);
      expect(info.titleKey, path).not.toBe('ptDefault');
      for (const locale of ['en', 'fr', 'rw'] as const) {
        expect(translations[info.titleKey][locale].trim(), `${info.titleKey} ${locale}`).not.toBe('');
        expect(translations[info.sectionKey][locale].trim(), `${info.sectionKey} ${locale}`).not.toBe('');
      }
      seen.add(info.titleKey);
    }
    expect(seen.size).toBeGreaterThan(15);
  });

  it('falls back to the product name for an unknown path', () => {
    expect(getPageInfo('/somewhere/else').titleKey).toBe('ptDefault');
  });
});

describe('formatDocumentTitle', () => {
  it('puts the page first and the product after a bar', () => {
    expect(formatDocumentTitle('Users')).toBe('Users | SSMS');
  });
});

function wrapper(path: string) {
  return ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>{children}</LanguageProvider>
    </MemoryRouter>
  );
}

describe('usePageTitle', () => {
  beforeEach(() => {
    localStorage.clear();
    document.title = 'Start';
  });

  it('sets the browser tab title for the current page', () => {
    renderHook(() => usePageTitle(), { wrapper: wrapper('/admin/audit-log') });
    expect(document.title).toBe('Audit log | SSMS');
  });

  it('returns the title and section for the top bar', () => {
    const { result } = renderHook(() => usePageTitle(), { wrapper: wrapper('/admin/cooperatives') });
    expect(result.current).toEqual({ title: 'Cooperatives', section: 'Administration' });
  });

  it('follows the language', () => {
    localStorage.setItem('ssms_locale', 'fr');
    const { result } = renderHook(() => usePageTitle(), { wrapper: wrapper('/admin/users') });
    expect(result.current.title).toBe(translations.ptUsers.fr);
    expect(document.title).toBe(`${translations.ptUsers.fr} | SSMS`);
  });

  it('puts the old tab title back when the page closes', () => {
    const { unmount } = renderHook(() => usePageTitle(), { wrapper: wrapper('/alerts') });
    expect(document.title).toBe('Alerts | SSMS');
    unmount();
    expect(document.title).toBe('Start');
  });
});

describe('useDocumentTitle', () => {
  it('uses the given text, such as the name of a farm', () => {
    document.title = 'Start';
    renderHook(() => useDocumentTitle('Gasabo Silk Farm'));
    expect(document.title).toBe('Gasabo Silk Farm | SSMS');
  });
});
