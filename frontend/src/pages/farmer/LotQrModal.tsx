import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import Modal from '../../components/ui/Modal';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useApiError } from '../../hooks/useApiError';
import { lotService } from '../../services/lot.service';
import type { HarvestRecord } from '../../types';
import { fill } from '../../utils/fill';

interface LotQrModalProps {
  record: HarvestRecord | null;
  onClose: () => void;
  /** Told when the lot starts or stops being shared, so the list can say so. */
  onChange?: (recordId: string, shared: boolean) => void;
}

type View = 'loading' | 'failed' | 'ready';

/** The address a buyer opens, which is what the QR code holds. */
const linkFor = (token: string) => `${window.location.origin}/lot/${token}`;

/** The picture is drawn dark on white whatever the theme, since a scanner reads it that way round. */
function QrPicture({ value }: { value: string }) {
  return <QRCodeSVG value={value} size={220} level="M" marginSize={4} bgColor="#ffffff" fgColor="#000000" />;
}

/** Turns the drawn code into a PNG and hands it to the browser as a download. */
function downloadPng(svg: SVGSVGElement, name: string) {
  const source = new XMLSerializer().serializeToString(svg);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1024;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 1024, 1024);
    context.drawImage(image, 0, 0, 1024, 1024);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      link.click();
      URL.revokeObjectURL(link.href);
    }, 'image/png');
  };
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
}

/**
 * The QR code of one harvest lot. The farmer makes the code on purpose, after being told what a buyer will and will not
 * see, and can end it again, which makes every printed copy stop working.
 */
export default function LotQrModal({ record, onClose, onChange }: LotQrModalProps) {
  const { t, locale } = useLanguage();
  const { success, error: showError } = useToast();
  const { getErrorMessage } = useApiError();
  const [view, setView] = useState<View>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const id = record?.id;

  useEffect(() => {
    if (!id) return;
    let live = true;
    setView('loading');
    setConfirmStop(false);
    lotService.getShare(id)
      .then((res) => { if (live) { setToken(res.data.data.token); setView('ready'); } })
      .catch(() => { if (live) setView('failed'); });
    return () => { live = false; };
  }, [id]);

  if (!record) return null;
  const link = token ? linkFor(token) : '';
  const day = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(record.harvestedAt));
  const kg = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(record.cocoonWeightKg));

  const create = async () => {
    setBusy(true);
    try {
      const res = await lotService.createShare(record.id);
      setToken(res.data.data.token);
      onChange?.(record.id, true);
      success(t('lotCreated'));
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const stop = async () => {
    setBusy(true);
    try {
      await lotService.stopShare(record.id);
      setToken(null);
      setConfirmStop(false);
      onChange?.(record.id, false);
      success(t('lotStopped'));
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      success(t('tmCopied'));
    } catch {
      showError(t('tmCopyFailed'));
    }
  };

  return (
    <Modal open onClose={onClose} title={t('lotQrTitle')} maxWidth={460}>
      {view === 'loading' && <p role="status" className="modal-text">{t('jnLoading')}</p>}
      {view === 'failed' && <div className="alert alert-error" role="alert">{t('lotLoadError')}</div>}

      {view === 'ready' && !token && (
        <>
          <p className="modal-text">{t('lotQrIntro')}</p>
          <h3 className="lot-subhead">{t('lotShowsTitle')}</h3>
          <p className="modal-text">{t('lotShows')}</p>
          <p className="modal-text">{t('lotHides')}</p>
          <button type="button" className="btn btn-primary lot-create" onClick={create} disabled={busy}>{t('lotCreate')}</button>
        </>
      )}

      {view === 'ready' && token && (
        <>
          <div className="lot-print-sheet" ref={sheet}>
            <div role="img" aria-label={t('lotQrAlt')} className="lot-qr">
              <QrPicture value={link} />
            </div>
            <p className="lot-scan">{t('lotScan')}</p>
            <p className="lot-print-caption">{fill(t('lotPrintCaption'), { farm: record.farmName ?? '', date: day, kg })}</p>
          </div>

          <div className="form-group lot-noprint">
            <label className="form-label" htmlFor="lot-link">{t('lotLink')}</label>
            <input id="lot-link" className="form-input" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
          </div>

          {confirmStop ? (
            <div className="lot-noprint">
              <p className="modal-text">{t('lotStopAsk')}</p>
              <div className="invite-actions">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setConfirmStop(false)} disabled={busy}>{t('btnCancel')}</button>
                <button type="button" className="btn btn-danger btn-sm" onClick={stop} disabled={busy}>{t('lotStopYes')}</button>
              </div>
            </div>
          ) : (
            <div className="invite-actions lot-noprint">
              <button type="button" className="btn btn-secondary btn-sm" onClick={copy}>{t('lotCopy')}</button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>{t('lotPrint')}</button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  const svg = sheet.current?.querySelector('svg');
                  if (svg) downloadPng(svg, 'ssms-lot-qr.png');
                }}
              >
                {t('lotDownload')}
              </button>
              <button type="button" className="btn btn-ghost btn-sm btn-quiet-danger" onClick={() => setConfirmStop(true)}>{t('lotStop')}</button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}
