import { FormEvent, ReactNode, useEffect, useId, useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import Modal from './Modal';

interface Props {
  open: boolean;
  title: string;
  intro?: ReactNode;
  /** The label of the typed field, which says what to type: "Type aline@example.rw to confirm". */
  confirmLabel: string;
  /** What has to be typed. */
  expected: string;
  /** Whether the typed text counts. By default it is the expected text, ignoring case and spaces at its ends. */
  matches?: (typed: string, expected: string) => boolean;
  /** A line under the typed field, for why it is asked. */
  hint?: string;
  /** A refusal of the typed text by the server, shown beside the field until the person types again. */
  typedError?: string;
  onTypedEdit?: () => void;
  submitLabel: string;
  busyLabel?: string;
  /** The red button, for something that cannot be taken back. */
  danger?: boolean;
  busy?: boolean;
  /** False while the fields the parent owns are not ready, so the button stays off whatever was typed. */
  canSubmit?: boolean;
  /** Called with the text exactly as it was typed, only when it matches. */
  onSubmit: (typed: string) => void;
  onClose: () => void;
  /** The fields the parent owns (a new email, a password). They come first, and the typed field last. */
  children?: ReactNode;
}

const sameText = (typed: string, expected: string) => typed.trim() !== '' && typed.trim().toLowerCase() === expected.trim().toLowerCase();

/**
 * A question that needs a typed answer, the way GitHub asks for a repository's name before deleting it: the button stays off
 * until the person has typed what the dialog names. The server checks the typed text too, so this is never the only guard.
 */
export default function ConfirmByTypingDialog({
  open, title, intro, confirmLabel, expected, matches = sameText, hint, typedError, onTypedEdit, submitLabel, busyLabel,
  danger = false, busy = false, canSubmit = true, onSubmit, onClose, children,
}: Props) {
  const { t } = useLanguage();
  const id = useId();
  const formId = `cbt-form-${id}`;
  const typedId = `cbt-typed-${id}`;
  const errorId = `cbt-error-${id}`;
  const hintId = `cbt-hint-${id}`;
  const [typed, setTyped] = useState('');

  // A dialog opened again starts empty, not with what was typed last time.
  useEffect(() => {
    if (open) setTyped('');
  }, [open]);

  const confirmed = matches(typed, expected);
  const ready = confirmed && canSubmit && !busy;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ready) onSubmit(typed);
  };

  const describedBy = [typedError ? errorId : '', hint ? hintId : ''].filter(Boolean).join(' ') || undefined;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>{t('btnCancel')}</button>
          <button type="submit" form={formId} className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={!ready}>
            {busy ? <><span className="spinner" />{busyLabel ?? t('pfSaving')}</> : submitLabel}
          </button>
        </>
      )}
    >
      {intro ? <div className="cbt-intro">{intro}</div> : null}
      <form id={formId} onSubmit={submit} noValidate>
        {children}
        <div className="form-group">
          <label className="form-label" htmlFor={typedId}>{confirmLabel}</label>
          <input
            id={typedId}
            className="form-input"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            maxLength={200}
            value={typed}
            onChange={(e) => { setTyped(e.target.value); onTypedEdit?.(); }}
            aria-invalid={typedError ? true : undefined}
            aria-describedby={describedBy}
          />
          {typedError ? <span id={errorId} className="form-error" role="alert">{typedError}</span> : null}
          {hint ? <span id={hintId} className="form-hint">{hint}</span> : null}
        </div>
      </form>
    </Modal>
  );
}
