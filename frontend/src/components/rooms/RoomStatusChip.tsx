import { useLanguage } from '../../context/LanguageContext';
import { Room } from '../../types';
import { fill } from '../../utils/fill';

/** Where a room stands with its reviewer. Words carry the meaning, the colour only helps. */
export default function RoomStatusChip({ room }: { room: Room }) {
  const { t } = useLanguage();
  if (room.approvalStatus === 'pending') return <span className="badge badge-yellow">{t('roomApWaiting')}</span>;
  if (room.approvalStatus === 'rejected') {
    const text = room.reviewNote ? fill(t('roomApRejected'), { note: room.reviewNote }) : t('roomApRejectedNoNote');
    return <span className="badge badge-red">{text}</span>;
  }
  return (
    <>
      <span className="badge badge-green">{t('roomApApproved')}</span>
      {room.pendingAreaM2 != null && <span className="badge badge-yellow">{t('roomApSizeWaiting')}</span>}
    </>
  );
}
