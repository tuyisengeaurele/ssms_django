export interface BarRow {
  key: string;
  label: string;
  value: number;
  color: string;
}

interface BarListProps {
  /** Names the list for screen readers. */
  label: string;
  rows: BarRow[];
  format?: (value: number) => string;
}

/** Horizontal bars as plain text rows. Label and value stay in text colour. The bar carries the colour. */
export default function BarList({ label, rows, format = (v) => String(v) }: BarListProps) {
  const max = Math.max(0, ...rows.map((r) => r.value));
  return (
    <ul className="barlist" aria-label={label}>
      {rows.map((row) => (
        <li key={row.key}>
          <span className="barlist-label">{row.label}</span>
          <span className="barlist-track" aria-hidden="true">
            <span className="barlist-bar" style={{ width: `${max ? (row.value / max) * 100 : 0}%`, background: row.color }} />
          </span>
          <span className="barlist-value">{format(row.value)}</span>
        </li>
      ))}
    </ul>
  );
}
