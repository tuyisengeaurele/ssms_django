import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cooperativeService, CreateCooperativePayload } from '../../services/cooperative.service';
import { Cooperative, CooperativeDetail } from '../../types';
import { useApiError } from '../../hooks/useApiError';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';

function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!target) { setVal(0); return; }
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setVal(Math.round((1 - Math.pow(1 - t, 3)) * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

interface StatCardProps { icon: React.ReactNode; label: string; value: number; color: string; bg: string; delay: number }
function StatCard({ icon, label, value, color, bg, delay }: StatCardProps) {
  const count = useCountUp(value);
  return (
    <motion.div className="stat-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
      <div className="stat-card-glow" style={{ background: color }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: '0.75rem' }}>{label}</p>
          <p style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1 }}>{count}</p>
        </div>
        <div className="stat-card-icon" style={{ background: bg }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
        </div>
      </div>
      <div style={{ marginTop: '1rem', height: 3, borderRadius: 2, background: `linear-gradient(90deg, ${color}60, ${color}10)` }} />
    </motion.div>
  );
}

const EMPTY_FORM: CreateCooperativePayload = { name: '', description: '', location: '' };

export default function AdminCooperativesPage() {
  const { getErrorMessage } = useApiError();
  const { success, error: showError } = useToast();

  const [coops,       setCoops]       = useState<Cooperative[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showCreate,  setShowCreate]  = useState(false);
  const [editCoop,    setEditCoop]    = useState<Cooperative | null>(null);
  const [viewDetail,  setViewDetail]  = useState<CooperativeDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmDel,  setConfirmDel]  = useState<Cooperative | null>(null);
  const [deleting,    setDeleting]    = useState(false);
  const [form,        setForm]        = useState<CreateCooperativePayload>(EMPTY_FORM);
  const [formError,   setFormError]   = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [search,      setSearch]      = useState('');

  const fetchCoops = () => {
    cooperativeService.getAll()
      .then(r => setCoops(r.data.data))
      .catch(e => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCoops(); }, []);

  const handleCreate = async () => {
    setFormError('');
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    setSubmitting(true);
    try {
      const res = await cooperativeService.create(form);
      setCoops(prev => [res.data.data, ...prev]);
      setShowCreate(false);
      setForm(EMPTY_FORM);
      success('Cooperative created successfully.');
    } catch (e) {
      setFormError(getErrorMessage(e));
    } finally { setSubmitting(false); }
  };

  const handleUpdate = async () => {
    if (!editCoop) return;
    setFormError('');
    if (!form.name.trim()) { setFormError('Name is required.'); return; }
    setSubmitting(true);
    try {
      const res = await cooperativeService.update(editCoop.id, form);
      setCoops(prev => prev.map(c => c.id === editCoop.id ? res.data.data : c));
      setEditCoop(null);
      setForm(EMPTY_FORM);
      success('Cooperative updated.');
    } catch (e) {
      setFormError(getErrorMessage(e));
    } finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    if (!confirmDel) return;
    setDeleting(true);
    try {
      await cooperativeService.delete(confirmDel.id);
      setCoops(prev => prev.filter(c => c.id !== confirmDel.id));
      setConfirmDel(null);
      success('Cooperative deactivated.');
    } catch (e) {
      showError(getErrorMessage(e));
    } finally { setDeleting(false); }
  };

  const openView = async (coop: Cooperative) => {
    setDetailLoading(true);
    setViewDetail(null);
    try {
      const res = await cooperativeService.getById(coop.id);
      setViewDetail(res.data.data);
    } catch (e) {
      showError(getErrorMessage(e));
    } finally { setDetailLoading(false); }
  };

  const openEdit = (coop: Cooperative) => {
    setEditCoop(coop);
    setForm({ name: coop.name, description: coop.description ?? '', location: coop.location ?? '' });
    setFormError('');
  };

  const filtered = coops.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.location ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const totalMembers = coops.reduce((a, c) => a + c.memberCount, 0);
  const totalFarms   = coops.reduce((a, c) => a + c.farmCount, 0);

  // ── CoopForm ──────────────────────────────────────────────────────────────
  const CoopForm = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {formError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{formError}</div>}
      <div className="form-group">
        <label className="form-label">Name <span style={{ color: 'var(--danger)' }}>*</span></label>
        <input className="form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Nyamagabe Silk Cooperative" maxLength={150} />
      </div>
      <div className="form-group">
        <label className="form-label">Location</label>
        <input className="form-input" value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Nyamagabe District, Rwanda" maxLength={250} />
      </div>
      <div className="form-group">
        <label className="form-label">Description</label>
        <textarea className="form-textarea" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Short description of this cooperative…" rows={3} maxLength={500} />
      </div>
    </div>
  );

  return (
    <div>
      {/* Delete confirm */}
      <Modal open={!!confirmDel} onClose={() => setConfirmDel(null)} title="Deactivate cooperative?"
        footer={<><button className="btn btn-secondary" onClick={() => setConfirmDel(null)}>Cancel</button><button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>{deleting ? <><span className="spinner"/>Deactivating…</> : 'Yes, deactivate'}</button></>}>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          This will deactivate <strong>{confirmDel?.name}</strong> and remove its assignment from members. This can be reversed.
        </p>
      </Modal>

      {/* Create modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setForm(EMPTY_FORM); setFormError(''); }} title="Create Cooperative"
        footer={<><button className="btn btn-secondary" onClick={() => { setShowCreate(false); setForm(EMPTY_FORM); }}>Cancel</button><button className="btn btn-primary" disabled={submitting} onClick={handleCreate}>{submitting ? <><span className="spinner"/>Creating…</> : 'Create'}</button></>}>
        <CoopForm />
      </Modal>

      {/* Edit modal */}
      <Modal open={!!editCoop} onClose={() => { setEditCoop(null); setForm(EMPTY_FORM); setFormError(''); }} title="Edit Cooperative"
        footer={<><button className="btn btn-secondary" onClick={() => setEditCoop(null)}>Cancel</button><button className="btn btn-primary" disabled={submitting} onClick={handleUpdate}>{submitting ? <><span className="spinner"/>Saving…</> : 'Save changes'}</button></>}>
        <CoopForm />
      </Modal>

      {/* View detail modal */}
      <Modal open={!!viewDetail || detailLoading} onClose={() => setViewDetail(null)} title={viewDetail?.name ?? 'Loading…'}>
        {detailLoading ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-faint)' }}><span className="spinner" style={{ display: 'inline-block', marginRight: '0.5rem' }} />Loading details…</div>
        ) : viewDetail ? (
          <div>
            {/* Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
              {[
                { label: 'Location', val: viewDetail.location ?? '—' },
                { label: 'Members',  val: viewDetail.memberCount },
                { label: 'Farms',    val: viewDetail.farmCount },
                { label: 'Created',  val: new Date(viewDetail.createdAt).toLocaleDateString() },
              ].map(item => (
                <div key={item.label} style={{ padding: '0.625rem 0.75rem', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                  <p style={{ fontSize: '0.62rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-faint)', marginBottom: '0.2rem' }}>{item.label}</p>
                  <p style={{ fontWeight: 700, fontSize: '0.875rem', color: 'var(--text)' }}>{item.val}</p>
                </div>
              ))}
            </div>
            {viewDetail.description && (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.25rem', lineHeight: 1.6, padding: '0.625rem 0.75rem', background: 'var(--gray-50)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                {viewDetail.description}
              </p>
            )}

            {/* Members */}
            <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-faint)', marginBottom: '0.5rem' }}>Members ({viewDetail.members.length})</p>
            {viewDetail.members.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-faint)', marginBottom: '1rem' }}>No members yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '1.25rem', maxHeight: 200, overflowY: 'auto' }}>
                {viewDetail.members.map(m => {
                  const roleColor: Record<string, string> = { ADMIN: '#d97706', SUPERVISOR: '#2563eb', FARMER: '#16a34a' };
                  return (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.625rem', background: 'var(--gray-50)', borderRadius: 'var(--radius)', border: '1px solid var(--border-light)' }}>
                      <div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg, var(--brand-500), var(--accent-500))`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                        {m.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</p>
                        <p style={{ fontSize: '0.7rem', color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email}</p>
                      </div>
                      <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '0.1rem 0.4rem', borderRadius: '9999px', background: (roleColor[m.role] ?? '#6b7280') + '18', color: roleColor[m.role] ?? '#6b7280', flexShrink: 0 }}>{m.role}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Farms */}
            <p style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-faint)', marginBottom: '0.5rem' }}>Farms ({viewDetail.farms.length})</p>
            {viewDetail.farms.length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-faint)' }}>No farms in this cooperative yet.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', maxHeight: 180, overflowY: 'auto' }}>
                {viewDetail.farms.map(f => (
                  <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.625rem', background: 'var(--gray-50)', borderRadius: 'var(--radius)', border: '1px solid var(--border-light)' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--brand-600)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                    </svg>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</p>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-faint)' }}>{f.location} · Owner: {f.ownerName}</p>
                    </div>
                    <Link to={`/farms/${f.id}`} className="btn btn-ghost btn-xs" onClick={() => setViewDetail(null)}>View</Link>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Cooperative Management</h1>
          <p className="page-subtitle">Manage sericulture cooperatives and their memberships</p>
        </div>
        <div className="page-actions">
          <Link to="/admin" className="btn btn-secondary btn-sm">← Dashboard</Link>
          <button className="btn btn-primary btn-sm" onClick={() => { setShowCreate(true); setForm(EMPTY_FORM); setFormError(''); }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Cooperative
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
        <StatCard label="Total Cooperatives" value={coops.length} color="#7c3aed" bg="#f3e8ff" delay={0}
          icon={<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>} />
        <StatCard label="Total Members" value={totalMembers} color="#2563eb" bg="#eff6ff" delay={0.07}
          icon={<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>} />
        <StatCard label="Total Farms" value={totalFarms} color="#16a34a" bg="#f0fdf4" delay={0.14}
          icon={<><path d="M12 22V12M3.5 8.5C3.5 5.46 6.46 3 10 3c2.12 0 4 .9 5.28 2.33A6.5 6.5 0 0 1 21 11.5c0 3.58-2.91 6.5-6.5 6.5H5a1.5 1.5 0 0 1 0-3"/></>} />
      </div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.35 }}>
        <div className="table-container">
          <div className="table-header">
            <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>Cooperatives ({coops.length})</p>
            <div className="input-wrapper" style={{ width: 220 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="input-icon-left"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input className="form-input has-left" style={{ height: 32, fontSize: '0.78rem' }} placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          {loading ? (
            <SkeletonTable rows={4} cols={5} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
              title={search ? 'No matches' : 'No cooperatives yet'}
              description={search ? `No cooperatives matching "${search}"` : 'Create your first cooperative to group farmers and supervisors.'}
              action={!search ? { label: 'Create Cooperative', onClick: () => { setShowCreate(true); setForm(EMPTY_FORM); } } : undefined}
            />
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Location</th>
                    <th>Members</th>
                    <th>Farms</th>
                    <th>Created</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c, i) => (
                    <motion.tr key={c.id} className="tbody-row"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'linear-gradient(135deg, #7c3aed20, #7c3aed40)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                            </svg>
                          </div>
                          <div>
                            <p style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text)' }}>{c.name}</p>
                            {c.description && <p style={{ fontSize: '0.72rem', color: 'var(--text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{c.description}</p>}
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{c.location ?? '—'}</td>
                      <td>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#2563eb' }}>{c.memberCount}</span>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#16a34a' }}>{c.farmCount}</span>
                      </td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                          <button className="btn btn-ghost btn-xs" onClick={() => openView(c)}>View</button>
                          <button className="btn btn-ghost btn-xs" onClick={() => openEdit(c)}>Edit</button>
                          <button className="btn btn-xs btn-secondary" onClick={() => setConfirmDel(c)} style={{ color: 'var(--danger)', borderColor: 'var(--danger-border)' }}>Delete</button>
                        </div>
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
