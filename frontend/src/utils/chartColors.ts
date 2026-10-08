/**
 * Chart colours. The five categorical colours were checked with the palette validator
 * (lightness band, chroma, colour blind separation, contrast on the paper surface).
 * They keep a fixed order. A name always gets the same colour, whatever else is on screen.
 */
export const CHART_COLORS = ['#B97F0C', '#1F7A52', '#2F78B5', '#B4472F', '#7A5BA6'] as const;

const [GOLD, LEAF, BLUE, TERRACOTTA, PLUM] = CHART_COLORS;
const QUIET = '#6B7B73';

const BY_KIND = {
  stage: { EGG: GOLD, LARVA: LEAF, PUPA: BLUE, COCOON: TERRACOTTA, HARVEST: PLUM },
  result: { Healthy: LEAF, Flacherie: TERRACOTTA, Grasserie: GOLD, Muscardine: BLUE },
  role: { ADMIN: PLUM, SUPERVISOR: BLUE, FARMER: LEAF },
  action: { CREATE: LEAF, UPDATE: BLUE, DELETE: TERRACOTTA, LOGIN: PLUM, LOGOUT: GOLD, OTHER: QUIET },
  grade: { A: LEAF, B: BLUE, C: GOLD },
} as const;

export type ChartKind = keyof typeof BY_KIND;

export function colorFor(kind: ChartKind, name: string): string {
  const table = BY_KIND[kind] as Record<string, string>;
  return table[name] ?? QUIET;
}
