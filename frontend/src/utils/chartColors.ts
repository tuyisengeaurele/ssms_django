/**
 * Chart colours. The five categorical colours were checked with the palette validator
 * (lightness band, chroma, colour blind separation, contrast on the paper surface).
 * They keep a fixed order. A name always gets the same colour, whatever else is on screen.
 *
 * CHART_COLORS are the light shades. The charts draw with the --chart-N tokens in index.css, which hold these shades in
 * the light theme and lighter ones of the same hues in the dark theme.
 */
export const CHART_COLORS = ['#B97F0C', '#1F7A52', '#2F78B5', '#B4472F', '#7A5BA6'] as const;

const [GOLD, LEAF, BLUE, TERRACOTTA, PLUM] = CHART_COLORS.map((_, index) => `var(--chart-${index + 1})`);
const QUIET = 'var(--chart-quiet)';

const BY_KIND = {
  stage: { EGG: GOLD, LARVA: LEAF, PUPA: BLUE, COCOON: TERRACOTTA, HARVEST: PLUM },
  result: { Healthy: LEAF, Grasserie: GOLD },
  role: { ADMIN: PLUM, SUPERVISOR: BLUE, FARMER: LEAF },
  action: { CREATE: LEAF, UPDATE: BLUE, DELETE: TERRACOTTA, LOGIN: PLUM, LOGOUT: GOLD, OTHER: QUIET },
  grade: { A: LEAF, B: BLUE, C: GOLD },
} as const;

export type ChartKind = keyof typeof BY_KIND;

export function colorFor(kind: ChartKind, name: string): string {
  const table = BY_KIND[kind] as Record<string, string>;
  return table[name] ?? QUIET;
}
