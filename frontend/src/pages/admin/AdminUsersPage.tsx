import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { adminService, CreateUserPayload } from '../../services/admin.service';
import { cooperativeService } from '../../services/cooperative.service';
import { User, Role, Cooperative } from '../../types';
import { useApiError } from '../../hooks/useApiError';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/ui/Modal';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';

const ROLE_META: Record<Role, { color: string; bg: string }> = {
  ADMIN:      { color: '#d97706', bg: '#fef3c7' },
  SUPERVISOR: { color: '#2563eb', bg: '#dbeafe' },
  FARMER:     { color: '#16a34a', bg: '#dcfce7' },
};

const EMPTY_FORM: CreateUserPayload = { name: '', email: '', password: '', role: 'FARMER' };

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

interface RoleStatCardProps { role: Role; count: number; delay: number; loading: boolean }
function RoleStatCard({ role, count, delay, loading }: RoleStatCardProps) {
  const meta = ROLE_META[role];
  const animCount = useCountUp(count);

  const icons: Record<Role, React.ReactNode> = {
    ADMIN:      <><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></>,
    SUPERVISOR: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
    FARMER:     <><path d="M12 22V12M3.5 8.5C3.5 5.46 6.46 3 10 3c2.12 0 4 .9 5.28 2.33A6.5 6.5 0 0 1 21 11.5c0 3.58-2.91 6.5-6.5 6.5H5a1.5 1.5 0 0 1 0-3"/></>,
  };

  if (loading) return <div className="stat-card skeleton" style={{ height: 110 }} />;

  return (
    <motion.div className="stat-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}>
      <div className="stat-card-glow" style={{ background: meta.color }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-faint)', marginBottom: '0.75rem' }}>
            {role === 'ADMIN' ? 'Admins' : role === 'SUPERVISOR' ? 'Supervisors' : 'Farmers'}
          </p>
          <p style={{ fontSize: '2.1rem', fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.04em', lineHeight: 1 }}>{animCount}</p>
        </div>
        <div className="stat-card-icon" style={{ background: meta.bg }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={meta.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            {icons[role]}
          </svg>
        </div>
      </div>
      <div style={{ marginTop: '1rem', height: 3, borderRadius: 2, background: `linear-gradient(90deg, ${meta.color}60, ${meta.color}10)` }} />
    </motion.div>
  );
}

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const { getErrorMessage } = useApiError();
  const { success, error: showError } = useToast();

  const [users,       setUsers]       = useState<User[]>([]);
  const [coops,       setCoops]       = useState<Cooperative[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showCreate,  setShowCreate]  = useState(false);
  const [confirmDeact, setConfirmDeact] = useState<User | null>(null);
  const [form,        setForm]        = useState<CreateUserPayload>(EMPTY_FORM);
  const [formError,   setFormError]   = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [search,      setSearch]      = useState('');

  useEffect(() => {
    Promise.all([
      adminService.getUsers(),
      cooperativeService.getAll(),
    ]).then(([usersRes, coopsRes]) => {
      setUsers(usersRes.data.data);
      setCoops(coopsRes.data.data);
    }).catch(e => showError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  const handleCooperativeChange = async (userId: string, cooperativeId: string) => {
    try {
      const res = await adminService.updateCooperative(userId, cooperativeId || null);
      setUsers(prev => prev.map(u => u.id === userId ? res.data.data : u));
      success('Cooperative updated.');
    } catch (e) { showError(getErrorMessage(e)); }
  };

  const handleRoleChange = async (userId: string, newRole: Role) => {
    try {
      const res = await adminService.updateRole(userId, newRole);
      setUsers(prev => prev.map(u => u.id === userId ? res.data.data : u));
      success(`Role updated to ${newRole}.`);
    } catch (e) { showError(getErrorMessage(e)); }
  };

  const handleDeactivate = async () => {
    if (!confirmDeact) return;
    setDeactivating(true);
    try {
      await adminService.deactivateUser(confirmDeact.id);
      setUsers(prev => prev.filter(u => u.id !== confirmDeact.id));
      success(`${confirmDeact.name} deactivated.`);
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setDeactivating(false);
      setConfirmDeact(null);
    }
  };

  const handleCreate = async () => {
    setFormError('');
    if (!form.name || !form.email || !form.password) { setFormError('All fields are required.'); return; }
    setSubmitting(true);
    try {
      const res = await adminService.createUser(form);
      setUsers(prev => [res.data.data, ...prev]);
      setShowCreate(false);
      setForm(EMPTY_FORM);
      success('User created successfully.');
    } catch (e) {
      setFormError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = users.filter(u =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  const byRole = (r: Role) => users.filter(u => u.role === r).length;

  return (
    <div>
      {/* Deactivate confirm modal */}
      <Modal open={!!confirmDeact} onClose={() => setConfirmDeact(null)} title="Deactivate user?"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setConfirmDeact(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleDeactivate} disabled={deactivating}>
              {deactivating ? <><span className="spinner" />Deactivating…</> : 'Yes, deactivate'}
            </button>
          </>
        }
      >
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          This will prevent <strong>{confirmDeact?.name}</strong> ({confirmDeact?.email}) from logging in. This action can be reversed manually.
        </p>
      </Modal>

      {/* Create user modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); setForm(EMPTY_FORM); setFormError(''); }} title="Create new user"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => { setShowCreate(false); setForm(EMPTY_FORM); }}>Cancel</button>
            <button className="btn btn-primary" disabled={submitting} onClick={handleCreate}>
              {submitting ? <><span className="spinner" />Creating…</> : 'Create User'}
            </button>
          </>
        }
      >
        {formError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{formError}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {(['name', 'email', 'password'] as const).map(field => (
            <div key={field} className="form-group">
              <label className="form-label" style={{ textTransform: 'capitalize' }}>{field}</label>
              <input type={field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'}
                value={form[field]} onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                className="form-input"
                placeholder={field === 'password' ? 'Min 8 chars, uppercase, digit' : ''} />
            </div>
          ))}
          <div className="form-group">
            <label className="form-label">Role</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))} className="form-select">
              <option value="FARMER">Farmer</option>
              <option value="SUPERVISOR">Supervisor</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
        </div>
      </Modal>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">Create accounts, assign roles, manage access</p>
        </div>
        <div className="page-actions">
          <Link to="/admin" className="btn btn-secondary btn-sm">← Dashboard</Link>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ Create User</button>
        </div>
      </div>

      {/* Role summary */}
      <div className="grid-3" style={{ marginBottom: '1.5rem' }}>
        {(['ADMIN', 'SUPERVISOR', 'FARMER'] as Role[]).map((r, i) => (
          <RoleStatCard key={r} role={r} count={byRole(r)} delay={i * 0.07} loading={loading} />
        ))}
      </div>

      {/* Search + table */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22, duration: 0.35 }}>
        <div className="table-container">
          <div className="table-header">
            <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>All Users ({users.length})</p>
            <div className="input-wrapper" style={{ width: 220 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="input-icon-left"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input className="form-input has-left" style={{ height: 32, fontSize: '0.78rem' }} placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          {loading ? (
            <SkeletonTable rows={5} cols={6} />
          ) : filtered.length === 0 ? (
            <EmptyState icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} title="No users found" description={search ? `No results for "${search}"` : 'No users in the system.'} />
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Cooperative</th>
                    <th>Joined</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u, i) => (
                    <motion.tr key={u.id} className="tbody-row"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                          <div style={{ width: 30, height: 30, borderRadius: '50%', background: `linear-gradient(135deg, var(--brand-500), var(--accent-500))`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                            {u.name.split(' ').map(w => w[0]).slice(0,2).join('').toUpperCase()}
                          </div>
                          <div>
                            <span style={{ fontWeight: 600, fontSize: '0.82rem' }}>{u.name}</span>
                            {u.id === me?.id && <span style={{ marginLeft: '0.4rem', fontSize: '0.65rem', color: 'var(--text-faint)' }}>(you)</span>}
                          </div>
                        </div>
                      </td>
                      <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{u.email}</td>
                      <td>
                        {u.id === me?.id ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.18rem 0.55rem', borderRadius: '9999px', fontSize: '0.7rem', fontWeight: 700, background: ROLE_META[u.role as Role]?.bg, color: ROLE_META[u.role as Role]?.color }}>
                            {u.role}
                          </span>
                        ) : (
                          <select value={u.role} onChange={e => handleRoleChange(u.id, e.target.value as Role)}
                            style={{ padding: '0.25rem 0.5rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: '0.75rem', background: ROLE_META[u.role as Role]?.bg, color: ROLE_META[u.role as Role]?.color, fontWeight: 700, cursor: 'pointer' }}>
                            <option value="FARMER">FARMER</option>
                            <option value="SUPERVISOR">SUPERVISOR</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                        )}
                      </td>
                      {/* Cooperative column */}
                      <td>
                        {u.role === 'ADMIN' ? (
                          /* Admins manage cooperatives globally — not assigned to any */
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)', fontStyle: 'italic' }}>N/A</span>
                        ) : u.id === me?.id ? (
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                            {u.cooperativeName ?? '—'}
                          </span>
                        ) : (
                          <select
                            value={u.cooperativeId ?? ''}
                            onChange={e => handleCooperativeChange(u.id, e.target.value)}
                            style={{ padding: '0.25rem 0.5rem', borderRadius: 'var(--radius)', border: '1px solid var(--border)', fontSize: '0.75rem', background: 'var(--surface)', color: 'var(--text)', cursor: 'pointer', minWidth: 130 }}
                          >
                            <option value="">— None —</option>
                            {coops.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td style={{ fontSize: '0.75rem', color: 'var(--text-faint)' }}>
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '9999px', background: '#f0fdf4', color: '#16a34a' }}>Active</span>
                      </td>
                      <td>
                        {u.id !== me?.id && (
                          <button className="btn btn-xs btn-secondary" onClick={() => setConfirmDeact(u)} style={{ color: 'var(--danger)', borderColor: 'var(--danger-border)' }}>
                            Deactivate
                          </button>
                        )}
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
