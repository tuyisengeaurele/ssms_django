import { useEffect, useState } from 'react';
import { alertService } from '../../services/alert.service';
import { AlertComment } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { fill } from '../../utils/fill';
import { timeAgo } from '../../utils/timeAgo';

const MAX_LENGTH = 1000;

interface Props {
  alertId: string;
  /** Called with +1 when a comment is added and -1 when one is deleted, so the page can keep its count right. */
  onCountChange: (delta: number) => void;
}

/** The comments on one alert, and a box to add one. Everyone who sees the alert may read; the server decides who writes. */
export default function AlertThread({ alertId, onCountChange }: Props) {
  const { user } = useAuth();
  const { t, locale } = useLanguage();
  const { success, error: showError } = useToast();

  const [comments, setComments] = useState<AlertComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setFailed(false);
    alertService.getComments(alertId)
      .then((res) => live && setComments(res.data.data))
      .catch(() => live && setFailed(true))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [alertId, attempt]);

  const add = async () => {
    const body = text.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const res = await alertService.addComment(alertId, body);
      setComments((prev) => [...prev, res.data.data]);
      setText('');
      onCountChange(1);
    } catch {
      showError(t('acSaveError'));
    } finally {
      setSending(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await alertService.deleteComment(alertId, id);
      setComments((prev) => prev.filter((c) => c.id !== id));
      setAsking(null);
      onCountChange(-1);
      success(t('acDeleted'));
    } catch {
      showError(t('acDeleteError'));
    }
  };

  const fieldId = `thread-${alertId}`;
  // The owner is emailed when someone else writes. The person writing as the owner has no use for that line.
  const tellsOwner = user?.role === 'SUPERVISOR' || user?.role === 'ADMIN';

  return (
    <div className="thread">
      {loading ? (
        <p className="panel-loading"><span className="spinner" /></p>
      ) : failed ? (
        <div className="alert alert-error" role="alert">
          <span>{t('acLoadError')}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAttempt((n) => n + 1)}>{t('acRetry')}</button>
        </div>
      ) : comments.length === 0 ? (
        <p className="thread-empty">{t('acNone')}</p>
      ) : (
        <ul className="thread-list">
          {comments.map((c) => (
            <li key={c.id} className="thread-item">
              <p className="thread-head">
                <span className="thread-author">{c.author?.name ?? '-'}</span>
                <span>{timeAgo(c.createdAt, locale)}</span>
              </p>
              <p className="thread-body">{c.body}</p>
              {c.canDelete && (
                asking === c.id ? (
                  <p className="thread-confirm">
                    <span>{t('acDeleteAsk')}</span>
                    <button type="button" className="btn btn-ghost btn-xs btn-quiet-danger" onClick={() => remove(c.id)}>{t('acDeleteYes')}</button>
                    <button type="button" className="btn btn-ghost btn-xs" onClick={() => setAsking(null)}>{t('acKeep')}</button>
                  </p>
                ) : (
                  <button type="button" className="btn btn-ghost btn-xs" onClick={() => setAsking(c.id)}>{t('acDelete')}</button>
                )
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="thread-form">
        <label className="form-label" htmlFor={fieldId}>{t('acWrite')}</label>
        <textarea
          id={fieldId}
          className="form-input"
          rows={3}
          maxLength={MAX_LENGTH}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="thread-foot">
          <span className="thread-count">{fill('{n} / {max}', { n: text.length, max: MAX_LENGTH })}</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={add} disabled={!text.trim() || sending}>{t('acAdd')}</button>
        </div>
        {tellsOwner && <p className="form-hint">{t('acEmailNote')}</p>}
      </div>
    </div>
  );
}
