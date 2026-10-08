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
      <img src="/logo-mark.png" alt="" width="28" height="28" decoding="async" />
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
