import { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Draw the title on the page. Only for a name the top bar does not carry, such as a farm or a batch. */
  showTitle?: boolean;
}

/**
 * The top of a page. The top bar already names the page, so the title stays for screen readers and a visible one
 * is the exception. A subtitle is for facts about this page (a count, a place), not for what the page is for.
 */
export default function PageHeader({ title, subtitle, actions, showTitle = false }: Props) {
  const heading = <h1 className={showTitle ? 'page-title' : 'sr-only'}>{title}</h1>;
  if (!showTitle && !subtitle && !actions) return heading;

  return (
    <div className="page-header">
      <div>
        {heading}
        {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}
