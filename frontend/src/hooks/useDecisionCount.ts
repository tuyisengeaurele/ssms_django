import { useCallback, useEffect, useState } from 'react';
import { supplyService } from '../services/supply.service';

/** The Decisions page sends this when it decided something, so the menu and the dashboard count again. */
export const DECISIONS_EVENT = 'ssms:decisions';

/**
 * How many decisions wait for this person. Only a supervisor or an admin has any, so `wanted` is false for a farmer and
 * no request is made. It counts again when `refreshKey` changes (the page changed) and when the Decisions page decided
 * something. A failed request keeps the last number.
 */
export function useDecisionCount(wanted: boolean, refreshKey?: string): number {
  const [count, setCount] = useState(0);

  const load = useCallback(() => {
    if (!wanted) return;
    supplyService.decisionCount().then((r) => setCount(r.data.data.count)).catch(() => {});
  }, [wanted]);

  useEffect(() => { load(); }, [load, refreshKey]);

  useEffect(() => {
    if (!wanted) return undefined;
    window.addEventListener(DECISIONS_EVENT, load);
    return () => window.removeEventListener(DECISIONS_EVENT, load);
  }, [wanted, load]);

  return wanted ? count : 0;
}
