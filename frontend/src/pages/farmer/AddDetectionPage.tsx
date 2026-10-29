import { ChangeEvent, DragEvent, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { detectionService, DetectionResult, UnclearResult } from '../../services/detection.service';
import { useApiError } from '../../hooks/useApiError';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import { colorFor } from '../../utils/chartColors';
import { fill } from '../../utils/fill';
import BarList from '../../components/ui/BarList';
import CameraCapture from '../../components/ui/CameraCapture';
import { compressPhoto } from '../../utils/compressPhoto';
import DetectionFeedback from './DetectionFeedback';
import DiseaseInfoCard from './DiseaseInfoCard';
import { Icon } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';

const percent = (value: number) => `${Math.round(value * 100)}%`;

/** A photo that is not a clear silkworm gets a calm answer. It is not kept, and it is not a result. */
const UNCLEAR = {
  NotSilkworm: { title: 'ckUnclearNotTitle', text: 'ckUnclearNotText' },
  Uncertain: { title: 'ckUnclearSureTitle', text: 'ckUnclearSureText' },
} as const;
const isUnclear = (answer: DetectionResult | UnclearResult): answer is UnclearResult => Object.prototype.hasOwnProperty.call(UNCLEAR, answer.result);

const MB = 1024 * 1024;
/** The size next to the file name, to one decimal. */
const fileSize = (bytes: number) => (bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${(bytes / 1024).toFixed(1)} KB`);
/** The size inside a sentence, as a round number of KB or one decimal of MB. */
const briefSize = (bytes: number) => (bytes >= MB ? `${(bytes / MB).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);

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
  const [unclear, setUnclear] = useState<UnclearResult['result'] | null>(null);
  const [dragging, setDragging] = useState(false);
  const [camera, setCamera] = useState(false);
  const [preparing, setPreparing] = useState(false);
  // The size the photo had before it was made smaller, so the person can see what was done.
  const [originalSize, setOriginalSize] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // A photo chosen while an earlier one is still being prepared wins, so a slow one cannot replace it.
  const latest = useRef(0);

  const canUseCamera = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const take = async (chosen: File) => {
    if (!chosen.type.startsWith('image/')) {
      setError(t('ckNotPhoto'));
      return;
    }
    const turn = ++latest.current;
    setError('');
    setResult(null);
    setUnclear(null);
    setPreparing(true);
    // If the photo cannot be made smaller, it is sent as it is and the server decides.
    const ready = await compressPhoto(chosen).catch(() => chosen);
    if (turn !== latest.current) return;
    setFile(ready);
    setOriginalSize(chosen.size);
    setPreparing(false);
    const reader = new FileReader();
    reader.onload = (e) => { if (turn === latest.current) setPreview(e.target?.result as string); };
    reader.readAsDataURL(ready);
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
    setUnclear(null);
    try {
      const res = await detectionService.create(batchId, file, notes || undefined);
      const answer = res.data.data;
      if (isUnclear(answer)) {
        setUnclear(answer.result);
      } else {
        setResult(answer);
        success(fill(t('ckDone'), { result: answer.result }));
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    latest.current += 1;
    setPreparing(false);
    setOriginalSize(0);
    setFile(null);
    setPreview(null);
    setNotes('');
    setResult(null);
    setUnclear(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const scores = result?.allScores ? Object.entries(result.allScores).sort((a, b) => b[1] - a[1]) : [];
  const healthy = result?.result === 'Healthy';

  return (
    <div className="page-narrow">
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
        <>
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
              {result.alertRaised && <p className="form-hint">{t('ckAlertAdded')}</p>}
              <p className="form-hint">{t('ckCaution')}</p>
              <DetectionFeedback key={result.id} detectionId={result.id} initial={result} />
            </Panel>

            <DiseaseInfoCard result={result.result} />

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
        </>
      ) : unclear ? (
        <div className="stack-24">
          <Panel title={t(UNCLEAR[unclear].title)}>
            {preview && <img src={preview} alt={t('ckPreviewAlt')} className="check-result-photo" />}
            <div className="alert alert-warning" role="status">
              <Icon name="warning" size={18} />
              <span>{t(UNCLEAR[unclear].text)}</span>
            </div>
          </Panel>
          <div className="profile-actions">
            <button type="button" className="btn btn-primary" onClick={reset}>
              <Icon name="refresh" size={15} />
              {t('ckAnother')}
            </button>
            <Link to={`/batches/${batchId}`} className="btn btn-ghost">{t('ckBack')}</Link>
          </div>
        </div>
      ) : (
        <>
          <Panel title={t('ckUpload')}>
            {error && <div className="alert alert-error" role="alert">{error}</div>}

            {preview ? (
              <div className="check-preview">
                <img src={preview} alt={t('ckPreviewAlt')} />
                <p className="check-preview-name">{file?.name} ({fileSize(file?.size ?? 0)})</p>
                {file && originalSize > file.size && (
                  <p className="form-hint">{fill(t('phReadySmaller'), { size: briefSize(file.size), was: briefSize(originalSize) })}</p>
                )}
                <button type="button" className="btn btn-ghost btn-sm" onClick={reset}>
                  <Icon name="close" size={15} />
                  {t('ckChange')}
                </button>
              </div>
            ) : camera ? (
              <CameraCapture onCapture={(photo) => { setCamera(false); take(photo); }} onClose={() => setCamera(false)} />
            ) : (
              <>
              {canUseCamera && (
                <div className="photo-choices">
                  <button type="button" className="btn btn-secondary" onClick={() => setCamera(true)}>
                    <Icon name="detections" size={16} />
                    {t('phCameraOpen')}
                  </button>
                </div>
              )}
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
              </>
            )}

            <details className="photo-help">
              <summary>{t('phTipsTitle')}</summary>
              <ul className="photo-tips">
                <li>{t('phTip1')}</li>
                <li>{t('phTip2')}</li>
                <li>{t('phTip3')}</li>
              </ul>
            </details>

            <div className="form-group">
              <label className="form-label" htmlFor="check-notes">{t('ckNotes')} <span className="form-optional">({t('ckNotesOptional')})</span></label>
              <textarea id="check-notes" className="form-textarea" rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('ckNotesPlace')} />
            </div>

            <button type="button" className="btn btn-primary btn-full" disabled={!file || loading || preparing} onClick={run}>
              {loading ? <><span className="spinner" />{t('ckRunning')}</>
                : preparing ? <><span className="spinner" />{t('phCompressing')}</> : t('ckRun')}
            </button>
          </Panel>

        </>
      )}
    </div>
  );
}
