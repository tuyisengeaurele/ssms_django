export interface SearchItem {
  id: string;
  kind: 'page' | 'farm';
  label: string;
  /** Shown under the label, for example the place of a farm. Searched too. */
  hint?: string;
  /** Searched but not shown, for example the name of the owner. */
  extra?: string;
  to: string;
}

/** Farms shown while nothing is typed, and the most shown for any query. */
const FARMS_AT_REST = 5;
const FARMS_MOST = 8;

/** Lower case, no accents, single spaces, so "Élevage" and "elevage" are the same word. */
export function normalise(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** 0 when the label starts with the query, 1 when it holds it, 2 when only the hint or extra does. */
function rank(item: SearchItem, query: string): number {
  const label = normalise(item.label);
  if (label.startsWith(query)) return 0;
  if (label.includes(query)) return 1;
  return 2;
}

/**
 * Pages first, then farms. A page or farm matches when every word the person typed is somewhere in its name, hint or
 * extra text. The query is plain text, never a pattern.
 */
export function searchItems(items: SearchItem[], query: string): SearchItem[] {
  const q = normalise(query);
  const pages = items.filter((item) => item.kind === 'page');
  const farms = items.filter((item) => item.kind === 'farm');

  if (!q) return [...pages, ...farms.slice(0, FARMS_AT_REST)];

  const words = q.split(' ');
  const find = (list: SearchItem[]) =>
    list
      .filter((item) => {
        const haystack = normalise(`${item.label} ${item.hint ?? ''} ${item.extra ?? ''}`);
        return words.every((word) => haystack.includes(word));
      })
      .map((item, index) => ({ item, index, rank: rank(item, q) }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map((entry) => entry.item);

  return [...find(pages), ...find(farms).slice(0, FARMS_MOST)];
}
