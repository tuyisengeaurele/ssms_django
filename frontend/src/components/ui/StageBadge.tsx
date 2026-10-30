import type { CSSProperties } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { BatchStage } from '../../types';
import { STAGE_COLORS, stageLabel } from '../../utils/constants';

export default function StageBadge({ stage }: { stage: BatchStage | string }) {
  const { t } = useLanguage();
  const color = STAGE_COLORS[stage as BatchStage] ?? 'var(--text-muted)';
  const label = stageLabel(t, stage as BatchStage);
  return (
    <span className="badge badge-stage" style={{ '--c': color } as CSSProperties}>
      {label}
    </span>
  );
}
