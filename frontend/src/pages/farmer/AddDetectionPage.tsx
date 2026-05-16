import React, { useState, useRef, DragEvent } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { detectionService, DetectionResult } from '../../services/detection.service';
import { useApiError } from '../../hooks/useApiError';
import { useToast } from '../../context/ToastContext';

const DISEASE_COLORS: Record<string, string> = {
  Healthy: '#16a34a', Flacherie: '#dc2626', Grasserie: '#d97706',
  Muscardine: '#7c3aed', Pebrine: '#db2777',
};
const gc = (l: string) => DISEASE_COLORS[l] ?? '#6b7280';

export default function AddDetectionPage() {
  const { id: batchId } = useParams<{ id: string }>();
  const { getErrorMessage } = useApiError();
  const { success } = useToast();

  const [file,     setFile]     = useState<File | null>(null);
  const [preview,  setPreview]  = useState<string | null>(null);
  const [notes,    setNotes]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [result,   setResult]   = useState<DetectionResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (!f.type.startsWith('image/')) { setError('Please select a JPEG or PNG image.'); return; }
    setFile(f); setError(''); setResult(null);
    const reader = new FileReader();
    reader.onload = e => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault(); setDragging(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  const handleSubmit = async () => {
    if (!file || !batchId) return;
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await detectionService.create(batchId, file, notes || undefined);
      setResult(res.data.data);
      success(`Detection complete: ${res.data.data.result}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setFile(null); setPreview(null); setNotes(''); setResult(null); setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const allScores = result?.allScores
    ? Object.entries(result.allScores).sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Disease Detection</h1>
          <p className="page-subtitle">Upload a silkworm image for AI-powered disease analysis</p>
        </div>
        <Link to={`/batches/${batchId}`} className="btn btn-secondary btn-sm">← Back to Batch</Link>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: result ? '1fr' : '1fr 1fr', gap: '1.5rem', maxWidth: result ? 700 : 900, transition: 'all 0.3s' }}>

        <AnimatePresence mode="wait">
          {!result ? (
            <motion.div key="upload" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }}>
              <div className="card">
                <h3 style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '1.25rem' }}>Upload Image</h3>

                {error && <motion.div className="alert alert-error" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>{error}</motion.div>}

                {/* Drop zone */}
                <div
                  onDragOver={e => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={onDrop}
                  onClick={() => inputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragging ? 'var(--brand-400)' : file ? 'var(--brand-300)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-lg)',
                    padding: preview ? '1rem' : '2.5rem 1rem',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: dragging ? 'var(--brand-50)' : file ? 'var(--brand-50)' : 'var(--gray-50)',
                    transition: 'all 0.2s',
                    marginBottom: '1rem',
                    position: 'relative',
                  }}
                >
                  {preview ? (
                    <div style={{ position: 'relative', display: 'inline-block' }}>
                      <img src={preview} alt="preview" style={{ maxHeight: 220, maxWidth: '100%', borderRadius: 'var(--radius-md)', objectFit: 'contain' }} />
                      <button
                        onClick={e => { e.stopPropagation(); reset(); }}
                        style={{ position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: '50%', background: 'var(--danger)', color: '#fff', border: 'none', cursor: 'pointer', fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >✕</button>
                    </div>
                  ) : (
                    <motion.div animate={{ y: [0, -4, 0] }} transition={{ repeat: Infinity, duration: 2.5, ease: 'easeInOut' }}>
                      <div style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'center' }}>
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--brand-400)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
                        </svg>
                      </div>
                      <p style={{ fontWeight: 600, color: 'var(--brand-600)', fontSize: '0.875rem' }}>Click or drag an image here</p>
                      <p style={{ color: 'var(--text-faint)', fontSize: '0.78rem', marginTop: '0.3rem' }}>JPEG · PNG · WebP — max 10 MB</p>
                    </motion.div>
                  )}
                </div>

                <input ref={inputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" style={{ display: 'none' }} onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />

                {file && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
                    {file.name} <span style={{ color: 'var(--text-faint)' }}>({(file.size / 1024).toFixed(1)} KB)</span>
                  </p>
                )}

                <div className="form-group" style={{ marginBottom: '1.125rem' }}>
                  <label className="form-label">Notes <span style={{ color: 'var(--text-faint)', fontWeight: 400 }}>(optional)</span></label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)}
                    className="form-textarea" placeholder="Observations about this sample…" rows={2} maxLength={500} />
                </div>

                <button className="btn btn-primary btn-full btn-lg" disabled={!file || loading} onClick={handleSubmit}>
                  {loading ? (
                    <><span className="spinner" />Analysing with AI…</>
                  ) : (
                    <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                      </svg>
                      Run Detection
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          ) : (
            <motion.div key="result" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }}>
              {/* Result card */}
              <div className="card" style={{ borderTop: `4px solid ${gc(result.result)}`, marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
                  {preview && (
                    <img src={preview} alt="analysed" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 'var(--radius-md)', flexShrink: 0, border: `2px solid ${gc(result.result)}30` }} />
                  )}
                  <div>
                    <p style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-faint)', marginBottom: '0.3rem' }}>AI Diagnosis</p>
                    <p style={{ fontSize: '2rem', fontWeight: 900, color: gc(result.result), lineHeight: 1, letterSpacing: '-0.03em' }}>{result.result}</p>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                      Confidence: <strong style={{ color: gc(result.result) }}>{(result.confidence * 100).toFixed(1)}%</strong>
                    </p>
                  </div>
                </div>

                <div className="progress-bar" style={{ height: 8 }}>
                  <motion.div className="progress-fill" style={{ background: gc(result.result) }}
                    initial={{ width: 0 }}
                    animate={{ width: `${result.confidence * 100}%` }}
                    transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                  />
                </div>

                {result.result !== 'Healthy' && (
                  <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#fef2f2', borderRadius: 'var(--radius-md)', border: '1px solid #fecaca', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#991b1b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                    </svg>
                    <p style={{ fontSize: '0.78rem', color: '#991b1b', fontWeight: 500 }}>
                      Disease detected. Consider isolating this batch and consulting a silkworm health specialist.
                    </p>
                  </div>
                )}
                {result.result === 'Healthy' && (
                  <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#f0fdf4', borderRadius: 'var(--radius-md)', border: '1px solid #bbf7d0', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <p style={{ fontSize: '0.78rem', color: '#15803d', fontWeight: 500 }}>
                      No disease detected. Continue normal monitoring.
                    </p>
                  </div>
                )}
              </div>

              {/* All probabilities */}
              {allScores.length > 0 && (
                <div className="card" style={{ marginBottom: '1.25rem' }}>
                  <h3 style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '1rem' }}>All Class Probabilities</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
                    {allScores.map(([label, score]) => {
                      const pct = (score * 100).toFixed(1);
                      const col = gc(label);
                      const isTop = label === result.result;
                      return (
                        <div key={label}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                            <span style={{ fontSize: '0.82rem', fontWeight: isTop ? 700 : 500, color: isTop ? col : 'var(--text-2)' }}>{label}</span>
                            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: col }}>{pct}%</span>
                          </div>
                          <div className="progress-bar">
                            <motion.div className="progress-fill" style={{ background: col, opacity: isTop ? 1 : 0.4 }}
                              initial={{ width: 0 }}
                              animate={{ width: `${pct}%` }}
                              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={reset} style={{ flex: 1 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/>
                  </svg>
                  Test Another
                </button>
                <Link to={`/batches/${batchId}`} className="btn btn-primary" style={{ flex: 1, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                  Back to Batch
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Info sidebar — only visible when not showing result */}
        {!result && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.35 }}>
            <div className="card">
              <h3 style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: '1.25rem' }}>About AI Detection</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                {([
                  {
                    icon: <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1H1a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/>,
                    title: 'ResNet50 Model', desc: 'State-of-the-art deep learning model trained on silkworm disease images',
                  },
                  {
                    icon: <><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></>,
                    title: '5 Disease Classes', desc: 'Healthy, Flacherie, Grasserie, Muscardine, Pebrine',
                  },
                  {
                    icon: <><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></>,
                    title: 'Instant Results', desc: 'AI analysis completes in under 5 seconds',
                  },
                  {
                    icon: <><path d="M18 20V10M12 20V4M6 20v-6"/></>,
                    title: 'Confidence Scores', desc: 'Get probability scores for all disease classes',
                  },
                ] as { icon: React.ReactNode; title: string; desc: string }[]).map(item => (
                  <div key={item.title} style={{ display: 'flex', gap: '0.75rem' }}>
                    <span style={{ width: 34, height: 34, borderRadius: 'var(--radius)', background: 'var(--brand-50)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--brand-600)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        {item.icon}
                      </svg>
                    </span>
                    <div>
                      <p style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text)', marginBottom: '0.15rem' }}>{item.title}</p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '1.25rem', padding: '0.875rem', background: 'var(--warning-bg)', borderRadius: 'var(--radius-md)', border: '1px solid var(--warning-border)' }}>
                <p style={{ fontSize: '0.75rem', color: '#92400e', lineHeight: 1.6 }}>
                  <strong>Tip:</strong> Use clear, close-up images of the silkworms for best accuracy. Avoid blurry or overexposed photos.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
