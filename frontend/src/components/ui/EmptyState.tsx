import { Link } from 'react-router-dom';
import { ReactNode } from 'react';
import { Icon } from './Icon';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    to?: string;
    onClick?: () => void;
  };
}

/** What a list says when it has nothing to show, and the next step. */
export default function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon ?? <Icon name="inbox" size={22} />}</div>
      <h3 className="empty-title">{title}</h3>
      {description && <p className="empty-desc">{description}</p>}
      {action && (
        <div style={{ marginTop: 20 }}>
          {action.to ? (
            <Link to={action.to} className="btn btn-primary btn-sm">
              {action.label}
            </Link>
          ) : (
            <button type="button" onClick={action.onClick} className="btn btn-secondary btn-sm">
              {action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
