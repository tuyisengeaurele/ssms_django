import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import Navbar from '../../components/ui/Navbar';
import PageHeader from '../../components/ui/PageHeader';
import { detectionService, DetectionResult } from '../../services/detection.service';
import { useApiError } from '../../hooks/useApiError';

const DISEASE_COLORS: Record<string, string> = {
  Healthy: '#059669',
  Flacherie: '#dc2626',
  Grasserie: '#d97706',
  Muscardine: '#7c3aed',
  Pebrine: '#db2777',
};

function getColor(label: string) {
  return DISEASE_COLORS[label] ?? '#6b7280';
}

export default function AddDetectionPage() {
  const { id: batchId } = useParams<{ id: string }>();
  const { getErrorMessage } = useApiError();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!f.type.startsWith('image/')) {
      setError('Please select a JPEG or PNG image.');
      return;
    }
    setFile(f);
    setError('');
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) handleFile(e.target.files[0]);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleSubmit = async () => {
    if (!file || !batchId) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await detectionService.create(batchId, file, notes || undefined);
      setResult(res.data.data);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setNotes('');
    setResult(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const allScores = result?.allScores
    ? Object.entries(result.allScores).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <>
      <Navbar />
      <div className="container page" style={{ maxWidth: '720px' }}>
        <PageHeader
          title="Disease Detection"
          subtitle="Upload a silkworm image for AI-powered disease analysis"
          action={<Link to={`/batches/${batchId}`} className="btn btn-secondary btn-sm">← Back to Batch</Link>}
        />

        {error && <div className="alert alert-error" style={{ marginBottom: '1rem' }}>{error}</div>}

        {!result ? (
          <div className="card">
            {/* Drop Zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              onClick={() => inputRef.current?.click()}
              style={{
                border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                padding: '2.5rem 1rem',
                textAlign: 'center',
                cursor: 'pointer',
                background: dragging ? 'var(--primary-light, #eff6ff)' : 'var(--bg)',
                transition: 'all 0.15s',
                marginBottom: '1rem',
              }}
            >
              {preview ? (
                <img
                  src={preview}
                  alt="preview"
                  style={{ maxHeight: '260px', maxWidth: '100%', borderRadius: 'var(--radius)', objectFit: 'contain' }}
                />
              ) : (
                <>
                  <p style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🖼️</p>
                  <p style={{ fontWeight: 600, color: 'var(--primary)' }}>Click or drag an image here</p>
                  <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>JPEG · PNG · WebP — max 10 MB</p>
                </>
              )}
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={onInputChange}
            />

            {file && (
              <p className="text-muted" style={{ fontSize: '0.8rem', marginBottom: '1rem' }}>
                📎 {file.name} ({(file.size / 1024).toFixed(1)} KB)
                <button
                  onClick={(e) => { e.stopPropagation(); reset(); }}
                  style={{ marginLeft: '0.5rem', background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', fontSize: '0.8rem' }}
                >
                  ✕ Remove
                </button>
              </p>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 500, display: 'block', marginBottom: '0.35rem' }}>Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any observations about the silkworm sample…"
                rows={3}
                style={{ width: '100%', padding: '0.625rem', border: '1px solid var(--border)', borderRadius: 'var(--radius)', resize: 'vertical', fontSize: '0.875rem', fontFamily: 'inherit', boxSizing: 'border-box' }}
              />
            </div>

            <button
              className="btn btn-primary"
              disabled={!file || loading}
              onClick={handleSubmit}
              style={{ width: '100%' }}
            >
              {loading ? '🔬 Analysing…' : '🔬 Run Detection'}
            </button>
          </div>
        ) : (
          /* ── Result card ── */
          <div>
            <div
              className="card"
              style={{ borderTop: `4px solid ${getColor(result.result)}`, marginBottom: '1rem' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                {preview && (
                  <img
                    src={preview}
                    alt="analysed"
                    style={{ width: '90px', height: '90px', objectFit: 'cover', borderRadius: 'var(--radius)', flexShrink: 0 }}
                  />
                )}
                <div style={{ flex: 1 }}>
                  <p className="text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Diagnosis</p>
                  <p style={{ fontSize: '1.75rem', fontWeight: 800, color: getColor(result.result), lineHeight: 1.1 }}>
                    {result.result}
                  </p>
                  <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>
                    Confidence: <strong style={{ color: getColor(result.result) }}>{(result.confidence * 100).toFixed(1)}%</strong>
                  </p>
                </div>
              </div>

              {/* Confidence bar */}
              <div style={{ marginTop: '1.25rem' }}>
                <div style={{ height: '8px', background: 'var(--border)', borderRadius: '9999px', overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${(result.confidence * 100).toFixed(1)}%`,
                      height: '100%',
                      background: getColor(result.result),
                      borderRadius: '9999px',
                      transition: 'width 0.6s ease',
                    }}
                  />
                </div>
              </div>

              {result.notes && (
                <p className="text-muted" style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
                  📝 {result.notes}
                </p>
              )}
            </div>

            {/* All scores breakdown */}
            {allScores.length > 0 && (
              <div className="card" style={{ marginBottom: '1rem' }}>
                <h3 style={{ fontWeight: 600, marginBottom: '1rem', fontSize: '0.95rem' }}>All Class Probabilities</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                  {allScores.map(([label, score]) => (
                    <div key={label}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.2rem' }}>
                        <span style={{ fontWeight: label === result.result ? 700 : 400, color: label === result.result ? getColor(label) : 'inherit' }}>{label}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{(score * 100).toFixed(1)}%</span>
                      </div>
                      <div style={{ height: '6px', background: 'var(--border)', borderRadius: '9999px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${(score * 100).toFixed(1)}%`,
                            height: '100%',
                            background: getColor(label),
                            opacity: label === result.result ? 1 : 0.4,
                            borderRadius: '9999px',
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button className="btn btn-secondary" onClick={reset} style={{ flex: 1 }}>
                🔄 Test Another Image
              </button>
              <Link to={`/batches/${batchId}`} className="btn btn-primary" style={{ flex: 1, textAlign: 'center' }}>
                ← Back to Batch
              </Link>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
