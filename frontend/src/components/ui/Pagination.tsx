interface PaginationMeta {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

interface PaginationProps {
  meta: PaginationMeta;
  onPage: (page: number) => void;
}

export default function Pagination({ meta, onPage }: PaginationProps) {
  if (meta.totalPages <= 1) return null;

  const { page, totalPages, totalItems, pageSize, hasNext, hasPrev } = meta;
  const from = (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, totalItems);

  // Build visible page numbers — show at most 5 around current
  const pages: (number | '…')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('…');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push('…');
    pages.push(totalPages);
  }

  const btnBase: React.CSSProperties = {
    minWidth: 32, height: 32,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 'var(--radius)', border: '1px solid var(--border)',
    fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer',
    background: 'var(--surface)', color: 'var(--text-muted)',
    transition: 'all 0.15s',
    padding: '0 0.5rem',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border-light)', flexWrap: 'wrap', gap: '0.5rem' }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>
        Showing <strong style={{ color: 'var(--text-2)' }}>{from}–{to}</strong> of <strong style={{ color: 'var(--text-2)' }}>{totalItems}</strong>
      </span>

      <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
        <button
          style={{ ...btnBase, opacity: hasPrev ? 1 : 0.4, cursor: hasPrev ? 'pointer' : 'not-allowed' }}
          onClick={() => hasPrev && onPage(page - 1)}
          disabled={!hasPrev}
          aria-label="Previous page"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>

        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`ellipsis-${i}`} style={{ padding: '0 0.25rem', color: 'var(--text-faint)', fontSize: '0.78rem' }}>…</span>
          ) : (
            <button
              key={p}
              style={{
                ...btnBase,
                background:   p === page ? 'var(--primary)' : 'var(--surface)',
                color:        p === page ? '#fff' : 'var(--text-muted)',
                borderColor:  p === page ? 'var(--primary)' : 'var(--border)',
                fontWeight:   p === page ? 700 : 500,
              }}
              onClick={() => onPage(p as number)}
            >
              {p}
            </button>
          )
        )}

        <button
          style={{ ...btnBase, opacity: hasNext ? 1 : 0.4, cursor: hasNext ? 'pointer' : 'not-allowed' }}
          onClick={() => hasNext && onPage(page + 1)}
          disabled={!hasNext}
          aria-label="Next page"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
