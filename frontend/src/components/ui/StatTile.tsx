import { useCountUp } from '../../hooks/useCountUp';
import { Icon, type IconName } from './Icon';

interface StatTileProps {
  label: string;
  value: number | string;
  hint?: string;
  icon?: IconName;
  /** Colours the number green, for good news. */
  good?: boolean;
}

/** One number with a plain label. No coloured icon tile, no gradient bar. */
export default function StatTile({ label, value, hint, icon, good }: StatTileProps) {
  const counted = useCountUp(typeof value === 'number' ? value : 0);
  return (
    <div className={`stat-tile${good ? ' is-good' : ''}`}>
      <p className="stat-tile-label">
        <span>{label}</span>
        {icon ? (
          <span className="stat-tile-icon">
            <Icon name={icon} size={18} />
          </span>
        ) : null}
      </p>
      <p className="stat-tile-value">{typeof value === 'number' ? counted : value}</p>
      {hint ? <p className="stat-tile-hint">{hint}</p> : null}
    </div>
  );
}
