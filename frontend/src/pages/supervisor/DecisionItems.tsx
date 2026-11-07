import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { WaitingRoom } from '../../services/room.service';
import { AllowanceEvidence, SupplyRound, WaitingAllowanceRequest, supplyService } from '../../services/supply.service';
import { boxesText } from '../../utils/boxes';
import { fill } from '../../utils/fill';
import Avatar from '../../components/ui/Avatar';
import { AmountDialog, NoteDialog } from './DecisionDialogs';

/** Each action returns a message to show in a dialog, or null when it worked. Direct approvals report errors themselves. */
export interface RoomActions {
  approve: () => Promise<void>;
  reject: (note: string) => Promise<string | null>;
}

export interface RequestActions {
  approve: () => Promise<void>;
  approveAmount: (boxes: number, note: string) => Promise<string | null>;
  decline: (note: string) => Promise<string | null>;
}

function Person({ name, email }: { name: string; email: string }) {
  return (
    <div className="cell-person">
      <Avatar name={name} />
      <div className="cell-stack">
        <span className="cell-strong">{name}</span>
        <span className="cell-sub">{email}</span>
      </div>
    </div>
  );
}

export function RoomItem({ room, actions }: { room: WaitingRoom; actions: RoomActions }) {
  const { t } = useLanguage();
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);

  const isSize = room.kind === 'size';
  const title = fill(t(isSize ? 'dcsRoomSize' : 'dcsRoomNew'), { room: room.name, farm: room.farm.name });
  let size: string;
  if (isSize && room.pendingAreaM2 != null) {
    size = room.areaM2 != null ? fill(t('roomApSizeAsked'), { old: room.areaM2, new: room.pendingAreaM2 }) : fill(t('dcsSizeFirst'), { n: room.pendingAreaM2 });
  } else {
    size = room.areaM2 != null ? fill(t('roomApSize'), { n: room.areaM2 }) : t('dcsNoSize');
  }

  const approve = async () => {
    setBusy(true);
    await actions.approve();
    setBusy(false);
  };

  return (
    <li className="decision">
      <Person name={room.owner.name} email={room.owner.email} />
      <div className="decision-body">
        <span className="badge badge-gray">{t('dcsKindRoom')}</span>
        <p className="decision-title">{title}</p>
        <p className="cell-sub">{size}</p>
      </div>
      <div className="decision-actions">
        <button className="btn btn-primary btn-sm" onClick={approve} disabled={busy}>{t('dcsApprove')}</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setRejecting(true)}>{t('dcsReject')}</button>
      </div>
      {rejecting && (
        <NoteDialog title={t('dcsRejectTitle')} sendLabel={t('dcsRejectSend')} farmerName={room.owner.name} onSend={actions.reject} onClose={() => setRejecting(false)} />
      )}
    </li>
  );
}

function roomLine(t: (key: string) => string, room: AllowanceEvidence['rooms'][number]): string {
  let size: string;
  if (room.areaM2 == null) size = t('dcsNoSize');
  else if (room.pendingAreaM2 != null) size = fill(t('roomApSizeAsked'), { old: room.areaM2, new: room.pendingAreaM2 });
  else size = fill(t('roomApSize'), { n: room.areaM2 });
  let tail: string;
  if (room.approvalStatus !== 'approved') tail = t('dcsRoomNotApproved');
  else if (room.capacityBoxes == null) tail = t('dcsHoldsUnknown');
  else tail = fill(t('dcsHolds'), { boxes: boxesText(t, room.capacityBoxes) });
  return fill(t('dcsRoomLine'), { name: room.name, size, tail });
}

function Evidence({ data }: { data: AllowanceEvidence }) {
  const { t } = useLanguage();
  return (
    <div className="decision-evidence">
      <h3 className="decision-evidence-title">{t('dcsHistory')}</h3>
      {data.history.length === 0 && <p className="cell-sub">{t('dcsNoHistory')}</p>}
      <ul>
        {data.history.map((line, i) => (
          <li key={`${line.at}-${i}`}>
            {line.kind === 'start'
              ? fill(t('dcsStarted'), { boxes: boxesText(t, line.newBoxes) })
              : fill(t(line.kind === 'reduction' ? 'alwLowered' : 'alwChanged'), {
                  boxes: boxesText(t, line.newBoxes), name: line.byName ?? t('alwYourCooperative'), reason: line.reason,
                })}
          </li>
        ))}
      </ul>
      <h3 className="decision-evidence-title">{t('dcsRooms')}</h3>
      {data.rooms.length === 0 ? <p className="cell-sub">{t('dcsNoRooms')}</p> : <ul>{data.rooms.map((r) => <li key={r.id}>{roomLine(t, r)}</li>)}</ul>}
    </div>
  );
}

/** A supply round whose requests are closed, waiting for the supervisor to split the eggs. The work is on the round's page. */
export function RoundItem({ round }: { round: SupplyRound }) {
  const { t } = useLanguage();
  const n = round.requestCount ?? 0;
  return (
    <li className="decision">
      <div className="cell-stack">
        <span className="cell-strong">{round.name}</span>
      </div>
      <div className="decision-body">
        <span className="badge badge-gray">{t('dcsKindRound')}</span>
        <p className="decision-title">{n === 1 ? fill(t('dcsRoundToSplitOne'), { name: round.name }) : fill(t('dcsRoundToSplit'), { name: round.name, n })}</p>
      </div>
      <div className="decision-actions">
        <Link to={`/supply/${round.id}`} className="btn btn-primary btn-sm">{t('dcsOpenRound')}</Link>
      </div>
    </li>
  );
}

export function RequestItem({ request, actions }: { request: WaitingAllowanceRequest; actions: RequestActions }) {
  const { t } = useLanguage();
  const [declining, setDeclining] = useState(false);
  const [other, setOther] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [evidence, setEvidence] = useState<AllowanceEvidence | null>(null);
  const [evidenceFailed, setEvidenceFailed] = useState(false);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    // The evidence is fetched the first time it is wanted, and kept for the next.
    if (next && !evidence) {
      setEvidenceFailed(false);
      supplyService.getFarmerAllowance(request.farmer.id).then((r) => setEvidence(r.data.data)).catch(() => setEvidenceFailed(true));
    }
  };

  const approve = async () => {
    setBusy(true);
    await actions.approve();
    setBusy(false);
  };

  return (
    <li className="decision">
      <Person name={request.farmer.name} email={request.farmer.email} />
      <div className="decision-body">
        <span className="badge badge-gray">{t('dcsKindAllowance')}</span>
        <p className="decision-title">{fill(t('dcsAsk'), { asked: boxesText(t, request.boxesAsked), current: boxesText(t, request.currentBoxes) })}</p>
        <p className="decision-reason">{request.reason}</p>
        <button type="button" className="btn btn-ghost btn-xs" aria-expanded={open} onClick={toggle}>{open ? t('dcsDetailsHide') : t('dcsDetails')}</button>
        {open && (evidence ? <Evidence data={evidence} /> : evidenceFailed ? <p className="cell-sub">{t('dcsDetailsFailed')}</p> : <span className="spinner" aria-hidden="true" />)}
      </div>
      <div className="decision-actions">
        <button className="btn btn-primary btn-sm" onClick={approve} disabled={busy}>{fill(t('dcsApproveBoxes'), { boxes: boxesText(t, request.boxesAsked) })}</button>
        <button className="btn btn-secondary btn-sm" onClick={() => setOther(true)}>{t('dcsApproveOther')}</button>
        <button className="btn btn-ghost btn-sm btn-quiet-danger" onClick={() => setDeclining(true)}>{t('dcsDecline')}</button>
      </div>
      {other && <AmountDialog asked={request.boxesAsked} onSend={actions.approveAmount} onClose={() => setOther(false)} />}
      {declining && (
        <NoteDialog title={t('dcsDeclineTitle')} sendLabel={t('dcsDeclineSend')} farmerName={request.farmer.name} onSend={actions.decline} onClose={() => setDeclining(false)} />
      )}
    </li>
  );
}
