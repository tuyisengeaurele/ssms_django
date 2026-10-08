import { useState, FormEvent } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { batchService } from '../../services/batch.service';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { Icon } from '../../components/ui/Icon';
import NextSteps from '../../components/ui/NextSteps';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';

export default function AddBatchPage() {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate = useNavigate();
  const { getErrorMessage } = useApiError();
  const { success } = useToast();
  const { t } = useLanguage();

  const [form, setForm] = useState({ expectedHarvestDate: '', notes: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const change = (field: 'expectedHarvestDate' | 'notes') => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!farmId) return;
    setError('');
    setLoading(true);
    try {
      await batchService.create({ farmId, expectedHarvestDate: form.expectedHarvestDate, notes: form.notes || undefined });
      success(t('abCreated'));
      navigate(`/farms/${farmId}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // A batch needs about a week at the least, so earlier dates are not offered.
  const earliest = new Date();
  earliest.setDate(earliest.getDate() + 7);

  return (
    <div>
      <PageHeader
        title={t('ptBatchNew')}
        subtitle={t('abSubtitle')}
        actions={
          <Link to={`/farms/${farmId}`} className="btn btn-secondary btn-sm">
            <Icon name="back" size={15} />
            {t('abBack')}
          </Link>
        }
      />

      <div className="form-page">
        <Panel title={t('abPanel')} note={t('abStartsAt')}>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="batch-harvest">{t('abHarvest')} <span className="required" aria-hidden="true">*</span></label>
              <input id="batch-harvest" type="date" className="form-input" value={form.expectedHarvestDate} onChange={change('expectedHarvestDate')} min={earliest.toISOString().split('T')[0]} required aria-describedby="batch-harvest-hint" />
              <span id="batch-harvest-hint" className="form-hint">{t('abHarvestHint')}</span>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="batch-notes">{t('abNotes')} <span className="form-optional">({t('abNotesOptional')})</span></label>
              <textarea id="batch-notes" className="form-textarea" rows={3} maxLength={500} value={form.notes} onChange={change('notes')} placeholder={t('abNotesPlace')} />
            </div>

            <div className="profile-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <><span className="spinner" />{t('abCreating')}</> : t('abCreate')}
              </button>
              <Link to={`/farms/${farmId}`} className="btn btn-ghost">{t('btnCancel')}</Link>
            </div>
          </form>
        </Panel>

        <NextSteps
          label={t('abStages')}
          steps={[
            { title: 'Egg', body: t('abStageEgg') },
            { title: 'Larva', body: t('abStageLarva') },
            { title: 'Pupa', body: t('abStagePupa') },
            { title: 'Cocoon', body: t('abStageCocoon') },
            { title: 'Harvest', body: t('abStageHarvest') },
          ]}
        />
      </div>
    </div>
  );
}
