import { useEffect, useState } from 'react';
import { adminService } from '../../services/admin.service';
import { User } from '../../types';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { fill } from '../../utils/fill';
import { ROLE_LABEL_KEY } from '../../components/layout/Sidebar';
import Avatar from '../../components/ui/Avatar';
import { Icon } from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import Panel from '../../components/ui/Panel';
import { useCoop } from './coopContext';

/** Who belongs to the cooperative, and the way for an admin to add a person or take one out. */
export default function CoopMembersTab() {
  const { detail, refreshDetail } = useCoop();
  const { t } = useLanguage();
  const { getErrorMessage } = useApiError();
  const { success, error: showError } = useToast();

  const [candidates, setCandidates] = useState<User[]>([]);
  const [addId, setAddId] = useState('');
  const [busy, setBusy] = useState(false);
  // The question asked before a person joins or leaves.
  const [ask, setAsk] = useState<{ kind: 'add' | 'remove'; userId: string; name: string } | null>(null);

  useEffect(() => {
    adminService.getUsers()
      .then((res) => setCandidates(res.data.data.filter((u) => u.role !== 'ADMIN')))
      .catch((e) => showError(getErrorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!detail) return <p className="panel-loading"><span className="spinner" /></p>;

  const memberIds = new Set(detail.members.map((m) => m.id));
  const available = candidates.filter((u) => !memberIds.has(u.id));

  const askAdd = () => {
    const person = candidates.find((u) => u.id === addId);
    if (person) setAsk({ kind: 'add', userId: person.id, name: person.name });
  };

  const askRemove = (userId: string) => {
    const person = detail.members.find((m) => m.id === userId);
    if (person) setAsk({ kind: 'remove', userId, name: person.name });
  };

  const confirm = async () => {
    if (!ask) return;
    setBusy(true);
    try {
      await adminService.updateCooperative(ask.userId, ask.kind === 'add' ? detail.id : null);
      await refreshDetail();
      setAddId('');
      success(t(ask.kind === 'add' ? 'coMemberAdded' : 'coMemberRemoved'));
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setBusy(false);
      setAsk(null);
    }
  };

  return (
    <Panel title={`${t('coDetailMembers')} (${detail.members.length})`}>
      {available.length > 0 && (
        <div className="add-row">
          <select className="form-select" aria-label={t('coPersonToAdd')} value={addId} onChange={(e) => setAddId(e.target.value)}>
            <option value="">{t('coChoosePerson')}</option>
            {available.map((u) => (
              <option key={u.id} value={u.id}>{u.name} ({t(ROLE_LABEL_KEY[u.role])})</option>
            ))}
          </select>
          <button type="button" className="btn btn-primary btn-sm" disabled={!addId || busy} onClick={askAdd}>
            {busy ? <span className="spinner" /> : <Icon name="add" size={15} />}
            {t('coAdd')}
          </button>
        </div>
      )}

      {detail.members.length === 0 ? (
        <p className="coop-empty">{t('coNoMembers')}</p>
      ) : (
        <ul className="people-list people-list--open">
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
                onClick={() => askRemove(m.id)}
              >
                {t('coRemove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={!!ask}
        onClose={() => setAsk(null)}
        title={ask ? fill(t(ask.kind === 'add' ? 'coAddTitle' : 'coRemoveTitle'), { name: ask.name, coop: detail.name }) : ''}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setAsk(null)} disabled={busy}>{t('btnCancel')}</button>
            <button className={`btn ${ask?.kind === 'remove' ? 'btn-danger' : 'btn-primary'}`} onClick={confirm} disabled={busy}>
              {busy ? <span className="spinner" aria-hidden="true" /> : null}
              {ask?.kind === 'add' ? t('coAddYes') : t('coRemoveYes')}
            </button>
          </>
        }
      >
        <p className="modal-text">
          {ask ? fill(t(ask.kind === 'add' ? 'coAddBody' : 'coRemoveBody'), { name: ask.name, coop: detail.name }) : ''}
        </p>
      </Modal>
    </Panel>
  );
}
