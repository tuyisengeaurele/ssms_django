import { useEffect, useState } from 'react';
import { cooperativeService, CreateCooperativePayload } from '../../services/cooperative.service';
import { Cooperative } from '../../types';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/ui/Modal';

const EMPTY: CreateCooperativePayload = { name: '', description: '', location: '' };

interface Props {
  open: boolean;
  /** The cooperative to change. Left out, the form makes a new one. */
  editing?: Cooperative | null;
  onClose: () => void;
  /** Called with what the server saved. */
  onSaved: (saved: Cooperative) => void;
}

/** The form that makes a cooperative or changes one: a name, where it is, and what it is for. */
export default function CooperativeFormModal({ open, editing = null, onClose, onSaved }: Props) {
  const { t } = useLanguage();
  const { getErrorMessage } = useApiError();
  const { success } = useToast();
  const [form, setForm] = useState<CreateCooperativePayload>(EMPTY);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Each time the form opens it starts from the cooperative being changed, or from an empty one.
  useEffect(() => {
    if (!open) return;
    setForm(editing ? { name: editing.name, description: editing.description ?? '', location: editing.location ?? '' } : EMPTY);
    setError('');
  }, [open, editing]);

  const save = async () => {
    setError('');
    if (!form.name.trim()) {
      setError(t('coNameNeeded'));
      return;
    }
    setSubmitting(true);
    try {
      const res = editing ? await cooperativeService.update(editing.id, form) : await cooperativeService.create(form);
      success(t(editing ? 'coUpdated' : 'coCreated'));
      onSaved(res.data.data);
      onClose();
    } catch (e) {
      setError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('coEditTitle') : t('coNew')}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>{t('btnCancel')}</button>
          <button className="btn btn-primary" disabled={submitting} onClick={save}>
            {submitting
              ? <><span className="spinner" />{editing ? t('coSaving') : t('coCreating')}</>
              : editing ? t('coSave') : t('coCreate')}
          </button>
        </>
      }
    >
      {error && <div className="alert alert-error" role="alert">{error}</div>}
      <div className="form-group">
        <label className="form-label" htmlFor="co-name">{t('coFieldName')} <span className="required" aria-hidden="true">*</span></label>
        <input id="co-name" className="form-input" value={form.name} maxLength={150} placeholder={t('coPlaceName')}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="co-location">{t('coFieldLocation')}</label>
        <input id="co-location" className="form-input" value={form.location} maxLength={250} placeholder={t('coPlaceLocation')}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="co-description">{t('coFieldDescription')}</label>
        <textarea id="co-description" className="form-textarea" rows={3} value={form.description} maxLength={500} placeholder={t('coPlaceDescription')}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
      </div>
    </Modal>
  );
}
