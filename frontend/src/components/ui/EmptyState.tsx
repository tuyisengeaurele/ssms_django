import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: {
    label: string;
    to?: string;
    onClick?: () => void;
  };
}

export default function EmptyState({ icon = '📭', title, description, action }: EmptyStateProps) {
  return (
    <motion.div
      className="empty-state"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="empty-icon">
        <span>{icon}</span>
      </div>
      <h3 className="empty-title">{title}</h3>
      {description && <p className="empty-desc">{description}</p>}
      {action && (
        <div style={{ marginTop: '1.5rem' }}>
          {action.to ? (
            <Link to={action.to} className="btn btn-primary btn-sm">
              {action.label}
            </Link>
          ) : (
            <button onClick={action.onClick} className="btn btn-primary btn-sm">
              {action.label}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}
