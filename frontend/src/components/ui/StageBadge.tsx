import { BatchStage } from '../../types';
import { STAGE_COLORS, STAGE_LABELS } from '../../utils/constants';

const STAGE_BG: Record<string, string> = {
  EGG:     '#fef9c3',
  LARVA:   '#d1fae5',
  PUPA:    '#dbeafe',
  COCOON:  '#ede9fe',
  HARVEST: '#fce7f3',
};

export default function StageBadge({ stage }: { stage: BatchStage | string }) {
  const color = STAGE_COLORS[stage as BatchStage] ?? '#6b7280';
  const bg = STAGE_BG[stage] ?? color + '20';
  const label = STAGE_LABELS[stage as BatchStage] ?? stage;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '0.3rem',
      padding: '0.2rem 0.6rem',
      borderRadius: '9999px',
      fontSize: '0.7rem',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      background: bg,
      color,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}
