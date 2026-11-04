import { ReactNode } from 'react';

interface Props {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

/** The title of one section of a page that already has its own title, such as a tab. The page title is the first level. */
export default function SectionHeader({ title, subtitle, actions }: Props) {
  return (
    <div className="section-head">
      <div>
        <h2 className="section-title">{title}</h2>
        {subtitle ? <p className="section-sub">{subtitle}</p> : null}
      </div>
      {actions ? <div className="section-actions">{actions}</div> : null}
    </div>
  );
}
