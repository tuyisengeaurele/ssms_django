import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { auditLogService, AuditLogEntry } from '../../services/admin.service';
import { useToast } from '../../context/ToastContext';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';

const ACTION_COLORS: Record<string, { color: string; bg: string }> = {
  CREATE: { color: '#16a34a', bg: '#dcfce7' },
  UPDATE: { color: '#2563eb', bg: '#dbeafe' },
  DELETE: { color: '#dc2626', bg: '#fee2e2' },
  LOGIN:  { color: '#7c3aed', bg: '#ede9fe' },
  LOGOUT: { color: '#d97706', bg: '#fef3c7' },
  OTHER:  { color: '#6b7280', bg: '#f3f4f6' },
};

const ACTIONS = ['', 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'OTHER'];

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_COLORS[action] ?? ACTION_COLORS.OTHER;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 999,
      fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.06em',
      color: meta.color, background: meta.bg,
    }}>
      {action}
    </span>
  );
}

export default function AdminAuditLogPage() {
  const { toast } = useToast();

  const [entries, setEntries]     = useState<AuditLogEntry[]>([]);
  const [loading, setLoading]     = useState(true);
  const [exporting, setExporting] = useState(false);
  const [page, setPage]           = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);

  const [search,   setSearch]   = useState('');
  const [action,   setAction]   = useState('');
  const [resource, setResource] = useState('');

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    try {
      const res = await auditLogService.getList({ page: p, action, resource, search });
      setEntries(res.data.data);
      setPage(res.data.pagination.page);
      setTotalPages(res.data.pagination.totalPages);
      setTotalItems(res.data.pagination.totalItems);
    } catch {
      toast('Failed to load audit log.', 'error');
    } finally {
      setLoading(false);
    }
  }, [action, resource, search, toast]);

  useEffect(() => { load(1); }, [load]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await auditLogService.exportCsv({ action, resource, search });
      toast('CSV downloaded.', 'success');
    } catch {
      toast('Export failed.', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}
      style={{ padding: '1.5rem 2rem', maxWidth: 1200 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--text)', margin: 0 }}>Audit Log</h1>
          <p style={{ color: 'var(--text-faint)', fontSize: '0.85rem', margin: '0.25rem 0 0' }}>
            {totalItems.toLocaleString()} recorded events
          </p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{
            padding: '0.5rem 1rem', borderRadius: 8, border: 'none',
            background: 'var(--brand-600)', color: '#fff', fontWeight: 600,
            fontSize: '0.85rem', cursor: exporting ? 'not-allowed' : 'pointer',
            opacity: exporting ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
          </svg>
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Search email or detail…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(1)}
          style={{ padding: '0.45rem 0.75rem', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.85rem', width: 240 }}
        />
        <select
          value={action}
          onChange={e => setAction(e.target.value)}
          style={{ padding: '0.45rem 0.75rem', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.85rem' }}
        >
          {ACTIONS.map(a => <option key={a} value={a}>{a || 'All actions'}</option>)}
        </select>
        <input
          type="text"
          placeholder="Resource (Farm, User…)"
          value={resource}
          onChange={e => setResource(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && load(1)}
          style={{ padding: '0.45rem 0.75rem', borderRadius: 8, border: '1.5px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '0.85rem', width: 180 }}
        />
        <button
          onClick={() => load(1)}
          style={{ padding: '0.45rem 1rem', borderRadius: 8, border: 'none', background: 'var(--brand-600)', color: '#fff', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer' }}
        >
          Filter
        </button>
        <button
          onClick={() => { setSearch(''); setAction(''); setResource(''); }}
          style={{ padding: '0.45rem 0.75rem', borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', color: 'var(--text-faint)', fontWeight: 500, fontSize: '0.85rem', cursor: 'pointer' }}
        >
          Clear
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden' }}>
        {loading ? (
          <SkeletonTable rows={10} cols={7} />
        ) : entries.length === 0 ? (
          <EmptyState title="No events found" description="Try adjusting your filters." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>
              <thead>
                <tr style={{ borderBottom: '1.5px solid var(--border)', background: 'var(--surface-alt, var(--surface))' }}>
                  {['Name', 'Email', 'Action', 'Resource', 'Detail', 'IP', 'Timestamp'].map(h => (
                    <th key={h} style={{ padding: '0.75rem 1rem', textAlign: 'left', fontWeight: 700, color: 'var(--text-faint)', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={e.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)' }}>
                    <td style={{ padding: '0.65rem 1rem', color: 'var(--text)', fontWeight: 600, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.userName || '—'}</td>
                    <td style={{ padding: '0.65rem 1rem', color: 'var(--text-faint)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.userEmail || '—'}</td>
                    <td style={{ padding: '0.65rem 1rem' }}><ActionBadge action={e.action} /></td>
                    <td style={{ padding: '0.65rem 1rem', color: 'var(--text-faint)' }}>
                      {e.resource}{e.resourceId ? <span style={{ color: 'var(--text-faint)', fontSize: '0.75rem' }}> #{e.resourceId}</span> : null}
                    </td>
                    <td style={{ padding: '0.65rem 1rem', color: 'var(--text)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.detail || '—'}</td>
                    <td style={{ padding: '0.65rem 1rem', color: 'var(--text-faint)', fontFamily: 'monospace', fontSize: '0.78rem' }}>{e.ipAddress || '—'}</td>
                    <td style={{ padding: '0.65rem 1rem', color: 'var(--text-faint)', whiteSpace: 'nowrap', fontSize: '0.78rem' }}>
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', marginTop: '1.25rem' }}>
          <button
            disabled={page <= 1}
            onClick={() => load(page - 1)}
            style={{ padding: '0.4rem 0.9rem', borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', color: page <= 1 ? 'var(--text-faint)' : 'var(--text)', cursor: page <= 1 ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
          >
            ← Prev
          </button>
          <span style={{ color: 'var(--text-faint)', fontSize: '0.85rem' }}>Page {page} of {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => load(page + 1)}
            style={{ padding: '0.4rem 0.9rem', borderRadius: 8, border: '1.5px solid var(--border)', background: 'transparent', color: page >= totalPages ? 'var(--text-faint)' : 'var(--text)', cursor: page >= totalPages ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
          >
            Next →
          </button>
        </div>
      )}
    </motion.div>
  );
}
