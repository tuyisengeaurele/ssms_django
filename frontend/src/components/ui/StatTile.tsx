import { useCountUp } from '../../hooks/useCountUp';

interface StatTileProps {
  label: string;
  value: number | string;
  hint?: string;
  /** Colours the number green, for good news. */
  good?: boolean;
}

/** One number with a plain label. Text only: no icon, no coloured tile, no gradient bar. */
export default function StatTile({ label, value, hint, good }: StatTileProps) {
  const counted = useCountUp(typeof value === 'number' ? value : 0);
  return (
    <div className={`stat-tile${good ? ' is-good' : ''}`}>
      <p className="stat-tile-label">{label}</p>
      <p className="stat-tile-value">{typeof value === 'number' ? counted : value}</p>
      {hint ? <p className="stat-tile-hint">{hint}</p> : null}
    </div>
  );
}
