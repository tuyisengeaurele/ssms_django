import { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export default function PageHeader({ title, subtitle, action }: Props) {
  return (
    <div className="flex-between mb-4" style={{ marginBottom: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text)' }}>{title}</h1>
        {subtitle && <p className="text-muted mt-1">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
