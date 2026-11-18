import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { useDecisionCount } from '../../hooks/useDecisionCount';
import { Icon } from '../ui/Icon';

/** A line on a supervisor's or admin's dashboard saying that decisions wait. It is not there when nothing waits. */
export default function DecisionsCard() {
  const { tn } = useLanguage();
  const count = useDecisionCount(true);
  if (count === 0) return null;
  return (
    <div className="alert alert-info" role="status">
      <Icon name="inbox" size={18} />
      <Link to="/decisions" className="link">{tn(count, 'dcsCardOne', 'dcsCardMany')}</Link>
    </div>
  );
}
