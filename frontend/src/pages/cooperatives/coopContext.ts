import { useOutletContext } from 'react-router-dom';
import { CooperativeDetail } from '../../types';
import type { CoopPeriod } from './useCoopReport';

/** Which cooperative the page is about: one an admin opened, all of them together, or a supervisor's own. */
export type CoopScope = 'one' | 'all' | 'mine';

/** What the page hands to its sections, so the report is asked for once and the dates are kept as they move around. */
export interface CoopContext {
  scope: CoopScope;
  period: CoopPeriod;
  /** The cooperative an admin opened. Null while it loads, and for the other two kinds of page. */
  detail: CooperativeDetail | null;
  setDetail: (next: CooperativeDetail) => void;
  refreshDetail: () => Promise<void>;
}

export const useCoop = () => useOutletContext<CoopContext>();
