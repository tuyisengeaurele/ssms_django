import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { farmService } from '../../services/farm.service';
import { batchService } from '../../services/batch.service';
import { Farm, Batch } from '../../types';
import StageBadge from '../../components/ui/StageBadge';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import { useAuth } from '../../context/AuthContext';
import { useApiError } from '../../hooks/useApiError';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/ui/Modal';

export default function FarmDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const { user } = useAuth();
  const { getErrorMessage } = useApiError();
  const { success, error: showError } = useToast();
  const navigate = useNavigate();

  const [farm,      setFarm]      = useState<Farm | null>(null);
  const [batches,   setBatches]   = useState<Batch[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [showDel,   setShowDel]   = useState(false);
  const [deleting,  setDeleting]  = useState(false);
  // Edit modal
  const [showEdit,  setShowEdit]  = useState(false);
  const [editForm,  setEditForm]  = useState({ name: '', location: '' });
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([farmService.getById(id), batchService.getByFarm(id)])
      .then(([farmRes, batchRes]) => {
        setFarm(farmRes.data.data);
        setBatches(batchRes.data.data);
      })
      .catch(err => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [id]);

  const openEdit = () => {
    if (!farm) return;
    setEditForm({ name: farm.name, location: farm.location });
    setShowEdit(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !farm) return;
    setSaving(true);
    try {
      const res = await farmService.update(id, editForm);
      setFarm(res.data.data);
      setShowEdit(false);
      success('Farm updated.');
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!id) return;
    setDeleting(true);
    try {
      await farmService.delete(id);
      success('Farm deleted.');
      navigate('/farms');
    } catch (err) {
      showError(getErrorMessage(err));
      setDeleting(false);
    }
  };

  const canEdit = user?.role === 'FARMER' || user?.role === 'ADMIN';

  if (loading) {
    return (
      <div>
        <div style={{ marginBottom: '1.75rem' }}>
          <div style={{ height: 28, width: 200, borderRadius: 6 }} className="skeleton" />
        </div>
        <SkeletonTable rows={4} cols={5} />
      </div>
    );
  }

  if (error || !farm) {
    return (
      <div>
        <div className="alert alert-error">{error || 'Farm not found.'}</div>
        <Link to="/farms" className="btn btn-secondary btn-sm">← Back</Link>
      </div>
    );
  }

  return (
    <div>
      {/* Edit modal */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit farm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowEdit(false)}>Cancel</button>
            <button className="btn btn-primary" form="farm-edit-form" type="submit" disabled={saving}>
              {saving ? <><span className="spinner" />Saving…</> : 'Save changes'}
            </button>
          </>
        }
      >
        <form id="farm-edit-form" onSubmit={handleSave}>
          <div className="form-group">
            <label className="form-label">Farm Name</label>
            <input
              type="text"
              value={editForm.name}
              onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
              className="form-input"
              required
              maxLength={100}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Location</label>
            <input
              type="text"
              value={editForm.location}
              onChange={e => setEditForm(f => ({ ...f, location: e.target.value }))}
              className="form-input"
              required
              maxLength={200}
            />
          </div>
        </form>
      </Modal>

      {/* Delete modal */}
      <Modal open={showDel} onClose={() => setShowDel(false)} title="Delete farm?"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowDel(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? <><span className="spinner" />Deleting…</> : 'Yes, delete'}
            </button>
          </>
        }
      >
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          This will permanently delete <strong>{farm.name}</strong> and all associated data. This action cannot be undone.
        </p>
      </Modal>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">{farm.name}</h1>
          <p className="page-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            {farm.location}
          </p>
        </div>
        <div className="page-actions">
          {canEdit && <Link to={`/farms/${id}/batches/new`} className="btn btn-primary btn-sm">+ New Batch</Link>}
          {canEdit && <button onClick={openEdit} className="btn btn-secondary btn-sm">Edit</button>}
          {canEdit && <button onClick={() => setShowDel(true)} className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger-border)' }}>Delete</button>}
          <Link to="/farms" className="btn btn-ghost btn-sm">← Farms</Link>
        </div>
      </div>

      {/* Farm info */}
      <motion.div className="card" style={{ marginBottom: '1.5rem' }}
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1.5rem' }}>
          {[
            { label: 'Owner',   value: farm.owner?.name ?? '—' },
            { label: 'Batches', value: batches.length },
            { label: 'Created', value: new Date(farm.createdAt).toLocaleDateString() },
            { label: 'Status',  value: farm.isActive ? 'Active' : 'Inactive' },
          ].map(item => (
            <div key={item.label}>
              <p style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-faint)', marginBottom: '0.3rem' }}>{item.label}</p>
              <p style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text)' }}>{item.value}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Batches table */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.35 }}>
        <div className="table-container">
          <div className="table-header">
            <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>Batches ({batches.length})</p>
            {canEdit && <Link to={`/farms/${id}/batches/new`} className="btn btn-primary btn-sm">+ Add Batch</Link>}
          </div>

          {batches.length === 0 ? (
            <EmptyState
              icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>}
              title="No batches yet"
              description="Add your first batch to start tracking production."
              action={canEdit ? { label: '+ Add Batch', to: `/farms/${id}/batches/new` } : undefined}
            />
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Batch ID</th>
                    <th>Stage</th>
                    <th>Started</th>
                    <th>Expected Harvest</th>
                    <th>Detections</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b, i) => (
                    <motion.tr key={b.id} className="tbody-row"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.04 }}>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: 'var(--text-faint)' }}>
                        #{b.id.slice(-8)}
                      </td>
                      <td><StageBadge stage={b.stage} /></td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(b.startDate).toLocaleDateString()}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{new Date(b.expectedHarvestDate).toLocaleDateString()}</td>
                      <td>
                        <span style={{ fontWeight: 600, color: 'var(--brand-600)' }}>{b.counts?.diseaseDetections ?? 0}</span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.375rem' }}>
                          <Link to={`/batches/${b.id}`} className="btn btn-ghost btn-xs">Details</Link>
                          <Link to={`/batches/${b.id}/detect`} className="btn btn-xs btn-outline-primary" title="Run Detection">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                          </Link>
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
