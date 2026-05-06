// Reusable skeleton loader components

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ width = '100%', height = 16, borderRadius, className = '', style }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{ width, height, borderRadius, ...style }}
    />
  );
}

export function SkeletonText({ lines = 3, lastWidth = '60%' }: { lines?: number; lastWidth?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="skeleton-text"
          width={i === lines - 1 ? lastWidth : '100%'}
        />
      ))}
    </div>
  );
}

export function SkeletonStatCard() {
  return (
    <div className="skeleton-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <Skeleton width={80} height={12} className="skeleton-text" />
        <Skeleton width={36} height={36} className="skeleton-circle" />
      </div>
      <Skeleton width={60} height={28} style={{ marginBottom: '0.5rem', borderRadius: '6px' }} />
      <Skeleton width={100} height={10} className="skeleton-text" />
    </div>
  );
}

export function SkeletonTableRow({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} style={{ padding: '0.9rem 1.125rem', borderBottom: '1px solid var(--border-light)' }}>
          <Skeleton height={12} width={i === 0 ? '70%' : i === cols - 1 ? '50%' : '85%'} className="skeleton-text" />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="table-container">
      <div className="table-wrapper">
        <table>
          <thead>
            <tr>
              {Array.from({ length: cols }).map((_, i) => (
                <th key={i}>
                  <Skeleton height={10} width={60 + i * 10} className="skeleton-text" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, i) => (
              <SkeletonTableRow key={i} cols={cols} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SkeletonCard({ height = 120 }: { height?: number }) {
  return (
    <div className="skeleton-card" style={{ height }}>
      <Skeleton height={16} width="50%" style={{ marginBottom: '0.75rem', borderRadius: '6px' }} />
      <Skeleton height={12} width="80%" className="skeleton-text" style={{ marginBottom: '0.5rem' }} />
      <Skeleton height={12} width="65%" className="skeleton-text" />
    </div>
  );
}
