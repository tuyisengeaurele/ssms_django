import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminService, CreateUserPayload } from '../../services/admin.service';
import { User, Role } from '../../types';
import Navbar from '../../components/ui/Navbar';
import { useApiError } from '../../hooks/useApiError';
import { useAuth } from '../../context/AuthContext';

// ── role badge ────────────────────────────────────────────────────────────────

const ROLE_STYLE: Record<Role, { bg: string; color: string }> = {
  ADMIN:      { bg: '#fef3c7', color: '#d97706' },
  SUPERVISOR: { bg: '#dbeafe', color: '#2563eb' },
  FARMER:     { bg: '#dcfce7', color: '#16a34a' },
};

function RoleBadge({ role }: { role: Role }) {
  const s = ROLE_STYLE[role];
  return (
    <span style={{ padding: '0.15rem 0.55rem', borderRadius: '9999px', fontSize: '0.72rem', fontWeight: 700, background: s.bg, color: s.color }}>
      {role}
    </span>
  );
}

// ── modal overlay ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div className="anim-in" style={{ background: '#fff', borderRadius: '12px', padding: '1.75rem', width: '100%', maxWidth: '440px', boxShadow: '0 20px 40px rgba(0,0,0,.15)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontWeight: 700, fontSize: '1.05rem' }}>{title}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', color: '#9ca3af', cursor: 'pointer', lineHeight: 1 }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const EMPTY_FORM: CreateUserPayload = { name: '', email: '', password: '', role: 'FARMER' };

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const { getErrorMessage } = useApiError();

  const [users, setUsers]         = useState<User[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');

  // modals
  const [showCreate, setShowCreate]             = useState(false);
  const [confirmDeact, setConfirmDeact]         = useState<User | null>(null);

  // create form
  const [form, setForm]           = useState<CreateUserPayload>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

  useEffect(() => {
    adminService.getUsers()
      .then(r => setUsers(r.data.data))
      .catch(e => setError(getErrorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  // ── role change (inline) ──────────────────────────────────────────────────
  const handleRoleChange = async (userId: string, newRole: Role) => {
    try {
      const res = await adminService.updateRole(userId, newRole);
      setUsers(prev => prev.map(u => u.id === userId ? res.data.data : u));
      flash(`Role updated to ${newRole}.`);
    } catch (e) {
      setError(getErrorMessage(e));
    }
  };

  // ── deactivate ────────────────────────────────────────────────────────────
  const handleDeactivate = async () => {
    if (!confirmDeact) return;
    try {
      await adminService.deactivateUser(confirmDeact.id);
      setUsers(prev => prev.filter(u => u.id !== confirmDeact.id));
      flash(`${confirmDeact.name} deactivated.`);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setConfirmDeact(null);
    }
  };

  // ── create user ───────────────────────────────────────────────────────────
  const handleCreate = async () => {
    setFormError('');
    if (!form.name || !form.email || !form.password) {
      setFormError('All fields are required.'); return;
    }
    setSubmitting(true);
    try {
      const res = await adminService.createUser(form);
      setUsers(prev => [res.data.data, ...prev]);
      setShowCreate(false);
      setForm(EMPTY_FORM);
      flash('User created successfully.');
    } catch (e) {
      setFormError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  // ── counts ────────────────────────────────────────────────────────────────
  const byRole = (r: Role) => users.filter(u => u.role === r).length;

  const inputStyle = {
    width: '100%', padding: '0.6rem 0.85rem', border: '1px solid #e5e7eb',
    borderRadius: '8px', fontSize: '0.875rem', outline: 'none', boxSizing: 'border-box' as const,
  };

  return (
    <>
      <Navbar />

      {/* Confirm deactivate modal */}
      {confirmDeact && (
        <Modal title="Deactivate user?" onClose={() => setConfirmDeact(null)}>
          <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1.25rem' }}>
            This will prevent <strong>{confirmDeact.name}</strong> ({confirmDeact.email}) from logging in. This action can be reversed manually.
          </p>
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
            <button className="btn btn-secondary" onClick={() => setConfirmDeact(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleDeactivate}>Yes, deactivate</button>
          </div>
        </Modal>
      )}

      {/* Create user modal */}
      {showCreate && (
        <Modal title="Create new user" onClose={() => { setShowCreate(false); setForm(EMPTY_FORM); setFormError(''); }}>
          {formError && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{formError}</div>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {(['name', 'email', 'password'] as const).map((field) => (
              <div key={field}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem', textTransform: 'capitalize' }}>{field}</label>
                <input
                  type={field === 'password' ? 'password' : field === 'email' ? 'email' : 'text'}
                  value={form[field]}
                  onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                  placeholder={field === 'password' ? 'Min 8 chars, uppercase, digit' : ''}
                  style={inputStyle}
                />
              </div>
            ))}
            <div>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as Role }))} style={inputStyle}>
                <option value="FARMER">Farmer</option>
                <option value="SUPERVISOR">Supervisor</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
            <button className="btn btn-secondary" onClick={() => { setShowCreate(false); setForm(EMPTY_FORM); }}>Cancel</button>
            <button className="btn btn-primary" disabled={submitting} onClick={handleCreate}>
              {submitting ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </Modal>
      )}

      <div className="container page" style={{ maxWidth: '1100px' }}>

        {/* header */}
        <div className="anim-in flex-between" style={{ marginBottom: '1.75rem' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, letterSpacing: '-0.02em' }}>User Management</h1>
            <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.2rem' }}>Create accounts, assign roles, manage access</p>
          </div>
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <Link to="/admin" className="btn btn-secondary btn-sm">← Dashboard</Link>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ Create User</button>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        {/* role summary cards */}
        <div className="grid-3 anim-in" style={{ marginBottom: '1.5rem', animationDelay: '60ms' }}>
          {(['ADMIN', 'SUPERVISOR', 'FARMER'] as Role[]).map((r) => (
            <div key={r} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', padding: '1rem 1.25rem', borderTop: `3px solid ${ROLE_STYLE[r].color}`, boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
              <p style={{ fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280' }}>{r}S</p>
              <p style={{ fontSize: '1.75rem', fontWeight: 800, color: ROLE_STYLE[r].color, marginTop: '0.2rem' }}>{byRole(r)}</p>
            </div>
          ))}
        </div>

        {/* users table */}
        <div className="anim-in" style={{ animationDelay: '120ms', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,.07)', overflow: 'hidden' }}>
          <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid #e5e7eb' }}>
            <p style={{ fontWeight: 700, fontSize: '0.95rem' }}>All Users ({users.length})</p>
          </div>

          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: '#9ca3af' }}>Loading…</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['Name', 'Email', 'Role', 'Joined', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '0.65rem 1rem', textAlign: 'left', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', fontWeight: 600, background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}
                      onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      style={{ transition: 'background 0.12s' }}
                    >
                      <td style={{ padding: '0.75rem 1rem', fontWeight: 600, fontSize: '0.875rem' }}>
                        {u.name}
                        {u.id === me?.id && <span style={{ marginLeft: '0.4rem', fontSize: '0.68rem', color: '#9ca3af' }}>(you)</span>}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.82rem', color: '#6b7280' }}>{u.email}</td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {u.id === me?.id ? (
                          <RoleBadge role={u.role as Role} />
                        ) : (
                          <select
                            value={u.role}
                            onChange={e => handleRoleChange(u.id, e.target.value as Role)}
                            style={{ padding: '0.25rem 0.5rem', borderRadius: '6px', border: '1px solid #e5e7eb', fontSize: '0.8rem', background: ROLE_STYLE[u.role as Role]?.bg, color: ROLE_STYLE[u.role as Role]?.color, fontWeight: 600, cursor: 'pointer' }}
                          >
                            <option value="FARMER">FARMER</option>
                            <option value="SUPERVISOR">SUPERVISOR</option>
                            <option value="ADMIN">ADMIN</option>
                          </select>
                        )}
                      </td>
                      <td style={{ padding: '0.75rem 1rem', fontSize: '0.78rem', color: '#9ca3af' }}>
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '9999px', background: '#dcfce7', color: '#16a34a' }}>
                          Active
                        </span>
                      </td>
                      <td style={{ padding: '0.75rem 1rem' }}>
                        {u.id !== me?.id && (
                          <button
                            onClick={() => setConfirmDeact(u)}
                            className="btn btn-sm btn-danger"
                            style={{ fontSize: '0.72rem' }}
                          >
                            Deactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
