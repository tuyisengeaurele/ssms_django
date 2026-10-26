import { Link } from 'react-router-dom';
import { useLanguage } from '../../context/LanguageContext';
import { fill } from '../../utils/fill';
import { CooperativeDetail, User } from '../../types';
import { ROLE_LABEL_KEY } from '../../components/layout/Sidebar';
import Avatar from '../../components/ui/Avatar';
import { Icon } from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';

interface Props {
  open: boolean;
  loading: boolean;
  detail: CooperativeDetail | null;
  /** People who could join: not admins. Members are filtered out here. */
  candidates: User[];
  addId: string;
  onAddIdChange: (id: string) => void;
  busy: boolean;
  onAdd: () => void;
  onRemove: (userId: string) => void;
  onClose: () => void;
}

/** One cooperative: where it is, who belongs to it, and which farms they own. */
export default function CooperativeDetailModal({ open, loading, detail, candidates, addId, onAddIdChange, busy, onAdd, onRemove, onClose }: Props) {
  const { t, locale } = useLanguage();
  const memberIds = new Set(detail?.members.map((m) => m.id));
  const available = candidates.filter((u) => !memberIds.has(u.id));
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <Modal open={open} onClose={onClose} title={detail?.name ?? ''} maxWidth={560}>
      {loading || !detail ? (
        <p className="panel-loading"><span className="spinner" /></p>
      ) : (
        <div className="coop-detail">
          <dl className="facts">
            <div><dt>{t('coColLocation')}</dt><dd>{detail.location || '-'}</dd></div>
            <div><dt>{t('coColMembers')}</dt><dd>{detail.memberCount}</dd></div>
            <div><dt>{t('coColFarms')}</dt><dd>{detail.farmCount}</dd></div>
            <div><dt>{t('coColCreated')}</dt><dd>{date.format(new Date(detail.createdAt))}</dd></div>
          </dl>

          {detail.description ? <p className="coop-description">{detail.description}</p> : null}

          <h3 className="mini-heading">{t('coDetailMembers')} ({detail.members.length})</h3>

          {available.length > 0 && (
            <div className="add-row">
              <select
                className="form-select"
                aria-label={t('coPersonToAdd')}
                value={addId}
                onChange={(e) => onAddIdChange(e.target.value)}
              >
                <option value="">{t('coChoosePerson')}</option>
                {available.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({t(ROLE_LABEL_KEY[u.role])})</option>
                ))}
              </select>
              <button type="button" className="btn btn-primary btn-sm" disabled={!addId || busy} onClick={onAdd}>
                {busy ? <span className="spinner" /> : <Icon name="add" size={15} />}
                {t('coAdd')}
              </button>
            </div>
          )}

          {detail.members.length === 0 ? (
            <p className="coop-empty">{t('coNoMembers')}</p>
          ) : (
            <ul className="people-list">
              {detail.members.map((m) => (
                <li key={m.id}>
                  <Avatar name={m.name} />
                  <span className="cell-stack">
                    <span className="cell-strong">{m.name}</span>
                    <span className="cell-sub">{m.email}</span>
                  </span>
                  <span className="badge badge-gray">{t(ROLE_LABEL_KEY[m.role])}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs btn-quiet-danger"
                    disabled={busy}
                    aria-label={fill(t('coRemoveFor'), { name: m.name })}
                    onClick={() => onRemove(m.id)}
                  >
                    {t('coRemove')}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h3 className="mini-heading">
            {t('coDetailFarms')} ({detail.farms.length})
            <span className="mini-note">{t('coDetailFarmsNote')}</span>
          </h3>
          {detail.farms.length === 0 ? (
            <p className="coop-empty">{t('coNoFarms')}</p>
          ) : (
            <ul className="people-list">
              {detail.farms.map((f) => (
                <li key={f.id}>
                  <span className="row-avatar" aria-hidden="true"><Icon name="farms" size={16} /></span>
                  <span className="cell-stack">
                    <span className="cell-strong">{f.name}</span>
                    <span className="cell-sub">{f.location} · {t('coOwner')}: {f.ownerName}</span>
                  </span>
                  <Link to={`/farms/${f.id}`} className="btn btn-ghost btn-xs" onClick={onClose}>{t('coOpenFarm')}</Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Modal>
  );
}
