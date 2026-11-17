type NavigatorWithConnection = Navigator & { connection?: { saveData?: boolean; effectiveType?: string } };

/**
 * True when downloading something nobody asked for yet would cost the person: they turned on data saving, or the connection
 * is 2g or slower. Browsers that do not say (Safari, Firefox) are treated as fine.
 */
export function shouldSpareData(): boolean {
  const connection = (typeof navigator !== 'undefined' ? (navigator as NavigatorWithConnection).connection : undefined) ?? undefined;
  return connection?.saveData === true || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g';
}
