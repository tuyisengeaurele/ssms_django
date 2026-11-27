import { useId, useState, type FormEvent } from 'react';
import axios from 'axios';
import { useLanguage } from '../../context/LanguageContext';
import { useApiError } from '../../hooks/useApiError';
import { LOCALE_LABELS, type Locale } from '../../i18n/locales';
import { announcementService } from '../../services/announcement.service';
import type { AdminAnnouncement, AnnouncementBody, AnnouncementKind } from '../../types';
import { fill } from '../../utils/fill';
import { fromKigaliInput, toKigaliInput } from '../../utils/kigaliTime';
import { Icon } from '../ui/Icon';
import Modal from '../ui/Modal';
import AnnouncementBanners from './AnnouncementBanners';
import { KIND_WORDS } from './kinds';

const LIMIT = 200;
const A_DAY_MS = 24 * 60 * 60_000;
const TEXTS = [
  { name: 'textEn', label: 'annTextEn' },
  { name: 'textFr', label: 'annTextFr' },
  { name: 'textRw', label: 'annTextRw' },
] as const;

type Field = keyof AnnouncementBody;

/** The form holds the times as the boxes show them. */
type Form = AnnouncementBody;

/** A banner is one line, so line breaks and spare spaces go, as the server does too. */
const oneLine = (text: string) => text.split(/\s+/).filter(Boolean).join(' ');

function startingForm(announcement: AdminAnnouncement | null): Form {
  if (announcement) {
    return {
      kind: announcement.kind, textEn: announcement.text.en, textFr: announcement.text.fr, textRw: announcement.text.rw,
      showPublic: announcement.showPublic,
      showFrom: toKigaliInput(announcement.showFrom), showUntil: toKigaliInput(announcement.showUntil),
    };
  }
  const now = Date.now();
  return {
    kind: 'information', textEn: '', textFr: '', textRw: '', showPublic: false,
    showFrom: toKigaliInput(new Date(now).toISOString()), showUntil: toKigaliInput(new Date(now + A_DAY_MS).toISOString()),
  };
}

const bodyOf = (form: Form): AnnouncementBody => ({
  ...form,
  textEn: oneLine(form.textEn), textFr: oneLine(form.textFr), textRw: oneLine(form.textRw),
  showFrom: fromKigaliInput(form.showFrom), showUntil: fromKigaliInput(form.showUntil),
});

/** The fields that differ. A time nobody touched is not sent: the boxes show no seconds, so sending it would move it. */
function changesBetween(before: AnnouncementBody, after: AnnouncementBody): Partial<AnnouncementBody> {
  return Object.fromEntries(Object.entries(after).filter(([field, value]) => before[field as Field] !== value));
}

function serverProblems(error: unknown): Partial<Record<Field, string>> {
  const errors = axios.isAxiosError(error) ? (error.response?.data as { errors?: Record<string, unknown> } | undefined)?.errors : undefined;
  const found: Partial<Record<Field, string>> = {};
  for (const [field, sentences] of Object.entries(errors ?? {})) {
    if (Array.isArray(sentences) && sentences.length > 0) found[field as Field] = String(sentences[0]);
  }
  return found;
}

interface Props {
  /** The one being changed, or null for a new one. */
  announcement: AdminAnnouncement | null;
  onSaved: () => void;
  /** Somebody else ended it while it was open here. */
  onEndedAlready: (message: string) => void;
  onClose: () => void;
}

export default function AnnouncementDialog({ announcement, onSaved, onEndedAlready, onClose }: Props) {
  const { t, locale } = useLanguage();
  const { getErrorMessage } = useApiError();
  const id = useId();
  const [start] = useState(() => startingForm(announcement));
  const [form, setForm] = useState<Form>(start);
  const [problems, setProblems] = useState<Partial<Record<Field, string>>>({});
  const [alert, setAlert] = useState('');
  const [busy, setBusy] = useState(false);
  const [previewIn, setPreviewIn] = useState<Locale>(locale);

  const change = <K extends Field>(field: K, value: Form[K]) => {
    setForm((before) => ({ ...before, [field]: value }));
    setProblems((before) => ({ ...before, [field]: undefined }));
  };

  const endTooEarly = form.showFrom !== '' && form.showUntil !== '' && form.showUntil <= form.showFrom;
  const complete = oneLine(form.textEn) !== '' && form.showFrom !== '' && form.showUntil !== '' && !endTooEarly;

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!complete || busy) return;
    const body = bodyOf(form);
    const changes = announcement ? changesBetween(bodyOf(start), body) : null;
    if (changes && Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    setAlert('');
    try {
      if (announcement) await announcementService.update(announcement.id, changes!);
      else await announcementService.create(body);
      onSaved();
    } catch (error) {
      setBusy(false);
      if (axios.isAxiosError(error) && error.response?.data?.code === 'announcement_ended') {
        onEndedAlready(getErrorMessage(error));
        return;
      }
      const found = serverProblems(error);
      setProblems(found);
      if (Object.keys(found).length === 0) setAlert(getErrorMessage(error));
    }
  };

  /** What a box needs to be tied to the notes under it. */
  const tied = (field: Field, noteId: string, problem = problems[field]) => ({
    'aria-describedby': problem ? `${noteId} ${id}-${field}-problem` : noteId,
    'aria-invalid': problem ? true : undefined,
  });
  const problemUnder = (field: Field, problem = problems[field]) =>
    problem ? <span id={`${id}-${field}-problem`} className="form-error" role={problems[field] ? 'alert' : undefined}>{problem}</span> : null;

  const untilProblem = problems.showUntil ?? (endTooEarly ? t('erAnnouncementTimes') : undefined);
  const drawn = {
    id: 0, kind: form.kind, version: 1, showUntil: '',
    text: { en: oneLine(form.textEn), fr: oneLine(form.textFr), rw: oneLine(form.textRw) },
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t(announcement ? 'annEditTitle' : 'annNew')}
      maxWidth={560}
      dismissible={!busy}
      footer={(
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>{t('btnCancel')}</button>
          <button type="submit" form={`${id}-form`} className="btn btn-primary" disabled={!complete || busy}>
            {busy ? <span className="spinner" aria-hidden="true" /> : <Icon name="check" size={15} />}
            {t('btnSave')}
          </button>
        </>
      )}
    >
      <form id={`${id}-form`} onSubmit={save} noValidate>
        {alert ? <div className="alert alert-error" role="alert">{alert}</div> : null}

        <div className="form-group">
          <label className="form-label" htmlFor={`${id}-kind`}>{t('annType')}</label>
          <select id={`${id}-kind`} className="form-select" value={form.kind} onChange={(e) => change('kind', e.target.value as AnnouncementKind)}>
            {(Object.keys(KIND_WORDS) as AnnouncementKind[]).map((kind) => <option key={kind} value={kind}>{t(KIND_WORDS[kind])}</option>)}
          </select>
        </div>

        {TEXTS.map(({ name, label }) => (
          <div className="form-group" key={name}>
            <label className="form-label" htmlFor={`${id}-${name}`}>{t(label)}</label>
            <textarea
              id={`${id}-${name}`}
              className="form-textarea announcement-input"
              rows={2}
              maxLength={LIMIT}
              value={form[name]}
              onChange={(e) => change(name, e.target.value)}
              {...tied(name, `${id}-${name}-left`)}
            />
            <span id={`${id}-${name}-left`} className="form-hint">{fill(t('annLeft'), { n: LIMIT - form[name].length })}</span>
            {problemUnder(name)}
          </div>
        ))}

        <div className="announcement-times">
          <div className="form-group">
            <label className="form-label" htmlFor={`${id}-from`}>{t('annFrom')}</label>
            <input
              id={`${id}-from`}
              type="datetime-local"
              className="form-input"
              value={form.showFrom}
              onChange={(e) => change('showFrom', e.target.value)}
              {...tied('showFrom', `${id}-from-zone`)}
            />
            <span id={`${id}-from-zone`} className="form-hint">{t('annKigali')}</span>
            {problemUnder('showFrom')}
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor={`${id}-until`}>{t('annUntil')}</label>
            <input
              id={`${id}-until`}
              type="datetime-local"
              className="form-input"
              value={form.showUntil}
              onChange={(e) => change('showUntil', e.target.value)}
              {...tied('showUntil', `${id}-until-zone`, untilProblem)}
            />
            <span id={`${id}-until-zone`} className="form-hint">{t('annKigali')}</span>
            {problemUnder('showUntil', untilProblem)}
          </div>
        </div>

        <label className="announcement-check">
          <input type="checkbox" checked={form.showPublic} onChange={(e) => change('showPublic', e.target.checked)} />
          <span>{t('annVisitors')}</span>
        </label>
      </form>

      <div className="announcement-preview" role="group" aria-labelledby={`${id}-preview`}>
        <div className="announcement-preview-head">
          <span id={`${id}-preview`} className="form-label">{t('annPreview')}</span>
          <div className="segmented">
            {(Object.keys(LOCALE_LABELS) as Locale[]).map((code) => (
              <button
                key={code}
                type="button"
                className={code === previewIn ? 'is-on' : undefined}
                aria-pressed={code === previewIn}
                onClick={() => setPreviewIn(code)}
              >
                {LOCALE_LABELS[code]}
              </button>
            ))}
          </div>
        </div>
        <AnnouncementBanners items={drawn.text.en ? [drawn] : []} locale={previewIn} live={false} />
      </div>
    </Modal>
  );
}
