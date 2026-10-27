import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { MAX_SIDE } from '../../utils/compressPhoto';
import { Icon } from './Icon';

interface Props {
  /** The photo, already cut to the square that was framed. */
  onCapture: (file: File) => void;
  /** The person cancelled, or chose to pick a photo instead. */
  onClose: () => void;
}

type Problem = 'phCamBlocked' | 'phCamNone' | 'phCamFailed';

const problemFor = (error: unknown): Problem => {
  const name = (error as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'phCamBlocked';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') return 'phCamNone';
  return 'phCamFailed';
};

/**
 * The camera, live in the page, with a square to line the subject up in. What is inside the square is what gets sent:
 * the disease model squeezes every photo into a square, so a photo framed as a square is read the way it looks.
 */
export default function CameraCapture({ onCapture, onClose }: Props) {
  const { t } = useLanguage();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [live, setLive] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    let current = true;
    if (!navigator.mediaDevices?.getUserMedia) {
      setProblem('phCamFailed');
      return;
    }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })
      .then((stream) => {
        if (!current) {
          // The page moved on while the person was answering the permission question.
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          video.play().catch(() => undefined);
        }
      })
      .catch((error) => { if (current) setProblem(problemFor(error)); });
    return () => {
      current = false;
      stopCamera();
    };
  }, []);

  const close = () => {
    stopCamera();
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const take = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const side = Math.min(video.videoWidth, video.videoHeight);
    const sx = Math.round((video.videoWidth - side) / 2);
    const sy = Math.round((video.videoHeight - side) / 2);
    const out = Math.min(side, MAX_SIDE);
    const canvas = document.createElement('canvas');
    canvas.width = out;
    canvas.height = out;
    const context = canvas.getContext('2d');
    if (!context) {
      setProblem('phCamFailed');
      return;
    }
    context.drawImage(video, sx, sy, side, side, 0, 0, out, out);
    canvas.toBlob((blob) => {
      if (!blob) {
        setProblem('phCamFailed');
        return;
      }
      stopCamera();
      onCapture(new File([blob], 'photo.jpg', { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.9);
  };

  if (problem) {
    return (
      <div className="camera-problem">
        <div className="alert alert-error" role="alert">{t(problem)}</div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={close}>{t('phCamInstead')}</button>
      </div>
    );
  }

  return (
    <div className="camera">
      <div className="camera-frame">
        <video
          ref={videoRef}
          className="camera-video"
          aria-label={t('phCamView')}
          playsInline
          muted
          onLoadedMetadata={() => setLive(true)}
        />
        <div className="camera-guide" data-testid="frame-guide" aria-hidden="true" />
        {!live && <p className="camera-starting"><span className="spinner" />{t('phCamStarting')}</p>}
      </div>
      <p className="form-hint">{t('phCamHint')}</p>
      <div className="camera-actions">
        <button type="button" className="btn btn-primary" onClick={take} disabled={!live}>
          <Icon name="detections" size={16} />
          {t('phTake')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={close}>{t('btnCancel')}</button>
      </div>
    </div>
  );
}
