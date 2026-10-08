import type { ReactNode } from 'react';
import './cards.css';

interface PaperProps {
  /** Large serif line at the top left, such as a farm name. */
  title: string;
  /** Small caps label and value at the top right, like an invoice number. */
  tag?: string;
  tagValue?: string;
  /** What a screen reader hears. The card is an illustration. */
  label: string;
  className?: string;
  children: ReactNode;
}

function Mark() {
  return (
    <span className="l-paper__mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="18" height="18" focusable="false">
        <ellipse cx="12" cy="13" rx="5.6" ry="7.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 5.8c1.9 2.2 2.7 4.7 2.7 7.2S13 17.8 12 20.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="18.5" cy="5" r="1.8" fill="currentColor" />
      </svg>
    </span>
  );
}

/** A printed document: serif title, small caps tag, hairlines, label and value rows. */
export function Paper({ title, tag, tagValue, label, className = '', children }: PaperProps) {
  return (
    <div className={`l-paper ${className}`.trim()} role="img" aria-label={label}>
      <div className="l-paper__sheet">
      <div className="l-paper__head">
        <span className="l-paper__who">
          <Mark />
          <b>{title}</b>
        </span>
        {tag && (
          <span className="l-paper__tag">
            <small>{tag}</small>
            <strong>{tagValue}</strong>
          </span>
        )}
      </div>
      <div className="l-paper__body">{children}</div>
      </div>
    </div>
  );
}

export function Row({ label, children, strong = false }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className={`l-paper__row${strong ? ' is-strong' : ''}`}>
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}
