import type { CSSProperties } from 'react';
import { BatchStage } from '../../types';
import { STAGE_COLORS, STAGE_LABELS } from '../../utils/constants';

export default function StageBadge({ stage }: { stage: BatchStage | string }) {
  const color = STAGE_COLORS[stage as BatchStage] ?? '#566760';
  const label = STAGE_LABELS[stage as BatchStage] ?? stage;
  return (
    <span className="badge badge-stage badge-dot" style={{ '--c': color } as CSSProperties}>
      {label}
    </span>
  );
}
