import { useEffect, useState } from 'react';
import { adminService, CreateUserPayload } from '../../services/admin.service';
import { cooperativeService } from '../../services/cooperative.service';
import { User, Role, Cooperative } from '../../types';
import { useApiError } from '../../hooks/useApiError';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { fill } from '../../utils/fill';
import Avatar from '../../components/ui/Avatar';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonStatCard, SkeletonTable } from '../../components/ui/SkeletonLoader';
import StatTile from '../../components/ui/StatTile';
import { ROLE_LABEL_KEY } from '../../components/layout/Sidebar';

const ROLES: Role[] = ['FARMER', 'SUPERVISOR', 'ADMIN'];
const EMPTY_FORM: CreateUserPayload = { name: '', email: '', password: '', role: 'FARMER' };

const ROLE_BADGE: Record<Role, string> = {
  ADMIN: 'badge-ink',
  SUPERVISOR: 'badge-blue',
  FARMER: 'badge-green',
};

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const { t, locale } = useLanguage();
  const { getErrorMessage } = useApiError();
  const { success, error: showError } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [coops, setCoops] = useState<Cooperative[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [confirmOff, setConfirmOff] = useState<User | null>(null);
  const [form, setForm] = useState<CreateUserPayload>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [turningOff, setTurningOff] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    Promise.all([adminService.getUsers(), cooperativeService.getAll()])
      .then(([usersRes, coopsRes]) => {
        setUsers(usersRes.data.data);
        setCoops(coopsRes.data.data);
      })
      .catch((e) => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const replaceUser = (updated: User) => setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));

  const handleCooperativeChange = async (userId: string, cooperativeId: string) => {
    try {
      const res = await adminService.updateCooperative(userId, cooperativeId || null);
      replaceUser(res.data.data);
      success(t('usCoopUpdated'));
    } catch (e) {
      showError(getErrorMessage(e));
    }
  };

  const handleRoleChange = async (target: User, newRole: Role) => {
    try {
      const res = await adminService.updateRole(target.id, newRole);
      replaceUser(res.data.data);
      success(fill(t('usRoleUpdated'), { name: target.name, role: t(ROLE_LABEL_KEY[newRole]) }));
    } catch (e) {
      showError(getErrorMessage(e));
    }
  };

  const handleTurnOff = async () => {
    if (!confirmOff) return;
    setTurningOff(true);
    try {
      await adminService.deactivateUser(confirmOff.id);
      replaceUser({ ...confirmOff, isActive: false });
      success(fill(t('usTurnedOff'), { name: confirmOff.name }));
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setTurningOff(false);
      setConfirmOff(null);
    }
  };

  const closeCreate = () => {
    setShowCreate(false);
    setForm(EMPTY_FORM);
    setFormError('');
  };

  const handleCreate = async () => {
    setFormError('');
    if (!form.name || !form.email || !form.password) {
      setFormError(t('usFillAll'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await adminService.createUser(form);
      setUsers((prev) => [res.data.data, ...prev]);
      closeCreate();
      success(t('usCreated'));
    } catch (e) {
      setFormError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const query = search.trim().toLowerCase();
  const filtered = users.filter(
    (u) => !query || u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query) || u.role.toLowerCase().includes(query),
  );
  const byRole = (r: Role) => users.filter((u) => u.role === r).length;
  const joined = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });

  return (
    <div>
      <Modal
        open={!!confirmOff}
        onClose={() => setConfirmOff(null)}
        title={t('usTurnOffTitle')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmOff(null)}>{t('btnCancel')}</button>
            <button className="btn btn-danger" onClick={handleTurnOff} disabled={turningOff}>
              {turningOff ? <><span className="spinner" />{t('usTurnOffBusy')}</> : t('usTurnOffConfirm')}
            </button>
          </>
        }
      >
        <p className="modal-text">
          {confirmOff ? fill(t('usTurnOffBody'), { name: confirmOff.name, email: confirmOff.email }) : ''}
        </p>
      </Modal>

      <Modal
        open={showCreate}
        onClose={closeCreate}
        title={t('usCreateTitle')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={closeCreate}>{t('btnCancel')}</button>
            <button className="btn btn-primary" disabled={submitting} onClick={handleCreate}>
              {submitting ? <><span className="spinner" />{t('usCreating')}</> : t('usCreate')}
            </button>
          </>
        }
      >
        {formError && <div className="alert alert-error" role="alert">{formError}</div>}
        <div className="form-group">
          <label className="form-label" htmlFor="new-name">{t('usFieldName')}</label>
          <input id="new-name" className="form-input" value={form.name} autoComplete="off"
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="new-email">{t('usFieldEmail')}</label>
          <input id="new-email" type="email" className="form-input" value={form.email} autoComplete="off"
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="new-password">{t('usFieldPassword')}</label>
          <input id="new-password" type="password" className="form-input" value={form.password} autoComplete="new-password"
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} aria-describedby="new-password-hint" />
          <span id="new-password-hint" className="form-hint">{t('usPasswordHint')}</span>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="new-role">{t('usColRole')}</label>
          <select id="new-role" className="form-select" value={form.role}
            onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}>
            {ROLES.map((r) => <option key={r} value={r}>{t(ROLE_LABEL_KEY[r])}</option>)}
          </select>
        </div>
      </Modal>

      <PageHeader
        title={t('ptUsers')}
        subtitle={t('usSubtitle')}
        actions={
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>
            <Icon name="add" size={15} />
            {t('usCreate')}
          </button>
        }
      />

      <div className="grid-3" style={{ marginBottom: 24 }}>
        {loading
          ? [0, 1, 2].map((i) => <SkeletonStatCard key={i} />)
          : (['ADMIN', 'SUPERVISOR', 'FARMER'] as Role[]).map((r) => (
              <StatTile
                key={r}
                label={r === 'ADMIN' ? t('usAdmins') : r === 'SUPERVISOR' ? t('usSupervisors') : t('usFarmers')}
                value={byRole(r)}
                icon={r === 'ADMIN' ? 'lock' : r === 'SUPERVISOR' ? 'users' : 'leaf'}
              />
            ))}
      </div>

      <Panel
        title={`${t('usAll')} (${users.length})`}
        flush
        actions={
          <div className="search-box">
            <Icon name="search" size={16} className="icon" />
            <input
              type="search"
              aria-label={t('usSearch')}
              placeholder={t('usSearch')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        }
      >
        {loading ? (
          <SkeletonTable rows={5} cols={6} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Icon name="users" size={22} />}
            title={t('usNoUsers')}
            description={query ? fill(t('usNoUsersSearch'), { q: search.trim() }) : t('usNoUsersAtAll')}
          />
        ) : (
          <div className="table-wrapper">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>{t('usColName')}</th>
                  <th>{t('usColRole')}</th>
                  <th>{t('usColCoop')}</th>
                  <th>{t('usColJoined')}</th>
                  <th>{t('usColStatus')}</th>
                  <th><span className="sr-only">{t('usTurnOff')}</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isMe = u.id === me?.id;
                  const active = u.isActive !== false;
                  return (
                    <tr key={u.id} className={`tbody-row${active ? '' : ' is-off'}`}>
                      <td className="cell-lead">
                        <div className="cell-person">
                          <Avatar name={u.name} />
                          <div className="cell-stack">
                            <span className="cell-strong">
                              {u.name}
                              {isMe && <span className="cell-tag">{t('usYou')}</span>}
                            </span>
                            <span className="cell-sub">{u.email}</span>
                          </div>
                        </div>
                      </td>
                      <td data-label={t('usColRole')}>
                        {isMe || !active ? (
                          <span className={`badge ${ROLE_BADGE[u.role]}`}>{t(ROLE_LABEL_KEY[u.role])}</span>
                        ) : (
                          <select
                            className="inline-select"
                            value={u.role}
                            aria-label={fill(t('usRoleFor'), { name: u.name })}
                            onChange={(e) => handleRoleChange(u, e.target.value as Role)}
                          >
                            {ROLES.map((r) => <option key={r} value={r}>{t(ROLE_LABEL_KEY[r])}</option>)}
                          </select>
                        )}
                      </td>
                      <td data-label={t('usColCoop')}>
                        {u.role === 'ADMIN' ? (
                          <span className="cell-muted">{t('usNotForAdmins')}</span>
                        ) : isMe || !active ? (
                          <span className="cell-muted">{u.cooperativeName ?? '-'}</span>
                        ) : (
                          <select
                            className="inline-select"
                            value={u.cooperativeId ?? ''}
                            aria-label={fill(t('usCoopFor'), { name: u.name })}
                            onChange={(e) => handleCooperativeChange(u.id, e.target.value)}
                          >
                            <option value="">{t('usNone')}</option>
                            {coops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        )}
                      </td>
                      <td data-label={t('usColJoined')} className="cell-muted cell-nowrap">{joined.format(new Date(u.createdAt))}</td>
                      <td data-label={t('usColStatus')}>
                        <span className={`badge badge-dot ${active ? 'badge-green' : 'badge-gray'}`}>
                          {active ? t('usActive') : t('usOff')}
                        </span>
                      </td>
                      <td data-label="">
                        <div className="table-actions">
                          {!isMe && active && (
                            <button className="btn btn-ghost btn-xs btn-quiet-danger" onClick={() => setConfirmOff(u)}>
                              {t('usTurnOff')}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
