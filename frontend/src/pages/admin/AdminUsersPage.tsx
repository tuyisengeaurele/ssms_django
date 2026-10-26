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

type Tab = 'active' | 'deleted';

const isActive = (u: User) => u.isActive !== false;

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const { t } = useLanguage();
  const { getErrorMessage } = useApiError();
  const { success, error: showError } = useToast();

  const [users, setUsers] = useState<User[]>([]);
  const [coops, setCoops] = useState<Cooperative[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('active');
  const [search, setSearch] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState<CreateUserPayload>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Edit access: a form first, then a review of what will change before anything is saved.
  const [editing, setEditing] = useState<User | null>(null);
  const [draftRole, setDraftRole] = useState<Role>('FARMER');
  const [draftCoop, setDraftCoop] = useState('');
  const [stage, setStage] = useState<'form' | 'review'>('form');
  const [editError, setEditError] = useState('');
  const [saving, setSaving] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmRestore, setConfirmRestore] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(false);

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

  const openEdit = (u: User) => {
    setEditing(u);
    setDraftRole(u.role);
    setDraftCoop(u.cooperativeId ?? '');
    setStage('form');
    setEditError('');
  };

  const closeEdit = () => {
    setEditing(null);
    setStage('form');
    setEditError('');
  };

  // An administrator belongs to no cooperative, so the cooperative is left alone when the role becomes Administrator.
  const roleChanged = !!editing && draftRole !== editing.role;
  const coopChanged = !!editing && draftRole !== 'ADMIN' && draftCoop !== (editing.cooperativeId ?? '');
  const coopName = (id: string) => (id ? coops.find((c) => c.id === id)?.name ?? '' : t('usNone'));

  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    setEditError('');
    let current = editing;
    try {
      if (roleChanged) {
        const res = await adminService.updateRole(current.id, draftRole);
        current = res.data.data;
        replaceUser(current);
        setEditing(current);
      }
      if (coopChanged) {
        const res = await adminService.updateCooperative(current.id, draftCoop || null);
        current = res.data.data;
        replaceUser(current);
      }
      success(fill(t('usAccessSaved'), { name: editing.name }));
      closeEdit();
    } catch (e) {
      setEditError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await adminService.deactivateUser(confirmDelete.id);
      replaceUser({ ...confirmDelete, isActive: false });
      success(fill(t('usDeleted'), { name: confirmDelete.name }));
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setDeleting(false);
      setConfirmDelete(null);
    }
  };

  const handleRestore = async () => {
    if (!confirmRestore) return;
    setRestoring(true);
    try {
      const res = await adminService.restoreUser(confirmRestore.id);
      replaceUser(res.data.data);
      success(fill(t('usRestored'), { name: confirmRestore.name }));
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setRestoring(false);
      setConfirmRestore(null);
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
  const inTab = users.filter((u) => (tab === 'active' ? isActive(u) : !isActive(u)));
  const filtered = inTab.filter(
    (u) => !query || u.name.toLowerCase().includes(query) || u.email.toLowerCase().includes(query) || u.role.toLowerCase().includes(query),
  );
  const activeCount = users.filter(isActive).length;
  const deletedCount = users.length - activeCount;
  const byRole = (r: Role) => users.filter((u) => isActive(u) && u.role === r).length;

  return (
    <div>
      <Modal
        open={!!editing}
        onClose={closeEdit}
        title={editing ? fill(t('usEditFor'), { name: editing.name }) : ''}
        footer={
          stage === 'form' ? (
            <>
              <button className="btn btn-secondary" onClick={closeEdit}>{t('btnCancel')}</button>
              <button className="btn btn-primary" disabled={!roleChanged && !coopChanged} onClick={() => setStage('review')}>
                {t('usReview')}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => setStage('form')} disabled={saving}>{t('usBack')}</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? <span className="spinner" aria-hidden="true" /> : null}
                {t('usReviewSave')}
              </button>
            </>
          )
        }
      >
        {editError && <div className="alert alert-error" role="alert">{editError}</div>}
        {editing && stage === 'form' && (
          <>
            <div className="form-group">
              <label className="form-label" htmlFor="edit-role">{t('usColRole')}</label>
              <select id="edit-role" className="form-select" value={draftRole} onChange={(e) => setDraftRole(e.target.value as Role)}>
                {ROLES.map((r) => <option key={r} value={r}>{t(ROLE_LABEL_KEY[r])}</option>)}
              </select>
            </div>
            {draftRole !== 'ADMIN' && (
              <div className="form-group">
                <label className="form-label" htmlFor="edit-coop">{t('usColCoop')}</label>
                <select id="edit-coop" className="form-select" value={draftCoop} onChange={(e) => setDraftCoop(e.target.value)}>
                  <option value="">{t('usNone')}</option>
                  {coops.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
          </>
        )}
        {editing && stage === 'review' && (
          <>
            <p className="modal-text">{fill(t('usReviewIntro'), { name: editing.name })}</p>
            <ul className="review-list">
              {roleChanged && (
                <li>{fill(t('usChangeRole'), { from: t(ROLE_LABEL_KEY[editing.role]), to: t(ROLE_LABEL_KEY[draftRole]) })}</li>
              )}
              {coopChanged && (
                <li>{fill(t('usChangeCoop'), { from: coopName(editing.cooperativeId ?? ''), to: coopName(draftCoop) })}</li>
              )}
            </ul>
          </>
        )}
      </Modal>

      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title={t('usDeleteTitle')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>{t('btnCancel')}</button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? <><span className="spinner" />{t('usDeleteBusy')}</> : t('usDeleteConfirm')}
            </button>
          </>
        }
      >
        <p className="modal-text">
          {confirmDelete ? fill(t('usDeleteBody'), { name: confirmDelete.name, email: confirmDelete.email }) : ''}
        </p>
      </Modal>

      <Modal
        open={!!confirmRestore}
        onClose={() => setConfirmRestore(null)}
        title={t('usRestoreTitle')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmRestore(null)}>{t('btnCancel')}</button>
            <button className="btn btn-primary" onClick={handleRestore} disabled={restoring}>
              {restoring ? <><span className="spinner" />{t('usRestoreBusy')}</> : t('usRestoreConfirm')}
            </button>
          </>
        }
      >
        <p className="modal-text">
          {confirmRestore ? fill(t('usRestoreBody'), { name: confirmRestore.name, email: confirmRestore.email }) : ''}
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
        <div className="tabs" role="tablist">
          {(['active', 'deleted'] as const).map((id) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-on' : ''} onClick={() => setTab(id)}>
              {id === 'active' ? t('usTabActive') : t('usTabDeleted')} ({id === 'active' ? activeCount : deletedCount})
            </button>
          ))}
        </div>

        {loading ? (
          <SkeletonTable rows={5} cols={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Icon name="users" size={22} />}
            title={query ? t('usNoUsers') : tab === 'deleted' ? t('usNoDeleted') : t('usNoUsers')}
            description={query ? fill(t('usNoUsersSearch'), { q: search.trim() }) : tab === 'deleted' ? t('usNoDeletedBody') : t('usNoUsersAtAll')}
          />
        ) : (
          <div className="table-wrapper">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>{t('usColName')}</th>
                  <th>{t('usColRole')}</th>
                  <th>{t('usColCoop')}</th>
                  <th>{t('usColStatus')}</th>
                  <th><span className="sr-only">{t('thActions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const isMe = u.id === me?.id;
                  const active = isActive(u);
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
                      <td data-label={t('usColRole')}>{t(ROLE_LABEL_KEY[u.role])}</td>
                      <td data-label={t('usColCoop')} className="cell-muted">
                        {u.role === 'ADMIN' ? t('usNotForAdmins') : u.cooperativeName ?? '-'}
                      </td>
                      <td data-label={t('usColStatus')}>
                        <span className={`badge ${active ? 'badge-green' : 'badge-gray'}`}>
                          {active ? t('usActive') : t('usGone')}
                        </span>
                      </td>
                      <td data-label="">
                        <div className="table-actions">
                          {!isMe && active && (
                            <>
                              <button className="btn btn-ghost btn-xs" aria-label={fill(t('usEditFor'), { name: u.name })} onClick={() => openEdit(u)}>
                                {t('usEdit')}
                              </button>
                              <button className="btn btn-ghost btn-xs btn-quiet-danger" aria-label={`${t('usDelete')} ${u.name}`} onClick={() => setConfirmDelete(u)}>
                                {t('usDelete')}
                              </button>
                            </>
                          )}
                          {!isMe && !active && (
                            <button className="btn btn-ghost btn-xs" aria-label={`${t('usRestore')} ${u.name}`} onClick={() => setConfirmRestore(u)}>
                              {t('usRestore')}
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
