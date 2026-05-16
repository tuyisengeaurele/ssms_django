import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { batchService } from '../../services/batch.service';
import { detectionService } from '../../services/detection.service';
import { Batch, BatchStage, DiseaseDetection } from '../../types';
import StageBadge from '../../components/ui/StageBadge';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonTable } from '../../components/ui/SkeletonLoader';
import Modal from '../../components/ui/Modal';
import { useAuth } from '../../context/AuthContext';
import { useApiError } from '../../hooks/useApiError';
import { useToast } from '../../context/ToastContext';
import { STAGE_ORDER, STAGE_LABELS, STAGE_COLORS } from '../../utils/constants';

const DISEASE_COLORS: Record<string, string> = {
  Healthy: '#16a34a', Flacherie: '#dc2626', Grasserie: '#d97706',
  Muscardine: '#7c3aed', Pebrine: '#db2777',
};
const dc = (r: string) => DISEASE_COLORS[r] ?? '#6b7280';

export default function BatchDetailPage() {
  const { id }   = useParams<{ id: string }>();
  const { user } = useAuth();
  const { getErrorMessage } = useApiError();
  const { success, error: showError } = useToast();
  const navigate = useNavigate();

  const [batch,      setBatch]      = useState<Batch | null>(null);
  const [detections, setDetections] = useState<DiseaseDetection[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [updating,   setUpdating]   = useState(false);
  const [error,      setError]      = useState('');
  const [showArchive,setShowArchive]= useState(false);
  const [archiving,  setArchiving]  = useState(false);

  const fetchBatch = () => {
    if (!id) return;
    Promise.all([batchService.getById(id), detectionService.getByBatch(id)])
      .then(([bRes, dRes]) => { setBatch(bRes.data.data); setDetections(dRes.data.data); })
      .catch(err => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchBatch(); }, [id]);

  const handleStageUpdate = async (stage: BatchStage) => {
    if (!id) return;
    setUpdating(true);
    try {
      await batchService.updateStage(id, stage);
      success(`Stage advanced to ${STAGE_LABELS[stage]}.`);
      if (stage === 'HARVEST') {
        // Automatically open harvest records when batch reaches harvest stage
        navigate(`/batches/${id}/harvest`);
      } else {
        setBatch(prev => prev ? { ...prev, stage } : prev);
      }
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setUpdating(false);
    }
  };

  const handleArchive = async () => {
    if (!id) return;
    setArchiving(true);
    try {
      await batchService.delete(id);
      success('Batch archived.');
      navigate(`/farms/${batch?.farmId}`);
    } catch (err) {
      showError(getErrorMessage(err));
      setArchiving(false);
    }
  };

  const canEdit   = user?.role === 'FARMER' || user?.role === 'ADMIN';
  const currentIdx = batch ? STAGE_ORDER.indexOf(batch.stage) : -1;

  if (loading) {
    return (
      <div>
        <div style={{ height: 28, width: 220, borderRadius: 6, marginBottom: '1.5rem' }} className="skeleton" />
        <SkeletonTable rows={5} cols={4} />
      </div>
    );
  }

  if (error || !batch) {
    return (
      <div>
        <div className="alert alert-error">{error || 'Batch not found.'}</div>
        <Link to="/farms" className="btn btn-secondary btn-sm">← Farms</Link>
      </div>
    );
  }

  return (
    <div>
      {/* Archive modal */}
      <Modal open={showArchive} onClose={() => setShowArchive(false)} title="Archive batch?"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowArchive(false)}>Cancel</button>
            <button className="btn btn-danger" onClick={handleArchive} disabled={archiving}>
              {archiving ? <><span className="spinner" />Archiving…</> : 'Archive'}
            </button>
          </>
        }
      >
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          This will archive batch <strong>#{id?.slice(-8).toUpperCase()}</strong>. You can still view it but it will no longer appear as active.
        </p>
      </Modal>

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Batch #{id?.slice(-8).toUpperCase()}</h1>
          <p className="page-subtitle">Farm: <strong>{batch.farm?.name ?? '—'}</strong></p>
        </div>
        <div className="page-actions">
          <Link to={`/batches/${id}/detect`} className="btn btn-primary btn-sm">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            Run Detection
          </Link>
          {batch.stage === 'HARVEST' && (
            <Link to={`/batches/${id}/harvest`} className="btn btn-secondary btn-sm" style={{ color: '#16a34a', borderColor: '#bbf7d0' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22V12M3.5 8.5C3.5 5.46 6.46 3 10 3c2.12 0 4 .9 5.28 2.33A6.5 6.5 0 0 1 21 11.5c0 3.58-2.91 6.5-6.5 6.5H5a1.5 1.5 0 0 1 0-3"/></svg>
              Harvest Records
            </Link>
          )}
          {canEdit && (
            <button onClick={() => setShowArchive(true)} className="btn btn-secondary btn-sm" style={{ color: 'var(--danger)', borderColor: 'var(--danger-border)' }}>
              Archive
            </button>
          )}
          <Link to={`/farms/${batch.farmId}`} className="btn btn-ghost btn-sm">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            Farm
          </Link>
        </div>
      </div>

      {/* Stage progression */}
      <motion.div className="card" style={{ marginBottom: '1.5rem' }}
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontWeight: 700, fontSize: '0.875rem' }}>Lifecycle Progress</h3>
          {canEdit && currentIdx < STAGE_ORDER.length - 1 && (
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Click next stage to advance</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0', overflow: 'auto' }}>
          {STAGE_ORDER.map((stage, idx) => {
            const isActive  = stage === batch.stage;
            const isPast    = idx < currentIdx;
            const isNext    = canEdit && idx === currentIdx + 1;
            const color     = STAGE_COLORS[stage];
            return (
              <div key={stage} style={{ display: 'flex', alignItems: 'center', flex: idx < STAGE_ORDER.length - 1 ? 1 : 'none' }}>
                <div
                  onClick={() => { if (isNext && !updating) handleStageUpdate(stage as BatchStage); }}
                  title={isNext ? `Click to advance to ${STAGE_LABELS[stage]}` : ''}
                  style={{
                    padding: '0.45rem 0.875rem',
                    borderRadius: '9999px',
                    fontWeight: isActive ? 700 : 500,
                    fontSize: '0.75rem',
                    whiteSpace: 'nowrap',
                    cursor: isNext ? 'pointer' : 'default',
                    background: isActive ? color : isPast ? color + '25' : 'var(--gray-100)',
                    color: isActive ? '#fff' : isPast ? color : 'var(--text-muted)',
                    border: `1.5px solid ${isActive ? color : isPast ? color + '50' : 'var(--border)'}`,
                    transition: 'all 0.2s',
                    boxShadow: isActive ? `0 2px 8px ${color}40` : 'none',
                    transform: isNext ? 'scale(1.02)' : 'scale(1)',
                  }}
                  onMouseEnter={e => { if (isNext) (e.currentTarget as HTMLElement).style.transform = 'scale(1.06)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = isNext ? 'scale(1.02)' : 'scale(1)'; }}
                >
                  {isPast && '✓ '}{STAGE_LABELS[stage]}{isActive && ' ●'}
                </div>
                {idx < STAGE_ORDER.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: isPast ? color + '60' : 'var(--border-light)', minWidth: 16, margin: '0 2px' }} />
                )}
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Details + Activity */}
      <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
        <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.35 }}>
          <h3 style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '1rem' }}>Batch Details</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {[
              { label: 'Stage',           value: <StageBadge stage={batch.stage} /> },
              { label: 'Start Date',      value: new Date(batch.startDate).toLocaleDateString() },
              { label: 'Expected Harvest',value: new Date(batch.expectedHarvestDate).toLocaleDateString() },
              { label: 'Farm',            value: batch.farm?.name ?? '—' },
              { label: 'Location',        value: batch.farm?.location ?? '—' },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.6rem 0', borderBottom: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{row.label}</span>
                <span style={{ fontSize: '0.82rem', fontWeight: 500 }}>{row.value}</span>
              </div>
            ))}
            {batch.notes && (
              <div style={{ paddingTop: '0.75rem' }}>
                <p style={{ fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-faint)', marginBottom: '0.3rem' }}>Notes</p>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-2)', lineHeight: 1.6 }}>{batch.notes}</p>
              </div>
            )}
          </div>
        </motion.div>

        <motion.div className="card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.16, duration: 0.35 }}>
          <h3 style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '1rem' }}>Activity Summary</h3>
          {[
            { label: 'Disease Detections', val: batch.counts?.diseaseDetections ?? detections.length, color: '#dc2626', bg: '#fef2f2' },
            { label: 'Sensor Readings',   val: batch.counts?.sensorReadings ?? 0,   color: '#2563eb', bg: '#eff6ff' },
            { label: 'Unread Alerts',     val: batch.alertLogs?.filter(a => !a.isRead).length ?? 0, color: '#d97706', bg: '#fef3c7' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.7rem 0', borderBottom: '1px solid var(--border-light)' }}>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{item.label}</span>
              <span style={{ fontWeight: 800, fontSize: '1.1rem', color: item.color }}>{item.val}</span>
            </div>
          ))}
          {batch.alertLogs && batch.alertLogs.length > 0 && (
            <div style={{ marginTop: '0.875rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {batch.alertLogs.slice(0, 3).map(a => (
                <div key={a.id} style={{ padding: '0.5rem 0.625rem', background: 'var(--gray-50)', borderRadius: 'var(--radius)', fontSize: '0.75rem', color: 'var(--text-2)', borderLeft: '3px solid var(--warning)' }}>
                  <strong>{a.type}</strong>: {a.message}
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>

      {/* Sensor readings — Charts + Table */}
      {batch.sensorReadings && batch.sensorReadings.length > 0 && (() => {
        const readings = [...batch.sensorReadings].reverse();
        const chartData = readings.map(r => ({
          time: new Date(r.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          temp: parseFloat(r.temperature.toFixed(1)),
          hum:  parseFloat(r.humidity.toFixed(1)),
        }));
        return (
          <>
            {/* Charts */}
            <motion.div
              className="grid-2" style={{ marginBottom: '1.5rem' }}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22, duration: 0.35 }}>

              {/* Temperature chart */}
              <div className="chart-card">
                <p className="chart-title">Temperature</p>
                <p className="chart-subtitle">Optimal range: 22–28 °C</p>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={chartData} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#d97706" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#d97706" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                    <ReferenceLine y={22} stroke="#d9770640" strokeDasharray="4 3" />
                    <ReferenceLine y={28} stroke="#d9770640" strokeDasharray="4 3" />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.78rem', boxShadow: 'var(--shadow-md)' }}
                      formatter={(v) => [`${v}°C`, 'Temperature']}
                    />
                    <Area type="monotone" dataKey="temp" stroke="#d97706" strokeWidth={2} fill="url(#tempGrad)" dot={false} activeDot={{ r: 4, fill: '#d97706' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Humidity chart */}
              <div className="chart-card">
                <p className="chart-title">Humidity</p>
                <p className="chart-subtitle">Optimal range: 70–85 %</p>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={chartData} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="humGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#2563eb" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border-light)" vertical={false} />
                    <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: 'var(--text-faint)' }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                    <ReferenceLine y={70} stroke="#2563eb40" strokeDasharray="4 3" />
                    <ReferenceLine y={85} stroke="#2563eb40" strokeDasharray="4 3" />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: '0.78rem', boxShadow: 'var(--shadow-md)' }}
                      formatter={(v) => [`${v}%`, 'Humidity']}
                    />
                    <Area type="monotone" dataKey="hum" stroke="#2563eb" strokeWidth={2} fill="url(#humGrad)" dot={false} activeDot={{ r: 4, fill: '#2563eb' }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            {/* Table */}
            <motion.div className="table-container" style={{ marginBottom: '1.5rem' }}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28, duration: 0.35 }}>
              <div className="table-header">
                <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>Recent Sensor Readings</p>
              </div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr><th>Timestamp</th><th>Temperature</th><th>Humidity</th><th>Status</th></tr>
                  </thead>
                  <tbody>
                    {readings.slice(0, 10).map(r => {
                      const tempOk = r.temperature >= 22 && r.temperature <= 28;
                      const humOk  = r.humidity >= 70 && r.humidity <= 85;
                      return (
                        <tr key={r.id} className="tbody-row">
                          <td style={{ fontSize: '0.78rem', color: 'var(--text-faint)' }}>{new Date(r.timestamp).toLocaleString()}</td>
                          <td><span style={{ fontWeight: 600, color: tempOk ? 'var(--text)' : '#dc2626' }}>{r.temperature.toFixed(1)}°C</span></td>
                          <td><span style={{ fontWeight: 600, color: humOk ? 'var(--text)' : '#2563eb' }}>{r.humidity.toFixed(1)}%</span></td>
                          <td>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '0.15rem 0.5rem', borderRadius: '9999px', background: (tempOk && humOk) ? '#f0fdf4' : '#fef2f2', color: (tempOk && humOk) ? '#16a34a' : '#dc2626' }}>
                              {(tempOk && humOk) ? 'Normal' : 'Alert'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </>
        );
      })()}

      {/* Detection history */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.34, duration: 0.35 }}>
        <div className="table-container">
          <div className="table-header">
            <p style={{ fontWeight: 700, fontSize: '0.875rem' }}>Detection History ({detections.length})</p>
            <Link to={`/batches/${id}/detect`} className="btn btn-primary btn-sm">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              New Detection
            </Link>
          </div>
          {detections.length === 0 ? (
            <EmptyState
              icon={<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>}
              title="No detections yet"
              description="Run your first disease detection to get AI-powered insights on this batch."
              action={{ label: 'Run Detection', to: `/batches/${id}/detect` }}
            />
          ) : (
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Date</th><th>Diagnosis</th><th>Confidence</th><th>Notes</th></tr></thead>
                <tbody>
                  {detections.map((d, i) => {
                    const col = dc(d.result);
                    const pct = Math.round(d.confidence * 100);
                    return (
                      <motion.tr key={d.id} className="tbody-row"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.04 }}>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-faint)' }}>{new Date(d.detectedAt).toLocaleString()}</td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.2rem 0.55rem', borderRadius: '9999px', fontSize: '0.72rem', fontWeight: 700, background: col + '18', color: col }}>
                            <span style={{ width: 5, height: 5, borderRadius: '50%', background: col }} />
                            {d.result}
                          </span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <div className="progress-bar" style={{ width: 55 }}>
                              <div className="progress-fill" style={{ width: `${pct}%`, background: col }} />
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: col }}>{pct}%</span>
                          </div>
                        </td>
                        <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{d.notes ?? '—'}</td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
