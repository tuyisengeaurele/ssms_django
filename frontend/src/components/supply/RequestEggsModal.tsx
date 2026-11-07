import { useState } from 'react';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { RoomLimit, SupplyRound, supplyService } from '../../services/supply.service';
import { boxesText } from '../../utils/boxes';
import { fill } from '../../utils/fill';
import Modal from '../ui/Modal';

interface Props {
  round: SupplyRound;
  rooms: RoomLimit[];
  onClose: () => void;
  /** Called after the request was saved, so the card can show it. */
  onSent: () => void;
}

/** What the farmer may ask for with one room, and why, in the words of the bound that sets it. */
export function limitSentence(t: (key: string) => string, room: RoomLimit): string {
  const first = fill(t('rndLimitUpTo'), { boxes: boxesText(t, room.limit) });
  if (room.binding === 'allowance') return `${first} ${fill(t('rndBoundAllowance'), { n: room.allowance })}`;
  if (room.binding === 'room') return `${first} ${fill(t('rndBoundRoom'), { room: room.name, n: room.roomFree ?? 0 })}`;
  return `${first} ${fill(t('rndBoundStock'), { boxes: boxesText(t, room.stock) })}`;
}

/** A farmer asks for eggs in a round. The limit is shown before sending, and the page refuses before the server has to. */
export default function RequestEggsModal({ round, rooms, onClose, onSent }: Props) {
  const { t } = useLanguage();
  const { success } = useToast();
  const { getErrorMessage } = useApiError();
  const [roomId, setRoomId] = useState(rooms.length === 1 ? rooms[0].id : '');
  const [boxes, setBoxes] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const chosen = rooms.find((r) => r.id === roomId);

  const send = async () => {
    if (!chosen) return setError(t('rndPickRoom'));
    const asked = boxes.trim() === '' ? NaN : Number(boxes);
    if (!Number.isInteger(asked) || asked < 1 || asked > chosen.limit) return setError(fill(t('rndNeedBoxes'), { n: chosen.limit }));
    setError('');
    setSending(true);
    try {
      const text = note.trim();
      await supplyService.requestEggs(round.id, { roomId: chosen.id, boxes: asked, ...(text ? { note: text } : {}) });
      success(t('rndSent'));
      onSent();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
      setSending(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t('rndRequest')}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>{t('btnCancel')}</button>
          <button className="btn btn-primary" onClick={send} disabled={sending}>
            {sending ? <span className="spinner" aria-hidden="true" /> : null}
            {t('rndSend')}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      {rooms.length > 1 && (
        <div className="form-group">
          <label className="form-label" htmlFor="egg-room">{t('rndFieldRoom')}</label>
          <select id="egg-room" className="form-select" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">{t('rndChooseRoom')}</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.farmName})</option>)}
          </select>
        </div>
      )}
      {chosen && (
        <>
          <p className="form-hint form-hint--gap">{limitSentence(t, chosen)}</p>
          {chosen.roomFree === null && <p className="form-hint form-hint--gap">{t('rndRoomUnknown')}</p>}
        </>
      )}
      <div className="form-group">
        <label className="form-label" htmlFor="egg-boxes">{t('rndFieldBoxes')}</label>
        <input id="egg-boxes" type="number" inputMode="numeric" className="form-input" min={1} step={1} value={boxes} onChange={(e) => setBoxes(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="egg-note">{t('rndFieldNote')}</label>
        <textarea id="egg-note" className="form-textarea" rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
    </Modal>
  );
}
