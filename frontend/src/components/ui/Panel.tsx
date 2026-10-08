import { ReactNode } from 'react';

interface PanelProps {
  title: string;
  note?: string;
  actions?: ReactNode;
  /** No padding around the content, for tables that run edge to edge. */
  flush?: boolean;
  children: ReactNode;
}

/** A white sheet with a serif heading. Holds a table, a chart or a form. */
export default function Panel({ title, note, actions, flush, children }: PanelProps) {
  return (
    <section className="panel">
      <header className="panel-head">
        <div>
          <h2 className="panel-title">{title}</h2>
          {note ? <p className="panel-note">{note}</p> : null}
        </div>
        {actions ? <div className="page-actions">{actions}</div> : null}
      </header>
      {flush ? children : <div className="panel-body">{children}</div>}
    </section>
  );
}
