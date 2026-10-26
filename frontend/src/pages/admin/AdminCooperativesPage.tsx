import { useEffect, useState } from 'react';
import { cooperativeService, CreateCooperativePayload } from '../../services/cooperative.service';
import { adminService } from '../../services/admin.service';
import { Cooperative, CooperativeDetail, User } from '../../types';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { fill } from '../../utils/fill';
import EmptyState from '../../components/ui/EmptyState';
import { Icon } from '../../components/ui/Icon';
import Modal from '../../components/ui/Modal';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import { SkeletonStatCard, SkeletonTable } from '../../components/ui/SkeletonLoader';
import StatTile from '../../components/ui/StatTile';
import CooperativeDetailModal from './CooperativeDetailModal';

const EMPTY_FORM: CreateCooperativePayload = { name: '', description: '', location: '' };

export default function AdminCooperativesPage() {
  const { t, locale } = useLanguage();
  const { getErrorMessage } = useApiError();
  const { success, error: showError } = useToast();

  const [coops, setCoops] = useState<Cooperative[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editCoop, setEditCoop] = useState<Cooperative | null>(null);
  const [detail, setDetail] = useState<CooperativeDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [confirmOff, setConfirmOff] = useState<Cooperative | null>(null);
  const [turningOff, setTurningOff] = useState(false);
  const [form, setForm] = useState<CreateCooperativePayload>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [candidates, setCandidates] = useState<User[]>([]);
  const [addId, setAddId] = useState('');
  const [memberBusy, setMemberBusy] = useState(false);

  useEffect(() => {
    cooperativeService.getAll()
      .then((r) => setCoops(r.data.data))
      .catch((e) => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeForm = () => {
    setShowCreate(false);
    setEditCoop(null);
    setForm(EMPTY_FORM);
    setFormError('');
  };

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setShowCreate(true);
  };

  const openEdit = (c: Cooperative) => {
    setEditCoop(c);
    setForm({ name: c.name, description: c.description ?? '', location: c.location ?? '' });
    setFormError('');
  };

  const handleSave = async () => {
    setFormError('');
    if (!form.name.trim()) {
      setFormError(t('coNameNeeded'));
      return;
    }
    setSubmitting(true);
    try {
      if (editCoop) {
        const res = await cooperativeService.update(editCoop.id, form);
        setCoops((prev) => prev.map((c) => (c.id === editCoop.id ? res.data.data : c)));
        success(t('coUpdated'));
      } else {
        const res = await cooperativeService.create(form);
        setCoops((prev) => [res.data.data, ...prev]);
        success(t('coCreated'));
      }
      closeForm();
    } catch (e) {
      setFormError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleTurnOff = async () => {
    if (!confirmOff) return;
    setTurningOff(true);
    try {
      await cooperativeService.delete(confirmOff.id);
      setCoops((prev) => prev.filter((c) => c.id !== confirmOff.id));
      setConfirmOff(null);
      success(t('coTurnedOff'));
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setTurningOff(false);
    }
  };

  const openView = async (c: Cooperative) => {
    setDetail(null);
    setAddId('');
    setDetailOpen(true);
    try {
      const [detailRes, usersRes] = await Promise.all([cooperativeService.getById(c.id), adminService.getUsers()]);
      setDetail(detailRes.data.data);
      setCandidates(usersRes.data.data.filter((u) => u.role !== 'ADMIN'));
    } catch (e) {
      setDetailOpen(false);
      showError(getErrorMessage(e));
    }
  };

  const refreshDetail = async (id: string) => {
    const res = await cooperativeService.getById(id);
    setDetail(res.data.data);
    setCoops((prev) => prev.map((c) => (c.id === id ? { ...c, memberCount: res.data.data.memberCount } : c)));
  };

  const changeMember = async (userId: string, cooperativeId: string | null, message: string) => {
    if (!detail) return;
    setMemberBusy(true);
    try {
      await adminService.updateCooperative(userId, cooperativeId);
      await refreshDetail(detail.id);
      setAddId('');
      success(message);
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setMemberBusy(false);
    }
  };

  const query = search.trim().toLowerCase();
  const filtered = coops.filter((c) => !query || c.name.toLowerCase().includes(query) || (c.location ?? '').toLowerCase().includes(query));
  const totalMembers = coops.reduce((sum, c) => sum + c.memberCount, 0);
  const totalFarms = coops.reduce((sum, c) => sum + c.farmCount, 0);
  const created = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const formOpen = showCreate || !!editCoop;

  return (
    <div>
      <Modal
        open={!!confirmOff}
        onClose={() => setConfirmOff(null)}
        title={t('coTurnOffTitle')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmOff(null)}>{t('btnCancel')}</button>
            <button className="btn btn-danger" onClick={handleTurnOff} disabled={turningOff}>
              {turningOff ? <><span className="spinner" />{t('coTurnOffBusy')}</> : t('coTurnOffConfirm')}
            </button>
          </>
        }
      >
        <p className="modal-text">{confirmOff ? fill(t('coTurnOffBody'), { name: confirmOff.name }) : ''}</p>
      </Modal>

      <Modal
        open={formOpen}
        onClose={closeForm}
        title={editCoop ? t('coEditTitle') : t('coNew')}
        footer={
          <>
            <button className="btn btn-secondary" onClick={closeForm}>{t('btnCancel')}</button>
            <button className="btn btn-primary" disabled={submitting} onClick={handleSave}>
              {submitting
                ? <><span className="spinner" />{editCoop ? t('coSaving') : t('coCreating')}</>
                : editCoop ? t('coSave') : t('coCreate')}
            </button>
          </>
        }
      >
        {formError && <div className="alert alert-error" role="alert">{formError}</div>}
        <div className="form-group">
          <label className="form-label" htmlFor="co-name">{t('coFieldName')} <span className="required" aria-hidden="true">*</span></label>
          <input id="co-name" className="form-input" value={form.name} maxLength={150} placeholder={t('coPlaceName')}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="co-location">{t('coFieldLocation')}</label>
          <input id="co-location" className="form-input" value={form.location} maxLength={250} placeholder={t('coPlaceLocation')}
            onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="co-description">{t('coFieldDescription')}</label>
          <textarea id="co-description" className="form-textarea" rows={3} value={form.description} maxLength={500} placeholder={t('coPlaceDescription')}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>
      </Modal>

      <CooperativeDetailModal
        open={detailOpen}
        loading={!detail}
        detail={detail}
        candidates={candidates}
        addId={addId}
        onAddIdChange={setAddId}
        busy={memberBusy}
        onAdd={() => changeMember(addId, detail?.id ?? null, t('coMemberAdded'))}
        onRemove={(userId) => changeMember(userId, null, t('coMemberRemoved'))}
        onClose={() => setDetailOpen(false)}
      />

      <PageHeader
        title={t('ptCooperatives')}
        subtitle={t('coSubtitle')}
        actions={
          <button className="btn btn-primary btn-sm" onClick={openCreate}>
            <Icon name="add" size={15} />
            {t('coNew')}
          </button>
        }
      />

      <div className="grid-3" style={{ marginBottom: 24 }}>
        {loading ? (
          [0, 1, 2].map((i) => <SkeletonStatCard key={i} />)
        ) : (
          <>
            <StatTile icon="cooperatives" label={t('coStatCoops')} value={coops.length} />
            <StatTile icon="users" label={t('coStatMembers')} value={totalMembers} />
            <StatTile icon="farms" label={t('coStatFarms')} value={totalFarms} />
          </>
        )}
      </div>

      <Panel
        title={`${t('ptCooperatives')} (${coops.length})`}
        flush
        actions={
          <div className="search-box">
            <Icon name="search" size={16} className="icon" />
            <input type="search" aria-label={t('coSearch')} placeholder={t('coSearch')} value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        }
      >
        {loading ? (
          <SkeletonTable rows={4} cols={5} />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<Icon name="cooperatives" size={22} />}
            title={query ? t('coNoMatch') : t('coNone')}
            description={query ? fill(t('coNoMatchBody'), { q: search.trim() }) : t('coNoneBody')}
            action={!query ? { label: t('coCreateFirst'), onClick: openCreate } : undefined}
          />
        ) : (
          <div className="table-wrapper">
            <table className="table-stack">
              <thead>
                <tr>
                  <th>{t('coColName')}</th>
                  <th>{t('coColLocation')}</th>
                  <th>{t('coColMembers')}</th>
                  <th>{t('coColFarms')}</th>
                  <th>{t('coColCreated')}</th>
                  <th><span className="sr-only">{t('coView')}</span></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id} className="tbody-row">
                    <td className="cell-lead">
                      <div className="cell-person">
                        <span className="row-avatar" aria-hidden="true"><Icon name="cooperatives" size={16} /></span>
                        <div className="cell-stack">
                          <span className="cell-strong">{c.name}</span>
                          {c.description ? <span className="cell-sub cell-trim">{c.description}</span> : null}
                        </div>
                      </div>
                    </td>
                    <td data-label={t('coColLocation')} className="cell-muted">{c.location || '-'}</td>
                    <td data-label={t('coColMembers')} className="cell-strong">{c.memberCount}</td>
                    <td data-label={t('coColFarms')} className="cell-strong">{c.farmCount}</td>
                    <td data-label={t('coColCreated')} className="cell-muted cell-nowrap">{created.format(new Date(c.createdAt))}</td>
                    <td data-label="">
                      <div className="table-actions">
                        <button className="btn btn-ghost btn-xs" aria-label={`${t('coView')} ${c.name}`} onClick={() => openView(c)}>{t('coView')}</button>
                        <button className="btn btn-ghost btn-xs" aria-label={`${t('coEdit')} ${c.name}`} onClick={() => openEdit(c)}>{t('coEdit')}</button>
                        <button className="btn btn-ghost btn-xs btn-quiet-danger" aria-label={`${t('coTurnOff')} ${c.name}`} onClick={() => setConfirmOff(c)}>{t('coTurnOff')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
