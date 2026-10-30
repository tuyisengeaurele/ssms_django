import { describe, expect, it } from 'vitest';
import { normalise, searchItems, type SearchItem } from './quickSearch';

const page = (label: string, to = '/x', hint = ''): SearchItem => ({ id: `p:${to}`, kind: 'page', label, hint, to });
const farm = (id: string, label: string, hint = '', extra = ''): SearchItem => ({ id: `f:${id}`, kind: 'farm', label, hint, extra, to: `/farms/${id}` });

const PAGES = [page('Dashboard', '/farmer'), page('My Farms', '/farms'), page('Alerts', '/alerts'), page('Devices', '/devices')];

describe('normalise', () => {
  it('ignores case, accents and extra spaces', () => {
    expect(normalise('  Élevage   DES Vers ')).toBe('elevage des vers');
  });

  it('keeps Kinyarwanda letters readable', () => {
    expect(normalise("Ikibaho cy'ubuyobozi")).toBe("ikibaho cy'ubuyobozi");
  });
});

describe('searchItems with nothing typed', () => {
  it('lists every page and a few farms', () => {
    const farms = Array.from({ length: 9 }, (_, i) => farm(String(i), `Farm ${i}`));
    const out = searchItems([...PAGES, ...farms], '');
    expect(out.filter((i) => i.kind === 'page')).toHaveLength(4);
    expect(out.filter((i) => i.kind === 'farm')).toHaveLength(5);
  });

  it('treats blanks as nothing typed', () => {
    expect(searchItems(PAGES, '   ')).toHaveLength(4);
  });
});

describe('searchItems with a query', () => {
  it('finds a page by part of its name', () => {
    expect(searchItems(PAGES, 'dev').map((i) => i.label)).toEqual(['Devices']);
  });

  it('finds a farm by the owner or the place in its hint', () => {
    const farms = [farm('1', 'Rwanda Silk Farm', 'Musanze, Northern Province', 'Aline Uwase'), farm('2', 'Hill Farm', 'Huye')];
    expect(searchItems(farms, 'aline').map((i) => i.id)).toEqual(['f:1']);
    expect(searchItems(farms, 'huye').map((i) => i.id)).toEqual(['f:2']);
  });

  it('needs every word to match, in any order', () => {
    const farms = [farm('1', 'Rwanda Silk Farm', 'Musanze'), farm('2', 'Silk Hill', 'Huye')];
    expect(searchItems(farms, 'musanze silk').map((i) => i.id)).toEqual(['f:1']);
    expect(searchItems(farms, 'silk huye').map((i) => i.id)).toEqual(['f:2']);
  });

  it('matches without accents on either side', () => {
    expect(searchItems([page('Élevage', '/e')], 'elevage')).toHaveLength(1);
    expect(searchItems([page('Elevage', '/e')], 'ÉLEVAGE')).toHaveLength(1);
  });

  it('puts a name that starts with the query before one that only contains it', () => {
    const items = [page('Disease alerts', '/a'), page('Alerts', '/b'), page('Safe alerts range', '/c')];
    expect(searchItems(items, 'alerts').map((i) => i.to)).toEqual(['/b', '/a', '/c']);
  });

  it('puts a name match before a match in the hint', () => {
    const items = [farm('1', 'Hill Farm', 'Near Silk Road'), farm('2', 'Silk Farm', 'Huye')];
    expect(searchItems(items, 'silk').map((i) => i.id)).toEqual(['f:2', 'f:1']);
  });

  it('shows at most eight farms, and every page that matches', () => {
    const farms = Array.from({ length: 20 }, (_, i) => farm(String(i), `Silk farm ${i}`));
    const out = searchItems([page('Farms', '/farms'), ...farms], 'farm');
    expect(out.filter((i) => i.kind === 'farm')).toHaveLength(8);
    expect(out.filter((i) => i.kind === 'page')).toHaveLength(1);
  });

  it('lists pages before farms', () => {
    const out = searchItems([farm('1', 'Farm one'), page('Farms', '/farms')], 'farm');
    expect(out.map((i) => i.kind)).toEqual(['page', 'farm']);
  });

  it('returns nothing when nothing matches', () => {
    expect(searchItems(PAGES, 'zzz')).toEqual([]);
  });

  it('does not treat the query as a pattern', () => {
    expect(searchItems(PAGES, '(.*')).toEqual([]);
  });
});
