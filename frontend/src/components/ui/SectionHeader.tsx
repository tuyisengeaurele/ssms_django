import { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

/**
 * The heading of one section of a page that already has its own title, such as a tab. The tab names the section, so
 * the title stays for screen readers. The row is drawn only for a fact about the section or for its actions.
 */
export default function SectionHeader({ title, subtitle, actions }: Props) {
  const heading = <h2 className="sr-only">{title}</h2>;
  if (!subtitle && !actions) return heading;

  return (
    <div className="section-head">
      <div>
        {heading}
        {subtitle ? <p className="section-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="section-actions">{actions}</div> : null}
    </div>
  );
}
