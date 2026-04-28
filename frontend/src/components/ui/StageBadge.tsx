import { BatchStage } from '../../types';
import { STAGE_COLORS, STAGE_LABELS } from '../../utils/constants';

export default function StageBadge({ stage }: { stage: BatchStage }) {
  const color = STAGE_COLORS[stage] ?? '#6b7280';
  return (
    <span className="badge" style={{ background: color + '20', color }}>
      {STAGE_LABELS[stage] ?? stage}
    </span>
  );
}
