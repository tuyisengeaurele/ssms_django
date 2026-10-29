import { useState } from 'react';
import { detectionService } from '../../services/detection.service';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';

// What the worm can be said to have really been. These are the two results of the check, and "something else".
const RESULTS = ['Healthy', 'Grasserie'] as const;

interface Props {
  detectionId: string;
  /** An answer given earlier, so a check that was already answered shows it. */
  initial?: { isCorrect?: boolean | null; actualResult?: string | null };
}

/** "Was this result correct?" The answers show how the check does on real photos, and nothing else is done with them. */
export default function DetectionFeedback({ detectionId, initial }: Props) {
  const { t } = useLanguage();
  const { getErrorMessage } = useApiError();
  const [choice, setChoice] = useState<'yes' | 'no' | null>(null);
  const [actual, setActual] = useState('');
  const [saved, setSaved] = useState(typeof initial?.isCorrect === 'boolean');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const send = async (isCorrect: boolean, actualResult?: string) => {
    setSaving(true);
    setError('');
    try {
      await detectionService.sendFeedback(detectionId, actualResult ? { isCorrect, actualResult } : { isCorrect });
      setSaved(true);
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const answerYes = () => {
    setChoice('yes');
    send(true);
  };

  const change = () => {
    setSaved(false);
    setChoice(null);
    setActual('');
  };

  if (saved) {
    return (
      <div className="feedback">
        <p role="status" className="feedback-thanks">{t('fbThanks')}</p>
        <button type="button" className="btn btn-ghost btn-xs" onClick={change}>{t('fbChange')}</button>
      </div>
    );
  }

  return (
    <fieldset className="feedback">
      <legend className="form-label">{t('fbQuestion')}</legend>
      <div className="feedback-buttons">
        <button type="button" className="btn btn-secondary btn-sm" aria-pressed={choice === 'yes'} disabled={saving} onClick={answerYes}>{t('fbYes')}</button>
        <button type="button" className="btn btn-secondary btn-sm" aria-pressed={choice === 'no'} disabled={saving} onClick={() => setChoice('no')}>{t('fbNo')}</button>
      </div>

      {choice === 'no' && (
        <div className="feedback-actual">
          <label className="form-label" htmlFor={`fb-${detectionId}`}>{t('fbWhat')}</label>
          <select id={`fb-${detectionId}`} className="form-select" value={actual} onChange={(e) => setActual(e.target.value)} disabled={saving}>
            <option value="">{t('fbNotSure')}</option>
            {RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}
            <option value="Something else">{t('fbElse')}</option>
          </select>
          <button type="button" className="btn btn-primary btn-sm" disabled={saving} onClick={() => send(false, actual || undefined)}>
            {saving ? <span className="spinner" /> : null}{t('fbSend')}
          </button>
        </div>
      )}

      {error && <div className="alert alert-error" role="alert">{error}</div>}
    </fieldset>
  );
}
