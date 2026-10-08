import { Icon } from './Icon';

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
  const to = Math.min(page * pageSize, totalItems);

  // Show at most five numbers around the current page.
  const pages: (number | '…')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('…');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('…');
    pages.push(totalPages);
  }

  return (
    <nav className="pager" aria-label="Pages">
      <span className="pager-count">
        Showing <strong>{from} to {to}</strong> of <strong>{totalItems}</strong>
      </span>

      <div className="pager-buttons">
        <button type="button" className="pager-btn" onClick={() => hasPrev && onPage(page - 1)} disabled={!hasPrev} aria-label="Previous page">
          <Icon name="back" size={15} />
        </button>

        {pages.map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="pager-gap" aria-hidden="true">…</span>
          ) : (
            <button
              key={p}
              type="button"
              className={`pager-btn${p === page ? ' is-current' : ''}`}
              aria-label={`Page ${p}`}
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onPage(p)}
            >
              {p}
            </button>
          ),
        )}

        <button type="button" className="pager-btn" onClick={() => hasNext && onPage(page + 1)} disabled={!hasNext} aria-label="Next page">
          <Icon name="forward" size={15} />
        </button>
      </div>
    </nav>
  );
}
