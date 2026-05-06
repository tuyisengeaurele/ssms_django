import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { batchService } from '../../services/batch.service';
import { detectionService } from '../../services/detection.service';
import { Batch, BatchStage, DiseaseDetection } from '../../types';
import Navbar from '../../components/ui/Navbar';
import PageHeader from '../../components/ui/PageHeader';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import StageBadge from '../../components/ui/StageBadge';
import { useAuth } from '../../context/AuthContext';
import { useApiError } from '../../hooks/useApiError';
import { STAGE_ORDER, STAGE_LABELS, STAGE_COLORS } from '../../utils/constants';

const DISEASE_COLORS: Record<string, string> = {
  Healthy: '#059669',
  Flacherie: '#dc2626',
  Grasserie: '#d97706',
  Muscardine: '#7c3aed',
  Pebrine: '#db2777',
};
function diseaseColor(label: string) { return DISEASE_COLORS[label] ?? '#6b7280'; }

export default function BatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { getErrorMessage } = useApiError();
  const navigate = useNavigate();

  const [batch, setBatch] = useState<Batch | null>(null);
  const [detections, setDetections] = useState<DiseaseDetection[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchBatch = () => {
    if (!id) return;
    Promise.all([
      batchService.getById(id),
      detectionService.getByBatch(id),
    ])
      .then(([batchRes, detRes]) => {
        setBatch(batchRes.data.data);
        setDetections(detRes.data.data);
      })
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchBatch(); }, [id]);

  const handleStageUpdate = async (stage: BatchStage) => {
    if (!id || !confirm(`Advance stage to "${STAGE_LABELS[stage]}"?`)) return;
    setUpdating(true);
    setError('');
    try {
      const res = await batchService.updateStage(id, stage);
      setBatch((prev) => prev ? { ...prev, stage: res.data.data.stage } : prev);
      setSuccess(`Stage updated to ${STAGE_LABELS[stage]}.`);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm('Archive this batch?')) return;
    try {
      await batchService.delete(id);
      navigate(`/farms/${batch?.farmId}`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  const canEdit = user?.role === 'FARMER' || user?.role === 'ADMIN';
  const currentIdx = batch ? STAGE_ORDER.indexOf(batch.stage) : -1;

  if (loading) return <><Navbar /><LoadingSpinner fullPage /></>;
  if (!batch) return <><Navbar /><div className="container page"><div className="alert alert-error">Batch not found.</div></div></>;

  return (
    <>
      <Navbar />
      <div className="container page">
        <PageHeader
          title={`Batch ${batch.id.slice(-8).toUpperCase()}`}
          subtitle={`Farm: ${batch.farm?.name ?? '—'}`}
          action={
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <Link to={`/batches/${id}/detect`} className="btn btn-primary btn-sm">🔬 Run Detection</Link>
              {canEdit && <button onClick={handleDelete} className="btn btn-danger btn-sm">Archive</button>}
              <Link to={`/farms/${batch.farmId}`} className="btn btn-secondary btn-sm">← Back</Link>
            </div>
          }
        />

        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        {/* Stage progress bar */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ fontWeight: 600, marginBottom: '1.25rem' }}>Lifecycle Stage</h3>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            {STAGE_ORDER.map((stage, idx) => {
              const isActive = stage === batch.stage;
              const isPast = idx < currentIdx;
              const isFuture = idx > currentIdx;
              const color = STAGE_COLORS[stage];
              return (
                <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div
                    style={{
                      padding: '0.5rem 1rem',
                      borderRadius: '9999px',
                      fontWeight: isActive ? 700 : 500,
                      fontSize: '0.875rem',
                      background: isActive ? color : isPast ? color + '30' : 'var(--border)',
                      color: isActive ? '#fff' : isPast ? color : 'var(--text-muted)',
                      border: isActive ? `2px solid ${color}` : '2px solid transparent',
                      cursor: canEdit && isFuture && idx === currentIdx + 1 ? 'pointer' : 'default',
                      transition: 'all 0.15s',
                    }}
                    onClick={() => {
                      if (canEdit && isFuture && idx === currentIdx + 1 && !updating) {
                        handleStageUpdate(stage as BatchStage);
                      }
                    }}
                    title={canEdit && idx === currentIdx + 1 ? `Click to advance to ${STAGE_LABELS[stage]}` : ''}
                  >
                    {STAGE_LABELS[stage]}
                    {isActive && ' ●'}
                  </div>
                  {idx < STAGE_ORDER.length - 1 && (
                    <div style={{ width: '2rem', height: '2px', background: isPast ? color : 'var(--border)', borderRadius: '2px' }} />
                  )}
                </div>
              );
            })}
          </div>
          {canEdit && currentIdx < STAGE_ORDER.length - 1 && (
            <p className="text-muted" style={{ marginTop: '0.75rem', fontSize: '0.8rem' }}>
              Click the next stage to advance the lifecycle.
            </p>
          )}
        </div>

        <div className="grid-2" style={{ marginBottom: '1.5rem' }}>
          <div className="card">
            <h3 style={{ fontWeight: 600, marginBottom: '1rem' }}>Details</h3>
            {[
              { label: 'Current Stage', value: <StageBadge stage={batch.stage} /> },
              { label: 'Start Date', value: new Date(batch.startDate).toLocaleDateString() },
              { label: 'Expected Harvest', value: new Date(batch.expectedHarvestDate).toLocaleDateString() },
              { label: 'Farm', value: batch.farm?.name ?? '—' },
              { label: 'Location', value: batch.farm?.location ?? '—' },
            ].map((row) => (
              <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                <span className="text-muted" style={{ fontSize: '0.875rem' }}>{row.label}</span>
                <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>{row.value}</span>
              </div>
            ))}
            {batch.notes && (
              <div style={{ marginTop: '0.75rem' }}>
                <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '0.25rem' }}>NOTES</p>
                <p style={{ fontSize: '0.875rem' }}>{batch.notes}</p>
              </div>
            )}
          </div>

          <div className="card">
            <h3 style={{ fontWeight: 600, marginBottom: '1rem' }}>Activity Summary</h3>
            {[
              { label: 'Disease Detections', value: batch.counts?.diseaseDetections ?? batch.diseaseDetections?.length ?? 0, color: 'var(--danger)' },
              { label: 'Sensor Readings', value: batch.counts?.sensorReadings ?? batch.sensorReadings?.length ?? 0, color: 'var(--secondary)' },
              { label: 'Unread Alerts', value: batch.alertLogs?.filter((a) => !a.isRead).length ?? 0, color: 'var(--warning)' },
            ].map((item) => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.625rem 0', borderBottom: '1px solid var(--border)' }}>
                <span className="text-muted" style={{ fontSize: '0.875rem' }}>{item.label}</span>
                <span style={{ fontWeight: 700, color: item.color }}>{item.value}</span>
              </div>
            ))}

            {batch.alertLogs && batch.alertLogs.length > 0 && (
              <div style={{ marginTop: '1rem' }}>
                <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>RECENT ALERTS</p>
                {batch.alertLogs.slice(0, 3).map((alert) => (
                  <div key={alert.id} style={{ padding: '0.5rem', background: 'var(--bg)', borderRadius: 'var(--radius)', marginBottom: '0.25rem', fontSize: '0.8rem' }}>
                    <span style={{ fontWeight: 500 }}>{alert.type}</span>: {alert.message}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {batch.sensorReadings && batch.sensorReadings.length > 0 && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ fontWeight: 600, marginBottom: '1rem' }}>Recent Sensor Readings</h3>
            <div className="table-wrapper">
              <table>
                <thead><tr><th>Timestamp</th><th>Temperature (°C)</th><th>Humidity (%)</th></tr></thead>
                <tbody>
                  {batch.sensorReadings.slice(0, 10).map((r) => (
                    <tr key={r.id}>
                      <td className="text-muted">{new Date(r.timestamp).toLocaleString()}</td>
                      <td style={{ fontWeight: 500 }}>{r.temperature.toFixed(1)}</td>
                      <td style={{ fontWeight: 500 }}>{r.humidity.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Disease Detection History */}
        <div className="card">
          <div className="flex-between" style={{ marginBottom: '1rem' }}>
            <h3 style={{ fontWeight: 600 }}>Detection History ({detections.length})</h3>
            <Link to={`/batches/${id}/detect`} className="btn btn-sm btn-primary">🔬 New Detection</Link>
          </div>
          {detections.length === 0 ? (
            <div className="text-center" style={{ padding: '2rem 0', color: 'var(--text-muted)' }}>
              <p style={{ fontSize: '2rem' }}>🔬</p>
              <p style={{ marginTop: '0.5rem' }}>No detections yet. <Link to={`/batches/${id}/detect`} style={{ color: 'var(--primary)' }}>Run the first one</Link></p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table>
                <thead>
                  <tr><th>Date</th><th>Diagnosis</th><th>Confidence</th><th>Notes</th></tr>
                </thead>
                <tbody>
                  {detections.map((d) => (
                    <tr key={d.id}>
                      <td className="text-muted">{new Date(d.detectedAt).toLocaleString()}</td>
                      <td>
                        <span style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.6rem',
                          borderRadius: '9999px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          background: `${diseaseColor(d.result)}20`,
                          color: diseaseColor(d.result),
                        }}>
                          {d.result}
                        </span>
                      </td>
                      <td style={{ fontWeight: 600 }}>{(d.confidence * 100).toFixed(1)}%</td>
                      <td className="text-muted" style={{ fontSize: '0.8rem' }}>{d.notes ?? '—'}</td>
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
