import { useState, FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { farmService } from '../../services/farm.service';
import { useApiError } from '../../hooks/useApiError';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { Icon } from '../../components/ui/Icon';
import PageHeader from '../../components/ui/PageHeader';
import Panel from '../../components/ui/Panel';
import LocationPicker, { EMPTY_PLACE, PlaceValue } from '../../components/ui/LocationPicker';

export default function AddFarmPage() {
  const [name, setName] = useState('');
  const [place, setPlace] = useState<PlaceValue>(EMPTY_PLACE);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { getErrorMessage } = useApiError();
  const { success } = useToast();
  const { t } = useLanguage();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await farmService.create({ name, ...place });
      success(t('afCreated'));
      navigate(`/farms/${res.data.data.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-narrow">
      <PageHeader
        title={t('ptFarmNew')}
        subtitle={t('afSubtitle')}
        actions={
          <Link to="/farms" className="btn btn-secondary btn-sm">
            <Icon name="back" size={15} />
            {t('afBack')}
          </Link>
        }
      />

      <Panel title={t('afPanel')}>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="farm-name">{t('afName')} <span className="required" aria-hidden="true">*</span></label>
              <input id="farm-name" className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('afNamePlace')} required maxLength={150} aria-describedby="farm-name-hint" />
              <span id="farm-name-hint" className="form-hint">{t('afNameHint')}</span>
            </div>

            <LocationPicker value={place} onChange={setPlace} idPrefix="farm-place" />

            <div className="profile-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? <><span className="spinner" />{t('afCreating')}</> : t('afCreate')}
              </button>
              <Link to="/farms" className="btn btn-ghost">{t('btnCancel')}</Link>
            </div>
          </form>
      </Panel>
    </div>
  );
}
