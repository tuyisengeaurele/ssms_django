import { ChangeEvent, DragEvent, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { detectionService, DetectionResult } from '../../services/detection.service';
import { useApiError } from '../../hooks/useApiError';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { colorFor } from '../../utils/chartColors';
import { fill } from '../../utils/fill';
import BarList from '../../components/ui/BarList';
import { Icon } from '../../components/ui/Icon';
import NextSteps from '../../components/ui/NextSteps';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';

const percent = (value: number) => `${Math.round(value * 100)}%`;

export default function AddDetectionPage() {
  const { id: batchId } = useParams<{ id: string }>();
  const { getErrorMessage } = useApiError();
  const { success } = useToast();
  const { t } = useLanguage();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const take = (chosen: File) => {
    if (!chosen.type.startsWith('image/')) {
      setError(t('ckNotPhoto'));
      return;
    }
    setFile(chosen);
    setError('');
    setResult(null);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(chosen);
  };

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    if (chosen) take(chosen);
  };

  const onDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setDragging(false);
    const chosen = e.dataTransfer.files?.[0];
    if (chosen) take(chosen);
  };

  const run = async () => {
    if (!file || !batchId) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await detectionService.create(batchId, file, notes || undefined);
      setResult(res.data.data);
      success(fill(t('ckDone'), { result: res.data.data.result }));
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

  const scores = result?.allScores ? Object.entries(result.allScores).sort((a, b) => b[1] - a[1]) : [];
  const healthy = result?.result === 'Healthy';

  return (
    <div>
      <PageHeader
        title={t('ptDetect')}
        subtitle={t('ckSubtitle')}
        actions={
          <Link to={`/batches/${batchId}`} className="btn btn-ghost btn-sm">
            <Icon name="back" size={15} />
            {t('ckBack')}
          </Link>
        }
      />

      {result ? (
        <div className="form-page">
          <div className="stack-24">
            <Panel title={t('ckResultLabel')}>
              <div className="check-result">
                {preview && <img src={preview} alt={t('ckPreviewAlt')} className="check-result-photo" />}
                <div>
                  <h2 className="check-result-name" style={{ color: colorFor('result', result.result) }}>{result.result}</h2>
                  <p className="check-result-sure">{fill(t('ckSure'), { pct: Math.round(result.confidence * 100) })}</p>
                </div>
              </div>
              <div className={`alert ${healthy ? 'alert-success' : 'alert-warning'}`} role="status">
                <Icon name={healthy ? 'success' : 'warning'} size={18} />
                <span>{healthy ? t('ckHealthy') : t('ckSick')}</span>
              </div>
              <p className="form-hint">{t('ckCaution')}</p>
            </Panel>

            {scores.length > 0 && (
              <Panel title={t('ckScores')}>
                <BarList
                  label={t('ckScores')}
                  rows={scores.map(([name, score]) => ({ key: name, label: name, value: score, color: colorFor('result', name) }))}
                  format={percent}
                />
              </Panel>
            )}

            <div className="profile-actions">
              <button type="button" className="btn btn-primary" onClick={reset}>
                <Icon name="refresh" size={15} />
                {t('ckAnother')}
              </button>
              <Link to={`/batches/${batchId}`} className="btn btn-ghost">{t('ckBack')}</Link>
            </div>
          </div>
        </div>
      ) : (
        <div className="form-page">
          <Panel title={t('ckUpload')}>
            {error && <div className="alert alert-error" role="alert">{error}</div>}

            {preview ? (
              <div className="check-preview">
                <img src={preview} alt={t('ckPreviewAlt')} />
                <p className="check-preview-name">{file?.name} ({((file?.size ?? 0) / 1024).toFixed(1)} KB)</p>
                <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
                  <Icon name="close" size={15} />
                  {t('ckChange')}
                </button>
              </div>
            ) : (
              <label
                className={`dropzone${dragging ? ' is-over' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
              >
                <input ref={inputRef} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" onChange={onPick} />
                <Icon name="detections" size={28} />
                <strong>{t('ckChoose')}</strong>
                <span>{t('ckChooseHint')}</span>
              </label>
            )}

            <div className="form-group">
              <label className="form-label" htmlFor="check-notes">{t('ckNotes')} <span className="form-optional">({t('ckNotesOptional')})</span></label>
              <textarea id="check-notes" className="form-textarea" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('ckNotesPlace')} />
            </div>

            <button type="button" className="btn btn-primary btn-full" disabled={!file || loading} onClick={run}>
              {loading ? <><span className="spinner" />{t('ckRunning')}</> : t('ckRun')}
            </button>
          </Panel>

          <div className="stack-24">
            <NextSteps
              label={t('ckTipsTitle')}
              steps={[
                { title: t('ckTip1'), body: t('ckTip1Body') },
                { title: t('ckTip2'), body: t('ckTip2Body') },
                { title: t('ckTip3'), body: t('ckTip3Body') },
                { title: t('ckTip4'), body: t('ckTip4Body') },
              ]}
            />
            <p className="form-hint">{t('ckKnows')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
